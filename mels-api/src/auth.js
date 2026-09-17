const encoder = new TextEncoder();
const TTL = 86400;
const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decode(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw Error('encoding');
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
function configured(env) {
  return typeof env.AICU_ACCESS_PASSWORD === 'string' && env.AICU_ACCESS_PASSWORD.length >= 16 && env.AICU_ACCESS_PASSWORD.length <= 512 &&
    typeof env.AICU_TOKEN_SECRET === 'string' && env.AICU_TOKEN_SECRET.length >= 32 &&
    typeof env.AICU_AUTH_VERSION === 'string' && env.AICU_AUTH_VERSION.length > 0;
}
const hmacKey = bytes => crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
async function signingKey(env) {
  // Both independent secret and password are required. Changing either revokes all tokens.
  const master = await hmacKey(encoder.encode(env.AICU_TOKEN_SECRET));
  const derived = await crypto.subtle.sign('HMAC', master, encoder.encode(JSON.stringify(['mels-aicu-auth-v1', env.AICU_ACCESS_PASSWORD, env.AICU_AUTH_VERSION])));
  return hmacKey(derived);
}
async function issue(env) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: 'mels-aicu', scope: 'aicu:read', iat: now, exp: now + TTL, ver: env.AICU_AUTH_VERSION, jti: crypto.randomUUID() };
  const message = `${header}.${encode(encoder.encode(JSON.stringify(claims)))}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(message));
  return { token: `${message}.${encode(new Uint8Array(signature))}`, expiresAt: claims.exp * 1000 };
}
export async function authorize(request, env) {
  if (!configured(env)) return { status: 503, error: 'auth_not_configured' };
  try {
    const value = request.headers.get('Authorization') || '';
    if (value.length > 2048 || !value.startsWith('Bearer ')) throw Error('token');
    const parts = value.slice(7).split('.');
    if (parts.length !== 3 || parts[0] !== header) throw Error('token');
    if (!await crypto.subtle.verify('HMAC', await signingKey(env), decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) throw Error('signature');
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== 'mels-aicu' || claims.scope !== 'aicu:read' || claims.ver !== env.AICU_AUTH_VERSION ||
        !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.iat > now ||
        claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > TTL ||
        typeof claims.jti !== 'string' || !claims.jti) throw Error('claims');
    return { status: 200, expiresAt: claims.exp * 1000 };
  } catch { return { status: 401, error: 'authentication_required' }; }
}
async function readPassword(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw Error('body');
  if (!request.body || Number(request.headers.get('Content-Length')) > 2048) throw Error('body');
  const reader = request.body.getReader();
  let size = 0, text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(Error('timeout')); }, 5000); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > 2048) throw Error('body');
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    if (typeof body.password !== 'string' || body.password.length > 512) throw Error('body');
    return body.password;
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export async function login(request, env) {
  if (!configured(env)) return { status: 503, error: 'auth_not_configured' };
  try {
    if (!env.AICU_LOGIN_LIMITER?.limit || !env.AICU_LOGIN_GLOBAL_LIMITER?.limit) throw Error('binding');
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const globalLimit = await env.AICU_LOGIN_GLOBAL_LIMITER.limit({ key: 'login' });
    const clientLimit = await env.AICU_LOGIN_LIMITER.limit({ key: ip });
    if (!globalLimit.success || !clientLimit.success) return { status: 429, error: 'login_rate_limited' };
  } catch { return { status: 503, error: 'login_limit_unavailable' }; }
  let password;
  try { password = await readPassword(request); } catch { return { status: 400, error: 'invalid_login_body' }; }
  // Verify fixed-size HMACs instead of an early-exit password string comparison.
  const key = await hmacKey(encoder.encode(env.AICU_TOKEN_SECRET));
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(env.AICU_ACCESS_PASSWORD));
  if (!await crypto.subtle.verify('HMAC', key, expected, encoder.encode(password))) return { status: 401, error: 'invalid_password' };
  return { status: 200, ...await issue(env) };
}
