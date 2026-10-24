const HEX = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const random = size => Array.from(crypto.getRandomValues(new Uint8Array(size)), value => value.toString(16).padStart(2, '0')).join('');
const safeStorage = name => { try { return globalThis[name]; } catch { return null; } };
const TTL = 86400000, IDLE = 300000;
const MESSAGES = {
    not_configured: 'Netlify 联机尚未启用', service_unavailable: '联机服务暂不可用，正在重试',
    room_not_found: '房间不存在，请检查房间码', room_expired: '房间已到期，请创建新房间',
    room_full: '房间已满，请检查房间码', room_exists: '房间已存在，请创建新房间',
    invalid_session: '无法恢复此房间身份，请使用原浏览器重连',
    session_replaced: '此身份已在其他标签页连接，可手动重新连接',
    too_many_rooms: '创建房间过于频繁，请稍后重试', too_many_operations: '操作过于频繁，请稍后重试',
    room_busy: '房间暂忙，正在重新同步', stale_state: '局面已更新，请重新操作',
    operation_conflict: '操作已失效，请重新操作', invalid_message: '操作参数无效，请刷新页面后重试'
};
const FATAL = new Set(['not_configured', 'room_not_found', 'room_expired', 'room_full', 'room_exists', 'invalid_session', 'session_replaced', 'unknown_game']);
let endpointPromise;
async function endpoint() {
    if (!endpointPromise) endpointPromise = (async () => {
        const response = await fetch('/assets/data/netlify-games.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw Error('not_configured');
        const config = await response.json();
        let url;
        try { url = new URL(config.endpoint); } catch { throw Error('not_configured'); }
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('not_configured');
        return url.href;
    })().catch(error => { endpointPromise = null; throw error; });
    return endpointPromise;
}
export async function requestRoom(payload, options = {}) {
    const controller = new AbortController();
    const stop = () => controller.abort();
    options.signal?.addEventListener('abort', stop, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(stop, 12000);
    try {
        const response = await fetch(await endpoint(), { method: 'POST', mode: 'cors', credentials: 'omit',
            referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal, keepalive: !!options.keepalive,
            // A simple cross-origin POST avoids a preflight for every operation.
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(payload) });
        if (!response.ok) throw Error(response.status === 429 ? 'too_many_operations' : 'service_unavailable');
        const body = await response.json();
        if (typeof body?.ok !== 'boolean') throw Error('service_unavailable');
        return body;
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', stop); }
}

// Shared HTTP room transport. Game rules, seat mapping, and polling preferences
// are supplied by the server's registered game adapter.
export class GameRoomClient {
    constructor({ game, onChange, call = requestRoom, clock = Date.now, storage = safeStorage('localStorage'),
        tabStorage = safeStorage('sessionStorage'), document = globalThis.document, timers = globalThis, events = globalThis, messages = {} } = {}) {
        if (!/^[a-z0-9-]{1,32}$/.test(game || '')) throw Error('invalid_game');
        Object.assign(this, { game, onChange, call, clock, storage, tabStorage, document, timers });
        this.messages = { ...MESSAGES, ...messages };
        this.prefix = `mels_netlify_room_v1:${game}:`; this.currentKey = `mels_netlify_current_v1:${game}`;
        this.session = null; this.state = null; this.status = 'idle'; this.error = ''; this.syncHint = '';
        this.active = false; this.pending = false; this.generation = 0; this.failures = 0;
        this.queue = Promise.resolve(); this.timer = null; this.controller = null; this.replaced = false;
        this.lastActivity = clock(); this.backgrounded = false;
        try {
            const expired = [];
            for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(this.prefix) && !this.valid(JSON.parse(storage.getItem(key)))) expired.push(key); }
            for (const key of expired) storage.removeItem(key);
            this.session = this.read(tabStorage.getItem(this.currentKey));
        } catch {}
        document?.addEventListener('visibilitychange', () => {
            if (document.hidden && this.active) { this.disconnect(); this.backgrounded = true; }
            else if (!document.hidden && this.backgrounded) { this.backgrounded = false; this.resume(); }
        });
        events.addEventListener?.('storage', event => {
            if (this.session && (event.key === null || event.key === this.prefix + this.session.room && event.newValue === null)) {
                this.disconnect(); this.session = null; this.state = null; this.status = 'idle'; this.notify();
            }
        });
    }
    valid(saved) { return saved?.game === this.game && HEX(saved.room, 20) && HEX(saved.token, 64) && saved.validUntil > this.clock(); }
    read(room) { try { const saved = JSON.parse(this.storage.getItem(this.prefix + room)); return this.valid(saved) ? saved : null; } catch { return null; } }
    persist() {
        try {
            if (this.session) { this.storage.setItem(this.prefix + this.session.room, JSON.stringify(this.session)); this.tabStorage.setItem(this.currentKey, this.session.room); }
            else this.tabStorage.removeItem(this.currentKey);
        } catch {}
    }
    notify() { this.onChange?.(); }
    prepareRoom(room) {
        if (this.session?.room === room && this.valid(this.session)) return;
        this.disconnect(); this.session = this.read(room); this.state = null; this.error = ''; this.replaced = false;
        this.status = this.session ? 'disconnected' : 'idle'; this.persist();
    }
    create(options = {}) {
        this.disconnect(); this.session = { game: this.game, room: random(10), token: random(32), validUntil: this.clock() + TTL, create: true, options };
        this.state = null; this.replaced = false; this.persist(); this.resume(true);
    }
    join(room) {
        if (!HEX(room, 20)) { this.error = '房间码无效'; this.notify(); return; }
        this.prepareRoom(room);
        if (!this.session) this.session = { game: this.game, room, token: random(32), validUntil: this.clock() + TTL, create: false };
        this.persist(); this.resume(true);
    }
    payload(action, fields = {}) {
        return { game: this.game, room: this.session.room, token: this.session.token, connection: this.connection, action, ...fields };
    }
    enqueue(task) {
        const job = this.queue.then(task);
        this.queue = job.catch(() => {}); return job;
    }
    async rpc(payload, generation) {
        if (!this.active || generation !== this.generation) return null;
        const controller = this.controller = new AbortController();
        try {
            const result = await this.call(payload, { signal: controller.signal });
            return this.active && generation === this.generation ? result : null;
        } finally { if (this.controller === controller) this.controller = null; }
    }
    accept(result) {
        if (!result) return false;
        if (result.state) {
            const state = result.state;
            if (state.game !== this.game || state.room !== this.session?.room || !Number.isSafeInteger(state.revision) || !Number.isSafeInteger(state.expiresAt) || !Number.isFinite(result.now) || typeof state.sync !== 'string' || !Array.isArray(state.players) || !Array.isArray(state.joined)) throw Error('service_unavailable');
            if (this.state && state.revision < this.state.revision) return false;
            if (!this.state || state.revision !== this.state.revision) this.lastActivity = this.clock();
            this.state = state; this.sync = state.sync;
            const remaining = Math.max(0, state.expiresAt - result.now);
            this.session.validUntil = this.clock() + remaining;
            if (!this.session.confirmed) { this.session.create = false; this.session.confirmed = true; this.persist(); }
        }
        if (result.ok) {
            if (!result.state && (!result.unchanged || !this.state || result.sync !== this.sync)) throw Error('service_unavailable');
            this.failures = 0; this.error = ''; this.status = 'connected'; this.syncHint = ''; this.notify(); return true;
        }
        this.handleError(Error(result.error || 'service_unavailable')); return false;
    }
    handleError(error) {
        const code = error.message;
        this.error = this.messages[code] || '联机服务暂不可用，正在重试';
        if (FATAL.has(code)) {
            this.active = false; this.timers.clearTimeout(this.timer); this.timer = null;
            this.replaced = code === 'session_replaced'; this.status = 'disconnected';
            if (code === 'room_expired') { try { this.storage.removeItem(this.prefix + this.session.room); } catch {} this.session = null; this.state = null; this.persist(); }
        } else if (code === 'service_unavailable' || code === 'too_many_operations' || !Object.hasOwn(this.messages, code)) {
            ++this.failures; this.status = 'reconnecting';
        }
        this.notify();
    }
    resume(force = false) {
        if (this.active || !this.session || this.replaced && !force || this.document?.hidden) return;
        if (!this.valid(this.session)) { this.forget(); return; }
        this.active = true; this.backgrounded = false; this.replaced = false; this.failures = 0; this.lastActivity = this.clock();
        this.status = 'connecting'; this.error = ''; this.syncHint = ''; this.connection = random(16);
        const generation = ++this.generation; this.notify();
        void this.enqueue(() => this.open(generation));
    }
    async open(generation) {
        try {
            const result = await this.rpc(this.payload('open', { create: this.session.create, options: this.session.options }), generation);
            if (result) this.accept(result);
        } catch (error) { if (generation === this.generation && this.active) this.handleError(error); }
        if (generation !== this.generation || !this.active) return;
        if (this.pauseIfIdle()) return;
        this.schedule(generation, this.status !== 'connected');
    }
    pauseIfIdle() {
        if (!this.active || this.clock() - this.lastActivity < IDLE) return false;
        this.disconnect(); this.syncHint = '长时间无操作，自动同步已暂停，请重新连接'; this.notify(); return true;
    }
    schedule(generation, opening = false) {
        if (!this.active || generation !== this.generation) return;
        this.timers.clearTimeout(this.timer);
        let delay = this.failures ? Math.min(30000, 3000 * 2 ** Math.min(this.failures - 1, 4)) : Math.min(15000, Math.max(3000, this.state?.pollAfterMs || 3000));
        if (this.clock() - this.lastActivity > 60000) delay = Math.max(delay, 15000);
        this.timer = this.timers.setTimeout(() => {
            this.timer = null;
            void this.enqueue(() => opening ? this.open(generation) : this.poll(generation));
        }, Math.round(delay * (.9 + Math.random() * .2)));
    }
    async poll(generation) {
        try {
            const result = await this.rpc(this.payload('sync', { sync: this.sync }), generation);
            if (result) this.accept(result);
        } catch (error) { if (generation === this.generation && this.active) this.handleError(error); }
        // Check the final response before pausing, so a move received near the
        // idle boundary resets the deadline instead of being missed.
        if (generation === this.generation && this.pauseIfIdle()) return;
        this.schedule(generation);
    }
    send(type, fields = {}) {
        if (!this.active || this.pending || this.status !== 'connected' || !this.state) return;
        const generation = this.generation;
        const payload = this.payload('command', { command: { type, ...fields }, revision: this.state.revision, requestId: random(16) });
        this.timers.clearTimeout(this.timer); this.timer = null; this.pending = true; this.lastActivity = this.clock(); this.notify();
        void this.enqueue(async () => {
            try {
                let result;
                try { result = await this.rpc(payload, generation); }
                catch (error) {
                    if (error.message === 'not_configured' || error.message === 'too_many_operations') throw error;
                    result = await this.rpc(payload, generation); // Same ID/revision: safe after a lost response.
                }
                if (result) this.accept(result);
            } catch (error) { if (generation === this.generation && this.active) this.handleError(error); }
            finally { if (generation === this.generation) { this.pending = false; this.notify(); this.schedule(generation); } }
        });
    }
    disconnect() {
        const leave = this.active && this.session && this.connection ? this.payload('leave') : null;
        this.active = false; this.backgrounded = false; ++this.generation;
        this.timers.clearTimeout(this.timer); this.timer = null; this.controller?.abort(); this.controller = null;
        this.pending = false; this.status = this.session ? 'disconnected' : 'idle';
        if (leave) void this.call(leave, { keepalive: true }).catch(() => {});
    }
    forget() {
        const room = this.session?.room; this.disconnect();
        try { if (room) this.storage.removeItem(this.prefix + room); } catch {}
        this.session = null; this.state = null; this.error = ''; this.syncHint = ''; this.replaced = false; this.status = 'idle'; this.persist(); this.notify();
    }
}
