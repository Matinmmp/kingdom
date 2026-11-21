import './styles.css';
import { THEMES, formatNumber, getTheme, populationBonus } from './config/themesConfig.js';
import { GameState } from './state/GameState.js';
import { GameEngine } from './game/GameEngine.js';
import { SoundManager } from './game/SoundManager.js';
import { ThumbnailRenderer } from './game/ThumbnailRenderer.js';
import { ApiService } from './services/ApiService.js';
import { GameUI } from './ui/GameUI.js';
import { BUILDING_TITLES } from './config/buildingsConfig.js';
import { icon } from './ui/elements.js';

const $ = (id) => document.getElementById(id);
const SWATCHES = ['#deebce', '#f3dfb4', '#e8e8e1', '#f4dce3', '#dfeef2'];
export const state = new GameState();
export const sound = new SoundManager({ muted: state.data.muted });
export const api = new ApiService({ state });
export let engine;
export let ui;
export let thumbnails;
let toastTimer;
let unlockTimer;
let previousPopulation = state.data.runPopulation;

function notice(message, kind = 'info', themeId) {
  const unlocked = kind === 'unlock';
  clearTimeout(unlocked ? unlockTimer : toastTimer);
  const region = $(unlocked ? 'unlock-toast-region' : 'toast-region');
  const toast = document.createElement('div');
  toast.className = `toast toast--${kind}`;
  toast.append(icon(kind === 'unlock' ? 'crown' : 'spark'));
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);
  if (themeId) {
    const button = document.createElement('button');
    button.textContent = 'بریم!';
    button.addEventListener('click', () => {
      ui?.chooseTheme(themeId);
      region.replaceChildren();
    });
    toast.append(button);
  }
  region.replaceChildren(toast);
  const timer = setTimeout(() => region.replaceChildren(), unlocked ? 7000 : 3500);
  if (unlocked) unlockTimer = timer;
  else toastTimer = timer;
}

function renderThemes() {
  const picker = $('theme-picker');
  picker.replaceChildren();
  THEMES.forEach((theme, index) => {
    const unlocked = state.isThemeUnlocked(theme.id);
    const active = theme.id === state.data.activeThemeId;
    const button = document.createElement('button');
    button.className = `theme-option${active ? ' is-active' : ''}`;
    button.disabled = !unlocked;
    button.setAttribute('aria-pressed', String(active));
    button.dataset.themeId = theme.id;
    const swatch = document.createElement('span');
    swatch.className = 'theme-swatch';
    swatch.style.background = SWATCHES[index];
    swatch.append(icon(index === 0 ? 'leaf' : 'kingdom'));
    const copy = document.createElement('span');
    copy.className = 'theme-option-copy';
    const title = document.createElement('strong');
    title.textContent = theme.title;
    const description = document.createElement('small');
    description.textContent = unlocked ? populationBonus(theme)
      : `${formatNumber(theme.unlockRequirement)} نفر جمعیت کل · ${populationBonus(theme)}`;
    copy.append(title, description);
    button.append(swatch, copy);
    if (!unlocked || active) button.append(icon(active ? 'check' : 'lock'));
    button.addEventListener('click', () => {
      ui?.chooseTheme(theme.id);
      closePicker();
    });
    picker.append(button);
  });
}

function updatePowerups() {
  const data = state.data;
  const busy = Boolean(engine?.motion || engine?.paused || !state.authenticated);
  $('undo-button').disabled = busy || !data.powerups.undo || !data.undoSnapshot;
  $('swap-button').disabled = busy || !data.powerups.swap || (data.grid?.flat().filter(Boolean).length ?? 0) < 2;
  $('sweeper-button').disabled = busy || !data.powerups.sweeper || !data.grid?.flat().some((level) => level === 1 || level === 2);
  $('swap-button').classList.toggle('is-active', Boolean(engine?.swapMode));
  $('swap-button').setAttribute('aria-pressed', String(Boolean(engine?.swapMode)));
  for (const kind of ['undo', 'swap', 'sweeper']) {
    $(`${kind}-count`).textContent = formatNumber(data.powerups[kind]);
  }
  $('swap-banner').hidden = !engine?.swapMode;
  const confirming = engine?.motion === 'powerup-request';
  $('cancel-swap').disabled = confirming;
  $('swap-banner-hint').textContent = confirming ? 'در حال جابه‌جایی ساختمان‌ها…'
    : engine?.selectedCell ? 'ساختمان اول انتخاب شد؛ حالا ساختمان دوم را انتخاب کنید.' : 'کمک شما پس از جابه‌جایی مصرف می‌شود.';
  document.querySelector('.quick-actions [data-new-run]').disabled = confirming;
}

function updateHUD(data, event = {}) {
  $('run-population').textContent = formatNumber(data.runPopulation);
  $('run-population').style.setProperty('--score-characters', formatNumber(data.runPopulation).length);
  $('total-population').textContent = formatNumber(data.totalPopulation);
  $('highest-building').textContent = BUILDING_TITLES[data.highestBuildingLevel - 1];
  $('highest-level').textContent = `سطح ${formatNumber(data.highestBuildingLevel)} از ${formatNumber(13)}`;
  $('username-badge').hidden = !data.username;
  $('username-label').textContent = data.username;
  $('brand-tagline').hidden = Boolean(data.username);
  $('move-count').textContent = `${formatNumber(data.moveCount)} حرکت`;
  const theme = getTheme(data.activeThemeId);
  $('active-theme-title').textContent = theme.title;
  $('theme-bonus').textContent = populationBonus(theme);
  document.documentElement.style.setProperty('--theme-accent', theme.module.themeMeta.accentColor);
  document.documentElement.style.setProperty('--world-tint', theme.module.themeMeta.backgroundColor);
  const nextTheme = state.getNextTheme();
  const progress = $('population-progress');
  const target = nextTheme?.unlockRequirement ?? THEMES.at(-1).unlockRequirement;
  const fraction = nextTheme ? data.totalPopulation / target : 1;
  $('progress-fill').style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', String(target));
  progress.setAttribute('aria-valuenow', String(Math.min(data.totalPopulation, target)));
  progress.setAttribute('aria-valuetext', nextTheme
    ? `${formatNumber(data.totalPopulation)} از ${formatNumber(target)} نفر برای ${nextTheme.title}`
    : 'همه پادشاهی‌ها باز شدند!');
  $('next-theme-label').textContent = nextTheme ? `به‌سوی ${nextTheme.title}` : 'همه پادشاهی‌ها باز شدند!';
  $('progress-hint').textContent = nextTheme
    ? `${formatNumber(Math.max(0, target - data.totalPopulation))} نفر تا یک قصهٔ تازه` : 'پنج سرزمین، بی‌نهایت قصه';
  $('progress-fraction').textContent = nextTheme ? `${formatNumber(data.totalPopulation)} / ${formatNumber(target)}` : '۵ از ۵ سرزمین';
  $('mute-button').setAttribute('aria-pressed', String(data.muted));
  $('mute-button').setAttribute('aria-label', data.muted ? 'وصل صدا' : 'قطع صدا');
  $('mute-button').title = data.muted ? 'وصل صدا' : 'قطع صدا';
  $('sound-icon').setAttribute('href', data.muted ? '#i-muted' : '#i-volume');
  if (data.runPopulation > previousPopulation) {
    const value = $('run-population').parentElement;
    value.classList.remove('is-bumping');
    void value.offsetWidth;
    value.classList.add('is-bumping');
  }
  previousPopulation = data.runPopulation;
  updatePowerups();
  if (['theme', 'move', 'new-run'].includes(event.type) || !event.type) renderThemes();
  if (event.type === 'theme') warmThumbnails();
  if (event.type === 'profile' && engine && engine.theme.id !== data.activeThemeId) engine.switchTheme(data.activeThemeId);
}

function warmThumbnails() {
  const theme = getTheme(state.data.activeThemeId);
  thumbnails?.warm([
    ...THEMES.map((item) => ({ theme: item, level: 13 })),
    ...Array.from({ length: 12 }, (_, index) => ({ theme, level: index + 1 })),
  ]);
}

function closePicker() {
  $('theme-picker').hidden = true;
  $('world-button').setAttribute('aria-expanded', 'false');
}

state.subscribe(updateHUD);
updateHUD(state.data);

try {
  engine = new GameEngine({
    canvas: $('game-canvas'), viewport: $('board-viewport'), labelLayer: $('tile-labels'), effectsLayer: $('effects-layer'),
    state, sound, onNotice: notice, onStatus: updatePowerups,
    onGameOver: (over) => ui?.handleGameOver(over), onVictory: () => ui?.openVictory(),
    confirmPowerup: (kind) => api.consumePowerup(kind),
  });
  $('loading-panel').hidden = true;
  updatePowerups();
} catch (error) {
  console.error('Unable to start Kingdom 2048:', error);
  $('loading-panel').classList.add('is-error');
  $('loading-panel').replaceChildren();
  const title = document.createElement('strong');
  title.textContent = 'نمای سه‌بعدی در دسترس نیست';
  const description = document.createElement('p');
  description.textContent = 'WebGL را در مرورگر فعال کن یا از نسخهٔ تازهٔ کروم، فایرفاکس یا سافاری استفاده کن.';
  $('loading-panel').append(icon('kingdom'), title, description);
}

try { thumbnails = new ThumbnailRenderer(); }
catch { thumbnails = { render() { throw new Error('Thumbnail renderer unavailable.'); }, warm() {}, dispose() {} }; }
ui = new GameUI({ state, api, sound, thumbnails, getEngine: () => engine, notice,
  onModalChange: (open) => {
    closePicker(); updatePowerups();
    const unlocked = $('unlock-toast-region');
    unlocked.hidden = open;
    if (unlocked.childElementCount) {
      clearTimeout(unlockTimer);
      if (!open) unlockTimer = setTimeout(() => unlocked.replaceChildren(), 7000);
    }
  },
});
ui.start();
warmThumbnails();

document.querySelectorAll('[data-new-run]').forEach((button) => {
  button.setAttribute('aria-label', 'شروع مجدد');
  button.addEventListener('click', () => { closePicker(); ui.restart(); });
});
$('mute-button').addEventListener('click', async () => {
  state.setMuted(!state.data.muted);
  sound.setMuted(state.data.muted);
  await sound.unlock();
});
$('undo-button').addEventListener('click', () => engine?.undo());
$('swap-button').addEventListener('click', () => {
  engine?.toggleSwap();
});
$('sweeper-button').addEventListener('click', () => engine?.sweeper());
$('cancel-swap').addEventListener('click', () => engine?.cancelSwap());
$('world-button').addEventListener('click', () => {
  const opening = $('theme-picker').hidden;
  $('theme-picker').hidden = !opening;
  $('world-button').setAttribute('aria-expanded', String(opening));
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.world-selector')) closePicker();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePicker(); });
document.querySelectorAll('[data-modal]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.modal === 'kingdoms') ui.openKingdoms();
    else if (button.dataset.modal === 'themes') ui.openThemes();
    else ui.openLeaderboard();
  });
});
if (state.persistenceError) notice('ذخیره‌سازی مرورگر در دسترس نیست؛ این قصه فعلاً در همین صفحه می‌ماند.');

// Public UI integration surface; saved data remains owned by GameState.
window.kingdom2048 = Object.freeze({
  switchTheme: (id) => engine?.switchTheme(id) ?? false,
  newRun: () => ui.restart(),
  openKingdoms: () => ui.openKingdoms(), openThemes: () => ui.openThemes(),
  openLeaderboard: (period) => ui.openLeaderboard(period),
  getSnapshot: () => state.exportSnapshot(),
  getSyncPayload: () => state.getSyncPayload(),
});

if (import.meta.hot) import.meta.hot.dispose(() => {
  clearTimeout(toastTimer);
  clearTimeout(unlockTimer);
  ui?.dispose();
  thumbnails?.dispose();
  engine?.dispose();
  sound.dispose();
});
