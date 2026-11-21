import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, STORAGE_KEY } from '../src/state/GameState.js';
import { emptyGrid } from '../src/game/boardLogic.js';
import { THEMES } from '../src/config/themesConfig.js';

function storageAdapter() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function newState(storage = storageAdapter()) {
  const state = new GameState({ storage });
  const grid = emptyGrid();
  grid[0] = [1, 1, 0, 0];
  state.startNewRun(grid);
  return state;
}

test('a new user receives exactly one of each lifetime power-up', () => {
  const state = newState();
  assert.equal(state.data.username, '');
  assert.equal(state.data.activeThemeId, 'storybook_meadow');
  assert.deepEqual(state.data.powerups, { undo: 1, swap: 1, sweeper: 1 });
  assert.equal(state.data.highestBuildingLevel, 1);
  assert.equal(state.setActiveTheme('sunstone_dynasty'), false);
});

test('each merge earns its own rounded theme multiplier and immediately unlocks thresholds', () => {
  const state = newState();
  state.data.totalPopulation = 299980;
  const grid = emptyGrid();
  grid[0][0] = 2;
  const first = state.recordMove(grid, [{ row: 0, column: 0, level: 2 }]);
  assert.equal(state.data.totalPopulation, 300000);
  assert.deepEqual(first.unlocked.map((theme) => theme.id), ['sunstone_dynasty']);
  assert.equal(state.setActiveTheme('sunstone_dynasty'), true);
  const second = state.recordMove(grid, [{ row: 0, column: 0, level: 2 }]);
  assert.equal(second.earned, 22);
  assert.equal(state.data.runPopulation, 42);
  assert.equal(state.data.totalPopulation, 300022);
});

test('undo restores the exact grid and run score while retaining lifetime progress and spent powers', () => {
  const state = newState();
  const before = state.exportSnapshot();
  const grid = emptyGrid();
  grid[0][0] = 13;
  state.recordMove(grid, [{ row: 0, column: 0, level: 13 }]);
  assert.equal(state.undo(), true);
  assert.deepEqual(state.data.grid, before.grid);
  assert.equal(state.data.runPopulation, before.runPopulation);
  assert.equal(state.data.moveCount, before.moveCount);
  assert.equal(state.data.totalPopulation, 350000);
  assert.equal(state.data.highestBuildingLevel, 13);
  assert.equal(state.data.powerups.undo, 0);
  assert.equal(state.undo(), false);
});

test('new games and reloads cannot refill any consumed power-up', () => {
  const storage = storageAdapter();
  const state = newState(storage);
  const grid = emptyGrid();
  grid[0][0] = 2;
  state.recordMove(grid, [{ row: 0, column: 0, level: 2 }]);
  state.undo();
  state.usePowerup('swap', state.data.grid);
  state.usePowerup('sweeper', state.data.grid);
  state.startNewRun(grid);
  const restored = new GameState({ storage });
  assert.deepEqual(restored.data.powerups, { undo: 0, swap: 0, sweeper: 0 });
  assert.equal(restored.data.totalPopulation, 20);
  assert.equal(restored.data.runPopulation, 0);
  assert.equal(restored.usePowerup('swap', grid), false);
});

test('a saved undo snapshot remains available after a reload', () => {
  const storage = storageAdapter();
  const state = newState(storage);
  const before = state.exportSnapshot();
  const grid = emptyGrid();
  grid[1][2] = 2;
  state.recordMove(grid, [{ row: 1, column: 2, level: 2 }]);
  const restored = new GameState({ storage });
  assert.equal(restored.undo(), true);
  assert.deepEqual(restored.data.grid, before.grid);
  assert.equal(restored.data.totalPopulation, 20);
});

test('corrupt or inaccessible browser storage does not prevent a new game', () => {
  const storage = storageAdapter();
  storage.setItem(STORAGE_KEY, 'broken json');
  assert.equal(newState(storage).data.activeThemeId, 'storybook_meadow');
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const state = newState(blocked);
  assert.ok(state.persistenceError);
  assert.equal(state.data.grid[0][0], 1);
});

test('sync data is a detached, versioned snapshot without the authentication token', () => {
  const state = newState();
  state.setAccount({ username: 'بازیکن', token: 'test-session-token' });
  const payload = state.getSyncPayload();
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.username, 'بازیکن');
  assert.equal('token' in payload, false);
  payload.powerups.swap = 0;
  assert.equal(state.data.powerups.swap, 1);
});

test('game over is recalculated when a power-up opens a cell', () => {
  const state = newState();
  const full = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, col) => (row + col) % 2 + 1));
  state.recordMove(full, []);
  assert.equal(state.data.gameOver, true);
  full[0][0] = 0;
  state.usePowerup('sweeper', full);
  assert.equal(state.data.gameOver, false);
});

test('new players unlock kingdoms only at the rebalanced cumulative thresholds', () => {
  assert.deepEqual(THEMES.map((theme) => theme.unlockRequirement), [0, 300000, 1000000, 2500000, 5000000]);
  for (const theme of THEMES.slice(1)) {
    const state = newState();
    state.data.totalPopulation = theme.unlockRequirement - 20;
    assert.equal(state.isThemeUnlocked(theme.id), false);
    const grid = emptyGrid(); grid[0][0] = 2;
    const result = state.recordMove(grid, [{ row: 0, column: 0, level: 2 }]);
    assert.deepEqual(result.unlocked.map((item) => item.id), [theme.id]);
    assert.equal(state.isThemeUnlocked(theme.id), true);
    assert.ok(state.data.unlockedThemeIds.includes(theme.id));
  }
});

test('existing Phase 1 saves retain earned kingdoms, the active theme, and all game progress', () => {
  const storage = storageAdapter();
  const original = newState().exportSnapshot();
  delete original.themeUnlockVersion;
  delete original.unlockedThemeIds;
  Object.assign(original, {
    username: 'بازیکن', token: 'test-token', activeThemeId: 'sakura_valley',
    totalPopulation: 425000, runPopulation: 3200, highestBuildingLevel: 7, moveCount: 42,
    powerups: { undo: 0, swap: 1, sweeper: 0 }, muted: true,
    undoSnapshot: { grid: emptyGrid(), runPopulation: 3180, moveCount: 41 },
  });
  storage.setItem(STORAGE_KEY, JSON.stringify(original));
  const state = new GameState({ storage });
  const { themeUnlockVersion, unlockedThemeIds, ...retained } = state.exportSnapshot();
  assert.deepEqual(retained, original);
  assert.equal(themeUnlockVersion, 2);
  assert.deepEqual(unlockedThemeIds, ['storybook_meadow', 'sunstone_dynasty', 'marble_republic', 'sakura_valley']);
  assert.equal(state.isThemeUnlocked('sakura_valley'), true);
  assert.equal(state.isThemeUnlocked('nordic_frost'), false);
  assert.deepEqual(new GameState({ storage }).exportSnapshot(), state.exportSnapshot());
});

test('current saves cannot acquire legacy unlocks by reloading', () => {
  const storage = storageAdapter();
  const state = newState(storage);
  state.data.totalPopulation = 600000;
  state.persist();
  const restored = new GameState({ storage });
  assert.equal(restored.isThemeUnlocked('sunstone_dynasty'), true);
  assert.equal(restored.isThemeUnlocked('marble_republic'), false);
  assert.equal(restored.getNextTheme().id, 'marble_republic');
});

test('level thirteen victory is announced once per run, including after undo and reload', () => {
  const storage = storageAdapter();
  const state = newState(storage);
  const originalId = state.data.runId;
  const grid = emptyGrid(); grid[0][0] = 13;
  assert.equal(state.recordMove(grid, [{ row: 0, column: 0, level: 13 }]).victory, true);
  state.undo();
  const restored = new GameState({ storage });
  assert.equal(restored.data.runId, originalId);
  assert.equal(restored.recordMove(grid, [{ row: 0, column: 0, level: 13 }]).victory, false);
  restored.startNewRun(emptyGrid());
  assert.notEqual(restored.data.runId, originalId);
  assert.equal(restored.recordMove(grid, [{ row: 0, column: 0, level: 13 }]).victory, true);
});
