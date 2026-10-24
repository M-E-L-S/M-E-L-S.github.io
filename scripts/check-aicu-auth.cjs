const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/scripts/aicu.js', 'utf8');

async function scenario({ offset = 0, status = 200, malformed = false, storageFails = false } = {}) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { hidden: false, value: '', classList: { contains: () => true },
            listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, replaceChildren() {} });
        return elements.get(id);
    };
    const stored = new Map();
    const timers = [];
    const now = Date.now();
    const context = {
        document: { getElementById: element },
        localStorage: { getItem: key => stored.get(key), removeItem: key => stored.delete(key),
            setItem(key, value) { if (storageFails) throw Error('blocked'); stored.set(key, value); } },
        Date: { now: () => now + offset }, AbortController,
        setTimeout: (fn, delay) => { timers.push(delay); return timers.length; }, clearTimeout() {},
        addEventListener() {}, MutationObserver: class { observe() {} },
        fetch: async () => ({ status, ok: status === 200, json: async () => malformed ? { ok: true } :
            { ok: true, token: 'test-token', expiresAt: now + 86400000 } })
    };
    vm.runInNewContext(source, context);
    element('aicu-password').value = 'test-password';
    element('aicu-auth-form').listeners.submit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    return { overlay: element('aicu-auth-overlay'), message: element('aicu-auth-status').textContent, stored, timers };
}
(async () => {
    for (const offset of [0, -10000, -2 * 86400000, 2 * 86400000]) {
        const result = await scenario({ offset });
        assert.equal(result.overlay.hidden, true, `successful login with clock offset ${offset}`);
        assert.equal(result.stored.get('mels.aicu.authorization.v1'), 'test-token');
        assert.equal(result.timers.at(-1), 86400000);
    }
    for (const [options, message] of [
        [{ status: 401 }, '访问密码不正确。'],
        [{ status: 500 }, '授权服务返回 HTTP 500，请稍后重试。'],
        [{ malformed: true }, '登录响应格式异常，请刷新页面后重试。'],
        [{ storageFails: true }, '无法保存授权，请允许本站使用浏览器存储。']
    ]) {
        const result = await scenario(options);
        assert.equal(result.overlay.hidden, false);
        assert.equal(result.message, message);
        assert.equal(result.stored.size, 0);
    }
    console.log('PASS Aicu login: clock skew, unlock/storage, invalid responses, HTTP and storage errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
