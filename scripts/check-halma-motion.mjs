import assert from 'node:assert/strict';
import { MovePlayback } from '../src/scripts/halma-motion.js';
const points = [[0, 0], [1, 1], [2, 2], [3, 3]], move = { path: [0, 1, 2, 3] };
function fixture(reduced = false) {
    const animations = [], sounds = [], timers = new Map(); let serial = 0;
    const piece = { hidden: true, style: { setProperty() {} }, animate() {
        let resolve, reject;
        const animation = { finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
            finish: () => resolve(), cancel: () => reject(new DOMException('Cancelled', 'AbortError')) };
        animations.push(animation); return animation;
    } };
    const playback = new MovePlayback(piece, points, { play: name => sounds.push(name), stop() {} }, {
        reduced: () => reduced,
        timers: { setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: id => timers.delete(id) }
    });
    return { playback, animations, sounds, timers };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
for (const reduced of [false, true]) {
    const f = fixture(reduced), done = f.playback.play(move, '#f00');
    assert.equal(f.sounds.length, 0);
    for (let i = 0; i < 3; ++i) {
        if (reduced) { const [id, fn] = f.timers.entries().next().value; f.timers.delete(id); fn(); }
        else f.animations[i].finish();
        await tick(); assert.equal(f.sounds.length, i + 1);
    }
    assert.equal(await done, true); assert.equal(f.playback.busy, false);
    assert.equal(f.animations.length, reduced ? 0 : 3);
    const cancelled = f.playback.play(move, '#f00'); f.playback.cancel();
    assert.equal(await cancelled, false); assert.equal(f.sounds.length, 3);
    assert.equal(f.timers.size, 0);
    const replaced = f.playback.play(move, '#f00');
    const replacement = f.playback.play(move, '#00f');
    assert.equal(await replaced, false);
    f.playback.cancel(); assert.equal(await replacement, false);
    assert.equal(f.timers.size, 0, 'an old completion must not clear the replacement timer handle');
}
console.log('PASS per-hop sound: each landing emits exactly one sound, animated/reduced-motion timing, cancellation and cleanup');
