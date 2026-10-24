const ROOM_ID = /^[a-f0-9]{20}$/;
const ALLOWED_ORIGINS = new Set([
  'https://m-e-l-s.github.io',
  'http://localhost:12001',
  'http://127.0.0.1:12001',
]);
const failure = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function routeGomoku(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/gomoku\/rooms\/([a-f0-9]{20})$/);
  if (!match || !ROOM_ID.test(match[1]) || url.href.length > 512) return failure('invalid_room', 400);
  // Production accepts only exact preview origins. Local Worker integration
  // tests may additionally use other loopback origins.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const origin = request.headers.get('Origin');
  let allowed = ALLOWED_ORIGINS.has(origin);
  try { allowed ||= local && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname); } catch {}
  if (!allowed) return failure('origin_not_allowed', 403);
  if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return failure('websocket_required', 426);
  if (!env.GOMOKU_ROOMS || !env.GOMOKU_CONNECT_LIMITER) return failure('service_unavailable', 503);
  // Stop abusive handshakes before allocating/reading a room. Not a strict global cap.
  const result = await env.GOMOKU_CONNECT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
  if (!result.success) return failure('too_many_connections', 429);
  if (url.searchParams.get('create') === '1') {
    if (!env.GOMOKU_CREATE_LIMITER) return failure('service_unavailable', 503);
    if (!(await env.GOMOKU_CREATE_LIMITER.limit({ key: 'rooms' })).success) return failure('too_many_rooms', 429);
  }
  return env.GOMOKU_ROOMS.get(env.GOMOKU_ROOMS.idFromName(match[1])).fetch(request);
}
