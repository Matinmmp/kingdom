export const BOARD_SIZE = 4;
export const MAX_LEVEL = 13;
export const BASE_POP = Object.freeze({
  2: 20, 3: 50, 4: 120, 5: 300, 6: 750, 7: 1800,
  8: 4500, 9: 11000, 10: 26000, 11: 60000, 12: 140000, 13: 350000,
});

export const emptyGrid = () => Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
export const cloneGrid = (grid) => grid.map((row) => [...row]);
export const cellKey = (row, column) => `${row},${column}`;

export function emptyCells(grid) {
  return grid.flatMap((row, r) => row.flatMap((level, c) => level === 0 ? [{ row: r, column: c }] : []));
}

export function spawnBuilding(grid, random = Math.random) {
  const result = cloneGrid(grid);
  const cells = emptyCells(result);
  if (!cells.length) return { grid: result, spawn: null };
  const cell = cells[Math.min(cells.length - 1, Math.floor(random() * cells.length))];
  const spawn = { ...cell, level: random() < 0.85 ? 1 : 2 };
  result[cell.row][cell.column] = spawn.level;
  return { grid: result, spawn };
}

export function startingGrid(random = Math.random) {
  return spawnBuilding(spawnBuilding(emptyGrid(), random).grid, random).grid;
}

function coordinates(direction, line, offset) {
  if (direction === 'left') return { row: line, column: offset };
  if (direction === 'right') return { row: line, column: BOARD_SIZE - 1 - offset };
  if (direction === 'up') return { row: offset, column: line };
  if (direction === 'down') return { row: BOARD_SIZE - 1 - offset, column: line };
  throw new RangeError(`Unknown direction: ${direction}`);
}

// A move plan keeps scoring independent of rendering and merges each tile once.
export function slideGrid(grid, direction) {
  const result = emptyGrid();
  const trajectories = [];
  const merges = [];
  for (let line = 0; line < BOARD_SIZE; line++) {
    const entries = Array.from({ length: BOARD_SIZE }, (_, offset) => coordinates(direction, line, offset))
      .map((cell) => ({ ...cell, level: grid[cell.row][cell.column] }))
      .filter((cell) => cell.level > 0);
    let destination = 0;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const next = entries[index + 1];
      const to = coordinates(direction, line, destination++);
      const merged = Boolean(next && next.level === entry.level && entry.level < MAX_LEVEL);
      const level = entry.level + Number(merged);
      result[to.row][to.column] = level;
      trajectories.push({ from: entry, to, merged });
      if (merged) {
        trajectories.push({ from: next, to, merged: true });
        merges.push({ ...to, level });
        index++;
      }
    }
  }
  const changed = result.some((row, r) => row.some((level, c) => level !== grid[r][c]));
  return { grid: result, trajectories, merges, changed };
}

export function canMove(grid) {
  if (emptyCells(grid).length) return true;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let column = 0; column < BOARD_SIZE; column++) {
      const level = grid[row][column];
      if (level >= MAX_LEVEL) continue;
      if (grid[row + 1]?.[column] === level || grid[row][column + 1] === level) return true;
    }
  }
  return false;
}
