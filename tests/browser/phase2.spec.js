import { test, expect } from '@playwright/test';

const KEY = 'kingdom2048:state:v1';
const blank = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
async function start(page, overrides = {}, trackContexts = false) {
  const grid = blank(); grid[1][1] = 3; grid[2][2] = 4;
  await page.addInitScript(({ key, overrides, grid, trackContexts }) => {
    if (trackContexts) {
      window.webglCanvases = new Set();
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        const context = original.call(this, type, ...args);
        if (context && ['webgl', 'webgl2', 'experimental-webgl'].includes(type)) window.webglCanvases.add(this);
        return context;
      };
    }
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      schemaVersion: 1, themeUnlockVersion: 2, unlockedThemeIds: ['storybook_meadow'],
      username: 'قلمرو_آزمون', token: 'local_test', activeThemeId: 'storybook_meadow',
      runPopulation: 0, totalPopulation: 0, highestBuildingLevel: 4,
      powerups: { undo: 1, swap: 1, sweeper: 1 }, grid, moveCount: 0,
      undoSnapshot: null, gameOver: false, victoryShown: false, muted: true, ...overrides,
    }));
  }, { key: KEY, overrides, grid, trackContexts });
  await page.goto('/');
  await expect(page.locator('#loading-panel')).toBeHidden();
  await page.evaluate(async () => {
    window.testGame = await import([...document.scripts].find((script) => script.src.includes('/src/main.js')).src);
  });
}
async function idle(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const check = () => window.testGame.engine.motion ? requestAnimationFrame(check) : resolve(); check();
    });
  });
}
async function clickBuilding(page, key) {
  const point = await page.evaluate((key) => {
    const { engine } = window.testGame;
    const point = engine.models.get(key).position.clone(); point.y += 0.2; point.project(engine.camera);
    const bounds = engine.viewport.getBoundingClientRect();
    return { x: bounds.left + (point.x + 1) * bounds.width / 2, y: bounds.top + (1 - point.y) * bounds.height / 2 };
  }, key);
  await page.mouse.click(point.x, point.y);
}
const dialog = (page) => page.locator('#game-modal');

test('welcome cannot be dismissed, validates usernames, and preserves anonymous progress on registration', async ({ page }, testInfo) => {
  await start(page, { username: '', token: null, totalPopulation: 20000, runPopulation: 1500,
    powerups: { undo: 0, swap: 1, sweeper: 0 } });
  await expect(dialog(page)).toHaveAttribute('data-kind', 'welcome');
  await expect(page.getByRole('heading', { name: 'به قلمرو ۲۰۴۸ خوش آمدید!' })).toBeVisible();
  await expect(page.locator('.how-to-strip li')).toHaveCount(3);
  const before = await page.evaluate(() => window.kingdom2048.getSnapshot());
  await page.keyboard.press('Escape');
  await page.mouse.click(3, 3);
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => window.testGame.engine.paused)).toBe(true);
  await page.locator('#username-input').fill('ab');
  await page.getByRole('button', { name: 'شروع فرمانروایی' }).click();
  await expect(page.locator('#username-error')).toContainText('۳ تا ۱۶');
  await page.locator('#username-input').fill('مهتاب');
  await page.getByRole('button', { name: 'شروع فرمانروایی' }).click();
  await expect(page.locator('#username-error')).toHaveText('این نام کاربری قبلاً انتخاب شده است');
  await page.screenshot({ path: testInfo.outputPath('welcome.png') });
  await page.locator('#username-input').fill('فرمانروای_نو');
  await page.getByRole('button', { name: 'شروع فرمانروایی' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('#username-label')).toHaveText('فرمانروای_نو');
  const after = await page.evaluate(() => window.kingdom2048.getSnapshot());
  expect(after.grid).toEqual(before.grid);
  expect(after.powerups).toEqual(before.powerups);
  expect(after.runPopulation).toBe(1500);
  expect(after.totalPopulation).toBe(20000);
  expect(after.token).toMatch(/^local_/);
  expect(await page.evaluate(() => window.testGame.sound.unlocked)).toBe(true);
  await page.reload();
  await expect(page.locator('#loading-panel')).toBeHidden();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('#username-label')).toHaveText('فرمانروای_نو');
});

test('encyclopedia shows thirteen cached PNG miniatures and locked discoveries without creating contexts per modal', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await start(page, {}, true);
  expect(await page.evaluate(() => window.webglCanvases.size)).toBe(2);
  await page.locator('[data-modal="kingdoms"]').click();
  await expect(page.locator('.building-card')).toHaveCount(13);
  await expect(page.locator('.building-card.is-locked')).toHaveCount(9);
  await expect(page.locator('.discovery-lock')).toHaveCount(9);
  await expect(page.locator('.building-card[data-level="2"] .building-population')).toHaveText('+۲۰ جمعیت');
  await expect(page.locator('.building-card[data-level="13"] h2')).toHaveText('ارگ نهایی پادشاهی');
  await expect.poll(() => page.locator('.building-card img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth === 180))).toBe(true);
  const originalPNG = await page.locator('.building-card img').first().getAttribute('src');
  expect(originalPNG).toMatch(/^data:image\/png;base64,/);
  expect(await page.locator('.building-card').evaluateAll((cards) => cards.every((card) =>
    card.querySelector('img').getBoundingClientRect().bottom <= card.querySelector('h2').getBoundingClientRect().top))).toBe(true);
  const moves = await page.evaluate(() => window.kingdom2048.getSnapshot().moveCount);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.kingdom2048.getSnapshot().moveCount)).toBe(moves);
  await page.screenshot({ path: testInfo.outputPath('kingdoms-desktop.png') });
  await page.keyboard.press('Escape'); await expect(dialog(page)).toBeHidden();
  await page.locator('[data-modal="themes"]').click();
  await expect(page.locator('.theme-card')).toHaveCount(5);
  await page.keyboard.press('Escape'); await expect(dialog(page)).toBeHidden();
  await page.locator('[data-modal="kingdoms"]').click();
  expect(await page.locator('.building-card img').first().getAttribute('src')).toBe(originalPNG);
  expect(await page.evaluate(() => window.webglCanvases.size)).toBe(2);
  expect(errors).toEqual([]);
});

test('themes show exact lock requirements and select an unlocked kingdom without changing the run', async ({ page }, testInfo) => {
  await start(page, { totalPopulation: 400000, runPopulation: 12345 });
  const before = await page.evaluate(() => window.kingdom2048.getSnapshot());
  await page.evaluate(() => {
    const original = window.testGame.sound.play.bind(window.testGame.sound);
    window.playedSounds = []; window.testGame.sound.play = (key) => { window.playedSounds.push(key); original(key); };
  });
  await page.locator('[data-modal="themes"]').click();
  await expect(page.locator('.theme-card')).toHaveCount(5);
  await expect(page.locator('.theme-card.is-locked')).toHaveCount(3);
  await expect(page.locator('.theme-card[data-theme-id="marble_republic"] .theme-requirement')).toHaveText('نیاز به ۱٬۰۰۰٬۰۰۰ جمعیت کل');
  await expect(page.locator('.theme-card[data-theme-id="nordic_frost"] [role="progressbar"]')).toHaveAttribute('aria-valuemax', '5000000');
  await page.screenshot({ path: testInfo.outputPath('themes-desktop.png') });
  await page.locator('.theme-card[data-theme-id="sunstone_dynasty"] .theme-select-button').click();
  await expect(dialog(page)).toBeHidden(); await idle(page);
  const after = await page.evaluate(() => window.kingdom2048.getSnapshot());
  expect(after.activeThemeId).toBe('sunstone_dynasty');
  expect(after.grid).toEqual(before.grid);
  expect(after.runPopulation).toBe(before.runPopulation);
  expect(after.totalPopulation).toBe(before.totalPopulation);
  expect(after.powerups).toEqual(before.powerups);
  expect(await page.evaluate(() => window.playedSounds)).toContain('themeUnlock');
});

test('leaderboard loads both periods, highlights a top-ten player and keeps an off-list personal best visible', async ({ page }, testInfo) => {
  await start(page, { runPopulation: 300000, totalPopulation: 800000 });
  await page.evaluate(() => {
    const original = window.testGame.api.getLeaderboard.bind(window.testGame.api);
    window.pendingBoards = [];
    window.testGame.api.getLeaderboard = (period) => new Promise((resolve) => {
      window.pendingBoards.push(() => original(period).then(resolve));
    });
  });
  await page.locator('[data-modal="leaderboard"]').click();
  await expect(page.locator('.leaderboard-loading .spinner')).toBeVisible();
  await page.evaluate(() => window.pendingBoards.shift()());
  await expect(page.locator('.leaderboard-row')).toHaveCount(10);
  await expect(page.locator('.leaderboard-row.is-player')).toHaveAttribute('data-rank', '1');
  await expect(page.locator('.leaderboard-personal')).toContainText('۳۰۰٬۰۰۰ جمعیت');
  await expect(page.locator('.rank-badge--1')).toHaveText('🥇');
  await page.screenshot({ path: testInfo.outputPath('leaderboard-desktop.png') });
  await page.getByRole('tab', { name: 'برترین‌های کل', exact: true }).click();
  await expect(page.locator('.leaderboard-loading .spinner')).toBeVisible();
  await page.evaluate(() => window.pendingBoards.shift()());
  await expect(page.locator('.leaderboard-row')).toHaveCount(10);
  await expect(page.locator('.leaderboard-row.is-player')).toHaveCount(0);
  await expect(page.locator('.personal-rank')).toHaveText('رتبهٔ ۱۱');
  await page.getByRole('tab', { name: 'برترین‌های امروز', exact: true }).click();
  await page.getByRole('tab', { name: 'برترین‌های کل', exact: true }).click();
  await page.evaluate(() => Promise.all(window.pendingBoards.splice(0).reverse().map((load) => load())));
  await expect(page.locator('.personal-rank')).toHaveText('رتبهٔ ۱۱');
  await expect(page.locator('#tab-alltime')).toHaveAttribute('aria-selected', 'true');
});

test('Swap banner cancellation is free and confirmation occurs only after the second occupied tile', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const original = window.testGame.api.consumePowerup.bind(window.testGame.api);
    window.consumeCalls = []; window.testGame.api.latency = 600;
    window.testGame.api.consumePowerup = (type) => { window.consumeCalls.push(type); return original(type); };
  });
  await page.locator('#swap-button').click();
  await expect(page.locator('#swap-banner')).toBeVisible();
  await clickBuilding(page, '1,1');
  await page.locator('#cancel-swap').click();
  await expect(page.locator('#swap-banner')).toBeHidden();
  expect(await page.evaluate(() => window.consumeCalls)).toEqual([]);
  expect(await page.evaluate(() => window.kingdom2048.getSnapshot().powerups.swap)).toBe(1);
  await page.locator('#swap-button').click();
  await clickBuilding(page, '1,1');
  expect(await page.evaluate(() => window.consumeCalls)).toEqual([]);
  await clickBuilding(page, '2,2');
  expect(await page.evaluate(() => window.consumeCalls)).toEqual(['swap']);
  expect(await page.evaluate(() => window.kingdom2048.getSnapshot().powerups.swap)).toBe(1);
  await idle(page);
  expect(await page.evaluate(() => window.kingdom2048.getSnapshot().grid[1][1])).toBe(4);
  await expect(page.locator('#swap-count')).toHaveText('۰');
  await expect(page.locator('#swap-banner')).toBeHidden();
});

test('a refused power-up leaves the board and lifetime charge unchanged', async ({ page }) => {
  await start(page);
  const before = await page.evaluate(() => window.kingdom2048.getSnapshot());
  await page.evaluate(() => { window.testGame.api.transport = async () => ({ ok: false, error: 'ارتباط برقرار نشد؛ دوباره تلاش کنید.' }); });
  await page.locator('#swap-button').click();
  await clickBuilding(page, '1,1'); await clickBuilding(page, '2,2'); await idle(page);
  const after = await page.evaluate(() => window.kingdom2048.getSnapshot());
  expect(after.grid).toEqual(before.grid);
  expect(after.powerups).toEqual(before.powerups);
  await expect(page.locator('#toast-region')).toContainText('ارتباط برقرار نشد');
  await page.locator('#cancel-swap').click();
});

test('level thirteen celebrates once per run and the newly unlocked kingdom appears in a golden toast', async ({ page }, testInfo) => {
  const grid = blank(); grid[0] = [12, 12, 0, 0];
  await start(page, { grid, highestBuildingLevel: 12 });
  await page.keyboard.press('ArrowLeft'); await idle(page);
  await expect(dialog(page)).toHaveAttribute('data-kind', 'victory');
  await expect(page.getByRole('heading', { name: '👑 تبریک! ارگ نهایی ساخته شد!' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('victory-desktop.png') });
  const moves = await page.evaluate(() => window.kingdom2048.getSnapshot().moveCount);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.kingdom2048.getSnapshot().moveCount)).toBe(moves);
  await page.getByRole('button', { name: 'ادامه بازی برای رکورد بالاتر' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('#unlock-toast-region')).toContainText('🎉 سرزمین جدید باز شد: سلسله آفتاب (+۱۰٪ جمعیت)!');
  await expect(page.locator('#unlock-toast-region .toast')).toBeVisible();
  await page.locator('#undo-button').click(); await idle(page);
  await page.keyboard.press('ArrowLeft'); await idle(page);
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => window.kingdom2048.getSnapshot().victoryShown)).toBe(true);
});

test('game over submits a persistent best, shows unlock progress, and restarts without refilling powers', async ({ page }, testInfo) => {
  const grid = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => (row + column) % 2 + 5));
  await start(page, { grid, runPopulation: 300000, totalPopulation: 750000, highestBuildingLevel: 6,
    powerups: { undo: 0, swap: 0, sweeper: 0 } });
  await expect(dialog(page)).toHaveAttribute('data-kind', 'gameover');
  await expect(page.locator('.end-run-score')).toHaveText('۳۰۰٬۰۰۰');
  await expect(page.locator('.personal-best-badge')).toHaveText('🏆 رکورد شخصی تازه!');
  await expect(page.locator('.end-run-body [role="progressbar"]')).toHaveAttribute('aria-valuemax', '1000000');
  await page.screenshot({ path: testInfo.outputPath('gameover-desktop.png') });
  await page.reload();
  await expect(page.locator('.personal-best-badge')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'برترین‌ها', exact: true }).click();
  await expect(page.locator('.leaderboard-personal')).toContainText('۳۰۰٬۰۰۰ جمعیت');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveAttribute('data-kind', 'gameover');
  await page.getByRole('button', { name: 'بازی دوباره', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  const data = await page.evaluate(() => window.kingdom2048.getSnapshot());
  expect(data.runPopulation).toBe(0); expect(data.totalPopulation).toBe(750000);
  expect(data.powerups).toEqual({ undo: 0, swap: 0, sweeper: 0 });
  expect(data.grid.flat().filter(Boolean)).toHaveLength(2);
});

test('all browsing modals scroll within a mobile viewport and keep their controls reachable', async ({ page }, testInfo) => {
  // Three full modal captures include PNG readbacks on SwiftShader.
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, { totalPopulation: 180000, runPopulation: 20000 });
  for (const kind of ['kingdoms', 'themes', 'leaderboard']) {
    await page.locator(`[data-modal="${kind}"]`).click();
    if (kind === 'leaderboard') await expect(page.locator('.leaderboard-row')).toHaveCount(10);
    const geometry = await dialog(page).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: innerWidth, height: innerHeight, overflowing: node.scrollWidth > node.clientWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.width);
    expect(geometry.top).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
    expect(geometry.overflowing).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`${kind}-mobile.png`) });
    if (kind === 'kingdoms') await page.locator('.building-card').last().scrollIntoViewIfNeeded();
    if (kind === 'themes') await page.locator('.theme-card').last().scrollIntoViewIfNeeded();
    if (kind === 'leaderboard') await expect(page.locator('.leaderboard-personal')).toBeInViewport();
    await page.getByRole('button', { name: 'بستن پنجره' }).click(); await expect(dialog(page)).toBeHidden();
  }
});
