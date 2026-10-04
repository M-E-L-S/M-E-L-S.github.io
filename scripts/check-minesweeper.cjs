const assert = require('node:assert/strict');
const Minesweeper = require('../src/scripts/minesweeper.js');
const { OPEN, FLAG } = Minesweeper.CELL;

function board(order, mines) {
    const game = new Minesweeper({ cols: 5, rows: 5, mines: mines.length }, { order });
    for (const [r, c, type] of mines) {
        game.mine[game.idx(r, c)] = 1;
        game.mineType[game.idx(r, c)] = type;
    }
    game.computeClues();
    game.armed = true;
    return game;
}

function mark(game, r, c, type) {
    for (let k = 0; k <= type; k++) game.toggleFlag(r, c);
}

// Exact clues, including cancellation zeros and simplified radicals.
for (const [order, types, expected] of [
    [1, [0, 0], '2'], [2, [0, 1], '0'], [3, [0, 1, 2], '0'],
    [3, [0, 0, 1], '√3'], [4, [0, 1], '√2'], [4, [0, 0, 1, 1], '2√2'],
    [6, [0, 1], '√3'], [6, [0, 3], '0']
]) {
    const positions = [[1, 1], [1, 2], [1, 3], [2, 1]];
    const game = board(order, types.map((type, i) => [...positions[i], type]));
    assert.equal(game.clueText(2, 2), expected);
    const q = game.adjSquared[game.idx(2, 2)];
    for (let rotation = 0; rotation < order; rotation++) {
        assert.equal(game.sumSquared(types.map(t => (t + rotation) % order)), q);
    }
}

const cancelled = board(2, [[1, 1, 0], [1, 2, 1]]);
assert.equal(cancelled.clueText(2, 2), '0');
assert.equal(cancelled.clueText(4, 4), '');
assert.equal(cancelled.reveal(2, 2).changed.length, 1, 'cancellation must not flood');
assert.equal(cancelled.chord(2, 2).status, 'ignore', 'zero clue with no flags must not chord');
mark(cancelled, 1, 1, 1);
mark(cancelled, 1, 2, 0);
assert.notEqual(cancelled.chord(2, 2).status, 'ignore', 'rotated flags may chord a zero');
for (const [r, c] of cancelled.neighbors(2, 2)) if (!cancelled.isMine(r, c)) assert.equal(cancelled.state[cancelled.idx(r, c)], OPEN);

for (const order of Minesweeper.ORDERS) {
    for (let rotation = 0; rotation < order; rotation++) {
        const game = board(order, [[1, 1, 0], [1, 2, order - 1]]);
        game.reveal(2, 2);
        mark(game, 1, 1, rotation);
        mark(game, 1, 2, (order - 1 + rotation) % order);
        assert.notEqual(game.chord(2, 2).status, 'ignore');
        assert.equal(game.over && !game.won, false, 'rotating flags cannot cause loss');
    }
}

const wrong = board(2, [[1, 1, 0], [1, 2, 1]]);
wrong.reveal(2, 2);
mark(wrong, 2, 1, 0);
mark(wrong, 2, 3, 1);
const beforeWrong = Array.from(wrong.state);
const beforeOpened = wrong.opened;
assert.deepEqual(wrong.chord(2, 2), { status: 'ignore', changed: [] }, 'wrong positions reject expansion');
assert.deepEqual(Array.from(wrong.state), beforeWrong, 'rejection must not partially reveal safe cells');
assert.equal(wrong.opened, beforeOpened);
assert.equal(wrong.over, false);
assert.equal(wrong.boomCell, null);
assert.equal(wrong.reveal(1, 1).status, 'boom', 'directly clicking a mine still loses');

// A cancelling pair may be missed even when the marked sum matches the clue.
const missing = board(2, [[1, 1, 0], [1, 2, 1], [1, 3, 0]]);
missing.reveal(2, 2);
mark(missing, 1, 3, 0);
const beforeMissing = Array.from(missing.state);
assert.equal(missing.chord(2, 2).status, 'ignore');
assert.deepEqual(Array.from(missing.state), beforeMissing);
assert.equal(missing.over, false);

const mismatch = board(4, [[1, 1, 0], [1, 2, 1]]);
mismatch.reveal(2, 2);
mark(mismatch, 1, 1, 0);
mark(mismatch, 1, 2, 0);
assert.equal(mismatch.chord(2, 2).status, 'ignore', 'wrong modulus must reject correct positions');
assert.equal(mismatch.over, false);

const labels = {
    1: ['1'], 2: ['1', '−1'], 3: ['1', 'ω', 'ω²'],
    4: ['1', 'i', '−1', '−i'], 6: ['1', '−ω²', 'ω', '−1', 'ω²', '−ω']
};
for (const order of Minesweeper.ORDERS) {
    const game = board(order, [[1, 1, 0]]);
    for (let cycle = 0; cycle < 2; cycle++) {
        for (let type = 0; type < order; type++) {
            assert.equal(game.toggleFlag(1, 1).status, 'flag');
            assert.equal(game.flagType[game.idx(1, 1)], type);
            assert.equal(game.flags, 1, 'cycling type must not increase flag count');
            assert.equal(game.typeLabel(type), labels[order][type]);
        }
        assert.equal(game.toggleFlag(1, 1).status, 'unflag');
        assert.equal(game.flags, 0);
        assert.equal(game.isHidden(1, 1), true);
    }
}

const flags = board(4, [[1, 1, 0]]);
mark(flags, 1, 1, 2);
assert.equal(flags.flags, 1);
assert.equal(flags.flagType[flags.idx(1, 1)], 2);
flags.toggleFlag(1, 1);
assert.equal(flags.flagType[flags.idx(1, 1)], 3);
flags.toggleFlag(1, 1);
assert.equal(flags.flags, 0);
mark(flags, 1, 1, 3);
for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!flags.isMine(r, c)) flags.reveal(r, c);
assert.equal(flags.won, true, 'winning does not require correct flag types');
assert.equal(flags.state[flags.idx(1, 1)], FLAG);

// Exercise all 15 combinations, first-click safety, clue calculation, hint and completion.
let seed = 12345;
const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
for (const level of Object.keys(Minesweeper.LEVELS)) for (const order of Minesweeper.ORDERS) {
    const game = new Minesweeper(level, { order, rng });
    assert.notEqual(game.reveal(4, 4).status, 'boom');
    for (const [r, c] of [[4, 4], ...game.neighbors(4, 4)]) assert.equal(game.isMine(r, c), false);
    assert.equal(game.mine.reduce((a, b) => a + b, 0), game.mineTotal);
    assert.equal(game.adjCount[game.idx(4, 4)], 0);
    for (let i = 0; i < game.total; i++) {
        assert.ok(game.mineType[i] < order);
        if (game.mine[i]) continue;
        const [r, c] = game.rc(i);
        const types = game.neighbors(r, c).filter(([nr, nc]) => game.isMine(nr, nc)).map(([nr, nc]) => game.mineType[game.idx(nr, nc)]);
        assert.equal(game.adjCount[i], types.length);
        assert.equal(game.adj[i], Math.sqrt(game.sumSquared(types)));
        if (order === 1) assert.equal(game.adj[i], types.length);
    }
    assert.notEqual(game.hint().status, 'boom');
    for (let i = 0; i < game.total; i++) if (!game.mine[i]) game.reveal(...game.rc(i));
    assert.equal(game.won, true);
    assert.equal(game.opened, game.safeTotal);
    assert.equal(game.flags, game.mineTotal);
    game.reset();
    assert.equal(game.order, order);
    assert.equal(game.adjCount.some(Boolean), false);
    assert.equal(game.flagType.some(Boolean), false);
}
console.log('OK Minesweeper: 15 modes, exact clues, cancellation, rotation, flags, chords, safety, hints and wins');
