import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { GomokuGame, BUDGETS, mateProof } from '../src/scripts/gomoku-model.js';
import { EngineWorker } from '../src/scripts/gomoku-client.js';

const read = name => readFile(new URL('../' + name, import.meta.url));
const playAll = (game, moves) => moves.forEach(move => assert.ok(game.play(move)));
assert.deepEqual(Object.values(BUDGETS).map(b => [b.label, b.soft_ms, b.hard_ms]), [['简单',300,1000],['普通',300,1000],['高级',1000,3000]]);
assert.equal(BUDGETS.beginner.beginner, true);
assert.ok(!BUDGETS.fast.beginner && !BUDGETS.light.beginner);
for (const ai of [[false,false,false], [false,true,false], [false,false,true], [false,true,true]]) {
    const game = new GomokuGame();
    playAll(game, [[7,7],[6,7],[8,8],[9,9]]);
    assert.ok(game.undoLocal(ai));
    assert.equal(game.moves.length, ai[1] !== ai[2] ? ai[1] ? 3 : 2 : 3);
}
assert.equal(mateProof({mate_proven:false,mate_plies:3,score:999997},1),null);
assert.equal(mateProof({mate_proven:true,mate_plies:null,score:999997},1),null);
assert.equal(mateProof({mate_proven:true,mate_plies:3,score:10},1),null);
assert.deepEqual(mateProof({mate_proven:true,mate_plies:15,score:999985},1),{winner:1,plies:15});
assert.deepEqual(mateProof({mate_proven:true,mate_plies:2,score:-999998},1),{winner:2,plies:2});
for (const human of [1, 2]) {
    const game = new GomokuGame(human);
    assert.equal(game.undo(), false);
    if (human === 2) { game.play([7, 7]); assert.equal(game.undo(), false); }
    const opening = game.moves.slice();
    game.play([0, 0]);
    assert.ok(game.undo()); // Search is still running: remove just the player's move.
    assert.deepEqual(game.moves, opening);
    game.play([0, 0]); game.play([1, 0]);
    assert.ok(game.undo()); // AI has replied: remove the full round.
    assert.deepEqual(game.moves, opening);
    assert.equal(game.turn, human);
}
for (const [dx, dy, x, y] of [[1,0,0,0],[0,1,14,0],[1,1,0,0],[1,-1,0,14]]) {
    const game = new GomokuGame();
    for (let i = 0; i < 5; ++i) {
        assert.ok(game.play([x + i * dx, y + i * dy]));
        if (i < 4) game.play([10 + i % 2, 6 + Math.floor(i / 2)]);
    }
    assert.equal(game.outcome, 1);
    assert.equal(game.winningLine.length, 5);
    assert.equal(game.play([12,12]), false);
    assert.ok(game.undo());
    assert.equal(game.outcome, null);
    assert.equal(game.turn, 1);
    assert.ok(game.play([x + 4 * dx, y + 4 * dy]));
}
const overline = new GomokuGame();
playAll(overline, [[0,0],[10,10],[1,0],[11,10],[2,0],[10,11],[4,0],[11,11],[5,0],[12,12],[3,0]]);
assert.equal(overline.outcome, 1);
assert.equal(overline.winningLine.length, 6);
const whiteWin = new GomokuGame();
playAll(whiteWin, [[8,8],[0,0],[10,8],[1,0],[12,8],[2,0],[9,10],[3,0],[11,10],[4,0]]);
assert.equal(whiteWin.outcome, 2);
assert.ok(whiteWin.undo());
assert.equal(whiteWin.moves.length, 8);
const illegal = new GomokuGame();
for (const move of [[-1,0],[15,0],[0,15],[0,0.5],[NaN,0],[2**32+7,7],null,[0]]) assert.equal(illegal.play(move), false);
assert.ok(illegal.play([0,0])); assert.equal(illegal.play([0,0]), false);
// This balanced full-board pattern has no five on any axis, including diagonals.
const draw = new GomokuGame();
const colors = [[], []];
for (let y = 0; y < 15; ++y) for (let x = 0; x < 15; ++x) colors[(x + 2 * y) % 4 < 2 ? 0 : 1].push([x,y]);
while (draw.moves.length < 225) assert.ok(draw.play(colors[draw.turn - 1].pop()));
assert.equal(draw.outcome, 0);
assert.ok(draw.undo()); assert.equal(draw.outcome, null);
console.log('PASS rules: four axes, edges, overline, both winners, draw, input bounds and round undo');

// Force queued replies after cancellation; they must never settle a newer job.
class MockWorker {
    static instances = [];
    constructor(url) { this.url = url; MockWorker.instances.push(this); }
    postMessage(data) { this.data = data; }
    terminate() { this.terminated = true; }
    reply(result) { this.onmessage({ data: { id: this.data.id, result } }); }
}
globalThis.Worker = MockWorker;
const client = new EngineWorker();
const limits = { soft_ms: 300, hard_ms: 1000 };
const first = client.search([], limits);
const firstRejected = assert.rejects(first, { name: 'AbortError' });
const oldWorker = client.worker;
client.stop();
await firstRejected;
assert.ok(oldWorker.terminated);
const second = client.search([[7,7]], limits);
oldWorker.reply({ move: [0,0] });
client.worker.reply({ move: [6,6] });
assert.deepEqual(await second, { move: [6,6] });
const failed = client.search([], limits);
const failure = assert.rejects(failed, /load failed/);
client.worker.onerror({ message: 'load failed' });
await failure;
assert.equal(client.worker, null);
const recovered = client.search([], limits);
client.worker.reply({ move: [7,7] });
assert.deepEqual(await recovered, { move: [7,7] });
client.stop();
delete globalThis.Worker;
console.log('PASS worker lifecycle: cancellation, stale reply, load failure and recovery');

// Run the shipped classic worker, including its input boundary, using real Wasm.
const wasmBytes = await read('assets/gomoku/gomoku_wasm.wasm');
const glue = String(await read('assets/gomoku/gomoku_wasm.js'));
const sandbox = vm.createContext({ console, URL, setTimeout, clearTimeout, performance, crypto });
sandbox.self = { location: { href: 'http://localhost/assets/gomoku/worker.js?v=test' } };
sandbox.importScripts = name => {
    assert.equal(name, 'gomoku_wasm.js?v=test');
    vm.runInContext(glue, sandbox);
    const factory = sandbox.createGomoku;
    sandbox.createGomoku = options => factory({ ...options, instantiateWasm(imports, receive) {
        assert.equal(options.locateFile('gomoku_wasm.wasm', '/assets/gomoku/'), '/assets/gomoku/gomoku_wasm.wasm?v=test');
        const instance = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), imports);
        receive(instance); return instance.exports;
    } });
};
vm.runInContext(String(await read('assets/gomoku/worker.js')), sandbox);
let serial = 0;
async function request(moves, limits) {
    let response;
    sandbox.self.postMessage = data => { response = JSON.parse(JSON.stringify(data)); };
    const id = ++serial;
    await sandbox.self.onmessage({ data: { id, moves, limits } });
    assert.equal(response.id, id);
    return response;
}
const fixtures = JSON.parse(await read('scripts/fixtures/gomoku-native.json'));
const clean = result => Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'elapsed_ms'));
for (const test of fixtures.cases) {
    const response = await request(test.moves, test.limits);
    assert.equal(response.error, undefined, test.id);
    assert.equal(response.result.evaluator, 'classical-v2', test.id);
    assert.deepEqual(clean(response.result), clean(test.expected), test.id);
    if (response.result.mate_proven) assert.equal(mateProof(response.result, test.moves.length % 2 + 1).plies, response.result.mate_plies, test.id);
}
for (const moves of [[[2**32+7,7]], [[7.5,7]], [[15,7]], [[7,7],[7,7]], 'invalid']) {
    assert.match((await request(moves, limits)).error, /illegal move|moves must/);
}
assert.match((await request([], { hard_ms: 0 })).error, /invalid limits/);
const timed = await request([[7,7],[6,7],[8,8],[9,9]], { depth:64, soft_ms:1, hard_ms:20 });
assert.ok(timed.result.move);
assert.ok(timed.result.elapsed_ms < 2000);
console.log(`PASS real Wasm: ${fixtures.cases.length} native fixtures identical, classical-v2, input validation and bounded search`);

const beginnerFixtures = JSON.parse(await read('scripts/fixtures/gomoku-beginner.json'));
const beginnerMoves = new Set();
let firstBeginner;
// uniform_int_distribution differs between MinGW's libstdc++ and Emscripten's
// libc++. Compare their exact rankings/work, then validate each platform's draw.
const rankingFields = result => Object.fromEntries(Object.entries(clean(result)).filter(([key]) =>
    !['move','score','pv','selected_rank','mate_proven','mate_plies'].includes(key)));
for (const test of beginnerFixtures.cases) {
    const response = await request(test.moves, test.limits);
    assert.equal(response.error, undefined, test.id);
    assert.equal(response.result.beginner_seed, test.limits.beginner_seed, test.id);
    assert.equal(response.result.vcf_calls, 0, test.id);
    assert.deepEqual(rankingFields(response.result), rankingFields(test.expected), test.id);
    if (response.result.beginner_choices.length) {
        const choice = response.result.beginner_choices[response.result.selected_rank - 1];
        assert.deepEqual(response.result.move,choice.move,test.id);
        assert.equal(response.result.score,choice.score,test.id);
    }
    const pv = new GomokuGame();
    playAll(pv,test.moves); playAll(pv,response.result.pv);
    if (!firstBeginner) firstBeginner = response.result;
    if (test.id.startsWith('ranking-')) beginnerMoves.add(JSON.stringify(response.result.move));
    else assert.deepEqual(response.result.move, [5,7], test.id);
}
assert.ok(beginnerMoves.size > 1, 'beginner samples more than one good candidate');
assert.deepEqual(clean((await request(beginnerFixtures.cases[0].moves,beginnerFixtures.cases[0].limits)).result),clean(firstBeginner),'same seed is reproducible within Wasm');
const simpleLimits = {depth:2,soft_ms:0,hard_ms:1000,beginner:true};
const fresh = await request([[7,7],[8,7],[7,8],[6,6]],simpleLimits);
const freshAgain = await request([[7,7],[8,7],[7,8],[6,6]],simpleLimits);
assert.ok(Number.isInteger(fresh.result.beginner_seed));
assert.notEqual(fresh.result.beginner_seed,freshAgain.result.beginner_seed);
const normalAgain = await request([[7,7],[8,7],[7,8],[6,6]],{depth:2,soft_ms:0,hard_ms:1000});
assert.equal(normalAgain.result.beginner_seed,undefined,'normal mode does not inherit beginner options');
for (const invalid of [{beginner:'yes'},{beginner:true,beginner_seed:-1},{beginner:true,beginner_seed:2**32},{beginner_seed:1}]) {
    assert.match((await request([],{...limits,...invalid})).error,/invalid limits/);
}
console.log(`PASS beginner Wasm: ${beginnerFixtures.cases.length} native rankings/work identical, valid seeded draws, legal PVs, win/defense, fresh seeds and normal-mode isolation`);

// Optional check against the actual static server, including Windows Python MIME
// mappings. A correct file on disk can still fail strict browser module loading.
const server = process.argv[2];
if (server) {
    for (const name of ['src/scripts/gomoku.js', 'src/scripts/gomoku-model.js', 'src/scripts/gomoku-client.js', 'src/scripts/gomoku-online.js', 'assets/gomoku/worker.js', 'assets/gomoku/gomoku_wasm.js']) {
        const response = await fetch(new URL(name, server), { signal: AbortSignal.timeout(5000) });
        assert.ok(response.ok, `${name}: HTTP ${response.status}`);
        assert.match(response.headers.get('content-type') || '', /^(text|application)\/(javascript|ecmascript)\b/i, `${name}: browser requires a JavaScript MIME type`);
        await response.arrayBuffer();
    }
    console.log(`PASS HTTP JavaScript module MIME types: ${server}`);
}
