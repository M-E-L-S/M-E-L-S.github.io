import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GomokuRoom } from '../src/gomoku-room.js';
import { routeGomoku } from '../src/gomoku-router.js';

globalThis.WebSocketRequestResponsePair = class { constructor(request, response) { this.request = request; this.response = response; } };
function fixture() {
  let stored = { id: 'a'.repeat(20), hostKey: 'black', seats: ['black', 'white'], moves: [], revision: 0, offer: null, expiresAt: Date.now() + 86400000 };
  const ctx = {
    writes: 0, alarmWrites: 0, sockets: [],
    storage: {
      get: async () => structuredClone(stored),
      put: async (_, value) => { stored = structuredClone(value); ++ctx.writes; },
      deleteAll: async () => { stored = null; },
      setAlarm: async () => { ++ctx.alarmWrites; }
    },
    blockConcurrencyWhile: callback => { ctx.ready = callback(); },
    setWebSocketAutoResponse: pair => { ctx.autoResponse = pair; },
    getWebSockets: () => ctx.sockets
  };
  function socket(color, key) {
    let attachment = { color, key, window: Date.now(), count: 0 };
    const ws = { readyState: 1, messages: [], deserializeAttachment: () => structuredClone(attachment),
      serializeAttachment: data => { attachment = structuredClone(data); },
      send: data => ws.messages.push(JSON.parse(data)), close: code => { ws.readyState = 3; ws.code = code; } };
    ctx.sockets.push(ws); return ws;
  }
  const black = socket(1, 'black'), white = socket(2, 'white');
  const object = async () => { const room = new GomokuRoom(ctx, {}); await ctx.ready; return room; };
  return { ctx, black, white, object };
}
const command = (room, ws, body) => room.webSocketMessage(ws, JSON.stringify({ revision: room.room.revision, ...body }));

test('authoritative moves, stale/double moves, out-of-turn, forged seat, bounds and terminal game', async () => {
  const { ctx, black, white, object } = fixture();
  const room = await object();
  await command(room, white, { type: 'move', move: [0,0] });
  assert.equal(ctx.writes, 0);
  await command(room, black, { type: 'move', move: [2**32+7,7] });
  assert.equal(ctx.writes, 0);
  for (let i = 0; i < 5; ++i) {
    await command(room, black, { type: 'move', move: [i,0] });
    if (i < 4) await command(room, white, { type: 'move', move: [10 + i%2, 10 + Math.floor(i/2)] });
  }
  assert.equal(room.snapshot(1).outcome, 1);
  const writes = ctx.writes;
  await command(room, white, { type: 'move', move: [8,8] });
  await room.webSocketMessage(black, JSON.stringify({ type:'move', revision:0, move:[8,8] }));
  assert.equal(ctx.writes, writes);
  white.serializeAttachment({ color: 1, key: 'wrong' });
  await command(room, white, { type: 'move', move: [8,8] });
  assert.equal(white.code, 4003);
  assert.equal(ctx.alarmWrites, 0);
});

test('undo/restart require peer consent, requester can cancel, accepted undo returns to requester turn', async () => {
  const { black, white, object } = fixture();
  const room = await object();
  await command(room, black, { type:'move', move:[7,7] });
  await command(room, white, { type:'move', move:[6,7] });
  await command(room, black, { type:'offer', kind:'undo' });
  await command(room, black, { type:'respond', accept:true });
  assert.equal(room.room.moves.length, 2);
  await command(room, white, { type:'move', move:[8,7] });
  assert.equal(room.room.moves.length, 2);
  await command(room, white, { type:'respond', accept:true });
  assert.equal(room.room.moves.length, 0);
  await command(room, black, { type:'move', move:[7,7] });
  await command(room, white, { type:'offer', kind:'restart' });
  await command(room, white, { type:'respond', accept:false });
  assert.equal(room.room.offer, null);
  assert.equal(room.room.moves.length, 1);
  await command(room, white, { type:'offer', kind:'restart' });
  await command(room, black, { type:'respond', accept:true });
  assert.equal(room.room.moves.length, 0);
});

test('reconstructed DO restores board/offer and socket identity after hibernation without rearming cleanup', async () => {
  const { ctx, black, white, object } = fixture();
  let room = await object();
  await command(room, black, { type:'move', move:[7,7] });
  await command(room, white, { type:'offer', kind:'restart' });
  room = await object(); // Lose all instance memory, retain only DB and attachments.
  assert.equal(ctx.autoResponse.request, 'ping');
  assert.equal(ctx.autoResponse.response, 'pong');
  assert.equal(room.snapshot(2).moves.length, 1);
  assert.equal(room.snapshot(2).offer.by, 2);
  await command(room, black, { type:'respond', accept:false });
  await command(room, white, { type:'move', move:[6,7] });
  assert.equal(room.room.moves.length, 2);
  assert.equal(ctx.alarmWrites, 0);
  white.readyState = 3;
  room.webSocketClose(white, 1000);
  await command(room, black, { type:'move', move:[8,8] });
  assert.equal(room.room.moves.length, 2);
  await room.alarm();
  assert.equal(black.code, 4004);
  assert.equal(await ctx.storage.get(), null);
  assert.equal(ctx.alarmWrites, 0);
});

test('malformed/oversized messages and rapid spam are bounded without writing storage', async () => {
  const { ctx, black, white, object } = fixture();
  const room = await object();
  await room.webSocketMessage(black, '{');
  await room.webSocketMessage(black, 'null');
  for (let i=0;i<30;++i) await command(room, black, { type:'unsupported' });
  assert.equal(black.code, 4008);
  await room.webSocketMessage(white, 'x'.repeat(513));
  assert.equal(white.code, 1009);
  assert.equal(ctx.writes, 0);
});

test('host may change colors before a guest joins; seat identity and authority survive hibernation', async () => {
  const { black, white, object } = fixture();
  let room = await object();
  room.room.seats[1] = null; white.readyState = 3;
  await command(room, black, {type:'color',hostColor:2});
  assert.deepEqual(room.room.seats,[null,'black']);
  assert.equal(black.deserializeAttachment().color,2);
  assert.equal(room.snapshot(2).isHost,true);
  room = await object();
  assert.equal(room.snapshot(2).hostColor,2);
});

test('host color change requires peer consent after joining, updates both sockets and survives reconnect metadata', async () => {
  const { black, white, object } = fixture();
  const room = await object();
  await command(room, white, {type:'offer',kind:'restart',hostColor:2});
  assert.equal(room.room.offer,null);
  await command(room, black, {type:'color',hostColor:2});
  assert.equal(room.snapshot(1).hostColor,1);
  await command(room, black, {type:'move',move:[7,7]});
  await command(room, black, {type:'offer',kind:'restart',hostColor:2});
  await command(room, white, {type:'respond',accept:false});
  assert.equal(room.room.moves.length,1); assert.equal(room.snapshot(1).hostColor,1);
  await command(room, black, {type:'offer',kind:'restart',hostColor:2});
  await command(room, white, {type:'respond',accept:true});
  assert.deepEqual(room.room.seats,['white','black']);
  assert.equal(black.deserializeAttachment().color,2); assert.equal(white.deserializeAttachment().color,1);
  assert.equal(room.snapshot(2).isHost,true); assert.equal(room.snapshot(1).isHost,false);
  assert.equal(room.room.moves.length,0);
  await command(room, white, {type:'move',move:[7,7]});
  assert.equal(room.room.moves.length,1);
});

test('gateway rejects external/missing origins and limits requests before touching the DO', async () => {
  let calls = 0;
  const env = { GOMOKU_ROOMS: { idFromName: id=>id, get: ()=>({ fetch:async()=>{ ++calls; return new Response('ok'); } }) },
    GOMOKU_CONNECT_LIMITER: { limit:async()=>({ success:true }) } };
  const req = (origin, base='https://mels-api.workers.dev') => new Request(`${base}/api/gomoku/rooms/${'a'.repeat(20)}`, { headers: { ...(origin ? {Origin:origin}:{}), Upgrade:'websocket' } });
  assert.equal((await routeGomoku(req('https://evil.example'),env)).status,403);
  assert.equal((await routeGomoku(req(null),env)).status,403);
  assert.equal((await routeGomoku(req('http://localhost:12001'),env)).status,403);
  assert.equal(calls,0);
  assert.equal((await routeGomoku(req('http://localhost:12001','http://127.0.0.1:8787'),env)).status,200);
  env.GOMOKU_CONNECT_LIMITER.limit = async()=>({success:false});
  assert.equal((await routeGomoku(req('https://m-e-l-s.github.io'),env)).status,429);
  assert.equal(calls,1);
});
