import { test, expect } from '@playwright/test';

const KEY = 'kingdom2048:state:v1';
const blank = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
async function ready(page, overrides = {}) {
  const grid = blank(); grid[1][1] = 3;
  await page.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key: KEY, data: {
    schemaVersion: 1, themeUnlockVersion: 2, unlockedThemeIds: ['storybook_meadow'],
    username: 'آزمونگر', token: 'local_test', activeThemeId: 'storybook_meadow',
    runPopulation: 0, totalPopulation: 0, highestBuildingLevel: 3,
    powerups: { undo: 1, swap: 1, sweeper: 1 }, grid, moveCount: 0,
    undoSnapshot: null, gameOver: false, muted: true, ...overrides,
  } });
  await page.goto('/');
  await expect(page.locator('#loading-panel')).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(window.kingdom2048))).toBe(true);
  await page.evaluate(async () => {
    window.testGame = await import([...document.scripts].find((script) => script.src.includes('/src/main.js')).src);
  });
}

async function screenAxis(page, direction, distance = 100) {
  return page.evaluate(async ({ direction, distance }) => {
    const { engine } = window.testGame;
    const camera = engine.camera;
    const origin = camera.position.clone().set(0, 0, 0).project(camera);
    const axis = camera.position.clone().set(
      direction === 'right' ? 1 : direction === 'left' ? -1 : 0, 0,
      direction === 'down' ? 1 : direction === 'up' ? -1 : 0,
    ).project(camera).sub(origin);
    const bounds = engine.viewport.getBoundingClientRect();
    const dx = axis.x * bounds.width;
    const dy = -axis.y * bounds.height;
    const length = Math.hypot(dx, dy);
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2,
      dx: dx / length * distance, dy: dy / length * distance };
  }, { direction, distance });
}

async function drag(page, kind, { x, y, dx, dy }) {
  if (kind === 'mouse') {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  } else {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
}

const destinations = { right: [1, 3], down: [3, 1], left: [1, 0], up: [0, 1] };
for (const kind of ['mouse', 'touch']) {
  for (const [direction, [row, column]] of Object.entries(destinations)) {
    test(`${kind} drag along projected ${direction} axis moves in the matching visual direction`, async ({ page }) => {
      await page.setViewportSize(kind === 'touch' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
      await ready(page);
      await drag(page, kind, await screenAxis(page, direction));
      const data = await page.evaluate(() => window.kingdom2048.getSnapshot());
      expect(data.grid[row][column]).toBe(3);
      expect(data.moveCount).toBe(1);
      expect(data.grid.flat().filter(Boolean)).toHaveLength(2);
      expect(data.powerups).toEqual({ undo: 1, swap: 1, sweeper: 1 });
      expect(await page.evaluate(() => scrollY)).toBe(0);
    });
  }
}

test('drags below 24px stay taps, crossing the threshold consumes exactly one move, and cancel releases capture', async ({ page }) => {
  await ready(page);
  const short = await screenAxis(page, 'right', 23);
  await drag(page, 'mouse', short);
  expect((await page.evaluate(() => window.kingdom2048.getSnapshot())).moveCount).toBe(0);
  const long = await screenAxis(page, 'right', 26);
  await page.mouse.move(long.x, long.y);
  await page.mouse.down();
  await page.mouse.move(long.x + long.dx, long.y + long.dy);
  await page.mouse.move(long.x + long.dx * 3, long.y + long.dy * 3);
  await page.mouse.up();
  expect((await page.evaluate(() => window.kingdom2048.getSnapshot())).moveCount).toBe(1);
  await expect(page.locator('#game-canvas')).not.toHaveClass(/is-dragging/);
  await page.mouse.move(long.x, long.y);
  await page.mouse.down();
  await page.locator('#game-canvas').dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(page.locator('#game-canvas')).not.toHaveClass(/is-dragging/);
});

test('touch taps still choose both occupied buildings during Swap mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const grid = blank(); grid[1][1] = 3; grid[2][2] = 4;
  await ready(page, { grid, highestBuildingLevel: 4 });
  await page.locator('#swap-button').click();
  const session = await page.context().newCDPSession(page);
  for (const key of ['1,1', '2,2']) {
    const point = await page.evaluate(async (key) => {
      const { engine } = window.testGame;
      const point = engine.models.get(key).position.clone();
      point.y = 0.2;
      point.project(engine.camera);
      const bounds = engine.viewport.getBoundingClientRect();
      return { x: bounds.left + (point.x + 1) * bounds.width / 2,
        y: bounds.top + (1 - point.y) * bounds.height / 2 };
    }, key);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (key === '1,1') {
      expect((await page.evaluate(() => window.kingdom2048.getSnapshot())).powerups.swap).toBe(1);
      await expect(page.locator('#swap-button')).toHaveAttribute('aria-pressed', 'true');
    }
  }
  await expect.poll(() => page.evaluate(() => window.kingdom2048.getSnapshot().powerups.swap)).toBe(0);
  const data = await page.evaluate(() => window.kingdom2048.getSnapshot());
  expect(data.grid[1][1]).toBe(4);
  expect(data.grid[2][2]).toBe(3);
  expect(data.powerups.swap).toBe(0);
  expect(data.moveCount).toBe(0);
  await session.detach();
});

test('an existing save keeps its active kingdom, scores, and spent powers after the rebalance', async ({ page }) => {
  await ready(page, {
    themeUnlockVersion: undefined, unlockedThemeIds: undefined,
    activeThemeId: 'sakura_valley', runPopulation: 12345, totalPopulation: 425000,
    username: 'بازیکن', powerups: { undo: 0, swap: 1, sweeper: 0 },
  });
  await expect(page.locator('#active-theme-title')).toHaveText('دره شکوفه');
  await expect(page.locator('#population-progress')).toHaveAttribute('aria-valuemax', '5000000');
  await expect(page.locator('#run-population')).toHaveText('۱۲٬۳۴۵');
  await page.reload();
  await expect(page.locator('#loading-panel')).toBeHidden();
  const data = await page.evaluate(() => window.kingdom2048.getSnapshot());
  expect(data.activeThemeId).toBe('sakura_valley');
  expect(data.totalPopulation).toBe(425000);
  expect(data.powerups).toEqual({ undo: 0, swap: 1, sweeper: 0 });
});

test('ambient music produces quiet audio with soft fades and stops scheduling while muted', async ({ page }) => {
  await ready(page);
  await page.locator('#mute-button').click();
  const result = await page.evaluate(async () => {
    const { sound } = window.testGame;
    await sound.unlock();
    const context = sound.context;
    const music = sound.music;
    // Record real scheduled notes to verify spacing, pitch choices, and mute lifecycle.
    const notes = [];
    const originalVoice = sound.ambientVoice.bind(sound);
    sound.ambientVoice = (music, frequency, time, pad) => {
      notes.push({ frequency, time, pad: Boolean(pad) });
      originalVoice(music, frequency, time, pad);
    };
    sound.pauseProceduralMusic();
    music.nextNoteTime = context.currentTime + 0.05;
    music.nextPadTime = context.currentTime + 0.05;
    sound.scheduleProceduralMusic();
    const spacing = music.nextNoteTime - notes.find((note) => !note.pad).time;
    const filter = { type: music.filter.type, frequency: music.filter.frequency.value };
    sound.setMuted(true);
    const stoppedWhileMuted = music.timer === null;
    sound.setMuted(false);
    const resumed = music.timer !== null;
    const offline = new OfflineAudioContext(2, 44100 * 4, 44100);
    const offlineFilter = offline.createBiquadFilter();
    offlineFilter.type = 'lowpass'; offlineFilter.frequency.value = 750;
    offlineFilter.connect(offline.destination);
    sound.context = offline;
    const offlineMusic = { filter: offlineFilter, voices: new Set() };
    originalVoice(offlineMusic, 261.626, 0.1);
    const buffer = await offline.startRendering();
    sound.context = context;
    let peak = 0;
    const rms = (from, to) => {
      const samples = buffer.getChannelData(0).slice(Math.floor(from * 44100), Math.floor(to * 44100));
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    };
    for (const sample of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(sample));
    const fades = { attack: rms(0.1, 0.2), body: rms(0.45, 0.55), tail: rms(2.5, 2.7), silence: rms(3.5, 3.9) };
    sound.dispose();
    return { notes, spacing, filter, peak, fades, stoppedWhileMuted, resumed,
      stoppedOnDispose: music.timer === null && music.voices.size === 0 };
  });
  expect(result.filter).toEqual({ type: 'lowpass', frequency: 750 });
  expect(result.spacing).toBeGreaterThanOrEqual(1.5);
  expect(result.spacing).toBeLessThanOrEqual(3.5);
  const scale = [174.614, 195.998, 220, 261.626, 293.665, 349.228, 391.995, 440];
  for (const note of result.notes) expect(scale).toContain(note.frequency);
  expect(result.notes.filter((note) => note.pad)).toHaveLength(3);
  expect(result.peak).toBeGreaterThan(0.001);
  expect(result.peak).toBeLessThanOrEqual(0.04);
  expect(result.fades.attack).toBeLessThan(result.fades.body * 0.5);
  expect(result.fades.tail).toBeLessThan(result.fades.body * 0.35);
  expect(result.fades.silence).toBeLessThan(0.00001);
  expect(result.stoppedWhileMuted).toBe(true);
  expect(result.resumed).toBe(true);
  expect(result.stoppedOnDispose).toBe(true);
});
