import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_POP, canMove, emptyGrid, slideGrid, spawnBuilding, startingGrid } from '../src/game/boardLogic.js';

test('a new tile cannot merge twice in the same move', () => {
  const grid = emptyGrid();
  grid[0] = [1, 1, 2, 0];
  const result = slideGrid(grid, 'left');
  assert.deepEqual(result.grid[0], [2, 2, 0, 0]);
  assert.equal(result.merges.length, 1);
  assert.equal(result.trajectories.length, 3);
  assert.deepEqual(grid[0], [1, 1, 2, 0]);
});

test('four matching tiles produce two independent merges', () => {
  const grid = emptyGrid();
  grid[0] = [3, 3, 3, 3];
  const result = slideGrid(grid, 'right');
  assert.deepEqual(result.grid[0], [0, 0, 4, 4]);
  assert.deepEqual(result.merges.map(({ column, level }) => [column, level]), [[3, 4], [2, 4]]);
});

test('vertical moves preserve order and merge toward the chosen edge', () => {
  const grid = [[1, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], [2, 0, 0, 0]];
  assert.deepEqual(slideGrid(grid, 'up').grid.map((row) => row[0]), [2, 2, 0, 0]);
  assert.deepEqual(slideGrid(grid, 'down').grid.map((row) => row[0]), [0, 0, 2, 2]);
});

test('level thirteen is a hard cap and cannot merge with another level thirteen', () => {
  const grid = emptyGrid();
  grid[0] = [13, 13, 12, 12];
  const result = slideGrid(grid, 'left');
  assert.deepEqual(result.grid[0], [13, 13, 13, 0]);
  assert.equal(result.merges.length, 1);
  assert.equal(BASE_POP[result.merges[0].level], 350000);
});

test('an invalid move is distinguishable and never mutates its input', () => {
  const grid = emptyGrid();
  grid[0][0] = 1;
  const result = slideGrid(grid, 'left');
  assert.equal(result.changed, false);
  assert.deepEqual(result.grid, grid);
});

test('game over requires a full board with no legal adjacent merge', () => {
  const grid = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, col) => (row + col) % 2 + 1));
  assert.equal(canMove(grid), false);
  grid[0][0] = 0;
  assert.equal(canMove(grid), true);
  grid[0][0] = grid[0][1];
  assert.equal(canMove(grid), true);
  assert.equal(canMove(Array.from({ length: 4 }, () => [13, 13, 13, 13])), false);
});

test('spawning respects the exact 85/15 boundary and chooses only empty cells', () => {
  const grid = Array.from({ length: 4 }, () => [3, 3, 3, 3]);
  grid[2][1] = 0;
  let values = [0.5, 0.849999];
  assert.deepEqual(spawnBuilding(grid, () => values.shift()).spawn, { row: 2, column: 1, level: 1 });
  values = [0.5, 0.85];
  assert.equal(spawnBuilding(grid, () => values.shift()).spawn.level, 2);
  assert.equal(grid[2][1], 0);
  grid[2][1] = 3;
  assert.equal(spawnBuilding(grid).spawn, null);
  assert.equal(startingGrid(() => 0).flat().filter(Boolean).length, 2);
});
