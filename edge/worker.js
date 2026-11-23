import { S3Storage, StorageError } from './s3.js';
import { MAX_SCORE, POWERUP_TYPES, THEME_REQUIREMENTS, tehranDate, usernameLower, validateUsername } from '../shared/validation.js';

// Server-only defaults. This module is never imported by the browser bundle.
export const DEFAULT_S3_CONFIG = Object.freeze({
  S3_ENDPOINT: 'https://s3.ir-central1.arvanstorage.ir',
  S3_BUCKET: 'kingdom-rush',
  S3_REGION: 'ir-central1',
  S3_ACCESS_KEY: '4e1f1636-2f03-4c96-8d2f-5b698ff31587',
  S3_SECRET_KEY: '2200da89601960f6b57e23cae2f7e3d74bdff0c07d4612133954b8e503b77260',
});
const APP_HTML = typeof __KINGDOM_APP_HTML__ === 'string' ? __KINGDOM_APP_HTML__ : '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>پادشاهی ۲۰۴۸</title><p>ابتدا نسخهٔ انتشار بازی را با دستور ساخت اج آماده کنید.</p></html>';
const userKey = (name) => `users/${name}.json`;
const clone = (value) => JSON.parse(JSON.stringify(value));

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function getS3Config(env = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_S3_CONFIG).map(([key, fallback]) => [key, env[key] ?? globalThis[key] ?? fallback]));
}

function publicProfile(profile) {
  const { runReceipts, powerupUses, retiredKeys, ...visible } = profile;
  return visible;
}

function responseJSON(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders,
  } });
}

function cors(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? globalThis.ALLOWED_ORIGINS ?? '*').split(',').map((value) => value.trim());
  if (allowed.includes('*')) headers.set('access-control-allow-origin', '*');
  else if (origin && (allowed.includes(origin) || new URL(request.url).origin === origin)) {
    headers.set('access-control-allow-origin', origin); headers.append('vary', 'Origin');
  }
  headers.set('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type, Idempotency-Key, X-Run-Id');
  headers.set('access-control-max-age', '86400');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'same-origin');
  return new Response(response.body, { status: response.status, headers });
}

function identity(body) {
  const validation = validateUsername(body.username);
  if (!validation.ok) throw new ApiError(400, validation.error);
  return { username: validation.username, lower: usernameLower(validation.username) };
}

async function authenticated(storage, body) {
  const { lower } = identity(body);
  const stored = await storage.getJSON(userKey(lower));
  if (!stored || typeof body.token !== 'string' || body.token !== stored.value.token) {
    throw new ApiError(401, 'نشست شما معتبر نیست؛ لطفاً دوباره وارد بازی شوید.');
  }
  return { ...stored, lower };
}

export function scoreKey(prefix, score, themeId, username, timestamp) {
  const inv = String(Math.max(0, MAX_SCORE - Math.floor(score))).padStart(9, '0');
  return `${prefix}${inv}_${timestamp}_${themeId}_${username}`;
}

export function parseScoreKey(key, prefix) {
  if (!key.startsWith(prefix)) return null;
  const match = key.slice(prefix.length).match(/^(\d{9})_(\d+)_(storybook_meadow|sunstone_dynasty|marble_republic|sakura_valley|nordic_frost)_(.+)$/u);
  if (!match || !validateUsername(match[4]).ok) return null;
  const score = MAX_SCORE - Number(match[1]);
  return score >= 0 ? { username: match[4], score, themeId: match[3] } : null;
}

// The canonical profile uses conditional ETags; sorted S3 objects are a repairable index.
// Re-check ownership after publishing so concurrent higher records remove obsolete keys.
async function reconcileIndexes(storage, lower, profile) {
  const keys = [profile.allTimeKey, profile.dailyKey].filter(Boolean);
  await Promise.all(keys.map((key) => storage.putEmpty(key)));
  const current = await storage.getJSON(userKey(lower));
  if (!current) throw new StorageError();
  const owned = new Set([current.value.allTimeKey, current.value.dailyKey].filter(Boolean));
  const garbage = new Set([...(current.value.retiredKeys ?? []), ...keys.filter((key) => !owned.has(key))]);
  await Promise.all([...garbage].filter((key) => !owned.has(key)).map((key) => storage.delete(key)));
}

export function createWorker({ storage: suppliedStorage, cache: suppliedCache, now = () => new Date(), html = APP_HTML } = {}) {
  return {
    async fetch(request, env = {}, context = {}) {
      const url = new URL(request.url);
      const storage = suppliedStorage ?? new S3Storage(getS3Config(env), { now });
      const cache = suppliedCache ?? globalThis.caches?.default;
      let response;
      try {
        if (request.method === 'OPTIONS') response = new Response(null, { status: 204 });
        else if ((request.method === 'GET' || request.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
          response = new Response(request.method === 'HEAD' ? null : html, { headers: {
            'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate',
            'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          } });
        } else if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
          const period = url.searchParams.get('period') ?? 'daily';
          if (!['daily', 'alltime'].includes(period)) throw new ApiError(400, 'بازهٔ انتخاب‌شده معتبر نیست.');
          const today = tehranDate(now());
          const prefix = period === 'alltime' ? 'scores/alltime/' : `scores/daily/${today}/`;
          // Only the public ten-row list is cached; personal information never shares a cache entry.
          const cacheURL = new URL('/__leaderboard_cache', url.origin);
          cacheURL.searchParams.set('bucket', getS3Config(env).S3_BUCKET);
          cacheURL.searchParams.set('period', period); cacheURL.searchParams.set('date', today);
          const cacheKey = new Request(cacheURL.toString());
          const cached = cache ? await cache.match(cacheKey) : null;
          let entries;
          if (cached) entries = await cached.json();
          else {
            const keys = await storage.list(prefix, 10);
            const seen = new Set();
            entries = keys.map((key) => parseScoreKey(key, prefix)).filter((entry) => {
              if (!entry) return false;
              const lower = usernameLower(entry.username);
              if (seen.has(lower)) return false;
              seen.add(lower); return true;
            }).map((entry, index) => ({ ...entry, rank: index + 1 }));
            if (cache) {
              const put = cache.put(cacheKey, responseJSON(entries, 200, { 'cache-control': 'public, max-age=15' })).catch(() => {});
              if (context.waitUntil) context.waitUntil(put); else await put;
            }
          }
          let userBest = null;
          const username = url.searchParams.get('username');
          if (username && validateUsername(username).ok) {
            const stored = await storage.getJSON(userKey(usernameLower(username)));
            if (stored) {
              const profile = stored.value;
              const score = period === 'alltime' ? profile.bestAllTime : profile.dailyDate === today ? profile.bestDaily : 0;
              const key = period === 'alltime' ? profile.allTimeKey : profile.dailyDate === today ? profile.dailyKey : null;
              const record = key ? parseScoreKey(key, prefix) : null;
              userBest = { username: profile.username, score: score ?? 0,
                themeId: record?.themeId ?? 'storybook_meadow', rank: entries.find((entry) => usernameLower(entry.username) === profile.usernameLower)?.rank ?? null };
            }
          }
          response = responseJSON({ entries, userBest });
        } else if (url.pathname.startsWith('/api/') && request.method === 'POST') {
          if (!['/api/register', '/api/profile', '/api/powerup', '/api/score'].includes(url.pathname)) throw new ApiError(404, 'این بخش پیدا نشد.');
          if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'اطلاعات درخواست باید با قالب درست فرستاده شود.');
          const raw = await request.text();
          if (new TextEncoder().encode(raw).byteLength > 16384) throw new ApiError(413, 'حجم اطلاعات درخواست بیش از حد مجاز است.');
          let body;
          try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'اطلاعات درخواست خوانا نیست.'); }
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'اطلاعات درخواست کامل نیست.');
          if (url.pathname === '/api/register') {
            const { username, lower } = identity(body);
            if (await storage.getJSON(userKey(lower))) throw new ApiError(409, 'این نام کاربری قبلاً انتخاب شده است');
            const profile = { username, usernameLower: lower, token: crypto.randomUUID(), totalPopulation: 0,
              highestBuildingLevel: 1, bestAllTime: 0, allTimeKey: null, bestDaily: 0, dailyDate: tehranDate(now()), dailyKey: null,
              powerups: { undo: 1, swap: 1, sweeper: 1 }, createdAt: now().toISOString(), version: 1,
              runReceipts: {}, powerupUses: {}, retiredKeys: [] };
            if (!await storage.putJSON(userKey(lower), profile, { 'if-none-match': '*' })) throw new ApiError(409, 'این نام کاربری قبلاً انتخاب شده است');
            response = responseJSON({ ok: true, profile: publicProfile(profile) }, 201);
          } else if (url.pathname === '/api/profile') {
            const stored = await authenticated(storage, body);
            await reconcileIndexes(storage, stored.lower, stored.value);
            response = responseJSON({ ok: true, profile: publicProfile(stored.value) });
          } else {
            const operationId = request.headers.get('idempotency-key') ?? crypto.randomUUID();
            const runId = request.headers.get('x-run-id') ?? body.runId ?? operationId;
            if (!/^[A-Za-z0-9:_-]{1,160}$/.test(operationId) || !/^[A-Za-z0-9:_-]{1,160}$/.test(runId)) throw new ApiError(400, 'شناسهٔ این درخواست معتبر نیست.');
            let complete = false;
            for (let attempt = 0; attempt < 8; attempt++) {
              const stored = await authenticated(storage, body);
              const profile = clone(stored.value);
              profile.runReceipts ??= {}; profile.powerupUses ??= {}; profile.retiredKeys ??= [];
              let result;
              if (url.pathname === '/api/powerup') {
                const { type } = body;
                if (!POWERUP_TYPES.includes(type)) throw new ApiError(400, 'این کمک در بازی وجود ندارد.');
                if (profile.powerups[type] < 1) {
                  if (profile.powerupUses[type] === operationId) {
                    response = responseJSON({ ok: true, powerups: profile.powerups }); complete = true; break;
                  }
                  throw new ApiError(409, 'این کمک را قبلاً استفاده کرده‌اید.');
                }
                profile.powerups[type] = 0;
                profile.powerupUses[type] = operationId;
                result = { ok: true, powerups: profile.powerups };
              } else {
                const { runPopulation: score, highestBuildingLevel, activeThemeId } = body;
                if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE || !Number.isInteger(highestBuildingLevel)
                  || highestBuildingLevel < 1 || highestBuildingLevel > 13 || !Object.hasOwn(THEME_REQUIREMENTS, activeThemeId)) {
                  throw new ApiError(400, 'امتیاز یا اطلاعات این دور معتبر نیست.');
                }
                if (profile.totalPopulation < THEME_REQUIREMENTS[activeThemeId]) throw new ApiError(403, 'این پادشاهی هنوز برای شما باز نشده است.');
                const receipt = profile.runReceipts[runId];
                if (receipt?.operationId === operationId) {
                  await reconcileIndexes(storage, stored.lower, profile);
                  response = responseJSON({ ok: true, profile: publicProfile(profile), isNewDailyBest: receipt.isNewDailyBest, isNewAllTimeBest: receipt.isNewAllTimeBest });
                  complete = true; break;
                }
                const previousCredit = receipt?.score ?? 0;
                const added = Math.max(0, score - previousCredit);
                if (!Number.isSafeInteger(profile.totalPopulation + added)) throw new ApiError(400, 'جمعیت این حساب به سقف مجاز رسیده است.');
                profile.totalPopulation += added;
                profile.highestBuildingLevel = Math.max(profile.highestBuildingLevel, highestBuildingLevel);
                const today = tehranDate(now());
                const isNewAllTimeBest = score > profile.bestAllTime;
                const isNewDailyBest = score > (profile.dailyDate === today ? profile.bestDaily : 0);
                const retired = [];
                if (isNewAllTimeBest) {
                  if (profile.allTimeKey) retired.push(profile.allTimeKey);
                  profile.allTimeKey = scoreKey('scores/alltime/', score, activeThemeId, profile.username, now().getTime());
                  profile.bestAllTime = score;
                }
                if (profile.dailyDate !== today) { profile.bestDaily = 0; profile.dailyDate = today; }
                if (isNewDailyBest) {
                  if (profile.dailyKey) retired.push(profile.dailyKey);
                  profile.dailyKey = scoreKey(`scores/daily/${today}/`, score, activeThemeId, profile.username, now().getTime());
                  profile.bestDaily = score;
                }
                profile.retiredKeys = [...new Set([...profile.retiredKeys, ...retired])];
                profile.runReceipts[runId] = { score: Math.max(score, previousCredit), operationId, isNewDailyBest, isNewAllTimeBest };
                result = { ok: true, isNewDailyBest, isNewAllTimeBest };
              }
              profile.version = (profile.version ?? 0) + 1;
              if (!await storage.putJSON(userKey(stored.lower), profile)) continue;
              if (url.pathname === '/api/score') {
                await reconcileIndexes(storage, stored.lower, profile);
                result.profile = publicProfile(profile);
              }
              response = responseJSON(result); complete = true; break;
            }
            if (!complete) throw new ApiError(409, 'حساب شما هم‌زمان در حال به‌روزرسانی است؛ دوباره تلاش کنید.');
          }
        } else throw new ApiError(url.pathname.startsWith('/api/') ? 405 : 404, 'این درخواست در دسترس نیست.');
      } catch (error) {
        response = responseJSON({ ok: false, error: error instanceof ApiError || error instanceof StorageError ? error.message : 'سرویس بازی فعلاً در دسترس نیست؛ لطفاً دوباره تلاش کنید.' },
          error instanceof ApiError ? error.status : 503);
      }
      return cors(response, request, env);
    },
  };
}

const worker = createWorker();
export default worker;
export function installServiceWorker() {
  globalThis.addEventListener('fetch', (event) => event.respondWith(worker.fetch(event.request, globalThis, event)));
}
if (typeof __EDGE_CLASSIC__ !== 'undefined' && __EDGE_CLASSIC__) installServiceWorker();
