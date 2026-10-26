const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync('src/scripts/gomoku-online.js', 'utf8')
    .replace('export class OnlineGame', 'globalThis.OnlineGame = class OnlineGame');
const prefix = 'mels_gomoku_identity_v2:';
const currentKey = 'mels_gomoku_room_v1';
const historyKey = 'mels_gomoku_rooms_v1';
let now = Date.now();
const tabs = [];
const durable = new Map();
function storage(map, changed = () => {}) {
    return {
        get length() { return map.size; }, key: i => [...map.keys()][i],
        getItem: key => map.get(key) ?? null,
        setItem(key, value) { const old = map.get(key); map.set(key, value); if (value !== old) changed(key, value); },
        removeItem(key) { if (map.delete(key)) changed(key, null); }
    };
}
function tab(savedSession = new Map(), gameId = 'gomoku') {
    const listeners = [], sockets = [];
    const localStorage = storage(durable, (key, newValue) => {
        for (const other of tabs) if (other.listeners !== listeners)
            queueMicrotask(() => other.listeners.forEach(fn => fn({ key, newValue })));
    });
    class WebSocket {
        static OPEN = 1;
        readyState = 1;
        constructor(url, protocols) { this.url = String(url); this.protocols = protocols; sockets.push(this); }
        close() { this.readyState = 3; }
    }
    const context = { localStorage, sessionStorage: storage(savedSession), crypto: webcrypto, URL,
        WebSocket, structuredClone, Date: { now: () => now },
        addEventListener(type, fn) { assert.equal(type, 'storage'); listeners.push(fn); },
        setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {} };
    vm.runInNewContext(source, context);
    const game = new context.OnlineGame(() => {}, { game: gameId });
    const result = { game, listeners, sockets, savedSession };
    tabs.push(result);
    return result;
}
function snapshot(target, expiresAt = now + 3600000) {
    target.sockets.at(-1).onmessage({ data: JSON.stringify({ type: 'state',
        room: target.game.session.room, moves: [], expiresAt, revision: 0 }) });
}
(async () => {
    const original = tab(); original.game.create(2); snapshot(original);
    const { room, token, expiresAt } = original.game.session;
    assert.equal(JSON.parse(durable.get(prefix + room)).expiresAt, expiresAt);
    original.game.disconnect(); // Close the original tab, preserving only durable storage.
    const reopened = tab();
    assert.equal(reopened.game.session, null, 'a new tab does not select an unrelated room automatically');
    reopened.game.prepareRoom(room); reopened.game.resume();
    assert.equal(reopened.game.session.token, token, 'invitation recovers the original seat identity');
    assert.ok(reopened.sockets[0].protocols.includes('token.' + token));
    assert.ok(!reopened.sockets[0].url.includes(token), 'credential stays out of the URL');
    snapshot(reopened);


    const takeover = tab(); takeover.game.join(room);
    assert.equal(takeover.game.session.token, token, 'joining in another tab reuses the identity');
    reopened.sockets.at(-1).onclose({ code: 4001 });
    assert.equal(reopened.game.active, false, 'replaced connection does not reconnect and fight the new tab');

    const differentRoom = tab(); differentRoom.game.create(1); snapshot(differentRoom);
    const secondRoom = differentRoom.game.session.room;
    snapshot(takeover);
    assert.ok(durable.has(prefix + secondRoom), 'updates in one room retain other room credentials');
    const oldSession = new Map(takeover.savedSession);
    takeover.game.forget();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(durable.has(prefix + room), false);
    assert.equal(reopened.game.session, null, 'leaving clears other tabs holding the same identity');
    assert.ok(durable.has(prefix + secondRoom));
    assert.equal(tab(oldSession).game.session, null, 'stale tab selection cannot resurrect a forgotten identity');

    const legacyRoom = 'a'.repeat(20), legacyToken = 'b'.repeat(64);
    const legacy = tab(new Map([[currentKey, JSON.stringify({ room: legacyRoom, token: legacyToken, create: false })],
        [historyKey, JSON.stringify({})]]));
    assert.equal(legacy.game.session.token, legacyToken, 'existing tab credentials migrate');
    legacy.game.resume(); snapshot(legacy, now + 5000);
    legacy.game.disconnect(); now += 6000;
    const expired = tab(); expired.game.prepareRoom(legacyRoom);
    assert.equal(expired.game.session, null);
    assert.equal(durable.has(prefix + legacyRoom), false, 'expired credentials are removed on the next visit');

    differentRoom.sockets.at(-1).onclose({ code: 4004 });
    assert.equal(differentRoom.game.session, null);
    assert.equal(durable.has(prefix + secondRoom), false, 'server expiry removes credentials immediately');
    const halma = tab(new Map(), 'halma');
    halma.game.create({ players: 6, first: 6, hostColor: 6, mirror: true }); snapshot(halma);
    const halmaRoom = halma.game.session.room, halmaToken = halma.game.session.token;
    assert.ok(halma.sockets[0].url.includes('/api/halma/rooms/'));
    assert.ok(halma.sockets[0].protocols.includes('halma.v1'));
    assert.equal(JSON.parse(new URL(halma.sockets[0].url).searchParams.get('options')).players, 6);
    const halmaReopened = tab(new Map(), 'halma'); halmaReopened.game.prepareRoom(halmaRoom); halmaReopened.game.resume();
    assert.equal(halmaReopened.game.session.token, halmaToken);
    const gomokuSameID = tab(); gomokuSameID.game.join(halmaRoom);
    assert.notEqual(gomokuSameID.game.session.token, halmaToken, 'game identities remain isolated even for the same room code');
    assert.ok(gomokuSameID.sockets[0].protocols.includes('gomoku.v1'));
    console.log('PASS reconnect: new-tab recovery, token privacy, single-seat takeover, independent rooms/games, Halma configuration, leave propagation, legacy migration and expiry');
})().catch(error => { console.error(error); process.exitCode = 1; });
