import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoomClient } from '../../src/scripts/game-room-client.js';
import { createService } from '../core.mjs';
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
class Store {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index]; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
class Clock {
  now = 1000000; id = 0; tasks = new Map();
  setTimeout = (fn, ms) => { const id = ++this.id; this.tasks.set(id, { fn, at: this.now + ms }); return id; };
  clearTimeout = id => { this.tasks.delete(id); };
  async advance(ms) {
    const end = this.now + ms;
    for (let steps = 0; steps < 1000; steps++) {
      const next = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) { this.now = end; await flush(); return; }
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].fn(); await flush();
    }
    throw Error('timer runaway');
  }
}
function setup() {
  const clock = new Clock(), records = new Map(), calls = [];
  const service = createService({
    async get(id) { return structuredClone(records.get(id)) || null; },
    async commit(id, version, data) {
      if ((records.get(id)?.version ?? null) !== version) return false;
      records.set(id, { version: version === null ? 0 : version + 1, data: structuredClone(data) }); return true;
    }, async limitCreation() { return true; }
  }, () => clock.now);
  const transport = async payload => { calls.push(structuredClone(payload)); return service(payload, 'client'); };
  function client(call = transport, storage = new Store(), tabStorage = new Store()) {
    const listeners = {}, events = {}, document = { hidden: false, addEventListener: (name, fn) => { listeners[name] = fn; } };
    const instance = new GameRoomClient({ game: 'gomoku', onChange() {}, call, storage, tabStorage, document,
      events: { addEventListener: (name, fn) => { events[name] = fn; } }, clock: () => clock.now, timers: clock });
    return { instance, storage, tabStorage, events,
      async hidden(hidden) { document.hidden = hidden; listeners.visibilitychange(); await flush(); } };
  }
  return { clock, records, calls, transport, client };
}
test('client preserves separate credentials, handles lost responses and supports new-tab takeover', async () => {
  const f = setup(); let lose = true;
  const host = f.client(async payload => { const result = await f.transport(payload); if (payload.action === 'command' && lose) { lose = false; throw Error('lost response'); } return result; });
  host.storage.setItem('mels_gomoku_identity_v2:cloud-room', 'preserved');
  host.instance.create({ hostColor: 1 }); await flush();
  const room = host.instance.session.room, token = host.instance.session.token;
  const guest = f.client(); guest.instance.join(room); await flush();
  await f.clock.advance(11000);
  host.instance.send('move', { move: [7, 7] }); await flush();
  assert.equal(host.instance.state.moves.length, 1);
  const retries = f.calls.filter(value => value.action === 'command');
  assert.equal(retries.length, 2); assert.equal(retries[0].requestId, retries[1].requestId);
  const reopened = f.client(undefined, host.storage);
  reopened.instance.prepareRoom(room); reopened.instance.resume(); await flush();
  assert.equal(reopened.instance.session.token, token);
  await f.clock.advance(17000);
  assert.equal(host.instance.active, false); assert.equal(host.instance.replaced, true);
  host.instance.resume(); assert.equal(host.instance.active, false, 'auto resume cannot fight the new tab');
  reopened.instance.forget(); await flush();
  assert.equal(host.storage.getItem('mels_netlify_room_v1:gomoku:' + room), null);
  assert.equal(host.storage.getItem('mels_gomoku_identity_v2:cloud-room'), 'preserved');
  guest.instance.disconnect();
});

test('visibility and inactivity stop requests, foreground resumes, unchanged sync is compact', async () => {
  const f = setup(), host = f.client(); host.instance.create(); await flush();
  const guest = f.client(); guest.instance.join(host.instance.session.room); await flush();
  await f.clock.advance(11000);
  assert.equal(host.instance.state.players.every(Boolean), true);
  await host.hidden(true); const afterLeave = f.calls.length;
  await f.clock.advance(40000);
  assert.equal(f.calls.filter((value, i) => i >= afterLeave && value.token === host.instance.session.token).length, 0);
  await host.hidden(false); assert.equal(host.instance.status, 'connected');
  await f.clock.advance(330000);
  assert.equal(host.instance.active, false); assert.match(host.instance.syncHint, /暂停/);
  assert.equal(guest.instance.active, false);
  const count = f.calls.length; await f.clock.advance(300000); assert.equal(f.calls.length, count);
});

test('one poll at a time, retry backoff, no early sync before open, no late state after switching', async () => {
  const f = setup(); let failures = 2, release, held = false;
  const host = f.client(async (payload, options) => {
    if (payload.action === 'open' && failures-- > 0) throw Error('network');
    if (payload.action === 'sync' && !held) {
      held = true;
      return new Promise(resolve => { release = async () => resolve(await f.transport(payload)); });
    }
    return f.transport(payload, options);
  });
  host.instance.create(); await flush(); assert.equal(host.instance.status, 'reconnecting');
  await f.clock.advance(11000); assert.equal(host.instance.status, 'connected');
  await f.clock.advance(12000); assert.ok(release);
  const count = f.calls.length; await f.clock.advance(10000); assert.equal(f.calls.length, count, 'held poll does not spawn another');
  const oldRoom = host.instance.session.room;
  host.instance.create({ hostColor: 2 }); await release(); await flush();
  assert.notEqual(host.instance.session.room, oldRoom);
  assert.equal(host.instance.state.room, host.instance.session.room);
  assert.equal(host.instance.state.you, 2);
  host.instance.disconnect();
});

test('fatal config errors do not poll, and invalid stored identities never connect', async () => {
  const f = setup(); let requests = 0;
  const host = f.client(async () => { requests++; throw Error('not_configured'); });
  host.instance.create(); await flush(); assert.equal(requests, 1); assert.equal(host.instance.active, false);
  await f.clock.advance(600000); assert.equal(requests, 1);
  const expired = f.client(); expired.instance.prepareRoom(host.instance.session.room);
  assert.equal(expired.instance.session, null);
});
