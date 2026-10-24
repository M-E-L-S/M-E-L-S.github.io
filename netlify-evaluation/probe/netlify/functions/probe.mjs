const ORIGINS = new Set(['https://m-e-l-s.github.io', 'http://localhost:12001', 'http://127.0.0.1:12001']);
export default async function probe(request) {
  const url = new URL(request.url), origin = request.headers.get('origin');
  const allowed = !origin || origin === url.origin || ORIGINS.has(origin);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Netlify-CDN-Cache-Control': 'no-store', 'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };
  if (allowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (!allowed) return reply({ ok: false, error: 'origin_not_allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'POST'].includes(request.method)) return reply({ ok: false, error: 'method_not_allowed' }, 405);
  let nonce = url.searchParams.get('nonce');
  if (request.method === 'POST') {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return reply({ ok: false, error: 'json_required' }, 415);
    let bytes = 0;
    const decoder = new TextDecoder();
    let text = '';
    for await (const chunk of request.body || []) {
      bytes += chunk.byteLength;
      if (bytes > 2048) return reply({ ok: false, error: 'payload_too_large' }, 413);
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    let body;
    try { body = JSON.parse(text); } catch { return reply({ ok: false, error: 'invalid_json' }, 400); }
    nonce = body?.nonce;
  }
  if (typeof nonce !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(nonce)) return reply({ ok: false, error: 'invalid_nonce' }, 400);
  return reply({ ok: true, nonce, at: Date.now(), source: 'netlify-function' });
}
