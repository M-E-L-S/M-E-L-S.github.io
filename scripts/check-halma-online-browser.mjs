import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const require = createRequire(new URL('../mels-api/package.json', import.meta.url));
const WebSocket = require('ws');
const [endpoint, origin, folder, cfPort, netlifyPort] = process.argv.slice(2);
const socket = new WebSocket(endpoint);
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
let serial = 0;
const pending = new Map(), errors = [], checks = [], targets = [], contexts = [];
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
socket.on('message', raw => {
    const data = JSON.parse(String(raw));
    if (data.id) { const job = pending.get(data.id); if (!job) return; pending.delete(data.id); data.error ? job.reject(Error(JSON.stringify(data.error))) : job.resolve(data.result); }
    else if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    else if (data.method === 'Fetch.requestPaused') {
        const { requestId, request } = data.params;
        const allowed = request.url.startsWith('http://127.0.0.1:') || request.url.startsWith('data:');
        void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(!allowed ? { errorReason: 'BlockedByClient' } : {}) }, data.sessionId)
            .catch(error => { if (!error.message.includes('Session with given id not found')) errors.push(error.message); });
    }
});
async function page(url) {
    const { browserContextId } = await send('Target.createBrowserContext'); contexts.push(browserContextId);
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }); targets.push(targetId);
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.onlineConnections=[];window.engineWorkers=[];
        const NativeWebSocket=WebSocket;window.WebSocket=class extends NativeWebSocket {
            constructor(value,protocols){const url=new URL(value);window.onlineConnections.push(url.pathname);
                if(url.pathname.startsWith('/api/halma/')){url.protocol='ws:';url.host='127.0.0.1:${cfPort}';}
                super(url,protocols);}
        };
        const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(url,options){window.engineWorkers.push(String(url));super(url,options);}};
        const nativeFetch=fetch;window.fetch=(value,options)=>{
            const url=new URL(typeof value==='string'?value:value.url,location.href);
            if(url.hostname==='m-e-l-s.netlify.app' && url.pathname==='/api/rooms') value='http://127.0.0.1:${netlifyPort}/api/rooms';
            return nativeFetch(value,options);
        };
        const nativeTimeout=setTimeout;window.setTimeout=(fn,delay,...args)=>nativeTimeout(fn,
            location.hash.includes('backend=netlify') && delay>=2700 && delay<=11000 ? 100 : delay,...args);
    ` }, sessionId);
    const p = { sessionId, targetId };
    p.eval = async expression => {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
        if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
        return r.result.value;
    };
    p.click = selector => p.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
    p.wait = async (expression, timeout = 16000) => {
        const end = Date.now() + timeout;
        while (!await p.eval(expression)) {
            if (Date.now() > end) throw Error('Timeout: ' + expression + '\n' + await p.eval('document.querySelector("#halma-status")?.textContent+" / "+document.querySelector("#halma-detail")?.textContent'));
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    };
    p.moves = () => p.eval('parseInt(document.querySelector("#halma-moves").textContent)');
    p.count = n => p.wait(`parseInt(document.querySelector('#halma-moves').textContent)===${n}`);
    p.select = (id, value) => p.eval(`document.getElementById(${JSON.stringify('halma-' + id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify('halma-' + id)}).dispatchEvent(new Event('change'))`);
    p.move = async () => {
        await p.wait('!!document.querySelector(".halma-cell[aria-disabled=false]")');
        await p.eval(`(()=>{for(const cell of document.querySelectorAll('.halma-cell[aria-disabled=false]')){
            cell.click();const dest=document.querySelector('.halma-cell.destination');if(dest){dest.click();return;}
        }throw Error('No legal move');})()`);
    };
    await send('Page.navigate', { url }, sessionId);
    await p.wait('!!window.__HALMA && document.querySelectorAll(".halma-cell").length===121');
    await p.eval('MELSI18n.setLanguage("zh-CN")');
    return p;
}
try {
    for (const mode of ['online', 'netlify']) {
        console.log('Checking', mode);
        const host = await page(origin + '/minigame/halma/');
        await host.click(`[data-halma-mode="${mode}"]`); await host.click('[data-halma-players="3"]');
        await host.select('first', 3); await host.select('host-color', 3); await host.click('#halma-mirror');
        await host.click('#halma-start');
        await host.wait('document.querySelector("#halma-side").textContent.includes("绿方：你")');
        const invitation = await host.eval('document.querySelector("#halma-invitation").href');
        assert.ok(!invitation.includes('token')); assert.equal(new URL(invitation).pathname, '/minigame/halma/');
        const peers = [host];
        for (let i = 0; i < 2; ++i) {
            const guest = await page(invitation); await guest.click('#halma-join');
            await guest.wait('document.querySelector("#halma-side").textContent.includes("：你")'); peers.push(guest);
        }
        await host.wait('document.querySelectorAll(".halma-cell[aria-disabled=false]").length>0');
        assert.equal(await peers[1].eval('document.querySelector("#halma-first").disabled'), true);
        for (const [i, p] of peers.entries()) {
            assert.equal(await p.eval('document.querySelector("#halma-ai-options").hidden'), i !== 0);
            assert.equal(await p.eval('document.querySelector("#halma-mirror").getAttribute("aria-pressed")'), 'true');
            assert.equal(await p.eval('[...document.querySelectorAll("[data-halma-players]")].every(button=>button.disabled)'), true);
        }
        for (let i = 0; i < 3; ++i) { await peers[i].move(); await Promise.all(peers.map(p => p.count(i + 1))); }
        await host.click('#halma-undo'); await peers[1].wait('!document.querySelector("#halma-offer").hidden');
        await peers[1].click('#halma-accept');
        await host.wait('document.querySelector("#halma-offer-text").textContent.includes("2/3")'); assert.equal(await host.moves(), 3);
        await peers[2].wait('!document.querySelector("#halma-accept").disabled'); await peers[2].click('#halma-accept');
        await Promise.all(peers.map(p => p.count(0)));
        await host.select('first', 1); await host.select('host-color', 1); await host.click('#halma-mirror');
        await host.click('#halma-start');
        for (const p of peers.slice(1)) { await p.wait('!document.querySelector("#halma-offer").hidden'); await p.click('#halma-accept'); }
        await host.wait('document.querySelector("#halma-side").textContent.includes("红方：你") && document.querySelector("#halma-mirror").getAttribute("aria-pressed")==="false"');
        await send('Page.reload', {}, host.sessionId);
        await host.wait('!!window.__HALMA && document.querySelector("#halma-side").textContent.includes("红方：你")');
        await host.move(); await Promise.all(peers.map(p => p.count(1)));
        await peers[2].click('.nav-link[data-page="tools"]');
        await host.wait('document.querySelector("#halma-status").textContent.includes("未在线")');
        assert.equal(await host.eval('document.querySelectorAll(".halma-cell[aria-disabled=false]").length'), 0);
        await peers[2].click('.nav-link[data-page="game"]');
        await peers[2].move(); await Promise.all(peers.map(p => p.count(2)));
        for (const p of peers) {
            assert.equal(await p.eval('onlineConnections.every(path=>path.startsWith("/api/halma/"))'), true, 'invitation cannot open a Gomoku room');
            assert.equal(await p.eval('engineWorkers.some(url=>url.includes("/assets/halma/"))'), false);
        }
        await peers[1].select('swap-target', 2); await peers[1].click('#halma-swap');
        await peers[2].wait('document.querySelector("#halma-offer-text").textContent.includes("交换颜色")');
        assert.equal(await host.eval('document.querySelector("#halma-accept").hidden'), true, 'uninvolved player does not vote on a swap');
        await peers[2].click('#halma-decline'); await peers[1].wait('document.querySelector("#halma-offer").hidden');
        const beforeSwap = await host.eval('[...document.querySelectorAll(".halma-cell")].map(c=>c.dataset.piece).join("")');
        await peers[1].click('#halma-swap'); await peers[2].wait('!document.querySelector("#halma-offer").hidden');
        await peers[2].click('#halma-accept');
        await peers[1].wait('document.querySelector("#halma-side").textContent.includes("蓝方：你")');
        await peers[2].wait('document.querySelector("#halma-side").textContent.includes("绿方：你")');
        assert.equal(await host.eval('[...document.querySelectorAll(".halma-cell")].map(c=>c.dataset.piece).join("")'), beforeSwap);
        await peers[2].move(); await Promise.all(peers.map(p => p.count(3)));
        await host.eval('MELSI18n.setLanguage("en")');
        assert.ok(!/[\u3400-\u9fff]/.test(await host.eval('document.querySelector("#halma-view").textContent')));
        await host.eval('MELSI18n.setLanguage("zh-CN")');
        await host.eval('document.querySelector("#halma-board").scrollIntoView({block:"center"})');
        const screenshot = await send('Page.captureScreenshot', { format: 'png' }, host.sessionId);
        await writeFile(join(folder, mode + '.png'), Buffer.from(screenshot.data, 'base64'));
        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, host.sessionId);
        assert.equal(await host.eval('document.documentElement.scrollWidth<=window.innerWidth'), true, 'online controls must fit the mobile viewport');
        await peers[1].click('#halma-leave'); await peers[1].count(0);
        checks.push(`${mode}: 3 browsers, mirror/starting color, seat identity, moves, unanimous undo/restart, bilateral swap accept/reject, refresh, disconnect/resume, leave and translations`);
        for (const p of peers) await send('Target.closeTarget', { targetId: p.targetId });
        const botHost = await page(origin + '/minigame/halma/');
        await botHost.click(`[data-halma-mode="${mode}"]`); await botHost.click('[data-halma-players="4"]');
        await botHost.select('first', 2); await botHost.click('#halma-ai-2'); await botHost.click('#halma-ai-3');
        await botHost.click('#halma-start'); await botHost.wait('document.querySelector("#halma-side").textContent.includes("红方：你")');
        assert.equal(await botHost.eval('engineWorkers.length'), 0, 'AI waits for the remaining human seat');
        const botInvite = await botHost.eval('document.querySelector("#halma-invitation").href');
        const botGuest = await page(botInvite); await botGuest.click('#halma-join');
        await botGuest.wait('document.querySelector("#halma-side").textContent.includes("黄方：你")');
        await Promise.all([botHost.count(2), botGuest.count(2)]);
        assert.equal(await botGuest.eval('engineWorkers.some(url=>url.includes("/assets/halma/"))'), false);
        assert.equal(await botHost.eval('engineWorkers.some(url=>url.includes("/assets/halma/"))'), true);
        await botGuest.select('swap-target', 1); await botGuest.click('#halma-swap');
        await botHost.wait('!document.querySelector("#halma-offer").hidden && !document.querySelector("#halma-accept").hidden && !document.querySelector("#halma-accept").disabled'); await botHost.click('#halma-accept');
        await botHost.wait('document.querySelector("#halma-side").textContent.includes("黄方：你")');
        await send('Page.reload', {}, botHost.sessionId);
        await botHost.wait('!!window.__HALMA && document.querySelector("#halma-side").textContent.includes("黄方：你")');
        assert.equal(await botHost.eval('document.querySelector("#halma-ai-2").getAttribute("aria-pressed")'), 'true');
        await botHost.click('#halma-ai-3');
        await botHost.wait('document.querySelector("#halma-side").textContent.includes("绿方：待加入")');
        const newcomer = await page(botInvite); await newcomer.click('#halma-join');
        await newcomer.wait('document.querySelector("#halma-side").textContent.includes("绿方：你")');
        await botHost.move(); await Promise.all([botHost.count(3), botGuest.count(3), newcomer.count(3)]);
        assert.equal(await botHost.eval('document.querySelector("#halma-ai-3").disabled'), true);
        await botHost.eval('MELSI18n.setLanguage("en")');
        assert.ok(!/[\u3400-\u9fff]/.test(await botHost.eval('document.querySelector("#halma-view").textContent')));
        const aiImage = await send('Page.captureScreenshot', { format: 'png' }, botHost.sessionId);
        await writeFile(join(folder, mode + '-ai.png'), Buffer.from(aiImage.data, 'base64'));
        checks.push(`${mode}: 4-player host-only real WASM AI, bots reserve empty seats, no guest inference, human-only votes, swap with host, refresh, releasing AI slots and human admission`);
        for (const p of [botHost, botGuest, newcomer]) await send('Target.closeTarget', { targetId: p.targetId });
    }
    assert.deepEqual(errors, []);
    await writeFile(join(folder, 'results.json'), JSON.stringify({ checks, uncaughtErrors: errors }, null, 2));
    console.log('PASS online browser:', checks.join('; '));
} finally {
    for (const browserContextId of contexts) await send('Target.disposeBrowserContext', { browserContextId });
    socket.close();
}
