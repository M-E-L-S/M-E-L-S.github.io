import test from 'node:test';
import assert from 'node:assert/strict';
import halma, { board } from '../../shared/halma-room.js';
import { HalmaRoom } from '../src/halma-room.js';
import { routeGomoku } from '../src/gomoku-router.js';
import { HalmaGame } from '../../src/scripts/halma-model.js';
globalThis.WebSocketRequestResponsePair = class {};
async function fixture(players = 3, mirror = false, first = players, hostColor = players) {
    let saved = { id: 'a'.repeat(20), seats: Array.from({ length: players }, (_, i) => 'key' + i),
        state: halma.initial({ players, mirror, first, hostColor }), revision: 0, expiresAt: Date.now() + 86400000 };
    const sockets = saved.seats.map((key, seat) => {
        let attachment = { key, seat, window: Date.now(), count: 0 };
        const ws = { readyState: 1, messages: [], deserializeAttachment: () => structuredClone(attachment),
            serializeAttachment: value => { attachment = structuredClone(value); }, send: value => ws.messages.push(JSON.parse(value)),
            close: code => { ws.readyState = 3; ws.code = code; } }; return ws;
    });
    const ctx = { writes: 0, getWebSockets: () => sockets, setWebSocketAutoResponse() {},
        blockConcurrencyWhile(callback) { this.ready = callback(); },
        storage: { get: async () => structuredClone(saved), put: async (_, value) => { saved = structuredClone(value); ++ctx.writes; }, deleteAll: async () => { saved = null; } } };
    const restore = async () => { const room = new HalmaRoom(ctx, {}); await ctx.ready; return room; };
    return { room: await restore(), sockets, ctx, restore };
}
const command = (room, socket, value) => room.webSocketMessage(socket, JSON.stringify({ revision: room.room.revision,
    ...(value.type === 'respond' ? { offerId: room.room.state.offer?.id } : {}), ...value }));
for (const players of [2, 3, 4, 6]) for (const mirror of [false, true]) test(`Cloudflare Halma ${players} players, mirror=${mirror}: authoritative move, consensus and hibernation`, async () => {
    const f = await fixture(players, mirror), { room, sockets } = f;
    assert.equal(room.snapshot(0).you, players);
    const wrong = sockets.find((_, seat) => room.snapshot(seat).you !== board(room.room.state).turn);
    await command(room, wrong, { type: 'move', move: board(room.room.state).allMoves()[0] });
    assert.equal(f.ctx.writes, 0);
    for (let i = 0; i < players; ++i) {
        const game = board(room.room.state), seat = room.room.state.colors.indexOf(game.turn);
        await command(room, sockets[seat], { type: 'move', move: game.allMoves()[0] });
    }
    assert.equal(room.room.state.moves.length, players);
    await command(room, sockets[0], { type: 'offer', kind: 'undo' });
    for (let seat = 1; seat < players; ++seat) {
        await command(room, sockets[seat], { type: 'respond', accept: true });
        if (seat < players - 1) assert.equal(room.room.state.moves.length, players, 'partial votes cannot undo');
    }
    assert.equal(room.room.state.moves.length, 0);
    const next = { first: 1, hostColor: 1, mirror: !mirror };
    await command(room, sockets[0], { type: 'offer', kind: 'restart', options: next });
    const resumed = await f.restore();
    assert.equal(resumed.snapshot(0).offer.accepted.length, 1);
    for (let seat = 1; seat < players; ++seat) await command(resumed, sockets[seat], { type: 'respond', accept: true });
    assert.equal(resumed.snapshot(0).you, 1); assert.equal(resumed.snapshot(0).first, 1);
    assert.equal(resumed.snapshot(0).mirror, !mirror); assert.equal(resumed.snapshot(0).offer, null);
    const writes = f.ctx.writes;
    await resumed.webSocketMessage(sockets[0], JSON.stringify({ revision: 0, type: 'move', move: { from: 0, to: 1 } }));
    assert.equal(f.ctx.writes, writes);
    sockets[1].readyState = 3;
    await command(resumed, sockets[0], { type: 'move', move: board(resumed.room.state).allMoves()[0] });
    assert.equal(f.ctx.writes, writes, 'offline players pause all moves');
    await resumed.alarm(); assert.equal(sockets[0].code, 4004);
});
test('Halma settings, input bounds, credentials and cancellation are authoritative', async () => {
    const { room, sockets, ctx } = await fixture();
    await command(room, sockets[1], { type: 'settings', options: { hostColor: 1 } });
    await command(room, sockets[0], { type: 'settings', options: { hostColor: 1 } });
    assert.equal(ctx.writes, 0, 'joined peers require a restart vote');
    await command(room, sockets[0], { type: 'offer', kind: 'restart', options: { first: 9 } });
    assert.equal(ctx.writes, 0);
    await command(room, sockets[0], { type: 'move', move: { from: 2 ** 32 + 61, to: 5 } });
    assert.equal(ctx.writes, 0);
    await command(room, sockets[0], { type: 'offer', kind: 'restart' });
    const previousOffer = room.room.state.offer.id;
    await command(room, sockets[0], { type: 'respond', accept: true });
    assert.equal(room.room.state.offer.accepted.length, 1);
    await command(room, sockets[1], { type: 'respond', accept: false });
    assert.equal(room.room.state.offer, null);
    await command(room, sockets[0], { type: 'offer', kind: 'restart' });
    const votes = room.room.state.offer.accepted.length;
    await command(room, sockets[1], { type: 'respond', accept: true, offerId: previousOffer, revision: 0 });
    assert.equal(room.room.state.offer.accepted.length, votes, 'a previous offer cannot approve the new one');
    sockets[1].serializeAttachment({ seat: 0, key: 'wrong' });
    await command(room, sockets[1], { type: 'offer', kind: 'restart' });
    assert.equal(sockets[1].code, 4003);
});
test('Halma gateway has an isolated room binding and exact origin gate', async () => {
    let calls = 0;
    const env = { HALMA_ROOMS: { idFromName: id => id, get: () => ({ fetch: async () => { ++calls; return new Response('ok'); } }) },
        HALMA_CONNECT_LIMITER: { limit: async () => ({ success: true }) } };
    const request = origin => new Request('https://api.example/api/halma/rooms/' + 'a'.repeat(20), { headers: { Origin: origin, Upgrade: 'websocket' } });
    assert.equal((await routeGomoku(request('https://evil.example'), env, 'halma')).status, 403);
    assert.equal((await routeGomoku(request('https://m-e-l-s.github.io'), env, 'halma')).status, 200);
    assert.equal(calls, 1);
    assert.throws(() => halma.initial({ players: '6' }));
});
test('multiplayer: only host can fill empty seats; AI moves are legal, human votes exclude bots, swaps exchange authority without moving pieces', async () => {
    const { room, sockets, ctx } = await fixture(3, false, 2, 3);
    room.room.seats[2] = null; sockets[2].readyState = 3;
    await command(room, sockets[1], { type: 'ai', color: 2, enabled: true });
    assert.equal(ctx.writes, 0);
    await command(room, sockets[0], { type: 'ai', color: 1, enabled: true });
    assert.equal(ctx.writes, 0, 'human seat cannot be overwritten');
    await command(room, sockets[0], { type: 'ai', color: 2, enabled: true, difficulty: 'simple' });
    assert.deepEqual(room.snapshot(0).ai, [false, true, false]);
    assert.equal(room.snapshot(0).players.every(Boolean), true);
    assert.equal(halma.emptySeat(room.room.state, room.room.seats), -1);
    let move = board(room.room.state).allMoves()[0];
    await command(room, sockets[1], { type: 'move', move, ai: true });
    assert.equal(room.room.state.moves.length, 0, 'guest cannot act for an AI');
    await command(room, sockets[0], { type: 'move', move, ai: true });
    assert.equal(room.room.state.moves.length, 1);
    move = board(room.room.state).allMoves()[0]; await command(room, sockets[0], { type: 'move', move });
    const frame = board(room.room.state).frame(), moves = JSON.stringify(room.room.state.moves);
    await command(room, sockets[1], { type: 'offer', kind: 'swap', target: 3 });
    assert.deepEqual(room.room.state.offer.required, [1, 3]);
    await command(room, sockets[0], { type: 'respond', accept: true });
    assert.equal(room.snapshot(0).you, 1); assert.equal(room.snapshot(1).you, 3);
    assert.equal(board(room.room.state).frame(), frame); assert.equal(JSON.stringify(room.room.state.moves), moves);
    await command(room, sockets[1], { type: 'offer', kind: 'undo' });
    assert.equal(room.room.state.offer.required.length, 2);
    await command(room, sockets[0], { type: 'respond', accept: true });
    assert.equal(room.room.state.offer, null);
    await command(room, sockets[0], { type: 'ai', color: 2, enabled: false });
    assert.equal(room.snapshot(0).joined[1], false);
    assert.equal(halma.emptySeat(room.room.state, room.room.seats), 2);
});
test('existing multiplayer rooms preserve the old board until an agreed restart migrates the layout', async () => {
    const { room, sockets } = await fixture(3);
    delete room.room.state.layoutVersion;
    const old = new HalmaGame(3, false, 3, 1), move = old.allMoves()[0]; old.play(move);
    room.room.state.moves = [{ from: move.from, to: move.to }];
    assert.deepEqual(board(room.room.state).board, old.board);
    await command(room, sockets[0], { type: 'offer', kind: 'restart' });
    for (const socket of sockets.slice(1)) await command(room, socket, { type: 'respond', accept: true });
    assert.equal(room.room.state.layoutVersion, 2);
    assert.deepEqual(board(room.room.state).seats, [3, 1, 5]);
});
