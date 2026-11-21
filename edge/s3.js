const encoder = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
export const awsEncode = (value) => encodeURIComponent(value).replace(/[!'()*]/g,
  (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

export async function sha256(body = '') {
  return hex(await crypto.subtle.digest('SHA-256', typeof body === 'string' ? encoder.encode(body) : body));
}

async function hmac(key, message) {
  const imported = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', imported, encoder.encode(message));
}

export async function signS3Request(config, { method = 'GET', key = '', query = {}, body = '', headers = {}, now = new Date() } = {}) {
  const endpoint = new URL(config.S3_ENDPOINT);
  endpoint.search = ''; endpoint.hash = '';
  const prefix = endpoint.pathname.replace(/\/$/, '');
  const path = [config.S3_BUCKET, ...key.split('/').filter((segment) => segment !== '')].map(awsEncode).join('/');
  endpoint.pathname = `${prefix}/${path}`;
  const pairs = Object.entries(query).map(([name, value]) => [awsEncode(name), awsEncode(String(value))])
    .sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0);
  const canonicalQuery = pairs.map(([name, value]) => `${name}=${value}`).join('&');
  endpoint.search = canonicalQuery;
  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const stamp = date.slice(0, 8);
  const payloadHash = await sha256(body);
  const signed = new Headers(headers);
  signed.set('host', endpoint.host);
  signed.set('x-amz-date', date);
  signed.set('x-amz-content-sha256', payloadHash);
  const headerNames = [...signed.keys()].sort();
  const canonicalHeaders = headerNames.map((name) => `${name}:${signed.get(name).trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = headerNames.join(';');
  const canonicalRequest = [method, endpoint.pathname, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${stamp}/${config.S3_REGION}/s3/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await sha256(canonicalRequest)}`;
  let signingKey = await hmac(`AWS4${config.S3_SECRET_KEY}`, stamp);
  signingKey = await hmac(signingKey, config.S3_REGION);
  signingKey = await hmac(signingKey, 's3');
  signingKey = await hmac(signingKey, 'aws4_request');
  signed.set('authorization', `AWS4-HMAC-SHA256 Credential=${config.S3_ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hex(await hmac(signingKey, toSign))}`);
  // Fetch derives Host from the URL; it remains part of the signed canonical headers.
  signed.delete('host');
  return { url: endpoint.toString(), init: { method, headers: signed, ...(method === 'PUT' ? { body } : {}) }, canonicalRequest };
}

export class StorageError extends Error {
  constructor(status = 503) { super('سرویس ذخیره‌سازی در دسترس نیست؛ لطفاً دوباره تلاش کنید.'); this.status = status; }
}

function decodeXML(value) {
  return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (_, hexValue, decimal, name) => {
    if (hexValue || decimal) return String.fromCodePoint(parseInt(hexValue || decimal, hexValue ? 16 : 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name.toLowerCase()];
  });
}

export function parseListKeys(xml) {
  return [...xml.matchAll(/<(?:\w+:)?Key>([\s\S]*?)<\/(?:\w+:)?Key>/g)].map((match) => decodeXML(match[1]));
}

export class S3Storage {
  constructor(config, { fetcher = globalThis.fetch.bind(globalThis), now = () => new Date() } = {}) {
    Object.assign(this, { config, fetcher, now });
  }

  async request(method, key, { body = '', headers = {}, query = {} } = {}) {
    const signed = await signS3Request(this.config, { method, key, body, headers, query, now: this.now() });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try { return await this.fetcher(signed.url, { ...signed.init, signal: controller.signal }); }
    catch { throw new StorageError(); }
    finally { clearTimeout(timer); }
  }

  async getJSON(key) {
    const response = await this.request('GET', key);
    if (response.status === 404) return null;
    if (!response.ok) throw new StorageError();
    const etag = response.headers.get('etag');
    if (!etag) throw new StorageError();
    try { return { value: await response.json(), etag }; } catch { throw new StorageError(); }
  }

  async putJSON(key, value, conditions = {}) {
    const response = await this.request('PUT', key, { body: JSON.stringify(value),
      headers: { 'content-type': 'application/json; charset=utf-8', ...conditions } });
    if (response.status === 412 || response.status === 409) return false;
    if (!response.ok) throw new StorageError();
    return true;
  }

  async putEmpty(key) {
    const response = await this.request('PUT', key, { body: '', headers: { 'content-type': 'application/octet-stream' } });
    if (!response.ok) throw new StorageError();
  }

  async head(key) {
    const response = await this.request('HEAD', key);
    if (response.status === 404) return false;
    if (!response.ok) throw new StorageError();
    return response.headers;
  }

  async delete(key) {
    const response = await this.request('DELETE', key);
    if (!response.ok && response.status !== 404) throw new StorageError();
  }

  async list(prefix, maxKeys = 10) {
    const response = await this.request('GET', '', { query: { 'list-type': '2', prefix, 'max-keys': maxKeys } });
    if (!response.ok) throw new StorageError();
    return parseListKeys(await response.text());
  }
}
