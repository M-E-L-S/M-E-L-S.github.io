import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createService } from '../core.mjs';
import { repository } from '../repository.mjs';
import { board } from '../../shared/halma-room.js';
import { games } from '../registry.mjs';
import { needsBackendBuild } from '../ignore-build.mjs';
const hex = (n, length) => n.toString(16).padStart(length, '0');
test('real PostgreSQL Halma: dynamic seats, concurrent join/move, unanimous votes, stale versions and resume', async t => {
    const db = new PGlite(); t.after(() => db.close());
    await db.exec(await readFile(new URL('../netlify/database/migrations/0001_rooms.sql', import.meta.url), 'utf8'));
    const repo = repository(async (sql, params) => (await db.query(sql, params)).rows);
    const service = createService(repo, () => 1000000);
    let serial = 0;
    for (const players of [2, 3, 4, 6]) for (const mirror of [false, true]) {
        const id = players * 10 + Number(mirror);
        const clients = Array.from({ length: players + 1 }, (_, i) => ({ game: 'halma', room: hex(id, 20), token: hex(i + 1, 64), connection: hex(i + 1, 32) }));
        const call = (seat, action, fields = {}) => service({ ...clients[seat], action, ...fields }, 'ip' + id);
        const command = (seat, state, command, requestId = hex(++serial, 32)) => call(seat, 'command', { revision: state.revision, requestId,
            command: { ...(command.type === 'respond' ? { offerId: state.offer?.id } : {}), ...command } });
        let result = await call(0, 'open', { create: true, options: { players, first: players, hostColor: players, mirror } });
        assert.equal(result.ok, true); assert.equal(result.state.you, players);
        const joins = await Promise.all(Array.from({ length: players }, (_, i) => call(i + 1, 'open')));
        // The shared service deliberately bounds CAS retries; a six-way race
        // may return room_busy, which the owner client retries as an open.
        for (let i = 0; i < joins.length; ++i) if (joins[i].error === 'room_busy') joins[i] = await call(i + 1, 'open');
        assert.equal(joins.filter(r => r.ok).length, players - 1);
        assert.equal(joins.find(r => !r.ok).error, 'room_full');
        const accepted = [0, ...joins.flatMap((r, i) => r.ok ? [i + 1] : [])];
        result = await call(0, 'sync');
        const states = await Promise.all(accepted.map(i => call(i, 'sync')));
        assert.equal(new Set(states.map(r => r.state.you)).size, players);
        const colors = states.map(r => r.state.you);
        const stored = (await repo.get(clients[0].room)).data.state;
        const move = board(stored).allMoves()[0], requestId = hex(++serial, 32);
        const moved = await command(0, result.state, { type: 'move', move }, requestId);
        assert.equal(moved.ok, true);
        assert.equal((await command(0, result.state, { type: 'move', move }, requestId)).replayed, true);
        assert.equal((await command(0, result.state, { type: 'move', move })).error, 'stale_state');
        result = await command(0, moved.state, { type: 'offer', kind: 'undo' });
        assert.equal(result.ok, true);
        for (let i = 1; i < accepted.length; ++i) {
            result = await command(accepted[i], result.state, { type: 'respond', accept: true });
            assert.equal(result.ok, true);
            assert.equal(result.state.moves.length, i < accepted.length - 1 ? 1 : 0);
        }
        result = await command(0, result.state, { type: 'offer', kind: 'restart', options: { first: 1, hostColor: 1, mirror: !mirror } });
        const votes = await Promise.all(accepted.slice(1).map(i => command(i, result.state, { type: 'respond', accept: true })));
        assert.ok(votes.every(value => value.ok), 'concurrent votes on the same offer must commute');
        result = await call(0, 'sync');
        assert.equal(result.state.offer, null); assert.equal(result.state.first, 1); assert.equal(result.state.mirror, !mirror);
        const resumed = await service({ ...clients[0], connection: hex(999, 32), action: 'open' }, 'ip' + id);
        assert.equal(resumed.state.isHost, true); assert.equal(resumed.state.you, 1);
        assert.equal((await call(0, 'sync')).error, 'session_replaced');
        assert.ok(!JSON.stringify(resumed.state).includes('"token"')); assert.equal(colors.includes(players), true);
    }
    assert.deepEqual(Object.keys(games).sort(), ['gomoku', 'halma']);
    for (const path of ['shared/halma-room.js', 'src/scripts/halma-rules.js', 'src/scripts/halma-geometry.js']) assert.equal(needsBackendBuild([path]), true);
    const members = [1, 2, 3].map(i => ({ game: 'halma', room: hex(999, 20), token: hex(i, 64), connection: hex(i, 32) }));
    const call = (seat, action, fields = {}) => service({ ...members[seat], action, ...fields }, 'ai-room');
    const act = (seat, state, cmd) => call(seat, 'command', { revision: state.revision, requestId: hex(++serial, 32),
        command: { ...(cmd.type === 'respond' ? { offerId: state.offer?.id } : {}), ...cmd } });
    let value = await call(0, 'open', { create: true, options: { players: 4, first: 2, ai: [false, true, false, true] } });
    assert.equal(value.ok, true);
    let joined = await call(1, 'open'); assert.equal(joined.state.you, 3, 'join skips AI slots');
    assert.equal((await call(2, 'open')).error, 'room_full');
    value = await call(0, 'sync');
    let storedAI = (await repo.get(members[0].room)).data.state, aiMove = board(storedAI).allMoves()[0];
    assert.equal((await act(1, value.state, { type: 'move', move: aiMove, ai: true })).error, 'illegal_move');
    value = await act(0, value.state, { type: 'move', move: aiMove, ai: true }); assert.equal(value.ok, true);
    joined = await act(1, value.state, { type: 'offer', kind: 'swap', target: 1 });
    assert.equal(joined.ok, true); assert.equal(joined.state.offer.required.length, 2);
    const previousMoves = JSON.stringify(joined.state.moves);
    value = await act(0, joined.state, { type: 'respond', accept: true }); assert.equal(value.state.you, 3);
    assert.equal(JSON.stringify(value.state.moves), previousMoves);
    assert.equal((await act(1, value.state, { type: 'ai', color: 4, enabled: false })).error, 'host_only');
    value = await act(0, value.state, { type: 'ai', color: 4, enabled: false });
    assert.equal((await call(2, 'open')).state.you, 4);
});
