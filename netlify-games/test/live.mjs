// Opt-in real deployment test. Not included in npm test. Creates one temporary
// 24-hour room, closes both sessions, and never prints/saves seat credentials.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)]; }));
const config = JSON.parse(await readFile(new URL('../../assets/data/netlify-games.json', import.meta.url), 'utf8'));
const endpoint = new URL(args.endpoint || config.endpoint);
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('HTTPS endpoint required');
const origin = args.origin || 'https://m-e-l-s.github.io', records = [];
const random = size => randomBytes(size).toString('hex');
async function request(method, payload, requestOrigin = origin) {
  const params = ['--noproxy', '*', '--ipv4', '--silent', '--show-error', '--include', '--connect-timeout', '6', '--max-time', '15',
    '--request', method, '--header', `Origin: ${requestOrigin}`, '--write-out', '\n__METRICS__%{json}'];
  if (args.interface) params.push('--interface', args.interface);
  if (method === 'POST') params.push('--header', 'Content-Type: text/plain;charset=UTF-8', '--data-binary', '@-');
  if (method === 'OPTIONS') params.push('--header', 'Access-Control-Request-Method: POST', '--header', 'Access-Control-Request-Headers: content-type');
  params.push(endpoint.href + (method === 'GET' ? '?health=1' : ''));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', params, { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(payload ? JSON.stringify(payload) : undefined);
  });
  const marker = result.stdout.lastIndexOf('\n__METRICS__');
  const metrics = marker >= 0 ? JSON.parse(result.stdout.slice(marker + '\n__METRICS__'.length)) : {};
  const response = marker >= 0 ? result.stdout.slice(0, marker) : result.stdout;
  const end = response.indexOf('\r\n\r\n'), headers = response.slice(0, end);
  const header = key => headers.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))?.[1]?.trim() || null;
  let body; try { body = JSON.parse(response.slice(end + 4)); } catch {}
  const record = { method, action: payload?.action || null, status: metrics.http_code || 0,
    ms: Math.round((metrics.time_total || 0) * 1000), requestId: header('X-Nf-Request-Id'),
    allowOrigin: header('Access-Control-Allow-Origin'), error: body?.error || (result.code ? 'network_error' : !body && method !== 'OPTIONS' ? 'non_json_response' : null) };
  records.push(record);
  assert.equal(result.code, 0, 'network request failed');
  assert.equal(record.allowOrigin, requestOrigin, `CORS failed (${record.status}, request ${record.requestId})`);
  if (method === 'OPTIONS') { assert.equal(record.status, 204); return null; }
  assert.ok(body && record.status === 200, `HTTP ${record.status}: ${record.error}, request ${record.requestId}`);
  return body;
}
const room = random(10), host = { game: 'gomoku', room, token: random(32), connection: random(16) }, guest = { game: 'gomoku', room, token: random(32), connection: random(16) };
const call = (who, action, extra = {}) => request('POST', { ...who, action, ...extra });
const command = (who, state, value, id = random(16)) => call(who, 'command', { command: value, revision: state.revision, requestId: id });
let hostOpened = false, guestOpened = false, success = false, failure = null;
try {
  assert.equal((await request('GET')).service, 'mels-games');
  await request('OPTIONS'); await request('OPTIONS', null, 'http://localhost:12001');
  let result = await call(host, 'open', { create: true, options: { hostColor: 2 } });
  assert.equal(result.ok, true, `create failed: ${result.error}`); hostOpened = true;
  assert.equal(result.state.you, 2);
  result = await call(guest, 'open'); assert.equal(result.ok, true); guestOpened = true; assert.equal(result.state.you, 1);
  let state = (await call(host, 'sync')).state; assert.deepEqual(state.players, [true, true]);
  assert.equal((await call(host, 'sync', { sync: state.sync })).unchanged, true);
  state = (await command(guest, state, { type: 'move', move: [7, 7] })).state;
  const id = random(16), previous = state;
  state = (await command(host, state, { type: 'move', move: [7, 8] }, id)).state;
  assert.equal(state.moves.length, 2);
  const replay = await command(host, previous, { type: 'move', move: [7, 8] }, id);
  assert.equal(replay.replayed, true); assert.equal(replay.state.moves.length, 2);
  assert.equal((await command(host, state, { type: 'move', move: [8, 8] })).error, 'illegal_move');
  state = (await command(host, state, { type: 'offer', kind: 'undo' })).state;
  assert.equal((await command(host, state, { type: 'respond', accept: true })).error, 'invalid_offer');
  state = (await command(guest, state, { type: 'respond', accept: true })).state;
  assert.equal(state.moves.length, 1);
  state = (await command(host, state, { type: 'offer', kind: 'restart', hostColor: 1 })).state;
  state = (await command(guest, state, { type: 'respond', accept: true })).state;
  assert.equal(state.hostColor, 1); assert.equal(state.moves.length, 0);
  for (let x = 0; x < 5; x++) {
    state = (await command(host, state, { type: 'move', move: [x, 0] })).state;
    if (x < 4) state = (await command(guest, state, { type: 'move', move: [x, 1] })).state;
  }
  assert.equal(state.outcome, 1);
  const oldConnection = host.connection; host.connection = random(16);
  assert.equal((await call(host, 'open')).state.moves.length, 9);
  assert.equal((await call({ ...host, connection: oldConnection }, 'sync')).error, 'session_replaced');
  await call(host, 'leave'); hostOpened = false;
  assert.equal((await call(guest, 'sync')).state.players[0], false);
  await call(host, 'open'); hostOpened = true;
  assert.equal((await call(host, 'sync')).state.moves.length, 9);
  success = true;
} catch (error) { failure = error.message; }
finally {
  for (const [who, opened] of [[host, hostOpened], [guest, guestOpened]]) if (opened) {
    try { await call(who, 'leave'); } catch { /* Lease expiry is the fallback. */ }
  }
}
const times = records.map(value => value.ms).sort((a, b) => a - b);
const report = { at: new Date().toISOString(), endpoint: endpoint.href, success, failure,
  explicitProxy: false, physicalInterfaceBound: !!args.interface, origin,
  samples: records.length, medianMs: times[Math.ceil(times.length / 2) - 1], p95Ms: times[Math.ceil(times.length * .95) - 1], records };
const output = path.resolve(args.output || 'build/netlify-live-results.json');
await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ success, failure, samples: report.samples, medianMs: report.medianMs, p95Ms: report.p95Ms, output }, null, 2));
if (!success) process.exitCode = 1;
