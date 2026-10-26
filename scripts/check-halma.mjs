import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { HalmaGame, CELLS, SEATS, BUDGETS, estimatedSteps } from '../src/scripts/halma-model.js';
import { BUDGETS as gomokuBudgets } from '../src/scripts/gomoku-model.js';
const require = createRequire(import.meta.url);
const createHalma = require('../assets/halma/halma.js');
const { Session } = require('../assets/halma/api.js');
const engine = await createHalma({ wasmBinary: await readFile(new URL('../assets/halma/halma.wasm', import.meta.url)) });
const session = new Session(engine), hello = session.dispatch('hello');
const sums = String(await readFile(new URL('../assets/halma/SHA256SUMS.txt', import.meta.url)));
for (const name of ['api.js', 'client.js', 'halma.js', 'halma.wasm', 'worker.js']) {
    const expected = sums.split(/\r?\n/).find(line => line.endsWith('  ' + name))?.slice(0, 64);
    const bytes = await readFile(new URL('../assets/halma/' + (name === 'client.mjs' ? 'client.js' : name), import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, 'upstream runtime integrity: ' + name);
}
assert.deepEqual(CELLS, hello.cells);
assert.deepEqual(new HalmaGame().board.join(''), hello.initial);
assert.deepEqual(Object.values(BUDGETS), Object.values(gomokuBudgets).map(({ label, soft_ms, hard_ms }) => ({ label, soft_ms, hard_ms })));
const pairs = moves => moves.map(m => `${m.from}:${m.to}`).sort();
let seed = 9137;
const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
let compared = 0;
for (const mirror of [false, true]) for (const first of [1, 2]) {
    const game = new HalmaGame(2, mirror, first);
    for (let ply = 0; ply < 180 && game.outcome === null; ++ply) {
        const inspection = session.dispatch('inspect', game.position()), moves = game.allMoves();
        assert.deepEqual(pairs(moves), pairs(inspection.moves), `legal moves: mirror=${mirror}, ply=${ply}`);
        assert.equal(inspection.winner, 0); assert.equal(inspection.draw, false);
        assert.ok(game.play(moves[random(moves.length)])); ++compared;
    }
    const inspection = session.dispatch('inspect', game.position());
    assert.equal(inspection.winner, game.outcome > 0 ? game.outcome === 1 ? 1 : -1 : 0);
    const result = session.dispatch('search', { ...game.position(), nodes: 2000, soft_ms: 0, hard_ms: 0, endgame: false });
    if (result.move) assert.ok(game.legalMoves(result.move.from).some(m => m.to === result.move.to));
}
for (const players of [2, 3, 4, 6]) for (const mirror of [false, true]) for (let first = 1; first <= players; ++first) {
    const game = new HalmaGame(players, mirror, first), initial = game.frame();
    assert.equal(game.turn, first);
    assert.deepEqual(game.seats, SEATS[players]);
    for (let p = 1; p <= players; ++p) {
        assert.equal(game.board.filter(n => n === p).length, 10);
        assert.equal(game.won(p), false);
        assert.equal(game.board.filter((n, i) => n === p && CELLS[i][2] === game.seats[p - 1]).length, 10);
    }
    const info = session.dispatch('hello', { players });
    assert.equal(game.board.join(''), info.initial);
    assert.deepEqual(game.seats, info.seats.map(seat => seat.start));
    assert.equal(game.position().turn, info.seats[first - 1].side);
    for (let i = 0; i < players * 8; ++i) {
        const moves = game.allMoves(); assert.ok(moves.length);
        assert.deepEqual(pairs(moves), pairs(session.dispatch('inspect', game.position()).moves)); ++compared;
        assert.ok(game.play(moves[random(moves.length)]));
        assert.equal(game.turn, (first + i) % players + 1);
        for (let p = 1; p <= players; ++p) assert.equal(game.board.filter(n => n === p).length, 10);
    }
    while (game.moves.length) assert.ok(game.undo());
    assert.equal(game.frame(), initial); assert.equal(game.history.length, 1); assert.equal(game.outcome, null);
    assert.equal(game.play({ from: -1, to: 0 }), false);
    if (first === 1) {
        const result = session.dispatch('search', { ...game.position(), nodes: 500, soft_ms: 0, hard_ms: 0, endgame: false });
        assert.equal(result.mode, players === 2 ? 'alphabeta' : 'paranoid');
        assert.ok(game.legalMoves(result.move.from).some(m => m.to === result.move.to));
    }
}
const cell = (q, r) => CELLS.findIndex(c => c[0] === q && c[1] === r);
const jump = new HalmaGame(); jump.board.fill(0); jump.board[cell(0, 0)] = 1; jump.board[cell(2, 0)] = 2;
assert.equal(jump.legalMoves(cell(0, 0)).some(m => m.to === cell(4, 0)), false);
jump.mirror = true;
assert.ok(jump.legalMoves(cell(0, 0)).some(m => m.to === cell(4, 0)), 'mirror equidistant long jump');
jump.board[cell(3, 0)] = 2;
assert.equal(jump.legalMoves(cell(0, 0)).some(m => m.to === cell(4, 0)), false, 'mirror landing corridor cannot cross a second piece');
jump.board.fill(0); jump.mirror = false;
jump.board[cell(0, 0)] = 1; jump.board[cell(1, 0)] = 2; jump.board[cell(3, 0)] = 2;
assert.deepEqual(jump.legalMoves(cell(0, 0)).find(m => m.to === cell(4, 0)).path, [cell(0, 0), cell(2, 0), cell(4, 0)], 'full multi-jump path');
// Anti-blocking victory, including an opponent left in the target camp.
for (const mirror of [false, true]) {
    const game = new HalmaGame(2, mirror), redCamp = CELLS.flatMap((c, i) => c[2] === 0 ? [i] : []), blueCamp = CELLS.flatMap((c, i) => c[2] === 3 ? [i] : []);
    game.board.fill(0); blueCamp.forEach(i => { game.board[i] = 1; }); redCamp.slice(0, 9).forEach(i => { game.board[i] = 2; });
    const spare = CELLS.findIndex(c => c[2] === -1); game.board[spare] = 2;
    game.turn = 2; game.history = [game.frame()];
    assert.equal(game.won(1), true); assert.equal(session.dispatch('inspect', game.position()).winner, 1);
    game.board[blueCamp[0]] = 2; game.board[spare] = 1; game.history = [game.frame()];
    assert.equal(game.won(1), true); assert.equal(session.dispatch('inspect', game.position()).winner, 1);
    game.board[blueCamp[1]] = 0;
    assert.equal(game.won(1), false);
}
// A reversible four-ply cycle must draw on the third full position occurrence.
const repetition = new HalmaGame();
const first = repetition.allMoves().find(m => m.path.length === 2); assert.ok(repetition.play(first));
const second = repetition.allMoves().find(m => m.path.length === 2); assert.ok(repetition.play(second));
assert.ok(repetition.play({ from: first.to, to: first.from }));
assert.ok(repetition.play({ from: second.to, to: second.from }));
assert.equal(repetition.outcome, null);
for (const move of [first, second, { from: first.to, to: first.from }, { from: second.to, to: second.from }]) assert.ok(repetition.play(move));
assert.equal(repetition.outcome, 0); assert.equal(session.dispatch('inspect', repetition.position()).draw, true);
assert.ok(repetition.undo()); assert.equal(repetition.outcome, null);
for (const ai of [[false, false, false], [false, true, false], [false, false, true], [false, true, true]]) {
    const game = new HalmaGame();
    for (let i = 0; i < 4; ++i) assert.ok(game.play(game.allMoves()[0]));
    assert.ok(game.undo(ai));
    assert.equal(game.moves.length, ai[1] !== ai[2] ? ai[1] ? 3 : 2 : 3);
    assert.equal(game.history.length, game.moves.length + 1);
}
assert.equal(estimatedSteps({ estimated_steps: { red: null, blue: null } }), null);
assert.deepEqual(estimatedSteps({ estimated_steps: { red: 12, blue: null }, estimated_lower_mask: 1 }), ['≥12', '—']);
assert.deepEqual(estimatedSteps({ estimated_steps: { red: 0, blue: 5 }, estimated_lower_mask: 2 }), ['0', '≥5']);
assert.deepEqual(estimatedSteps({ estimated_player_steps: [null, null, 12] }, 3), ['—', '—', '12']);
const fixtures = JSON.parse(await readFile(new URL('fixtures/halma-native.json', import.meta.url)));
const fixtureEngine = await createHalma({ wasmBinary: await readFile(new URL('../assets/halma/halma.wasm', import.meta.url)) });
const fixtureSession = new Session(fixtureEngine);
const clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key]) => !['elapsed_ms', 'elapsed_us', 'planner_us', 'leaf_us', 'max_threads'].includes(key)).map(([key, val]) => [key, clean(val)])) : value;
for (const test of fixtures.cases) {
    if (test.reset) fixtureSession.request('clear');
    assert.deepEqual(clean(fixtureSession.request(test.command)), clean(test.expected), test.id);
}
console.log('PASS shipped multiplayer WASM:', fixtures.cases.length, 'native fixtures');
// Real SDK: cancellation rejects outstanding work and ignores old generations.
class MockWorker {
    static instances = [];
    constructor(url) { this.url = url; this.messages = []; MockWorker.instances.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data }); }
}
globalThis.Worker = MockWorker;
const { HalmaClient } = await import('../assets/halma/client.js');
const client = new HalmaClient('/worker.js?v=hash'), worker = client.worker;
worker.reply({ type: 'ready', info: hello }); await client.ready;
const pending = client.search({ ...new HalmaGame().position(), difficulty: 'fast' });
const rejected = assert.rejects(pending, { name: 'AbortError' }); await Promise.resolve();
client.close(); await rejected; assert.ok(worker.terminated);
const secondClient = new HalmaClient('/worker.js?v=hash');
secondClient.worker.reply({ type: 'ready', info: hello }); await secondClient.ready;
const next = secondClient.search(new HalmaGame().position()); await Promise.resolve();
worker.reply({ id: 1, result: { move: null } });
secondClient.worker.reply({ id: 1, result: { move: { from: 1, to: 2 } } });
assert.deepEqual((await next).move, { from: 1, to: 2 }); secondClient.close(); delete globalThis.Worker;
assert.throws(() => new HalmaGame(2, false, 3));
console.log(`PASS Halma: ${compared} real WASM position comparisons, all 30 player/rule/starting-color combinations, AI legality, wins, repetition, undo, budgets, estimates and cancellation`);
