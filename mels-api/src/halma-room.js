import halma from '../../shared/halma-room.js';
import { ROOM_TTL } from './gomoku-room.js';
const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('');

// Seat identity is stable; the shared rules map seats to colors after a restart.
export class HalmaRoom {
    constructor(ctx, env) {
        this.ctx = ctx; this.env = env; this.room = null;
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
        ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get('room') || null; });
    }
    sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
    view(seat) {
        const online = this.room.seats.map(() => false);
        for (const ws of this.sockets()) online[ws.deserializeAttachment().seat] = true;
        return { seat, online, joined: this.room.seats.map(Boolean) };
    }
    snapshot(seat) {
        return { type: 'state', game: 'halma', room: this.room.id, revision: this.room.revision,
            expiresAt: this.room.expiresAt, ...halma.snapshot(this.room.state, this.view(seat)) };
    }
    send(ws, value) { try { ws.send(JSON.stringify(value)); } catch { try { ws.close(1011, 'send failed'); } catch {} } }
    broadcast() { if (this.room) for (const ws of this.sockets()) this.send(ws, this.snapshot(ws.deserializeAttachment().seat)); }
    save() { return this.ctx.storage.put('room', this.room); }
    async fetch(request) {
        const url = new URL(request.url), protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(s => s.trim());
        const token = protocols.find(value => /^token\.[a-f0-9]{64}$/.test(value))?.slice(6);
        if (!token || !protocols.includes('halma.v1')) return json({ error: 'invalid_session' }, 401);
        const key = await digest(token);
        if (this.room && Date.now() >= this.room.expiresAt) return json({ error: 'room_expired' }, 410);
        let seat;
        if (!this.room) {
            if (url.searchParams.get('create') !== '1') return json({ error: 'room_not_found' }, 404);
            let state;
            try { state = halma.initial(JSON.parse(url.searchParams.get('options') || '{}')); }
            catch { return json({ error: 'invalid_options' }, 400); }
            this.room = { id: url.pathname.split('/').at(-1), seats: Array(halma.seats(state)).fill(null), state,
                revision: 0, expiresAt: Date.now() + ROOM_TTL };
            seat = 0; this.room.seats[seat] = key;
            await this.ctx.storage.transaction(async storage => {
                await storage.put('room', this.room); await storage.setAlarm(this.room.expiresAt);
            });
        } else {
            seat = this.room.seats.indexOf(key);
            if (seat < 0) {
                if (url.searchParams.get('create') === '1') return json({ error: 'room_exists' }, 409);
                seat = halma.emptySeat(this.room.state, this.room.seats);
                if (seat < 0) return json({ error: 'room_full' }, 403);
                this.room.seats[seat] = key; ++this.room.revision; await this.save();
            }
        }
        for (const ws of this.sockets()) if (ws.deserializeAttachment().seat === seat) ws.close(4001, 'session replaced');
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server); server.serializeAttachment({ seat, key, window: Date.now(), count: 0 });
        this.broadcast();
        return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'halma.v1' } });
    }
    async webSocketMessage(ws, message) {
        if (!this.room || Date.now() >= this.room.expiresAt) { ws.close(4004, 'room expired'); return; }
        if (ws.readyState !== 1) return;
        const session = ws.deserializeAttachment();
        if (!Number.isInteger(session?.seat) || this.room.seats[session.seat] !== session.key) { ws.close(4003, 'invalid session'); return; }
        if (typeof message !== 'string' || message.length > 512) { ws.close(1009, 'message too large'); return; }
        const now = Date.now();
        if (now - session.window >= 10000) { session.window = now; session.count = 0; }
        if (++session.count > 30) { ws.close(4008, 'too many messages'); return; }
        ws.serializeAttachment(session);
        const fail = error => { this.send(ws, { type: 'error', error }); this.send(ws, this.snapshot(session.seat)); };
        let command;
        try { command = JSON.parse(message); } catch { fail('invalid_message'); return; }
        if (!command || typeof command !== 'object' || Array.isArray(command)) { fail('invalid_message'); return; }
        if (command.revision !== this.room.revision && !(Number.isSafeInteger(command.revision) && command.revision >= 0 && command.revision < this.room.revision
            && halma.acceptsStale(this.room.state, command))) { fail('stale_state'); return; }
        try { halma.apply(this.room.state, command, this.view(session.seat)); }
        catch (error) { if (error.expected) { fail(error.message); return; } throw error; }
        ++this.room.revision; await this.save(); this.broadcast();
    }
    webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'closed'); } catch {} this.broadcast(); }
    webSocketError(ws) { try { ws.close(1011, 'connection error'); } catch {} this.broadcast(); }
    async alarm() {
        for (const ws of this.sockets()) ws.close(4004, 'room expired');
        this.room = null; await this.ctx.storage.deleteAll();
    }
}
