// Run against `npm run dev`; ws is already installed with Wrangler.
import WebSocket from 'ws';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'ws://127.0.0.1:8780';
const room = randomBytes(10).toString('hex');
const token1 = randomBytes(32).toString('hex'), token2 = randomBytes(32).toString('hex');
const sockets = [];
function client(token, create = false, origin = 'http://127.0.0.1:12001') {
  const ws = new WebSocket(`${base}/api/gomoku/rooms/${room}${create ? '?create=1&color=2' : ''}`, ['gomoku.v1', 'token.' + token], { origin });
  sockets.push(ws);
  const messages = [], waiters = [];
  let latest;
  ws.on('message', value => {
    const text = String(value);
    const data = text === 'pong' ? text : JSON.parse(text);
    messages.push(data);
    if (data.type === 'state') latest = data;
    for (const waiter of [...waiters]) if (waiter.predicate(data)) { clearTimeout(waiter.timer); waiters.splice(waiters.indexOf(waiter),1); waiter.resolve(data); }
  });
  // Explicitly retain errors so rejected handshakes do not crash the process.
  let failure;
  ws.on('error', error => { failure = error; });
  return {
    ws, messages,
    get state() { return latest; },
    wait(predicate) {
      const existing = messages.findLast(predicate);
      if (existing !== undefined) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer:setTimeout(()=>reject(failure || new Error('WebSocket response timeout')),5000) };
        waiters.push(waiter);
      });
    },
    async action(type, fields = {}) {
      const revision = latest.revision;
      ws.send(JSON.stringify({ type, revision, ...fields }));
      return this.wait(data => data.type === 'state' && data.revision > revision);
    }
  };
}
try {
  const host = client(token1, true);
  await host.wait(data => data.type === 'state');
  assert.equal(host.state.you, 2, 'creator chooses white');
  const guest = client(token2);
  await guest.wait(data => data.type === 'state');
  await host.wait(data => data.type === 'state' && data.joined.every(Boolean));
  assert.equal(guest.state.you, 1);
  await guest.action('move', {move:[7,7]});
  await host.wait(data => data.type === 'state' && data.moves.length === 1);
  host.ws.send(JSON.stringify({type:'move',revision:0,move:[6,7]}));
  await host.wait(data => data.type === 'error' && data.error === 'stale_state');
  await host.action('move', {move:[6,7]});
  await guest.wait(data => data.type === 'state' && data.moves.length === 2);
  await guest.action('offer', {kind:'undo'});
  await host.wait(data => data.type === 'state' && data.offer?.kind === 'undo');
  await host.action('respond', {accept:true});
  assert.equal(host.state.moves.length,0);
  host.ws.send('ping'); await host.wait(data => data === 'pong');
  await guest.action('move', {move:[7,7]});
  await host.wait(data => data.type === 'state' && data.moves.length === 1);
  const closed = new Promise(resolve=>host.ws.once('close',resolve));
  host.ws.close(); await closed;
  await guest.wait(data => data.type === 'state' && !data.players[1]);
  guest.ws.send(JSON.stringify({type:'move',revision:guest.state.revision,move:[8,8]}));
  await guest.wait(data => data.type === 'error' && data.error === 'opponent_offline');
  const resumed = client(token1);
  await resumed.wait(data => data.type === 'state');
  assert.equal(resumed.state.you,2); assert.equal(resumed.state.moves.length,1);
  await resumed.action('move',{move:[6,7]});
  await guest.wait(data => data.type === 'state' && data.moves.length === 2);
  await resumed.action('offer',{kind:'restart'});
  await guest.wait(data => data.type === 'state' && data.offer?.kind === 'restart');
  await guest.action('respond',{accept:true});
  assert.equal(guest.state.moves.length,0);
  await resumed.wait(data=>data.type==='state' && data.moves.length===0);
  await resumed.action('offer',{kind:'restart',hostColor:1});
  await guest.wait(data=>data.type==='state' && data.offer?.hostColor===1);
  await guest.action('respond',{accept:true});
  assert.equal(guest.state.you,2);
  await resumed.wait(data=>data.type==='state' && data.you===1);
  assert.equal(resumed.state.isHost,true);
  const full = client(randomBytes(32).toString('hex'));
  await new Promise(resolve=>full.ws.once('error',resolve));
  const replaced = new Promise(resolve=>resumed.ws.once('close',code=>resolve(code)));
  const replacement = client(token1);
  await replacement.wait(data => data.type === 'state');
  assert.equal(replacement.state.you,1);
  assert.equal(await replaced,4001);
  console.log('PASS real Workers runtime: 2 seats, chosen colors, moves, stale revisions, negotiated undo/restart/color swap, automatic ping, disconnect pause, credential resume after swap, full room and duplicate-session replacement');
} finally {
  for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.close(); else if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
}
