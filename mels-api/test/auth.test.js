import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { authorize } from '../src/auth.js';

const env = {
  AICU_ACCESS_PASSWORD: 'test-only-password-1234',
  AICU_TOKEN_SECRET: 'test-only-signing-key-000000000000000000000000',
  AICU_AUTH_VERSION: '1',
  AICU_LOGIN_LIMITER: { limit: async () => ({ success: true }) },
  AICU_LOGIN_GLOBAL_LIMITER: { limit: async () => ({ success: true }) }
};
const origin = 'https://m-e-l-s.github.io';
function request(path, token, options = {}) {
  return new Request(`https://worker.test/api/aicu/${path}`, { ...options, headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
}
const fetchWorker = (req, config = env) => worker.fetch(req, config, { waitUntil() {} });
async function login(password = env.AICU_ACCESS_PASSWORD, config = env) {
  return fetchWorker(request('auth/login', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }), config);
}
const getToken = async () => (await (await login()).json()).token;

test('login issues a 24h token, session verifies without renewal, responses no-store', async () => {
  const result = await login();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const data = await result.json();
  assert.ok(data.expiresAt > Date.now() + 86390000 && data.expiresAt <= Date.now() + 86400000);
  const session = await fetchWorker(request('auth/session', data.token));
  assert.deepEqual(await session.json(), { ok: true, expiresAt: data.expiresAt });
});
test('wrong password, missing and tampered token rejected', async () => {
  assert.equal((await login('wrong')).status, 401);
  assert.equal((await fetchWorker(request('auth/session'))).status, 401);
  const token = await getToken();
  const parts = token.split('.'); parts[1] = Buffer.from('{"scope":"admin"}').toString('base64url');
  assert.equal((await fetchWorker(request('auth/session', parts.join('.')))).status, 401);
  assert.equal((await fetchWorker(request('auth/session', 'x'.repeat(3000)))).status, 401);
});
test('password, signing secret and version independently revoke existing tokens', async () => {
  const token = await getToken();
  for (const key of ['AICU_ACCESS_PASSWORD', 'AICU_TOKEN_SECRET', 'AICU_AUTH_VERSION']) {
    assert.equal((await fetchWorker(request('auth/session', token), { ...env, [key]: env[key] + '-changed' })).status, 401);
  }
});
test('all query routes authenticate before touching shared cached data', async () => {
  let hits = 0;
  globalThis.caches = { default: { match: async () => { hits++; return Response.json({ ok: true, data: {} }); } } };
  for (const path of ['replies', 'video-danmaku', 'history', 'assets']) {
    assert.equal((await fetchWorker(request(`${path}?uid=2`))).status, 401);
  }
  assert.equal(hits, 0);
  const response = await fetchWorker(request('history?uid=2', await getToken()));
  assert.equal(response.status, 200); assert.equal(response.headers.get('X-Cache'), 'HIT'); assert.equal(hits, 1);
});
test('missing configuration and broken login limiter fail closed', async () => {
  assert.equal((await fetchWorker(request('history?uid=2'), {})).status, 503);
  assert.equal((await login(env.AICU_ACCESS_PASSWORD, { ...env, AICU_LOGIN_LIMITER: null })).status, 503);
  const response = await login(env.AICU_ACCESS_PASSWORD, { ...env, AICU_LOGIN_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60');
});
test('login body is bounded without trusting Content-Length', async () => {
  assert.equal((await login('x'.repeat(3000))).status, 400);
  assert.equal((await fetchWorker(request('auth/login', null, { method: 'POST', body: '{}' }))).status, 400);
  assert.equal((await fetchWorker(request('auth/login?password=bad', null, { method: 'POST' }))).status, 400);
});
test('preflight allows Authorization and POST login without exposing protected data', async () => {
  for (const [path, method] of [['history', 'GET'], ['auth/login', 'POST']]) {
    const response = await fetchWorker(request(path, null, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization,content-type' } }));
    assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  }
  assert.equal((await fetchWorker(request('auth/login'))).status, 405);
  assert.equal((await fetchWorker(request('history?uid=2', null, { headers: { Origin: 'https://evil.test' } }))).status, 403);
});
test('signed but expired, future, wrong-scope and excessive-lifetime claims fail', async () => {
  const token = await getToken();
  const [header, payload] = token.split('.');
  const original = JSON.parse(Buffer.from(payload, 'base64url'));
  const importKey = bytes => crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const master = await importKey(Buffer.from(env.AICU_TOKEN_SECRET));
  const key = await importKey(await crypto.subtle.sign('HMAC', master, Buffer.from(JSON.stringify(['mels-aicu-auth-v1', env.AICU_ACCESS_PASSWORD, env.AICU_AUTH_VERSION]))));
  for (const patch of [{ exp: original.iat - 1 }, { iat: original.iat + 60 }, { scope: 'admin' }, { exp: original.exp + 1 }, { aud: 'other' }]) {
    const message = `${header}.${Buffer.from(JSON.stringify({ ...original, ...patch })).toString('base64url')}`;
    const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, Buffer.from(message))).toString('base64url');
    assert.equal((await authorize(request('history', `${message}.${signature}`), env)).status, 401);
  }
});
