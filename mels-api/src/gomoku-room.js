import { GomokuGame } from '../../src/scripts/gomoku-model.js';

export const ROOM_TTL = 24 * 60 * 60 * 1000;
const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('');

// Plain DO class keeps rule tests runnable in Node; ctx is DurableObjectState.
export class GomokuRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get('room') || null; });
  }
  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
  presence() {
    const online = [false, false];
    for (const ws of this.sockets()) online[ws.deserializeAttachment().color - 1] = true;
    return online;
  }
  board(human = 1) {
    const game = new GomokuGame(human);
    for (const move of this.room.moves) if (!game.play(move)) throw new Error('Invalid stored game');
    return game;
  }
  snapshot(color) {
    const game = this.board();
    return { type: 'state', room: this.room.id, revision: this.room.revision, moves: this.room.moves,
      outcome: game.outcome, winningLine: game.winningLine, you: color, players: this.presence(),
      joined: this.room.seats.map(Boolean), offer: this.room.offer, expiresAt: this.room.expiresAt,
      isHost: !!this.room.hostKey && this.room.seats[color - 1] === this.room.hostKey,
      hostColor: this.room.hostKey ? this.room.seats.indexOf(this.room.hostKey) + 1 : null };
  }
  changeHostColor(color) {
    if (this.room.seats.indexOf(this.room.hostKey) + 1 === color) return;
    this.room.seats.reverse();
    for (const socket of this.sockets()) {
      const attachment = socket.deserializeAttachment();
      attachment.color = this.room.seats.indexOf(attachment.key) + 1;
      socket.serializeAttachment(attachment);
    }
  }
  send(ws, body) { try { ws.send(JSON.stringify(body)); } catch { try { ws.close(1011, 'send failed'); } catch {} } }
  broadcast() {
    if (!this.room) return;
    for (const ws of this.sockets()) this.send(ws, this.snapshot(ws.deserializeAttachment().color));
  }
  async save() { await this.ctx.storage.put('room', this.room); }
  async fetch(request) {
    const url = new URL(request.url);
    const protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(s => s.trim());
    const token = protocols.find(p => /^token\.[a-f0-9]{64}$/.test(p))?.slice(6);
    if (!token || !protocols.includes('gomoku.v1')) return json({ error: 'invalid_session' }, 401);
    const key = await digest(token);
    // No await between reading the room and starting its storage write (DO input gates).
    if (this.room && Date.now() >= this.room.expiresAt) return json({ error: 'room_expired' }, 410);
    let color;
    if (!this.room) {
      if (url.searchParams.get('create') !== '1') return json({ error: 'room_not_found' }, 404);
      color = url.searchParams.get('color') === '2' ? 2 : 1;
      this.room = { id: url.pathname.split('/').at(-1), hostKey: key, seats: [null, null], moves: [], revision: 0,
        offer: null, expiresAt: Date.now() + ROOM_TTL };
      this.room.seats[color - 1] = key;
      // Atomically install cleanup with the room, even if creation is interrupted.
      await this.ctx.storage.transaction(async storage => {
        await storage.put('room', this.room);
        await storage.setAlarm(this.room.expiresAt);
      });
    } else {
      const seat = this.room.seats.indexOf(key);
      if (seat !== -1) color = seat + 1;
      else {
        if (url.searchParams.get('create') === '1') return json({ error: 'room_exists' }, 409);
        const empty = this.room.seats.indexOf(null);
        if (empty === -1) return json({ error: 'room_full' }, 403);
        color = empty + 1;
        this.room.seats[empty] = key;
        ++this.room.revision;
        await this.save();
      }
    }
    // Same credential may reconnect, but cannot control two active sockets.
    for (const ws of this.sockets()) if (ws.deserializeAttachment().color === color) ws.close(4001, 'session replaced');
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ color, key, window: Date.now(), count: 0 });
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'gomoku.v1' } });
  }
  async webSocketMessage(ws, message) {
    if (!this.room || Date.now() >= this.room.expiresAt) { ws.close(4004, 'room expired'); return; }
    const session = ws.deserializeAttachment();
    if (ws.readyState !== 1) return;
    if (this.room.seats[session?.color - 1] !== session?.key) { ws.close(4003, 'invalid session'); return; }
    if (typeof message !== 'string' || message.length > 512) { ws.close(1009, 'message too large'); return; }
    const now = Date.now();
    if (now - session.window >= 10000) { session.window = now; session.count = 0; }
    if (++session.count > 30) { ws.close(4008, 'too many messages'); return; }
    ws.serializeAttachment(session); // Rate state survives hibernation; no DB write.
    let data;
    try { data = JSON.parse(message); } catch { this.send(ws, { type: 'error', error: 'invalid_message' }); return; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) { this.send(ws, { type: 'error', error: 'invalid_message' }); return; }
    const fail = error => { this.send(ws, { type: 'error', error }); this.send(ws, this.snapshot(session.color)); };
    if (data.revision !== this.room.revision) { fail('stale_state'); return; }
    if (data.type === 'color') {
      if (session.key !== this.room.hostKey || ![1, 2].includes(data.hostColor)) { fail('host_only'); return; }
      if (this.room.moves.length || this.room.seats.every(Boolean)) { fail('restart_required'); return; }
      this.changeHostColor(data.hostColor);
      ++this.room.revision;
      await this.save(); this.broadcast(); return;
    }
    if (!this.presence().every(Boolean)) { fail('opponent_offline'); return; }
    const game = this.board(session.color);
    if (data.type === 'move') {
      if (this.room.offer) { fail('offer_pending'); return; }
      if (game.turn !== session.color || !game.play(data.move)) { fail('illegal_move'); return; }
      this.room.moves = game.moves;
    } else if (data.type === 'offer') {
      if (this.room.offer) { fail('offer_pending'); return; }
      if (!['undo', 'restart'].includes(data.kind)) { fail('invalid_message'); return; }
      if (data.kind === 'undo' && !game.canUndo) { fail('nothing_to_undo'); return; }
      if (data.hostColor !== undefined && (data.kind !== 'restart' || session.key !== this.room.hostKey || ![1, 2].includes(data.hostColor))) { fail('host_only'); return; }
      this.room.offer = { kind: data.kind, by: session.color };
      if (data.kind === 'restart' && this.room.hostKey) this.room.offer.hostColor = data.hostColor ?? this.room.seats.indexOf(this.room.hostKey) + 1;
    } else if (data.type === 'respond') {
      const offer = this.room.offer;
      if (!offer || typeof data.accept !== 'boolean' || data.accept && offer.by === session.color) { fail('invalid_offer'); return; }
      if (data.accept) {
        if (offer.kind === 'restart') {
          this.room.moves = [];
          if (offer.hostColor) this.changeHostColor(offer.hostColor);
        }
        else { const previous = this.board(offer.by); previous.undo(); this.room.moves = previous.moves; }
      }
      this.room.offer = null;
    } else { fail('invalid_message'); return; }
    ++this.room.revision;
    await this.save();
    this.broadcast();
  }
  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'closed'); } catch {}
    // A disconnect pauses the game. Its seat/credential remains reserved to TTL.
    this.broadcast();
  }
  webSocketError(ws) { try { ws.close(1011, 'connection error'); } catch {} this.broadcast(); }
  async alarm() {
    if (!this.room) return;
    for (const ws of this.sockets()) ws.close(4004, 'room expired');
    this.room = null;
    await this.ctx.storage.deleteAll();
  }
}
