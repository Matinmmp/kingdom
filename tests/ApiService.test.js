import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiService, API_STORAGE_KEY, validateUsername } from '../src/services/ApiService.js';
import { GameState } from '../src/state/GameState.js';
import { emptyGrid } from '../src/game/boardLogic.js';

function setup() {
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const state = new GameState({ storage });
  state.startNewRun(emptyGrid());
  const api = new ApiService({ state, storage, latency: 0 });
  return { state, storage, api };
}
async function register(api, state, name = 'فرمانروای_سبز') {
  const response = await api.registerUsername(name);
  assert.equal(response.ok, true);
  state.setAccount(response.profile);
  return response;
}
const stats = (score) => ({ runPopulation: score, totalPopulation: score + 10000,
  highestBuildingLevel: 10, activeThemeId: 'storybook_meadow' });

test('usernames accept Persian/English letters, digits and underscores, with Persian validation messages', () => {
  for (const name of ['فرمانروای_سبز', 'King_2048', 'آوا_۱۲۳']) assert.equal(validateUsername(name).ok, true);
  for (const name of ['آب', 'abcdefghijklmnopq', 'نام کاربر', 'king<script>', 'king👑']) {
    assert.equal(validateUsername(name).ok, false);
    assert.match(validateUsername(name).error, /[آ-ی]/u);
  }
});

test('registration is unique across reloads, case, digit scripts, and concurrent attempts', async () => {
  const { state, storage, api } = setup();
  const results = await Promise.all([api.registerUsername('King_1'), api.registerUsername('king_۱')]);
  assert.equal(results.filter((response) => response.ok).length, 1);
  const restored = new ApiService({ state, storage, latency: 0 });
  assert.deepEqual(await restored.registerUsername('KING_١'), { ok: false, error: 'این نام کاربری قبلاً انتخاب شده است' });
  assert.equal((await restored.registerUsername('مهتاب')).ok, false);
});

test('registering an existing anonymous player preserves every spent lifetime charge', async () => {
  const { state, api } = setup();
  state.usePowerup('swap', state.data.grid);
  const response = await register(api, state);
  assert.equal(response.profile.powerups.swap, 0);
  assert.equal(state.data.powerups.swap, 0);
  assert.ok(state.data.token.startsWith('local_'));
});

test('the service confirms each power-up only once, including concurrent requests and reloads', async () => {
  const { state, storage, api } = setup();
  await register(api, state);
  const results = await Promise.all([api.consumePowerup('swap'), api.consumePowerup('swap')]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(state.data.powerups.swap, 1, 'the engine owns the board transaction after confirmation');
  const restored = new ApiService({ state, storage, latency: 0 });
  assert.equal((await restored.consumePowerup('swap')).ok, false);
  assert.equal((await api.consumePowerup('invalid')).ok, false);
});

test('score submission is idempotent and tracks independent daily/all-time records in Tehran time', async () => {
  const { state, api } = setup();
  await register(api, state);
  let clock = new Date('2026-11-21T20:00:00Z');
  api.now = () => clock;
  const first = await api.submitScore(stats(500000));
  assert.deepEqual(first, { ok: true, isNewDailyBest: true, isNewAllTimeBest: true });
  assert.deepEqual(await api.submitScore(stats(500000)), first);
  assert.deepEqual(await api.submitScore(stats(200000)), { ok: true, isNewDailyBest: false, isNewAllTimeBest: false });
  clock = new Date('2026-11-21T21:00:00Z');
  assert.deepEqual(await api.submitScore(stats(300000)), { ok: true, isNewDailyBest: true, isNewAllTimeBest: false });
  assert.equal((await api.getLeaderboard('daily')).userBest.score, 300000);
  assert.equal((await api.getLeaderboard('alltime')).userBest.score, 500000);
});

test('leaderboards rank ten sample players alongside the current run and preserve an off-list personal rank', async () => {
  const { state, api } = setup();
  await register(api, state);
  state.data.runPopulation = 300000;
  const daily = await api.getLeaderboard('daily');
  assert.equal(daily.entries.length, 10);
  assert.equal(daily.entries[0].username, state.data.username);
  assert.equal(daily.userBest.rank, 1);
  state.data.runPopulation = 10;
  const alltime = await api.getLeaderboard('alltime');
  assert.equal(alltime.entries.length, 10);
  assert.equal(alltime.userBest.rank, 11);
  assert.equal(alltime.userBest.score, 10);
  assert.ok(alltime.entries.every((entry, index) => entry.rank === index + 1));
});

test('invalid submissions are rejected and local data survives an unavailable storage adapter', async () => {
  const { state, storage, api } = setup();
  await register(api, state);
  assert.equal((await api.submitScore({ ...stats(100), runPopulation: -1 })).ok, false);
  assert.equal((await api.submitScore({ ...stats(100), totalPopulation: 0 })).ok, false);
  assert.ok(JSON.parse(storage.getItem(API_STORAGE_KEY)).profiles.length);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const fallback = new ApiService({ state, storage: blocked, latency: 0 });
  assert.equal((await fallback.getLeaderboard('daily')).entries.length, 10);
});

test('a Phase 3 transport receives structured payloads and auth, and failures become Persian responses', async () => {
  const { state } = setup();
  state.setAccount({ username: 'آزمونگر', token: 'session-token' });
  const calls = [];
  const api = new ApiService({ state, transport: async (request) => { calls.push(request); return { entries: [], userBest: null }; } });
  await api.getLeaderboard('alltime');
  assert.deepEqual(calls[0], { method: 'getLeaderboard', payload: { period: 'alltime' }, token: 'session-token' });
  api.transport = async () => { throw Error('network'); };
  assert.equal((await api.consumePowerup('swap')).ok, false);
  assert.match((await api.consumePowerup('undo')).error, /دوباره/);
});
