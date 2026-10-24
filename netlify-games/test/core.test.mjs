import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createService, TTL, LEASE } from '../core.mjs';
import { repository } from '../repository.mjs';
import { createHandler } from '../http.mjs';
import { games } from '../registry.mjs';
import { getDatabase } from '@netlify/database';
import { neonConfig } from '@neondatabase/serverless';
const migration = await readFile(new URL('../netlify/database/migrations/0001_rooms.sql', import.meta.url), 'utf8');
const hex = (n, length) => n.toString(16).padStart(length, '0');
async function fixture(t) {
  const db = new PGlite(); await db.exec(migration); t.after(() => db.close());
  let now = 1000000, operations = 0;
  const queries = [];
  const repo = repository(async (text, params) => { queries.push(text); return (await db.query(text, params)).rows; });
  const service = createService(repo, () => now);
  const identity = n => ({ game: 'gomoku', room: hex(1, 20), token: hex(n, 64), connection: hex(n, 32) });
  const host = identity(1), guest = identity(2);
  const call = (who, action, data = {}) => service({ ...who, action, ...data }, 'trusted-client');
  const command = (who, state, value, extra = {}) => call(who, 'command', { revision: state.revision,
    requestId: hex(++operations, 32), command: value, ...extra });
  return { db, repo, queries, service, host, guest, identity, call, command, now: () => now, advance: n => { now += n; } };
}

test('real PostgreSQL: concurrent seats, CAS moves, stale state, replay and privacy', async t => {
  const f = await fixture(t);
  assert.equal((await f.call(f.guest, 'sync')).error, 'room_not_found');
  const created = await f.call(f.host, 'open', { create: true }); assert.equal(created.ok, true);
  const joins = await Promise.all([f.call(f.guest, 'open'), f.call(f.identity(3), 'open')]);
  assert.equal(joins.filter(r => r.ok).length, 1);
  assert.equal(joins.find(r => !r.ok).error, 'room_full');
  const opponent = joins[0].ok ? f.guest : f.identity(3);
  const state = (await f.call(f.host, 'sync')).state;
  assert.equal((await f.command(opponent, state, { type: 'move', move: [7, 7] })).error, 'illegal_move');
  const results = await Promise.all([
    f.command(f.host, state, { type: 'move', move: [7, 7] }),
    f.command(f.host, state, { type: 'move', move: [8, 7] })
  ]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(results.find(r => !r.ok).error, 'stale_state');
  const next = results.find(r => r.ok).state;
  const id = hex(500, 32), cmd = { type: 'move', move: [9, 7] };
  const applied = await f.command(opponent, next, cmd, { requestId: id }); assert.equal(applied.ok, true);
  const replay = await f.command(opponent, next, cmd, { requestId: id });
  assert.equal(replay.replayed, true); assert.equal(replay.state.moves.length, 2);
  f.advance(31000); await f.call(opponent, 'sync');
  assert.equal((await f.command(opponent, next, cmd, { requestId: id })).replayed, true, 'lean renewal preserves operation receipts in SQL');
  assert.equal((await f.command(opponent, applied.state, { type: 'move', move: [9, 8] }, { requestId: id })).error, 'operation_conflict');
  assert.equal((await f.call({ ...f.host, token: hex(99, 64) }, 'sync')).error, 'invalid_session');
  const publicJSON = JSON.stringify(applied.state);
  assert.ok(!publicJSON.includes(f.host.token)); assert.ok(!publicJSON.includes('receipts')); assert.ok(!publicJSON.includes('"key"'));
});

test('Gomoku consent, host color, undo and terminal games remain authoritative', async t => {
  const f = await fixture(t);
  let state = (await f.call(f.host, 'open', { create: true, options: { hostColor: 2 } })).state;
  await f.call(f.guest, 'open'); state = (await f.call(f.host, 'sync')).state;
  assert.equal(state.you, 2); assert.equal(state.hostColor, 2);
  state = (await f.command(f.guest, state, { type: 'move', move: [0, 0] })).state;
  assert.equal((await f.command(f.host, state, { type: 'offer', kind: 'undo' })).error, 'nothing_to_undo');
  state = (await f.command(f.host, state, { type: 'move', move: [0, 1] })).state;
  state = (await f.command(f.host, state, { type: 'offer', kind: 'undo' })).state;
  assert.equal((await f.command(f.host, state, { type: 'respond', accept: true })).error, 'invalid_offer');
  state = (await f.command(f.guest, state, { type: 'respond', accept: true })).state;
  assert.equal(state.moves.length, 1);
  assert.equal((await f.command(f.guest, state, { type: 'color', hostColor: 1 })).error, 'host_only');
  state = (await f.command(f.host, state, { type: 'offer', kind: 'restart', hostColor: 1 })).state;
  state = (await f.command(f.guest, state, { type: 'respond', accept: true })).state;
  assert.equal(state.hostColor, 1); assert.equal(state.moves.length, 0);
  for (let x = 0; x < 5; x++) {
    state = (await f.command(f.host, state, { type: 'move', move: [x, 0] })).state;
    if (x < 4) state = (await f.command(f.guest, state, { type: 'move', move: [x, 1] })).state;
  }
  assert.equal(state.outcome, 1); assert.equal(state.winningLine.length, 5);
  assert.equal((await f.command(f.guest, state, { type: 'move', move: [6, 1] })).error, 'illegal_move');
});

test('leases, takeover, late heartbeat, compact sync, expiry and bounded cleanup', async t => {
  const f = await fixture(t);
  await f.call(f.host, 'open', { create: true }); await f.call(f.guest, 'open');
  const first = await f.call(f.host, 'sync'); const writes = f.queries.filter(q => /^(INSERT|UPDATE)/.test(q)).length;
  const unchanged = await f.call(f.host, 'sync', { sync: first.state.sync });
  assert.equal(unchanged.unchanged, true); assert.equal(unchanged.state, undefined);
  assert.equal(f.queries.filter(q => /^(INSERT|UPDATE)/.test(q)).length, writes);
  const replacement = { ...f.host, connection: hex(4, 32) };
  await f.call(replacement, 'open'); assert.equal((await f.call(f.host, 'sync')).error, 'session_replaced');
  await f.call(replacement, 'leave'); assert.equal((await f.call(replacement, 'sync')).error, 'session_replaced');
  assert.equal((await f.call(f.guest, 'sync')).state.players[0], false);
  await f.call(replacement, 'open'); f.advance(LEASE + 1);
  const presence = await f.call(f.guest, 'sync'); assert.deepEqual(presence.state.players, [false, true]);
  f.advance(TTL); assert.equal((await f.call(f.guest, 'sync')).error, 'room_expired');
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM game_rooms')).rows[0].n, 1, 'no background cleanup/wakeup');
  await f.call({ ...f.host, room: hex(2, 20) }, 'open', { create: true });
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM game_rooms')).rows[0].n, 1, 'new creation cleans expired row');
});

test('creation quota is atomic and game registry supports another seat count', async t => {
  const f = await fixture(t);
  const values = await Promise.all(Array.from({ length: 12 }, (_, i) => f.call({ ...f.host, room: hex(i + 1, 20) }, 'open', { create: true })));
  assert.equal(values.filter(r => r.ok).length, 10); assert.equal(values.filter(r => r.error === 'too_many_rooms').length, 2);
  const counter = { seats: 3, initial: () => ({ n: 0 }), snapshot: (state, view) => ({ ...state, players: view.online, joined: view.joined }), apply: state => { state.n++; } };
  const service = createService(f.repo, f.now, { ...games, counter });
  const input = { ...f.host, game: 'counter', room: hex(99, 20), action: 'open', create: true };
  assert.equal((await service(input, 'other-client')).state.players.length, 3);
  assert.equal((await service({ ...input, game: 'gomoku' }, 'other-client')).error, 'room_not_found');
  assert.equal((await service({ ...input, game: '__proto__' }, 'other-client')).error, 'unknown_game');
});

test('HTTP preflight/simple POST and health never query DB unnecessarily', async t => {
  const f = await fixture(t); let calls = 0;
  const handler = createHandler(() => { calls++; return f.service; });
  const url = 'https://games.netlify.app/.netlify/functions/game', origin = 'http://localhost:12001';
  assert.equal((await handler(new Request(url + '?health=1'))).status, 200); assert.equal(calls, 0);
  const preflight = await handler(new Request(url, { method: 'OPTIONS', headers: { Origin: origin } }));
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin); assert.equal(calls, 0);
  const rejected = await handler(new Request(url, { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: '{}' }));
  assert.equal(rejected.status, 403); assert.equal(calls, 0);
  const invalid = await handler(new Request(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{}' }));
  assert.equal(invalid.status, 400); assert.equal(calls, 0);
  const opened = await handler(new Request(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ ...f.host, action: 'open', create: true }) }), { ip: 'trusted-platform-client' });
  assert.equal((await opened.json()).ok, true); assert.equal(opened.headers.get('cache-control'), 'no-store');
  const tooBig = await handler(new Request(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: ' '.repeat(4097) }));
  assert.equal(tooBig.status, 413);
});

test('installed Netlify SDK serverless SQL driver matches repository result contract', async t => {
  const f = await fixture(t), previous = neonConfig.fetchFunction, driver = process.env.NETLIFY_DB_DRIVER;
  process.env.NETLIFY_DB_DRIVER = 'serverless';
  t.after(() => { neonConfig.fetchFunction = previous; if (driver === undefined) delete process.env.NETLIFY_DB_DRIVER; else process.env.NETLIFY_DB_DRIVER = driver; });
  neonConfig.fetchFunction = async (_url, options) => {
    const { query, params } = JSON.parse(options.body);
    const result = await f.db.query(query, params);
    const fields = result.fields.map(field => ({ name: field.name, dataTypeID: field.dataTypeID }));
    const rows = result.rows.map(row => fields.map(field => {
      const value = row[field.name];
      return value === null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value);
    }));
    return new Response(JSON.stringify({ fields, rows, rowCount: rows.length, command: 'SELECT' }), { headers: { 'Content-Type': 'application/json' } });
  };
  const db = getDatabase({ connectionString: 'postgresql://local:local@localhost/test' });
  const service = createService(repository((text, params) => db.sql.unsafe(text, params)), f.now);
  assert.equal((await service({ ...f.host, action: 'open', create: true }, 'sdk-test')).ok, true);
  const sync = await service({ ...f.host, action: 'sync' }, 'sdk-test');
  assert.equal(sync.ok, true); assert.equal(sync.state.room, f.host.room);
});
