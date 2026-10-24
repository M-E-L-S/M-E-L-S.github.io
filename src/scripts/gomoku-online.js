const STORAGE_KEY = 'mels_gomoku_room_v1';
const ROOMS_KEY = 'mels_gomoku_rooms_v1';
const ROOM_ID = /^[a-f0-9]{20}$/;
const IDENTITY_PREFIX = 'mels_gomoku_identity_v2:';
const ROOM_TTL = 24 * 60 * 60 * 1000;
const validSession = saved => ROOM_ID.test(saved?.room) && /^[a-f0-9]{64}$/.test(saved?.token) &&
    Number.isSafeInteger(saved.expiresAt) && saved.expiresAt > Date.now();
const randomHex = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, '0')).join('');
// Local previews use the same deployed backend as the public site.
const API = 'https://mels-api.3209692800.workers.dev';
const ERRORS = {
    stale_state: '局面已更新，请重新操作', illegal_move: '该位置不能落子或尚未轮到你',
    opponent_offline: '对方已断线，等待重连', offer_pending: '请先处理当前申请',
    nothing_to_undo: '还没有可撤回的落子', invalid_offer: '申请已失效，请重试',
    host_only: '只有房主可以选择下局执棋', restart_required: '更换执棋颜色需要申请重开'
};

export class OnlineGame {
    constructor(onChange) {
        this.onChange = onChange;
        this.session = null;
        this.sessions = {};
        // Remove expired durable identities when this origin is next opened.
        try {
            for (let i = localStorage.length - 1; i >= 0; --i) {
                const key = localStorage.key(i);
                if (!key?.startsWith(IDENTITY_PREFIX)) continue;
                let saved;
                try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
                if (!validSession(saved) || key !== IDENTITY_PREFIX + saved.room) localStorage.removeItem(key);
            }
        } catch {}
        try {
            const rooms = JSON.parse(sessionStorage.getItem(ROOMS_KEY)) || {};
            const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
            // Migrate credentials from tabs opened before persistent identities.
            for (const entry of [...Object.values(rooms), saved]) {
                if (!entry || !ROOM_ID.test(entry.room) || !/^[a-f0-9]{64}$/.test(entry.token)) continue;
                const legacy = entry.expiresAt === undefined;
                const identity = { ...entry, expiresAt: legacy ? Date.now() + ROOM_TTL : entry.expiresAt };
                if (!validSession(identity)) continue;
                this.sessions[identity.room] = identity;
                if (legacy) {
                    try {
                        const key = IDENTITY_PREFIX + identity.room;
                        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(identity));
                    } catch {}
                }
            }
            if (ROOM_ID.test(saved?.room)) this.session = this.readSession(saved.room);
        } catch {}
        this.state = null;
        this.socket = null;
        this.status = 'idle';
        this.error = '';
        this.active = false;
        this.retry = 0;
        this.reconnectTimer = null;
        this.heartbeat = null;
        this.generation = 0;
        this.lastSeen = 0;
        addEventListener('storage', event => {
            if (event.key === null || event.key?.startsWith(IDENTITY_PREFIX) && event.newValue === null) {
                const room = event.key?.slice(IDENTITY_PREFIX.length);
                if (room) delete this.sessions[room]; else this.sessions = {};
                if (this.session && (!room || this.session.room === room)) this.forget();
            }
        });
    }
    notify() { this.onChange(); }
    readSession(room) {
        if (!ROOM_ID.test(room)) return null;
        try {
            const saved = JSON.parse(localStorage.getItem(IDENTITY_PREFIX + room));
            if (validSession(saved) && saved.room === room) return saved;
            localStorage.removeItem(IDENTITY_PREFIX + room);
            return null;
        } catch {
            return validSession(this.sessions[room]) ? this.sessions[room] : null;
        }
    }
    persist() {
        if (this.session) {
            delete this.sessions[this.session.room];
            this.sessions[this.session.room] = { ...this.session };
            try { localStorage.setItem(IDENTITY_PREFIX + this.session.room, JSON.stringify(this.session)); } catch {}
        }
        // Only the current selection/history is per-tab. Each durable identity
        // has its own key so updates in other rooms cannot overwrite it.
        const entries = Object.entries(this.sessions).slice(-8);
        this.sessions = Object.fromEntries(entries);
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session));
            sessionStorage.setItem(ROOMS_KEY, JSON.stringify(this.sessions));
        } catch {}
    }
    prepareRoom(room) {
        if (room === this.session?.room && validSession(this.session)) return;
        if (this.session) this.persist();
        this.disconnect();
        this.session = this.readSession(room);
        this.state = null;
        this.status = this.session ? 'disconnected' : 'idle';
        this.persist();
    }
    create(color) {
        if (this.session) this.persist();
        this.disconnect();
        this.session = { room: randomHex(10), token: randomHex(32), create: true, color, expiresAt: Date.now() + ROOM_TTL };
        this.state = null; this.persist(); this.active = true; this.retry = 0; this.connect();
    }
    join(value) {
        const room = value.trim().toLowerCase();
        if (!ROOM_ID.test(room)) { this.error = '请输入完整的 20 位房间码'; this.notify(); return; }
        this.prepareRoom(room);
        this.disconnect();
        if (this.session?.room !== room) this.session = { room, token: randomHex(32), create: false, expiresAt: Date.now() + ROOM_TTL };
        this.state = null; this.persist(); this.active = true; this.retry = 0; this.connect();
    }
    resume() {
        if (!this.session) return;
        if (!validSession(this.session)) { this.forget(); return; }
        this.active = true;
        if (this.socket || this.reconnectTimer) return;
        this.retry = 0; this.connect();
    }
    connect() {
        if (!this.active || !this.session || this.socket) return;
        const generation = ++this.generation;
        const { room, token, create, color } = this.session;
        const url = new URL(`/api/gomoku/rooms/${room}`, API);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        if (create) { url.searchParams.set('create', '1'); url.searchParams.set('color', String(color)); }
        this.status = this.retry ? 'reconnecting' : 'connecting'; this.error = ''; this.notify();
        // Identity is a subprotocol header, never part of an invitation or URL.
        const ws = this.socket = new WebSocket(url, ['gomoku.v1', 'token.' + token]);
        this.lastSeen = Date.now();
        const timeout = setTimeout(() => { if (this.socket === ws && this.status !== 'connected') ws.close(); }, 10000);
        ws.onopen = () => {
            if (generation !== this.generation) return;
            this.lastSeen = Date.now();
            this.heartbeat = setInterval(() => {
                if (ws.readyState !== WebSocket.OPEN) return;
                if (Date.now() - this.lastSeen > 100000) { ws.close(); return; }
                ws.send('ping'); // DO automatic response: does not wake the room.
            }, 45000);
        };
        ws.onmessage = event => {
            if (generation !== this.generation) return;
            this.lastSeen = Date.now();
            if (event.data === 'pong') return;
            let data;
            try { data = JSON.parse(event.data); } catch { return; }
            if (data.type === 'error') { this.error = ERRORS[data.error] || '操作未成功，请重试'; this.notify(); return; }
            if (data.type !== 'state' || data.room !== room || !Array.isArray(data.moves)) return;
            clearTimeout(timeout);
            this.status = 'connected'; this.retry = 0; this.state = data;
            this.session.create = false;
            if (Number.isSafeInteger(data.expiresAt) && data.expiresAt > 0) this.session.expiresAt = data.expiresAt;
            this.persist();
            this.notify();
        };
        ws.onerror = () => {}; // Close handles failure and bounded backoff once.
        ws.onclose = event => {
            clearTimeout(timeout);
            if (generation !== this.generation) return;
            clearInterval(this.heartbeat); this.heartbeat = null; this.socket = null;
            if (event.code === 4004) {
                this.forget(); this.error = '房间已到期，请创建新房间'; this.notify(); return;
            }
            const permanent = [4001, 4003, 4004, 4008].includes(event.code);
            this.status = 'disconnected';
            this.error = event.code === 4001 ? '已在另一窗口连接，本窗口已断开'
                : event.code === 4004 ? '房间已到期，请创建新房间'
                : '连接已断开；房间不存在、已满或服务暂不可用，请检查房间码后重试';
            if (permanent) this.active = false;
            if (this.active && !permanent && this.retry < 5) {
                const delay = Math.min(30000, 1000 * 2 ** this.retry++) + Math.random() * 500;
                this.status = 'reconnecting';
                this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
            }
            this.notify();
        };
    }
    send(type, fields = {}) {
        if (this.status !== 'connected' || this.socket?.readyState !== WebSocket.OPEN || !this.state) return;
        this.error = '';
        this.socket.send(JSON.stringify({ type, revision: this.state.revision, ...fields }));
        this.notify();
    }
    disconnect() {
        this.active = false; ++this.generation;
        clearTimeout(this.reconnectTimer); this.reconnectTimer = null;
        clearInterval(this.heartbeat); this.heartbeat = null;
        this.socket?.close(1000, 'paused'); this.socket = null;
        this.status = this.session ? 'disconnected' : 'idle';
        this.error = '';
    }
    forget() {
        if (this.session) {
            delete this.sessions[this.session.room];
            try { localStorage.removeItem(IDENTITY_PREFIX + this.session.room); } catch {}
        }
        this.disconnect(); this.session = null; this.state = null; this.status = 'idle';
        this.persist();
        this.notify();
    }
}
