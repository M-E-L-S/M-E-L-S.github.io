import { games } from './registry.mjs';
const DEFAULT_ORIGINS = ['https://m-e-l-s.github.io', 'http://localhost:12001', 'http://127.0.0.1:12001'];
export function createHandler(getService, extraOrigins = '') {
  const origins = new Set([...DEFAULT_ORIGINS, ...extraOrigins.split(',').map(value => value.trim()).filter(Boolean)]);
  return async function handler(request, context = {}) {
    const origin = request.headers.get('origin'), url = new URL(request.url);
    const allowed = origins.has(origin) || origin === url.origin;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Netlify-CDN-Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (allowed) Object.assign(headers, { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400' });
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    // This liveness endpoint never creates a DB client or wakes the database.
    if (request.method === 'GET' && url.searchParams.get('health') === '1' && (!origin || allowed))
      return reply({ ok: true, service: 'mels-games', protocol: 1, games: Object.keys(games) });
    if (!allowed) return reply({ ok: false, error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405);
    if (!/^(application\/json|text\/plain)(?:;|$)/i.test(request.headers.get('content-type') || ''))
      return reply({ ok: false, error: 'invalid_message' }, 415);
    let body = '', size = 0;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of request.body || []) {
        size += chunk.byteLength;
        if (size > 4096) return reply({ ok: false, error: 'message_too_large' }, 413);
        body += decoder.decode(chunk, { stream: true });
      }
      body += decoder.decode();
      body = JSON.parse(body);
    } catch { return reply({ ok: false, error: 'invalid_message' }, 400); }
    // Reject unknown/invalid envelopes before constructing a database client.
    if (!body || typeof body.game !== 'string' || !Object.hasOwn(games, body.game) || !['open', 'sync', 'command', 'leave'].includes(body.action)
      || typeof body.room !== 'string' || !/^[a-f0-9]{20}$/.test(body.room)
      || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)
      || typeof body.connection !== 'string' || !/^[a-f0-9]{32}$/.test(body.connection))
      return reply({ ok: false, error: 'invalid_message' }, 400);
    try {
      const service = await getService();
      return reply(await service(body, typeof context.ip === 'string' ? context.ip : null));
    } catch (error) {
      // Never log request bodies, room credentials, connection URLs, or SQL.
      console.error('game_api_unavailable', /^[a-zA-Z0-9_]{1,16}$/.test(error.code || '') ? error.code : 'unknown');
      return reply({ ok: false, error: 'service_unavailable' }, 503);
    }
  };
}
