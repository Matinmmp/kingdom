import { DEFAULT_THEME_ID, THEMES, getTheme } from '../config/themesConfig.js';
import { BASE_POP, MAX_LEVEL, canMove, cloneGrid } from '../game/boardLogic.js';

export const STORAGE_KEY = 'kingdom2048:state:v1';
export const SCHEMA_VERSION = 1;
const THEME_UNLOCK_VERSION = 2;
// Only used to retain kingdoms earned by existing Phase 1 saves.
const LEGACY_THEME_THRESHOLDS = { storybook_meadow: 0, sunstone_dynasty: 150000,
  marble_republic: 350000, sakura_valley: 420000, nordic_frost: 600000 };
const clone = (value) => JSON.parse(JSON.stringify(value));
const nonnegative = (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;
const createRunId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const validGrid = (grid) => Array.isArray(grid) && grid.length === 4 && grid.every((row) =>
  Array.isArray(row) && row.length === 4 && row.every((level) => Number.isInteger(level) && level >= 0 && level <= MAX_LEVEL));

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    username: '', token: null, activeThemeId: DEFAULT_THEME_ID,
    themeUnlockVersion: THEME_UNLOCK_VERSION, unlockedThemeIds: [DEFAULT_THEME_ID],
    runPopulation: 0, totalPopulation: 0, highestBuildingLevel: 1,
    powerups: { undo: 1, swap: 1, sweeper: 1 },
    grid: null, moveCount: 0, undoSnapshot: null, gameOver: false,
    runId: createRunId(), victoryShown: false,
    pendingScores: [],
    muted: false, updatedAt: null,
  };
}

function hydrate(saved) {
  const data = defaultState();
  if (!saved || saved.schemaVersion !== SCHEMA_VERSION) return data;
  data.username = typeof saved.username === 'string' ? saved.username : '';
  data.token = typeof saved.token === 'string' ? saved.token : null;
  data.runPopulation = nonnegative(saved.runPopulation);
  data.totalPopulation = Math.max(data.runPopulation, nonnegative(saved.totalPopulation));
  data.highestBuildingLevel = Math.min(MAX_LEVEL, Math.max(1, nonnegative(saved.highestBuildingLevel, 1)));
  for (const key of Object.keys(data.powerups)) {
    // Missing counters in an existing save never grant another lifetime power-up.
    data.powerups[key] = saved.powerups?.[key] === 1 ? 1 : 0;
  }
  const legacy = saved.themeUnlockVersion === undefined;
  const previouslyUnlocked = Array.isArray(saved.unlockedThemeIds) ? saved.unlockedThemeIds : [];
  data.unlockedThemeIds = THEMES.filter((theme) => previouslyUnlocked.includes(theme.id)
    || data.totalPopulation >= theme.unlockRequirement
    || (legacy && data.totalPopulation >= LEGACY_THEME_THRESHOLDS[theme.id])).map((theme) => theme.id);
  if (data.unlockedThemeIds.includes(saved.activeThemeId)) data.activeThemeId = saved.activeThemeId;
  data.grid = validGrid(saved.grid) ? cloneGrid(saved.grid) : null;
  data.moveCount = nonnegative(saved.moveCount);
  data.muted = saved.muted === true;
  data.gameOver = Boolean(data.grid && !canMove(data.grid));
  data.runId = typeof saved.runId === 'string' && saved.runId ? saved.runId : createRunId();
  data.victoryShown = saved.victoryShown === true || Boolean(data.grid?.flat().includes(MAX_LEVEL));
  data.pendingScores = Array.isArray(saved.pendingScores) ? saved.pendingScores.filter((entry) => entry
    && typeof entry.runId === 'string' && typeof entry.username === 'string'
    && Number.isSafeInteger(entry.runPopulation) && entry.runPopulation >= 0
    && Number.isInteger(entry.highestBuildingLevel) && entry.highestBuildingLevel >= 1 && entry.highestBuildingLevel <= MAX_LEVEL
    && getTheme(entry.activeThemeId)).map((entry) => ({ ...entry })) : [];
  const snapshot = saved.undoSnapshot;
  if (data.grid && validGrid(snapshot?.grid) && Number.isSafeInteger(snapshot.runPopulation)
      && snapshot.runPopulation >= 0 && snapshot.runPopulation <= data.totalPopulation) {
    data.undoSnapshot = {
      grid: cloneGrid(snapshot.grid), runPopulation: snapshot.runPopulation,
      moveCount: nonnegative(snapshot.moveCount),
    };
  }
  if (data.grid) data.highestBuildingLevel = Math.max(data.highestBuildingLevel, ...data.grid.flat());
  data.updatedAt = saved.updatedAt ?? null;
  return data;
}

// Storage and future network sync are adapters; neither game rules nor rendering use localStorage directly.
export class GameState {
  constructor({ storage = browserStorage(), storageKey = STORAGE_KEY } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.listeners = new Set();
    this.persistenceError = null;
    let saved = null;
    try { saved = JSON.parse(this.storage?.getItem(this.storageKey) ?? 'null'); }
    catch (error) { this.persistenceError = error; }
    this.data = hydrate(saved);
    this.authenticated = false;
    this.serverVersion = 0;
    this.serverTotalPopulation = 0;
    // Persist the migration immediately; later reloads must use the new thresholds.
    if (saved?.schemaVersion === SCHEMA_VERSION && (saved.themeUnlockVersion === undefined || !saved.runId)) this.persist();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  commit(type, mutate, details = {}) {
    mutate(this.data);
    this.data.updatedAt = new Date().toISOString();
    this.persist();
    for (const listener of this.listeners) listener(this.data, { type, ...details });
  }

  persist() {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.exportSnapshot()));
      this.persistenceError = null;
    } catch (error) { this.persistenceError = error; }
  }

  exportSnapshot() { return clone(this.data); }

  // Step 3 can send this versioned DTO through an authenticated sync adapter.
  // The session token is deliberately excluded from the payload.
  getSyncPayload() {
    const { token, ...payload } = this.exportSnapshot();
    return payload;
  }

  isThemeUnlocked(id) {
    const theme = getTheme(id);
    return Boolean(theme && (this.data.unlockedThemeIds.includes(id)
      || this.data.totalPopulation >= theme.unlockRequirement));
  }

  getNextTheme() { return THEMES.find((theme) => !this.isThemeUnlocked(theme.id)) ?? null; }

  startNewRun(grid) {
    this.commit('new-run', (data) => {
      data.grid = cloneGrid(grid);
      data.runPopulation = 0;
      data.moveCount = 0;
      data.undoSnapshot = null;
      data.gameOver = !canMove(grid);
      data.runId = createRunId();
      data.victoryShown = false;
      data.highestBuildingLevel = Math.max(data.highestBuildingLevel, ...grid.flat());
    });
  }

  recordMove(grid, merges) {
    const theme = getTheme(this.data.activeThemeId);
    const rewards = merges.map((merge) => ({
      ...merge, population: Math.round((BASE_POP[merge.level] ?? 0) * theme.multiplier),
    }));
    const earned = rewards.reduce((sum, merge) => sum + merge.population, 0);
    const previousTotal = this.data.totalPopulation;
    const victory = !this.data.victoryShown && merges.some((merge) => merge.level === MAX_LEVEL);
    const unlocked = THEMES.filter((item) => !this.isThemeUnlocked(item.id) && item.unlockRequirement > previousTotal
      && item.unlockRequirement <= previousTotal + earned);
    this.commit('move', (data) => {
      data.undoSnapshot = { grid: cloneGrid(data.grid), runPopulation: data.runPopulation, moveCount: data.moveCount };
      data.grid = cloneGrid(grid);
      data.runPopulation += earned;
      data.totalPopulation += earned;
      data.unlockedThemeIds = THEMES.filter((item) => data.unlockedThemeIds.includes(item.id)
        || item.unlockRequirement <= data.totalPopulation).map((item) => item.id);
      data.highestBuildingLevel = Math.max(data.highestBuildingLevel, ...grid.flat());
      data.moveCount++;
      data.gameOver = !canMove(grid);
      if (victory) data.victoryShown = true;
    }, { earned, rewards, unlocked, victory });
    return { earned, rewards, unlocked, victory };
  }

  undo(serverConfirmed = false) {
    if ((!serverConfirmed && !this.data.powerups.undo) || !this.data.undoSnapshot) return false;
    this.commit('undo', (data) => {
      const snapshot = data.undoSnapshot;
      data.grid = cloneGrid(snapshot.grid);
      data.runPopulation = snapshot.runPopulation;
      data.moveCount = snapshot.moveCount;
      data.powerups.undo = 0;
      data.undoSnapshot = null;
      data.gameOver = !canMove(data.grid);
    });
    return true;
  }

  usePowerup(kind, grid, serverConfirmed = false) {
    if (!['swap', 'sweeper'].includes(kind) || (!serverConfirmed && !this.data.powerups[kind]) || !validGrid(grid)) return false;
    this.commit(kind, (data) => {
      data.grid = cloneGrid(grid);
      data.powerups[kind] = 0;
      data.gameOver = !canMove(grid);
    });
    return true;
  }

  setActiveTheme(id) {
    if (!this.isThemeUnlocked(id)) return false;
    this.commit('theme', (data) => { data.activeThemeId = id; });
    return true;
  }

  setMuted(muted) { this.commit('audio', (data) => { data.muted = Boolean(muted); }); }

  setAccount({ username = this.data.username, token = this.data.token }) {
    this.commit('account', (data) => { data.username = username; data.token = token; });
  }

  applyServerProfile(profile, { force = false } = {}) {
    if (!profile || typeof profile.username !== 'string' || typeof profile.token !== 'string'
      || !Number.isSafeInteger(profile.totalPopulation) || profile.totalPopulation < 0
      || !Number.isInteger(profile.highestBuildingLevel) || profile.highestBuildingLevel < 1 || profile.highestBuildingLevel > MAX_LEVEL
      || !['undo', 'swap', 'sweeper'].every((key) => profile.powerups?.[key] === 0 || profile.powerups?.[key] === 1)) return false;
    if (!force && profile.username === this.data.username && (profile.version ?? 0) < this.serverVersion) return false;
    this.authenticated = true;
    this.serverVersion = profile.version ?? 0;
    this.serverTotalPopulation = profile.totalPopulation;
    this.commit('profile', (data) => {
      data.username = profile.username; data.token = profile.token;
      data.totalPopulation = profile.totalPopulation;
      data.highestBuildingLevel = profile.highestBuildingLevel;
      data.powerups = { ...profile.powerups };
      data.unlockedThemeIds = THEMES.filter((theme) => theme.unlockRequirement <= profile.totalPopulation).map((theme) => theme.id);
      if (!data.unlockedThemeIds.includes(data.activeThemeId)) data.activeThemeId = DEFAULT_THEME_ID;
    });
    return true;
  }

  applyServerPowerups(powerups) {
    if (!['undo', 'swap', 'sweeper'].every((key) => powerups?.[key] === 0 || powerups?.[key] === 1)) return;
    this.commit('powerups-sync', (data) => { data.powerups = { ...powerups }; });
  }

  queueScore(entry) {
    if (!this.data.pendingScores.some((item) => item.runId === entry.runId && item.runPopulation === entry.runPopulation
      && item.activeThemeId === entry.activeThemeId && item.highestBuildingLevel === entry.highestBuildingLevel)) {
      this.data.pendingScores.push(clone(entry)); this.persist();
    }
  }

  removeQueuedScore(entry) {
    this.data.pendingScores = this.data.pendingScores.filter((item) => item.runId !== entry.runId
      || item.runPopulation !== entry.runPopulation || item.activeThemeId !== entry.activeThemeId
      || item.highestBuildingLevel !== entry.highestBuildingLevel);
    this.persist();
  }
}
