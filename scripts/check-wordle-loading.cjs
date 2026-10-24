const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
    children = []; dataset = {}; style = { setProperty() {} };
    classList = { add() {}, remove() {}, toggle() {} };
    addEventListener() {} setAttribute() {}
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren() { this.children = []; }
    querySelector() { return null; }
    set innerHTML(value) { this.children = []; }
}
const source = fs.readFileSync('src/scripts/wordle.js', 'utf8');
async function scenario(initiallyVisible) {
    const elements = new Map();
    const getElementById = id => {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
    };
    const requests = [];
    let init;
    const context = {
        document: { readyState: 'loading', getElementById, createElement: () => new Element(),
            querySelectorAll: () => [], addEventListener(type, fn) { if (type === 'DOMContentLoaded') init = fn; } },
        window: { addEventListener() {}, MELSGameAudio: { create: () => ({ stop() {} }) } },
        localStorage: { getItem() { return null; } },
        fetch: path => {
            requests.push(path);
            return Promise.resolve({ ok: true, text: async () => fs.readFileSync(path, 'utf8') });
        }
    };
    vm.runInNewContext(source, context);
    context.__WORDLE.setVisible(initiallyVisible);
    assert.equal(requests.length, 0, 'no fetch before DOM initialization');
    init();
    if (!initiallyVisible) {
        assert.equal(requests.length, 0, 'other pages and games fetch no Wordle dictionaries');
        context.__WORDLE.setVisible(false);
        assert.equal(requests.length, 0);
        context.__WORDLE.setVisible(true);
    }
    assert.equal(requests.length, 9, 'opening Wordle starts its dictionary requests');
    context.__WORDLE.setVisible(false);
    context.__WORDLE.setVisible(true);
    assert.equal(requests.length, 9, 'switching pages during loading does not duplicate requests');
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(!getElementById('wordle-message').textContent.includes('失败'), 'real dictionaries load successfully');
    context.__WORDLE.setVisible(false);
    context.__WORDLE.setVisible(true);
    assert.equal(requests.length, 9, 'loaded dictionaries are reused on return');
}
(async () => {
    await scenario(false);
    await scenario(true);
    console.log('PASS Wordle dictionaries: hidden pages, first entry, direct entry, pending deduplication and reuse');
})().catch(error => { console.error(error); process.exitCode = 1; });
