import { MAX_SCORE, POWERUP_TYPES, THEME_REQUIREMENTS, validateUsername } from '../../shared/validation.js';

export { validateUsername } from '../../shared/validation.js';

export class ApiService {
  constructor({ state, baseURL = import.meta.env?.VITE_API_BASE_URL || '', fetcher = globalThis.fetch.bind(globalThis), timeout = 20000 } = {}) {
    Object.assign(this, { state, fetcher, timeout });
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.pendingSubmissions = new Map();
    this.powerupOperations = new Map();
  }

  async request(path, { body, query, operationId, runId } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    const parameters = query ? `?${new URLSearchParams(query)}` : '';
    try {
      const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(operationId ? { 'Idempotency-Key': operationId } : {}), ...(runId ? { 'X-Run-Id': runId } : {}) };
      const response = await this.fetcher(`${this.baseURL}/api/${path}${parameters}`, {
        method: body ? 'POST' : 'GET', headers, credentials: 'omit', cache: 'no-store', redirect: 'error',
        signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let data;
      try { data = await response.json(); } catch { return { ok: false, status: response.status, error: 'پاسخ سرویس بازی خوانا نیست؛ لطفاً دوباره تلاش کنید.' }; }
      if (!response.ok || data.ok === false) return { ok: false, status: response.status,
        error: typeof data.error === 'string' ? data.error : 'درخواست شما انجام نشد؛ لطفاً دوباره تلاش کنید.' };
      return data;
    } catch {
      return { ok: false, status: 0, error: 'ارتباط با پادشاهی برقرار نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.' };
    } finally { clearTimeout(timer); }
  }

  identity() { return { username: this.state.data.username, token: this.state.data.token }; }

  async registerUsername(username) {
    const validation = validateUsername(username);
    if (!validation.ok) return validation;
    const response = await this.request('register', { body: { username: validation.username } });
    if (response.ok && response.profile) this.state.applyServerProfile(response.profile, { force: true });
    return response;
  }

  async getProfile() {
    const response = await this.request('profile', { body: this.identity() });
    if (response.ok && response.profile) this.state.applyServerProfile(response.profile, { force: true });
    return response;
  }

  async consumePowerup(type) {
    if (!POWERUP_TYPES.includes(type)) return { ok: false, error: 'این کمک در بازی وجود ندارد.' };
    if (!this.powerupOperations.has(type)) this.powerupOperations.set(type, crypto.randomUUID());
    const response = await this.request('powerup', { body: { ...this.identity(), type }, operationId: this.powerupOperations.get(type) });
    if (response.ok && response.powerups) {
      this.state.applyServerPowerups(response.powerups);
      this.powerupOperations.delete(type);
    } else if (response.status === 409) {
      // Refresh the permanent zero when another browser has already spent this charge.
      await this.getProfile();
      this.powerupOperations.delete(type);
    }
    return response;
  }

  async submitScore(stats, { runId = this.state.data.runId, queued = false } = {}) {
    if (!stats || !Number.isSafeInteger(stats.runPopulation) || stats.runPopulation < 0 || stats.runPopulation > MAX_SCORE
      || !Number.isInteger(stats.highestBuildingLevel) || stats.highestBuildingLevel < 1 || stats.highestBuildingLevel > 13
      || !Object.hasOwn(THEME_REQUIREMENTS, stats.activeThemeId)) return { ok: false, error: 'اطلاعات این دور کامل نیست؛ دوباره تلاش کنید.' };
    const entry = { runId, username: this.state.data.username, runPopulation: stats.runPopulation,
      highestBuildingLevel: stats.highestBuildingLevel, activeThemeId: stats.activeThemeId };
    const operationId = `${runId}:${entry.runPopulation}:${entry.highestBuildingLevel}:${entry.activeThemeId}`;
    if (this.pendingSubmissions.has(operationId)) return this.pendingSubmissions.get(operationId);
    if (!queued) this.state.queueScore(entry);
    const pending = this.request('score', { body: { ...this.identity(), runPopulation: entry.runPopulation,
      highestBuildingLevel: entry.highestBuildingLevel, activeThemeId: entry.activeThemeId }, operationId, runId }).then((response) => {
      if (response.ok) {
        this.state.removeQueuedScore(entry);
        if (response.profile) this.state.applyServerProfile(response.profile);
      }
      return response;
    });
    this.pendingSubmissions.set(operationId, pending);
    try { return await pending; } finally { this.pendingSubmissions.delete(operationId); }
  }

  async flushPendingScores() {
    for (const entry of [...this.state.data.pendingScores]) {
      if (entry.username !== this.state.data.username) continue;
      const response = await this.submitScore(entry, { runId: entry.runId, queued: true });
      if (!response.ok) return response;
    }
    return { ok: true };
  }

  getLeaderboard(period = 'daily') {
    if (!['daily', 'alltime'].includes(period)) return Promise.resolve({ ok: false, error: 'بازهٔ انتخاب‌شده معتبر نیست.' });
    return this.request('leaderboard', { query: { period, username: this.state.data.username } });
  }
}
