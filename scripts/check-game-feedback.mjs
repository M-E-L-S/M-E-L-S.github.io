import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MovePreview, isTouchClick } from '../src/scripts/gomoku-input.js';
import { onlineFeedback } from '../src/scripts/gomoku-feedback.js';

const preview = new MovePreview();
assert.equal(preview.confirm(112, 'local:0:1', true), false);
assert.equal(preview.index, 112);
assert.equal(preview.confirm(113, 'local:0:1', true), false);
assert.equal(preview.index, 113);
assert.equal(preview.confirm(113, 'local:0:1', true), true);
assert.equal(preview.index, null);
assert.equal(preview.confirm(112, 'local:0:1', false), true);
preview.confirm(112, 'local:0:1', true);
preview.sync('local:0:1', true);
assert.equal(preview.index, 112);
preview.sync('local:1:2', true);
assert.equal(preview.index, null);
preview.confirm(112, 'local:0:1', true);
assert.equal(preview.confirm(112, 'online:new-room:0:1', true), false);
preview.sync('online:new-room:0:1', false);
assert.equal(preview.index, null);
for (const pointerType of ['touch', 'pen']) assert.ok(isTouchClick({ detail: 1, pointerType }));
assert.equal(isTouchClick({ detail: 1, pointerType: 'mouse' }, () => true), false);
assert.equal(isTouchClick({ detail: 0, pointerType: 'touch' }, () => true), false);
assert.equal(isTouchClick({ detail: 1 }, () => true), true);
assert.equal(isTouchClick({ detail: 1 }, () => false), false);
console.log('PASS touch input: preview, relocation, confirmation, position/room invalidation, mouse and keyboard');

const state = (moves = [], extra = {}) => ({ connected: true, room: 'room-a', moves, ...extra });
const opening = state([[7,7]]), reply = state([[7,7],[7,8]]);
assert.equal(onlineFeedback(null, opening), null);
assert.equal(onlineFeedback(state(), opening), 'stone');
assert.equal(onlineFeedback(opening, reply), 'stone');
assert.equal(onlineFeedback(reply, reply), null);
assert.equal(onlineFeedback(reply, opening), 'undo');
assert.equal(onlineFeedback({ ...reply, offer: { kind: 'restart' } }, state()), 'start');
assert.equal(onlineFeedback({ ...reply, offer: { kind: 'restart' } }, reply), null);
assert.equal(onlineFeedback(state(), reply), null); // Hydrated history is not a new move.
assert.equal(onlineFeedback({ ...opening, connected: false }, reply), null);
assert.equal(onlineFeedback(opening, { ...reply, connected: false }), null);
assert.equal(onlineFeedback(opening, { ...reply, room: 'room-b' }), null);
assert.equal(onlineFeedback(opening, state([[1,1],[2,2]])), null);
console.log('PASS online audio: live moves, undo/restart, duplicate updates, reconnect/history and room changes');

const listeners = new Map(), nodes = [], contexts = [];
const parameter = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
class AudioContext {
    state = 'running'; currentTime = 10; destination = {};
    constructor() { contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createOscillator() {
        const oscillator = { frequency: parameter(), stops: [], connect(gain) { return gain; },
            start(time) { this.startTime = time; }, stop(time) { this.stops.push(time); }, disconnect() {} };
        nodes.push(oscillator); return oscillator;
    }
}
const document = { hidden: false, addEventListener(name, listener) {
    const callbacks = listeners.get(name) || []; callbacks.push(listener); listeners.set(name, callbacks);
} };
const window = { AudioContext, addEventListener(name, listener) { listeners.set(name, [listener]); } };
const button = () => ({ attrs: {}, classList: { toggle() {} }, addEventListener(_, handler) { this.click = handler; },
    setAttribute(name, value) { this.attrs[name] = value; } });
vm.runInNewContext(await readFile(new URL('../src/scripts/game-audio.js', import.meta.url), 'utf8'), { window, document });
let visible = true;
const wordleButton = button(), gomokuButton = button();
const wordle = window.MELSGameAudio.create(wordleButton, () => visible);
const gomoku = window.MELSGameAudio.create(gomokuButton, () => visible);
assert.equal(contexts.length, 0);
wordle.play('win'); assert.equal(nodes.length, 0);
wordle.unlock(); assert.equal(contexts.length, 1);
wordle.play('correct', .3); assert.equal(nodes[0].startTime, 10.3);
const reveal = nodes[0];
wordleButton.click();
assert.equal(wordleButton.attrs['aria-pressed'], 'false');
assert.equal(reveal.stops.at(-1), undefined); // Mute cancels already scheduled sounds.
const before = nodes.length;
wordle.play('key'); assert.equal(nodes.length, before);
gomoku.unlock(); gomoku.play('stone');
assert.equal(contexts.length, 1); assert.equal(nodes.length, before + 2);
const stone = nodes.at(-1);
wordleButton.click();
assert.equal(wordleButton.attrs['aria-pressed'], 'true');
assert.notEqual(stone.stops.at(-1), undefined); // Independent game mute never cancels the other game.
wordle.play('win', .8);
visible = false; wordle.stop();
assert.equal(nodes.at(-1).stops.at(-1), undefined);
const hiddenCount = nodes.length;
wordle.play('key'); assert.equal(nodes.length, hiddenCount);
visible = true; document.hidden = true;
for (const listener of listeners.get('visibilitychange')) listener();
assert.equal(stone.stops.at(-1), undefined);
gomoku.play('win'); assert.equal(nodes.length, hiddenCount);
document.hidden = false; contexts[0].state = 'suspended';
gomoku.unlock(); assert.equal(contexts[0].state, 'running');
contexts[0].state = 'closed'; gomoku.unlock(); assert.equal(contexts.length, 2);
window.AudioContext = class { constructor() { throw Error('unavailable'); } };
contexts[1].state = 'closed';
assert.doesNotThrow(() => { wordle.unlock(); wordle.play('key'); wordle.stop(); });
console.log('PASS audio: lazy gesture unlock, envelopes/scheduling, independent mute, cancellation, visibility and unavailable audio');
