import { THEMES, formatNumber, getTheme, populationBonus } from '../config/themesConfig.js';
import { BUILDING_TITLES } from '../config/buildingsConfig.js';
import { BASE_POP } from '../game/boardLogic.js';
import { validateUsername } from '../services/ApiService.js';
import { ModalManager } from './ModalManager.js';
import { button, el, icon } from './elements.js';
import { THEME_REQUIREMENTS } from '../../shared/validation.js';

export class GameUI {
  constructor({ state, api, sound, thumbnails, getEngine, notice, onModalChange }) {
    Object.assign(this, { state, api, sound, thumbnails, getEngine, notice });
    this.leaderboardRequest = 0;
    this.pendingGameOver = null;
    this.modals = new ModalManager({
      onChange: (open, kind) => {
        this.getEngine()?.setPaused(open || !this.state.authenticated);
        onModalChange?.(open, kind);
      },
      onClose: (kind) => {
        if (kind !== 'gameover' && this.pendingGameOver && this.state.data.gameOver && this.state.data.username) this.openGameOver();
      },
    });
    this.unsubscribe = state.subscribe((data, event) => {
      if (this.modals.kind === 'kingdoms' && ['theme', 'move', 'profile'].includes(event.type)) this.openKingdoms();
      if (this.modals.kind === 'themes' && ['theme', 'move', 'profile'].includes(event.type)) this.openThemes();
    });
  }

  async start() {
    this.getEngine()?.setPaused(true);
    if (!this.state.data.username || !this.state.data.token) { this.openWelcome(); return; }
    const content = el('div', 'session-sync leaderboard-loading');
    content.append(el('span', 'spinner'), el('p', '', 'جمعیت و کمک‌های شما در حال بازیابی است…'));
    this.modals.open({ kind: 'session', title: 'پادشاهی شما در راه است', content, dismissible: false });
    const response = await this.api.getProfile();
    if (response.ok) {
      const pending = await this.api.flushPendingScores();
      if (!pending.ok) this.notice('یکی از رکوردهای شما هنوز ثبت نشده است؛ در اتصال بعدی دوباره تلاش می‌کنیم.');
      this.modals.close(true);
      if (this.pendingGameOver) this.submitPendingScore();
    } else if ([401, 404].includes(response.status)) {
      this.state.authenticated = false;
      this.state.setAccount({ username: '', token: null });
      this.openWelcome();
      this.notice('نشست قبلی معتبر نیست؛ برای آغاز سفر، نام کاربری خود را انتخاب کنید.');
    } else {
      content.replaceChildren(icon('kingdom'), el('p', 'form-error', response.error),
        button('تلاش دوباره', 'primary-button', () => this.start(), 'restart'));
    }
  }

  image(theme, level, className = '') {
    const holder = el('div', `miniature ${className}`);
    try {
      const image = el('img');
      image.src = this.thumbnails.render(theme, level);
      image.alt = `${BUILDING_TITLES[level - 1]} در ${theme.title}`;
      image.width = image.height = 180;
      image.decoding = 'async';
      image.draggable = false;
      holder.append(image);
    } catch {
      holder.append(icon('kingdom'), el('span', 'miniature-fallback', 'تصویر در دسترس نیست'));
    }
    return holder;
  }

  progress(total, target, label) {
    const wrapper = el('div', 'modal-progress');
    const text = el('div', 'modal-progress-label');
    text.append(el('span', '', label));
    const fraction = el('bdi', '', `${formatNumber(total)} / ${formatNumber(target)}`);
    fraction.dir = 'ltr';
    text.append(fraction);
    const track = el('div', 'progress-track');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', label);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(target));
    track.setAttribute('aria-valuenow', String(Math.min(total, target)));
    const fill = el('div', 'progress-fill');
    fill.style.width = `${Math.min(100, total / Math.max(1, target) * 100)}%`;
    track.append(fill);
    wrapper.append(text, track);
    return wrapper;
  }

  openWelcome() {
    const content = el('div', 'welcome-body');
    const theme = getTheme(this.state.data.activeThemeId);
    const hero = el('div', 'welcome-hero');
    hero.append(el('span', 'welcome-star welcome-star--one', '✦'), this.image(theme, 10), el('span', 'welcome-star welcome-star--two', '✧'));
    const instructions = el('ol', 'how-to-strip');
    [['kingdom', 'ادغام خانه‌های هم‌سطح'], ['users', 'افزایش جمعیت'], ['crown', 'باز کردن پادشاهی‌های جدید']].forEach(([symbol, title], index) => {
      const item = el('li');
      const badge = el('span', 'how-to-icon'); badge.append(icon(symbol));
      item.append(badge, el('span', '', title));
      instructions.append(item);
      if (index < 2) { const arrow = el('span', 'how-to-arrow', '←'); arrow.setAttribute('aria-hidden', 'true'); instructions.append(arrow); }
    });
    const form = el('form', 'username-form');
    form.noValidate = true;
    const label = el('label', '', 'نام کاربری دلخواه خود را وارد کنید');
    label.htmlFor = 'username-input';
    const input = el('input', 'username-input');
    input.id = 'username-input'; input.name = 'username'; input.type = 'text'; input.dir = 'auto';
    input.autocomplete = 'username'; input.autocapitalize = 'off'; input.spellcheck = false;
    input.minLength = 3; input.maxLength = 16; input.required = true; input.autofocus = true;
    input.placeholder = 'مثلاً: فرمانروای_سبز';
    input.setAttribute('aria-describedby', 'username-hint username-error');
    const hint = el('div', 'username-hint'); hint.id = 'username-hint';
    const counter = el('bdi', 'username-counter', '۰ / ۱۶'); counter.dir = 'ltr';
    hint.append(el('span', '', '۳ تا ۱۶ نویسه؛ حروف فارسی یا انگلیسی، عدد و _'), counter);
    const error = el('p', 'form-error'); error.id = 'username-error'; error.setAttribute('role', 'alert');
    const submit = button('شروع فرمانروایی', 'primary-button welcome-submit', null, 'crown');
    submit.type = 'submit';
    let pending = false;
    input.addEventListener('input', () => {
      counter.textContent = `${formatNumber([...input.value].length)} / ${formatNumber(16)}`;
      error.textContent = ''; input.removeAttribute('aria-invalid');
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (pending) return;
      const validation = validateUsername(input.value);
      if (!validation.ok) { error.textContent = validation.error; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      pending = true; submit.disabled = true; input.readOnly = true;
      submit.textContent = 'در حال آماده‌کردن قلمرو…';
      void this.sound.unlock();
      const result = await this.api.registerUsername(validation.username);
      if (result.ok) {
        await this.sound.unlock();
        this.getEngine()?.setPaused(true);
        this.modals.close(true);
        this.notice(`${result.profile.username}، قصهٔ پادشاهی شما از همین‌جا شروع می‌شود!`);
        if (this.pendingGameOver) this.submitPendingScore();
      } else {
        error.textContent = result.error;
        input.setAttribute('aria-invalid', 'true'); input.readOnly = false;
        pending = false; submit.disabled = false;
        submit.replaceChildren(icon('crown'), document.createTextNode('شروع فرمانروایی'));
        input.focus();
      }
    });
    form.append(label, input, hint, error, submit);
    content.append(hero, instructions, form);
    this.modals.open({ kind: 'welcome', title: 'به قلمرو ۲۰۴۸ خوش آمدید!',
      subtitle: 'از چند خانهٔ کوچک، پادشاهیِ قصه‌وار خودتان را بسازید.', content, dismissible: false });
  }

  openKingdoms() {
    const theme = getTheme(this.state.data.activeThemeId);
    const content = el('div', 'encyclopedia-body');
    const summary = el('div', 'encyclopedia-summary');
    summary.append(el('span', '', theme.title), el('strong', '', `${formatNumber(this.state.data.highestBuildingLevel)} از ${formatNumber(13)} سازه کشف شده`));
    const grid = el('div', 'building-grid');
    BUILDING_TITLES.forEach((title, index) => {
      const level = index + 1;
      const unlocked = level <= this.state.data.highestBuildingLevel;
      const card = el('article', `building-card${unlocked ? '' : ' is-locked'}`);
      card.dataset.level = String(level);
      const preview = this.image(theme, level);
      if (!unlocked) {
        const lock = el('span', 'discovery-lock'); lock.append(icon('lock'));
        preview.append(lock);
      }
      card.append(el('span', 'building-level', `سطح ${formatNumber(level)}`), preview,
        el('h2', '', title), el('span', unlocked ? 'building-population' : 'building-locked-label',
          unlocked ? `+${formatNumber(BASE_POP[level] ?? 0)} جمعیت` : 'قفل شده'));
      grid.append(card);
    });
    content.append(summary, grid);
    this.modals.open({ kind: 'kingdoms', title: 'ساختمان‌ها', subtitle: 'از مصالح اولیه تا ارگ نهایی پادشاهی؛ هر ادغام یک کشف تازه است.',
      content, symbol: 'kingdom' });
  }

  async chooseTheme(themeId) {
    if (this.themeSelectionPending || !this.state.authenticated) return;
    this.themeSelectionPending = true;
    this.getEngine()?.setPaused(true);
    try {
      // Bank this run's progress before using a newly unlocked multiplier on the server.
      if (this.state.serverTotalPopulation < THEME_REQUIREMENTS[themeId]) {
        const response = await this.api.submitScore(this.runStats());
        if (!response.ok) { this.notice(response.error); return; }
      }
      if (!this.getEngine()?.switchTheme(themeId)) return;
      this.sound.play('themeUnlock');
      this.modals.close();
    } finally {
      this.themeSelectionPending = false;
      if (!this.modals.kind) this.getEngine()?.setPaused(false);
    }
  }

  openThemes() {
    const content = el('div', 'theme-card-list');
    THEMES.forEach((theme, index) => {
      const unlocked = this.state.isThemeUnlocked(theme.id);
      const active = theme.id === this.state.data.activeThemeId;
      const card = el('article', `theme-card${active ? ' is-active' : ''}${unlocked ? '' : ' is-locked'}`);
      card.dataset.themeId = theme.id;
      card.style.setProperty('--card-tint', theme.module.themeMeta.backgroundColor);
      card.style.setProperty('--card-accent', theme.module.themeMeta.accentColor);
      const preview = this.image(theme, 13, 'theme-miniature');
      const copy = el('div', 'theme-card-copy');
      const heading = el('div', 'theme-card-heading');
      heading.append(el('h2', '', theme.title), el('span', 'multiplier-badge', index ? populationBonus(theme) : 'عادی'));
      copy.append(heading);
      if (unlocked) {
        copy.append(el('p', '', index ? 'در این سرزمین، هر ادغام جمعیت بیشتری می‌آورد.' : 'یک شروع سبز برای قصه‌های بزرگ.'));
        if (active) { const badge = el('span', 'active-theme-badge', 'فعال'); badge.prepend(icon('check')); copy.append(badge); }
        else copy.append(button('انتخاب پادشاهی', 'primary-button theme-select-button', () => this.chooseTheme(theme.id), 'leaf'));
      } else {
        const requirement = el('p', 'theme-requirement', `نیاز به ${formatNumber(theme.unlockRequirement)} جمعیت کل`);
        requirement.prepend(icon('lock'));
        copy.append(requirement, this.progress(this.state.data.totalPopulation, theme.unlockRequirement, 'جمعیت کل شما'));
      }
      card.append(preview, copy);
      content.append(card);
    });
    this.modals.open({ kind: 'themes', title: 'پادشاهی‌ها',
      subtitle: 'جمعیت جمع کنید، پادشاهی باز کنید و قصه را با رنگ‌های تازه ادامه دهید.', content, symbol: 'palette' });
  }

  openLeaderboard(period = 'daily') {
    const content = el('div', 'leaderboard-body');
    const tabs = el('div', 'leaderboard-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'بازهٔ برترین‌ها');
    const board = el('div', 'leaderboard-entries'); board.id = 'leaderboard-panel'; board.setAttribute('role', 'tabpanel');
    const footer = el('div', 'leaderboard-personal');
    const buttons = [];
    for (const [value, label] of [['daily', 'برترین‌های امروز'], ['alltime', 'برترین‌های کل']]) {
      const tab = button(label, 'leaderboard-tab', () => load(value));
      tab.setAttribute('role', 'tab'); tab.id = `tab-${value}`; tab.setAttribute('aria-controls', board.id);
      tabs.append(tab); buttons.push({ value, tab });
    }
    tabs.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = buttons.findIndex(({ tab }) => tab === document.activeElement);
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (current + 1) % 2;
      buttons[target].tab.focus(); void load(buttons[target].value);
    });
    const load = async (value) => {
      const request = ++this.leaderboardRequest;
      for (const { value: key, tab } of buttons) { tab.setAttribute('aria-selected', String(key === value)); tab.tabIndex = key === value ? 0 : -1; }
      board.setAttribute('aria-labelledby', `tab-${value}`); board.setAttribute('aria-busy', 'true');
      const loading = el('div', 'leaderboard-loading'); loading.setAttribute('role', 'status');
      loading.append(el('span', 'spinner'), el('span', '', 'در حال آوردن برترین فرمانرواها…'));
      board.replaceChildren(loading); footer.replaceChildren(el('span', '', 'رکورد شما در حال بررسی است…'));
      const response = await this.api.getLeaderboard(value);
      if (request !== this.leaderboardRequest || this.modals.kind !== 'leaderboard') return;
      board.setAttribute('aria-busy', 'false');
      board.replaceChildren();
      if (!Array.isArray(response.entries)) {
        const error = el('div', 'leaderboard-loading');
        error.append(el('p', 'form-error', response.error ?? 'جدول برترین‌ها در دسترس نیست.'), button('دوباره تلاش کنید', 'secondary-button', () => load(value), 'restart'));
        board.append(error); footer.replaceChildren(el('span', '', 'رکورد شما محفوظ است.')); return;
      }
      const headings = el('div', 'leaderboard-column-labels');
      headings.append(el('span', '', 'رتبه'), el('span', '', 'فرمانروا و پادشاهی'), el('span', '', 'جمعیت'));
      board.append(headings);
      if (!response.entries.length) board.append(el('div', 'leaderboard-loading leaderboard-empty', 'هنوز رکوردی ثبت نشده است؛ اولین نفر باشید!'));
      for (const entry of response.entries) {
        const own = entry.username === this.state.data.username;
        const row = el('div', `leaderboard-row${own ? ' is-player' : ''}`);
        row.dataset.rank = String(entry.rank);
        const rank = el('span', `rank-badge rank-badge--${entry.rank <= 3 ? entry.rank : 'plain'}`,
          ['🥇', '🥈', '🥉'][entry.rank - 1] ?? formatNumber(entry.rank));
        rank.setAttribute('aria-label', `رتبهٔ ${formatNumber(entry.rank)}`);
        const copy = el('div', 'leaderboard-player');
        const name = el('bdi', '', entry.username); name.dir = 'auto';
        const title = el('strong'); title.append(name);
        if (own) title.append(el('span', 'you-badge', 'شما'));
        copy.append(title, el('span', 'leaderboard-theme', getTheme(entry.themeId)?.title ?? 'چمنزار قصه‌ها'));
        const score = el('div', 'leaderboard-score'); score.append(el('strong', '', formatNumber(entry.score)), el('small', '', 'جمعیت'));
        row.append(rank, copy, score); board.append(row);
      }
      const personal = response.userBest;
      const bestCopy = el('div'); bestCopy.append(el('small', '', value === 'daily' ? 'بهترین جمعیت امروز شما' : 'بهترین جمعیت تمام سفر شما'),
        el('strong', '', `${formatNumber(personal?.score ?? 0)} جمعیت`));
      const bestRank = el('span', 'personal-rank', personal?.rank ? `رتبهٔ ${formatNumber(personal.rank)}`
        : personal?.score ? 'خارج از ۱۰ نفر برتر' : 'اولین قصه‌تان را بسازید');
      footer.replaceChildren(icon('trophy'), bestCopy, bestRank);
    };
    content.append(tabs, board);
    this.modals.open({ kind: 'leaderboard', title: 'برترین فرمانرواها', subtitle: 'هر خانهٔ تازه، شما را یک قدم به صدر جدول نزدیک می‌کند.', content, footer, symbol: 'trophy' });
    void load(period);
  }

  openVictory() {
    const content = el('div', 'celebration-body');
    const confetti = el('div', 'confetti'); confetti.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 22; index++) {
      const piece = el('i'); piece.style.setProperty('--i', String(index)); confetti.append(piece);
    }
    content.append(confetti, this.image(getTheme(this.state.data.activeThemeId), 13, 'victory-miniature'),
      el('p', 'celebration-message', 'از اولین مصالح تا ارگ پادشاهی؛ این شکوه را شما ساختید!'),
      el('strong', 'celebration-score', `${formatNumber(this.state.data.runPopulation)} جمعیت`));
    const actions = el('div', 'celebration-actions');
    actions.append(button('ادامه بازی برای رکورد بالاتر', 'primary-button', () => this.modals.close(), 'crown'),
      button('مشاهده برترین‌ها', 'secondary-button', () => this.openLeaderboard(), 'trophy'));
    content.append(actions);
    this.modals.open({ kind: 'victory', title: '👑 تبریک! ارگ نهایی ساخته شد!', subtitle: 'یک پادشاهی بزرگ، یک قصهٔ فراموش‌نشدنی.', content });
    this.sound.play('themeUnlock');
  }

  runStats() {
    const { runPopulation, highestBuildingLevel, activeThemeId } = this.state.data;
    return { runPopulation, highestBuildingLevel, activeThemeId };
  }

  handleGameOver(over) {
    if (!over) { this.pendingGameOver = null; return; }
    const { runId } = this.state.data;
    if (this.pendingGameOver?.runId !== runId) this.pendingGameOver = { runId, stats: this.runStats(), response: null, promise: null };
    if (!this.state.authenticated) return;
    this.submitPendingScore();
    if (!this.modals.kind) this.openGameOver();
  }

  submitPendingScore() {
    const pending = this.pendingGameOver;
    if (!pending || pending.promise) return;
    pending.promise = this.api.submitScore(pending.stats).then((response) => {
      pending.response = response;
      if (this.pendingGameOver === pending && this.modals.kind === 'gameover') this.updateGameOverStatus();
    });
  }

  updateGameOverStatus() {
    const status = this.modals.dialog.querySelector('.score-submission-status');
    if (!status) return;
    status.replaceChildren();
    const response = this.pendingGameOver?.response;
    if (!response) { status.append(el('span', 'spinner'), el('span', '', 'در حال ثبت قصهٔ شما…')); return; }
    if (!response.ok) {
      status.append(el('span', 'form-error', response.error), button('تلاش دوباره', 'text-button', () => {
        this.pendingGameOver.promise = null; this.pendingGameOver.response = null;
        this.updateGameOverStatus(); this.submitPendingScore();
      }));
      return;
    }
    if (response.isNewAllTimeBest || response.isNewDailyBest) {
      const badge = el('span', 'personal-best-badge', response.isNewAllTimeBest ? '🏆 رکورد شخصی تازه!' : '✨ بهترین رکورد امروز شما!');
      status.append(badge);
    } else status.append(icon('check'), el('span', '', 'این قصه در رکوردهای شما ثبت شد.'));
  }

  openGameOver() {
    if (!this.pendingGameOver || !this.state.data.gameOver) return;
    const content = el('div', 'end-run-body');
    content.append(el('p', 'end-run-message', 'جایی برای حرکت نمانده؛ یک قصهٔ تازه در انتظار شماست.'),
      el('span', 'end-run-score-label', 'جمعیت نهایی این دور'),
      el('strong', 'end-run-score', formatNumber(this.pendingGameOver.stats.runPopulation)));
    const status = el('div', 'score-submission-status'); status.setAttribute('role', 'status');
    content.append(status);
    const next = this.state.getNextTheme();
    if (next) content.append(this.progress(this.state.data.totalPopulation, next.unlockRequirement, `جمعیت کل؛ تا ${next.title}`));
    else content.append(el('p', 'all-themes-unlocked', 'همه پادشاهی‌ها باز شدند!'));
    const actions = el('div', 'celebration-actions');
    actions.append(button('بازی دوباره', 'primary-button', () => this.restart(), 'restart'),
      button('برترین‌ها', 'secondary-button', () => this.openLeaderboard(), 'trophy'));
    content.append(actions);
    if (Object.values(this.state.data.powerups).some(Boolean)) content.append(button('ادامه با کمک‌ها', 'text-button', () => this.modals.close()));
    this.modals.open({ kind: 'gameover', title: 'پایان بازی', subtitle: 'هر پایان، آغاز یک پادشاهی تازه است.', content, symbol: 'leaf' });
    this.updateGameOverStatus();
  }

  restart() {
    if (!this.state.authenticated || this.getEngine()?.motion === 'powerup-request') return;
    if (this.state.data.runPopulation > 0 && !this.pendingGameOver) void this.api.submitScore(this.runStats());
    this.pendingGameOver = null;
    this.getEngine()?.newRun();
    this.modals.close(true);
  }

  dispose() {
    this.leaderboardRequest++;
    this.unsubscribe();
    this.modals.dispose();
  }
}
