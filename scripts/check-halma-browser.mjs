import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../mels-api/package.json', import.meta.url));
const WebSocket = require('ws');
const [endpoint, origin, folder] = process.argv.slice(2), socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = event => reject(event.error || new Error(event.message || 'CDP connection failed')); });
let sequence = 0;
let blockedEngine = false;
const pending = new Map(), errors = [], requests = [], checks = [];
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.id) { const p = pending.get(data.id); if (!p) return; pending.delete(data.id); data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result); }
    else if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    else if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url);
    else if (data.method === 'Fetch.requestPaused') {
        const { requestId, request } = data.params;
        const allowed = (request.url.startsWith(origin + '/') || request.url.startsWith('data:')) && !(blockedEngine && request.url.includes('/assets/halma/'));
        void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest',
            { requestId, ...(!allowed ? { errorReason: 'BlockedByClient' } : {}) }, data.sessionId)
            .catch(error => { if (!error.message.includes('Session with given id not found')) errors.push(error.message); });
    }
};
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId); await send('Network.enable', {}, sessionId);
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.halmaSearches=[];window.halmaWorkers=[];window.halmaTerminated=0;
    const RealWorker=Worker;window.Worker=class extends RealWorker {
        constructor(...args){super(...args);window.halmaWorkers.push(String(args[0]));}
        postMessage(data,...args){if(data.method==='search')window.halmaSearches.push(structuredClone(data.params));super.postMessage(data,...args);}
        terminate(){window.halmaTerminated++;super.terminate();}
    };` }, sessionId);
async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
    return r.result.value;
}
async function until(expression, timeout = 12000) {
    const end = Date.now() + timeout;
    while (!await evaluate(expression)) {
        if (Date.now() > end) throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.querySelector("#halma-status")?.textContent'));
        await new Promise(resolve => setTimeout(resolve, 60));
    }
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const count = () => evaluate('parseInt(document.querySelector("#halma-moves").textContent)');
const setFirst = first => evaluate(`document.querySelector('#halma-first').value=${JSON.stringify(String(first))};document.querySelector('#halma-first').dispatchEvent(new Event('change'))`);
async function manualMove() {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.halma-cell')];for(const cell of b){if(cell.getAttribute('aria-disabled')!=='false')continue;cell.click();const dest=document.querySelector('.halma-cell.destination');if(dest){dest.click();return;} }throw Error('No selectable move');})()`);
    await until('document.querySelector("#halma-board").getAttribute("aria-busy")==="false"');
}
await send('Page.navigate', { url: origin + '/scripts/fixtures/picker-cache/' }, sessionId);
await until('document.styleSheets.length===1 && !!document.styleSheets[0].cssRules.length');
assert.ok(requests.some(url => url === origin + '/src/styles/components.css'));
await send('Page.navigate', { url: origin + '/minigame/gomoku/' }, sessionId);
await until('!!window.__GOMOKU && document.querySelectorAll(".gomoku-cell").length===225');
assert.ok(requests.some(url => url.startsWith(origin + '/src/styles/components.css?v=')), 'returning browsers must fetch component styles under the content hash');
// Check actual CSS animations across both shared pickers, including future items.
const pickerMotion = await evaluate(`(async () => {
    const frame = () => new Promise(requestAnimationFrame), results = [];
    for (const [page, id] of [['game', 'game-picker'], ['tools', 'utility-picker']]) {
        document.querySelector('.nav-link[data-page="' + page + '"]').click();
        const picker = document.getElementById(id), menu = picker.querySelector('.game-picker-menu'), button = picker.querySelector('.game-picker-btn');
        const check = () => Array.from(menu.children).filter(item => item.classList.contains('game-picker-item')).every((item, index) => {
            const style = getComputedStyle(item);
            const animation = item.getAnimations().find(animation => animation.animationName === 'picker-item-in');
            if (style.animationName !== 'picker-item-in' || Math.abs(parseFloat(style.animationDelay) - index * .05) >= .0001
                || !animation || Math.abs(animation.effect.getTiming().delay - index * 50) >= .01) return false;
            // Verify rendered states as well as declarations: no false pass for
            // an animation overridden by another stylesheet or a stale cache.
            animation.pause(); animation.currentTime = 0;
            const before = Number(getComputedStyle(item).opacity);
            animation.currentTime = index * 50 + 100;
            const during = Number(getComputedStyle(item).opacity);
            animation.currentTime = index * 50 + 320;
            const after = Number(getComputedStyle(item).opacity);
            return before < .001 && during > before && during < 1 && after > .999;
        });
        button.click(); await frame(); results.push(check()); button.click();
        const added = Array.from({length: 9}, () => {
            const item = document.createElement('button'); item.className = 'game-picker-item'; item.textContent = 'Future item'; menu.append(item); return item;
        });
        await frame(); button.click(); await frame(); results.push(check()); button.click();
        menu.prepend(added.at(-1)); added[0].remove();
        await frame(); button.click(); await frame(); results.push(check()); button.click();
        added.forEach(item => item.remove()); await frame();
    }
    document.querySelector('.nav-link[data-page="game"]').click();
    return results;
})()`);
assert.deepEqual(pickerMotion, [true, true, true, true, true, true]);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
await click('#game-picker-btn');
assert.equal(await evaluate('[...document.querySelectorAll("#game-picker-menu .game-picker-item")].every(item => getComputedStyle(item).animationName === "none")'), true);
await click('#game-picker-btn');
await send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
checks.push('warm legacy CSS cache is bypassed; both picker menus animate every item in DOM order, including insertion/deletion/reordering, and respect reduced motion');
assert.equal(await evaluate('document.querySelector("#gomoku-start").textContent'), '重新开局');
await click('.gomoku-cell:nth-child(113)');
assert.equal(await evaluate('document.querySelectorAll(".gomoku-cell.black").length'), 1);
await click('#gomoku-start');
assert.equal(await evaluate('document.querySelectorAll(".gomoku-cell.black,.gomoku-cell.white").length'), 0);
await click('#gomoku-ai-1');
await until('document.querySelectorAll(".gomoku-cell.black").length===1');
await click('[data-gomoku-mode="online"]');
assert.equal(await evaluate('document.querySelectorAll(".gomoku-cell[aria-disabled=false]").length'), 0);
await click('[data-gomoku-mode="local"]');
await until('document.querySelectorAll(".gomoku-cell.black").length===1');
await click('#gomoku-ai-1');
await click('.gomoku-cell[aria-disabled="false"]');
assert.equal(await evaluate('document.querySelectorAll(".gomoku-cell.white").length'), 1);
checks.push('Gomoku opens ready for human play, AI starts on toggle and on returning to local mode, restart resets the board');
await send('Page.navigate', { url: origin + '/minigame/halma/' }, sessionId);
await until('!!window.__HALMA && document.querySelectorAll(".halma-cell").length===121');
assert.equal(await evaluate('__MINI_GAMES.current()'), 'halma');
assert.equal(await evaluate('document.querySelectorAll(".halma-cell.occupied").length'), 20);
assert.equal(await evaluate('halmaWorkers.length'), 0);
assert.equal(requests.some(url => url.includes('/assets/halma/')), false);
checks.push('direct route, 121 cells and no eager engine loading');
assert.equal(await evaluate('document.querySelector("#halma-start").textContent'), '重新开局');
await manualMove(); assert.equal(await count(), 1);
await click('#halma-undo'); assert.equal(await count(), 0);
await setFirst(2);
assert.equal(await evaluate('document.querySelector("#halma-status").textContent'), '蓝方选子');
await manualMove(); assert.equal(await count(), 1);
await setFirst(1); assert.equal(await count(), 1);
await click('#halma-start');
assert.ok(await evaluate('document.querySelector("#halma-status").textContent.includes("红方")'));
await click('#halma-start'); await manualMove(); assert.equal(await count(), 1);
await click('#halma-undo'); assert.equal(await count(), 0);
for (const players of [3, 4, 6]) {
    await click(`[data-halma-players="${players}"]`);
    assert.equal(await evaluate('document.querySelectorAll(".halma-cell.occupied").length'), players * 10);
    assert.equal(await evaluate('document.querySelector("#halma-ai-options").hidden'), false);
    assert.equal(await evaluate('document.querySelector("#halma-ai-toggles").children.length'), players);
    assert.equal(await evaluate('document.querySelector("#halma-first").options.length'), players);
    await setFirst(players);
    assert.ok(await evaluate('document.querySelector("#halma-side .current").textContent.startsWith(document.querySelector("#halma-first").selectedOptions[0].textContent)'));
    for (let i = 0; i < players; ++i) await manualMove();
    assert.equal(await count(), players);
    await click('#halma-mirror'); assert.equal(await count(), 0); await manualMove();
    await click('#halma-mirror');
}
await click('[data-halma-players="3"]'); assert.equal(await evaluate('document.querySelector("#halma-first").value'), '3');
await click('[data-halma-players="4"]'); assert.equal(await evaluate('document.querySelector("#halma-first").value'), '4');
await click('[data-halma-players="6"]'); assert.equal(await evaluate('document.querySelector("#halma-first").value'), '6');
await setFirst(1);
checks.push('per-mode starting colors, all options, immediate application before moves and next-game application during play');
assert.equal(await evaluate('halmaWorkers.length'), 0); checks.push('human play without Start and undo, all multiplayer counts and mirror mode without AI workers');
for (const players of [3, 4, 6]) {
    await click(`[data-halma-players="${players}"]`);
    await setFirst(players);
    const starts = { 3: [3, 1, 5], 4: [0, 5, 3, 2], 6: [0, 5, 4, 3, 2, 1] }[players];
    assert.deepEqual(await evaluate(`(async()=>{const {CELLS}=await import('/src/scripts/halma-geometry.js');const cells=[...document.querySelectorAll('.halma-cell')];return Array.from({length:${players}},(_,i)=>CELLS[cells.findIndex(cell=>Number(cell.dataset.piece)===i+1)][2]);})()`), starts);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.halma-camp')].map(c=>Number(c.dataset.target))`), Array.from({length:6},(_,r)=>starts.indexOf((r+3)%6)+1));
    await evaluate('document.querySelector("#halma-board").scrollIntoView({block:"center"})');
    const layout = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(folder, `layout-${players}.png`), Buffer.from(layout.data, 'base64'));
    await click('#halma-ai-' + players);
    await until('parseInt(document.querySelector("#halma-moves").textContent)===1 && document.querySelector("#halma-board").getAttribute("aria-busy")==="false"');
    assert.equal(await evaluate('halmaSearches.at(-1).players'), players);
    assert.equal(await evaluate('halmaSearches.at(-1).turn'), [1,-1,2,3,4,5][players-1]);
    await click('#halma-ai-' + players); await click('#halma-undo'); assert.equal(await count(), 0);
}
checks.push('3/4/6-player clockwise layouts, destination camp colors and real multiplayer WASM AI');
await click('[data-halma-players="2"]'); await setFirst(2); await click('#halma-ai-2');
await until('parseInt(document.querySelector("#halma-moves").textContent)===1 && document.querySelector("#halma-board").getAttribute("aria-busy")==="false"');
await click('#halma-ai-2'); await click('#halma-undo'); assert.equal(await count(), 0);
await setFirst(1); checks.push('Halma AI starts immediately after choosing Blue first and enabling Blue AI');
await click('#halma-ai-2'); await manualMove();
await until('parseInt(document.querySelector("#halma-moves").textContent)===2 && document.querySelector("#halma-board").getAttribute("aria-busy")==="false"');
assert.equal(await evaluate('halmaSearches.at(-1).difficulty'), 'fast');
assert.ok(await evaluate('halmaWorkers.at(-1).includes("?v=")'));
await click('#halma-undo'); assert.equal(await count(), 0);
checks.push('real WASM blue AI and full-round undo');
await click('#halma-mirror'); await click('#halma-ai-1');
await until('halmaSearches.length>=2 && halmaSearches.at(-1).mirror===true');
await until('parseInt(document.querySelector("#halma-moves").textContent)>=2');
await click('#halma-undo');
const pausedMoves = await count();
await new Promise(resolve => setTimeout(resolve, 450));
assert.equal(await count(), pausedMoves);
assert.equal(await evaluate('document.querySelector("#halma-retry").hidden'), false);
await click('#halma-retry'); await until(`parseInt(document.querySelector('#halma-moves').textContent)>${pausedMoves}`);
checks.push('mirror AI self-play, undo pauses, resume continues');
await click('#halma-ai-1'); await click('#halma-ai-2');
await evaluate('document.querySelector("#halma-speed").value="simple";document.querySelector("#halma-speed").dispatchEvent(new Event("change"))');
await click('#halma-ai-1'); await click('#halma-start');
await until('halmaSearches.at(-1)?.difficulty==="simple"');
await until('parseInt(document.querySelector("#halma-moves").textContent)===1 && document.querySelector("#halma-board").getAttribute("aria-busy")==="false"');
checks.push('simple mode dispatch and real AI move');
await evaluate('document.querySelector("#halma-speed").value="light";document.querySelector("#halma-speed").dispatchEvent(new Event("change"))');
await click('#halma-start'); await until('halmaSearches.at(-1)?.difficulty==="light"');
const terminations = await evaluate('halmaTerminated');
await click('[data-halma-players="4"]');
await new Promise(resolve => setTimeout(resolve, 500));
assert.equal(await count(), 0); assert.ok(await evaluate('halmaTerminated') > terminations);
checks.push('switching player count cancels a running advanced AI and discards results');
await click('[data-halma-players="2"]'); await until('document.querySelector("#halma-board").getAttribute("aria-busy")==="true"');
await evaluate('__MINI_GAMES.select("gomoku")'); const hiddenMoves = await count();
await new Promise(resolve => setTimeout(resolve, 500)); assert.equal(await count(), hiddenMoves);
await evaluate('__MINI_GAMES.select("halma")'); await until('parseInt(document.querySelector("#halma-moves").textContent)===1');
await click('#halma-ai-1');
checks.push('navigation cancels AI, returns to the same game and resumes');
await click('[data-halma-players="6"]');
await evaluate('document.querySelector("#halma-board").scrollIntoView({block:"center"})');
await new Promise(resolve => setTimeout(resolve, 200));
let screenshot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
await writeFile(join(folder, 'desktop.png'), Buffer.from(screenshot.data, 'base64'));
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }, sessionId);
await evaluate('document.querySelector("#halma-board").scrollIntoView({block:"center"})');
await new Promise(resolve => setTimeout(resolve, 250));
assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true);
assert.ok(await evaluate('document.querySelector("#halma-board").getBoundingClientRect().width>250'));
async function touch(selector) {
    const { x, y } = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(await evaluate(`document.elementFromPoint(${x},${y})?.matches(${JSON.stringify(selector)})`), 'touch target must be unobscured');
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 80));
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
}
await touch('.halma-cell.occupied[aria-disabled="false"]'); await until('!!document.querySelector(".halma-cell.destination")');
await touch('.halma-cell.destination'); await until('parseInt(document.querySelector("#halma-moves").textContent)===1 && document.querySelector("#halma-board").getAttribute("aria-busy")==="false"');
checks.push('real touch selects a piece and commits a legal destination');
screenshot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
await writeFile(join(folder, 'mobile.png'), Buffer.from(screenshot.data, 'base64'));
await evaluate('MELSI18n.setLanguage("en")');
assert.ok(!/[\u3400-\u9fff]/.test(await evaluate('document.querySelector("#halma-view").textContent')));
await evaluate('MELSI18n.setLanguage("zh-CN")');
checks.push('desktop/mobile layout, English and Chinese round trip');
await click('[data-halma-players="2"]');
blockedEngine = true;
await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
await click('#halma-ai-1');
await until('document.querySelector("#halma-status").textContent.includes("暂时不可用")');
assert.equal(await evaluate('document.querySelector("#halma-retry").hidden'), false);
blockedEngine = false; await click('#halma-retry');
await until('parseInt(document.querySelector("#halma-moves").textContent)===1');
await click('#halma-ai-1'); checks.push('engine loading failure is recoverable through Retry AI');
assert.deepEqual(errors, []);
await writeFile(join(folder, 'results.json'), JSON.stringify({ checks, uncaughtErrors: errors }, null, 2));
await send('Target.closeTarget', { targetId }); socket.close(); console.log('PASS browser Halma:', checks.join('; '));
