import { test, expect } from '@playwright/test';

const KEY = 'kingdom2048:state:v1';
const blank = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
const snapshot = (overrides = {}) => ({
  schemaVersion: 1, username: 'آزمونگر', token: 'local_test', activeThemeId: 'storybook_meadow',
  themeUnlockVersion: 2, unlockedThemeIds: ['storybook_meadow'],
  runPopulation: 0, totalPopulation: 0, highestBuildingLevel: 1,
  powerups: { undo: 1, swap: 1, sweeper: 1 }, grid: blank(), moveCount: 0,
  undoSnapshot: null, gameOver: false, muted: true, ...overrides,
});
async function seed(page, data) {
  await page.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key: KEY, data });
}
async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#loading-panel')).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(window.kingdom2048))).toBe(true);
  // Vite adds a timestamp after hot updates. Import that exact entry to avoid a second game instance.
  await page.evaluate(async () => {
    window.testGame = await import([...document.scripts].find((script) => script.src.includes('/src/main.js')).src);
  });
  if (await page.locator('#game-modal[data-kind="welcome"]').isVisible()) {
    await page.locator('#username-input').fill('آزمونگر');
    await page.getByRole('button', { name: 'شروع فرمانروایی' }).click();
    await expect(page.locator('#game-modal[data-kind="welcome"]')).toBeHidden();
  }
}
async function idle(page) {
  await page.evaluate(async () => {
    const { engine } = window.testGame;
    await new Promise((resolve) => {
      const check = () => engine.motion ? requestAnimationFrame(check) : resolve();
      check();
    });
  });
}
async function saved(page) { return page.evaluate(() => window.kingdom2048.getSnapshot()); }

test('desktop starts with Persian RTL HUD, two tiles, working audio, and locked themes', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.tile-value')).toHaveCount(2);
  await expect(page.locator('#undo-button')).toBeDisabled();
  await expect(page.locator('#population-progress')).toHaveAttribute('aria-valuemax', '300000');
  await expect(page.locator('#progress-fraction')).toHaveText('۰ / ۳۰۰٬۰۰۰');
  await page.locator('#mute-button').click();
  await expect(page.locator('#mute-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#mute-button').click();
  await expect.poll(() => page.evaluate(() => window.testGame.sound.context?.state)).toBe('running');
  await page.locator('#world-button').click();
  await expect(page.locator('.theme-option:disabled')).toHaveCount(4);
  expect(await page.evaluate(() => window.kingdom2048.switchTheme('sunstone_dynasty'))).toBe(false);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('desktop.png') });
  expect(errors).toEqual([]);
});

test('merge, undo, restart, and reload retain the exact lifetime counters', async ({ page }) => {
  const grid = blank(); grid[0] = [1, 1, 0, 0];
  await seed(page, snapshot({ grid }));
  await ready(page);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#run-population')).toHaveText('۲۰');
  await idle(page);
  expect((await saved(page)).grid.flat().filter(Boolean)).toHaveLength(2);
  await page.locator('#undo-button').click();
  await idle(page);
  expect((await saved(page)).grid).toEqual(grid);
  expect((await saved(page)).totalPopulation).toBe(20);
  await expect(page.locator('#run-population')).toHaveText('۰');
  await expect(page.locator('#undo-count')).toHaveText('۰');
  await page.locator('.quick-actions [data-new-run]').click();
  await page.reload();
  await expect(page.locator('#loading-panel')).toBeHidden();
  await expect(page.locator('#undo-count')).toHaveText('۰');
  expect((await saved(page)).totalPopulation).toBe(20);
  expect((await saved(page)).grid.flat().filter(Boolean)).toHaveLength(2);
});

test('raycaster selects occupied buildings, swaps them, and spends the power only once', async ({ page }) => {
  const grid = blank(); grid[1][1] = 3; grid[2][2] = 4;
  await seed(page, snapshot({ grid }));
  await ready(page);
  await page.locator('#swap-button').click();
  async function clickBuilding(key) {
    const point = await page.evaluate(async (key) => {
      const { engine } = window.testGame;
      const model = engine.models.get(key);
      const point = model.position.clone();
      point.y += 0.2;
      point.project(engine.camera);
      const rect = engine.viewport.getBoundingClientRect();
      return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
    }, key);
    await page.mouse.click(point.x, point.y);
  }
  await clickBuilding('1,1');
  await expect.poll(() => page.evaluate(() => window.testGame.engine.selectedCell)).toEqual({ row: 1, column: 1 });
  expect((await saved(page)).powerups.swap).toBe(1);
  await clickBuilding('2,2');
  await idle(page);
  const data = await saved(page);
  expect(data.grid[1][1]).toBe(4);
  expect(data.grid[2][2]).toBe(3);
  expect(data.powerups.swap).toBe(0);
  await expect(page.locator('#swap-button')).toBeDisabled();
});

test('sweeper clears low buildings, preserves larger ones, and never refills', async ({ page }) => {
  const grid = blank(); grid[0] = [1, 2, 3, 4];
  await seed(page, snapshot({ grid }));
  await ready(page);
  await page.locator('#sweeper-button').click();
  await idle(page);
  expect((await saved(page)).grid[0]).toEqual([0, 0, 3, 4]);
  await expect(page.locator('.tile-value')).toHaveCount(2);
  await page.locator('.quick-actions [data-new-run]').click();
  await expect(page.locator('#sweeper-count')).toHaveText('۰');
  await expect(page.locator('#sweeper-button')).toBeDisabled();
});

test('all five live themes render every level and retain the active run', async ({ page }, testInfo) => {
  // Render all 65 theme/level combinations and capture a full scene with software WebGL.
  test.slow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const grid = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 0, 0, 0]];
  await seed(page, snapshot({ grid, totalPopulation: 5000000, runPopulation: 12345, highestBuildingLevel: 13 }));
  await ready(page);
  await expect(page.locator('#next-theme-label')).toHaveText('همه سرزمین‌ها باز شدند!');
  const ids = ['sunstone_dynasty', 'marble_republic', 'sakura_valley', 'nordic_frost', 'storybook_meadow'];
  for (const id of ids) {
    expect(await page.evaluate((id) => window.kingdom2048.switchTheme(id), id)).toBe(true);
    await idle(page);
    await expect(page.locator('.tile-value')).toHaveCount(13);
    const data = await saved(page);
    expect(data.activeThemeId).toBe(id);
    expect(data.grid).toEqual(grid);
    expect(data.runPopulation).toBe(12345);
    expect(data.totalPopulation).toBe(5000000);
    expect(data.powerups).toEqual({ undo: 1, swap: 1, sweeper: 1 });
    await expect(page.locator('#swap-button')).toBeEnabled();
    await expect(page.locator('#sweeper-button')).toBeEnabled();
  }
  await page.screenshot({ path: testInfo.outputPath('all-levels.png') });
  await page.evaluate(() => window.kingdom2048.switchTheme('sakura_valley'));
  await page.locator('.quick-actions [data-new-run]').click();
  await idle(page);
  await expect(page.locator('.tile-value')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('mobile portrait fits the screen and accepts a real touch swipe without page scrolling', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const grid = blank(); grid[0] = [1, 1, 0, 0];
  await seed(page, snapshot({ grid }));
  await ready(page);
  const bounds = await page.locator('#board-viewport').boundingBox();
  const session = await page.context().newCDPSession(page);
  const x = bounds.x + bounds.width * 0.7;
  const y = bounds.y + bounds.height * 0.6;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  // Negative column direction follows the visible top-left grid axis.
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 90, y: y - 51 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#run-population')).toHaveText('۲۰');
  await idle(page);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(page.locator('#sweeper-button')).toBeInViewport();
  await expect(page.locator('#run-population')).toBeInViewport();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#swap-button')).toBeInViewport();
});

test('game over is shown for a blocked board and a sweeper can rescue an entirely low-level board', async ({ page }) => {
  const grid = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, col) => (row + col) % 2 + 1));
  await seed(page, snapshot({ grid }));
  await ready(page);
  await expect(page.locator('#game-modal[data-kind="gameover"]')).toBeVisible();
  await page.getByRole('button', { name: 'ادامه با کمک‌ها' }).click();
  await expect(page.locator('#game-modal')).toBeHidden();
  await page.locator('#sweeper-button').click();
  await idle(page);
  await expect(page.locator('#game-modal[data-kind="gameover"]')).toBeHidden();
  expect((await saved(page)).grid.flat().filter(Boolean)).toHaveLength(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await idle(page);
  expect((await saved(page)).moveCount).toBeGreaterThan(0);
});
