import {names, label} from './game.js';
import {handLayout, projectDiscard, latestDiscard, meldLayout, visibleRiver, automaticAction, discardTransitions, winningHandLayout} from './presentation.js';
import {playSound, unlockAudio, toggleAudio} from './sound.js';
import {attachTileRenderer} from './tile-renderer.js';

const $ = id => document.getElementById(id);
const winds = ['东', '南', '西', '北'];
const tileFiles = Array.from({length:34}, (_, t) => t < 27
  ? ['Man', 'Pin', 'Sou'][Math.floor(t/9)] + (t%9+1)
  : ['Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'][t-27]);
const number = n => n > 0 ? `+${n}` : String(n);
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let worker, state, busy = true, selected = null, timer, resultTimer;
const effectTimers = new Map();
const tools = {sort:true, win:false, noCall:false, cut:false};
let touchInput = !matchMedia('(hover: hover) and (pointer: fine)').matches;
let hoveredTile = null, choosingChi = false;
let dealRound = null, dealing = false, dealTimer, scoreFrame, scoreTimer;
const scoreKey = 'alphamah.scores.v1';
function savedScores() {
  try { const v = JSON.parse(localStorage.getItem(scoreKey)); return Array.isArray(v) && v.length === 4 && v.every(Number.isSafeInteger) ? v : null; } catch { return null; }
}
const audioButton = $('audio-toggle');
audioButton.onclick = () => audioButton.setAttribute('aria-pressed', String(toggleAudio()));
function unlockOnGesture(event) {
  if (!audioButton.contains(event.target)) unlockAudio();
}
document.addEventListener('pointerdown', unlockOnGesture, {once:true});
document.addEventListener('keydown', unlockOnGesture, {once:true});
let lastResult = 0, pendingAction = null, previousState = null, lastDiscard = null;
let renderedState = null, tileMotion, handRound = null, handDrawKey = null;

function fitScene() {
  const scale = Math.min(innerWidth / 1600, innerHeight / 900);
  const width = 1600, height = 900;
  const stage = $('stage');
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.setProperty('--stage-scale', scale);
  stage.style.setProperty('--board-y', `${Math.round(height * .39)}px`);
  if (state) renderHand(displayedState());
}
addEventListener('resize', fitScene);
fitScene();
attachTileRenderer($('stage'), $('table-world')).then(controller => { tileMotion = controller; });

function tile(t, {button = false, index = null, extra = '', disabled = false} = {}) {
  const back = t === null, tag = button ? 'button' : 'span';
  const name = back ? '暗牌' : label(t);
  return `<${tag} class="tile ${back ? 'back' : ''} ${extra}" ${back ? '' : `data-tile="${t}"`} ${button ? `type="button" data-index="${index}" aria-label="${name}" aria-pressed="${!disabled && index === selected}" ${disabled ? 'disabled' : ''}` : `role="img" aria-label="${name}"`} title="${name}"><img draggable="false" src="./assets/tiles/${back ? 'Back' : tileFiles[t]}.svg" alt=""></${tag}>`;
}

function meld(m, player = 0) {
  const {faces, sideways, addedTile} = meldLayout(m, player);
  const tiles = faces.map((t, i) => {
    const rotated = i === sideways;
    const stacked = rotated && addedTile !== null;
    return `<span class="meld-tile${rotated ? ' sideways' : ''}${stacked ? ' stacked' : ''}">${tile(t)}${stacked ? tile(addedTile) : ''}</span>`;
  }).join('');
  return `<span class="meld" aria-label="${({chi:'吃',pon:'碰',kan:'明杠',ankan:'暗杠',kakan:'加杠'})[m.kind]}">${tiles}</span>`;
}

function send(action) {
  if (busy) return;
  busy = true;
  pendingAction = action;
  clearTimeout(timer);
  render();
  worker.postMessage(action);
}

function start() {
  worker = new Worker(new URL('./worker.js', import.meta.url), {type:'module'});
  worker.onmessage = ({data}) => {
    if (data.error) { fail(data.error); return; }
    previousState = state;
    state = data.state;
    if(previousState && previousState.round===state.round && state.wall<previousState.wall)playSound('draw');
    choosingChi = false;
    try { localStorage.setItem(scoreKey, JSON.stringify(state.scores)); } catch {}
    lastDiscard = latestDiscard(previousState, state, lastDiscard);
    busy = false;
    selected = null;
    hoveredTile = null;
    pendingAction = null;
    render();
    announceCall();
  };
  worker.onerror = () => fail('牌桌加载失败，请刷新重试');
  worker.postMessage({kind:'init', scores:savedScores()});
}

function fail(message) {
  busy = false;
  pendingAction = null;
  $('error').hidden = false;
  $('error').textContent = message;
  if (state) render();
}

// Show a human discard immediately while the engine arbitrates the public responses.
// This is a visual projection only; the worker owns every authoritative game change.
function displayedState() {
  return projectDiscard(state, pendingAction, selected);
}

function renderPlayers(s) {
  $('table-world').classList.remove('revealed');
  for (let p = 0; p < 4; p++) {
    const wind = winds[(p - s.dealer + 4) % 4];
    const active = s.phase === 'turn' && s.turn === p;
    const player = $('seat-' + p);
    const markup = `<div class="player-avatar"><span>${wind}</span>${s.dealer === p ? '<b class="dealer-label">庄</b>' : ''}</div><div class="player-name">${names[p]}</div><div class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></div>`;
    if (player.dataset.wind !== wind) player.innerHTML = markup;
    player.dataset.wind = wind;
    player.classList.toggle('active', active);
    player.classList.toggle('thinking', active && p !== 0 && busy);
    $('wind-' + p).textContent = wind;
    $('wind-' + p).classList.toggle('active', active || (s.phase === 'response' && p === 0));
    $('score-' + p).textContent = number(s.scores[p]);
    $('score-' + p).classList.toggle('active', active);
    if (p === 0) continue;
    const winner = s.phase === 'over' && s.result?.winners?.some(w => w.player === p);
    const hand = $('concealed-' + p), melds = $('melds-' + p);
    hand.classList.toggle('winner-revealed', !!winner);
    const h = winner ? s.players[p].hand : Array(s.players[p].count).fill(null);
    const concealed = h.map((t, i) => tile(t, {extra:active && s.players[p].hasDrawn && i === h.length - 1 ? 'drawn' : ''})).join('');
    if (hand.innerHTML !== concealed) hand.innerHTML = concealed;
    const declared = s.players[p].melds.map(m => meld(m, p)).join('');
    if (melds.innerHTML !== declared) melds.innerHTML = declared;
    const meldWidth = melds.offsetWidth;
    const clearance = meldWidth ? meldWidth + hand.offsetWidth / 2 + 16 : 0;
    hand.parentElement.style.setProperty('--meld-clearance', `${clearance}px`);
  }
}

function renderRivers(s, transitions) {
  const freshKeys = new Set(transitions.map(t => t.key));
  const maxRows = Math.max(1, ...s.players.map(p => Math.ceil(visibleRiver(p.river).length / 6)));
  const width = Math.min(46, Math.floor((260 / maxRows - 5) / 1.32));
  $('stage').style.setProperty('--river-tile', `${width}px`);
  for (let p = 0; p < 4; p++) {
    const rs = s.players[p].river;
    $('river-' + p).innerHTML = visibleRiver(rs).map(r => {
      const i = r.index;
      const latest = s.pending ? s.pending.source === p && i === rs.length - 1
        : lastDiscard?.player === p && lastDiscard.index === i;
      const key = `${s.round}:${p}:${i}`;
      return `<span class="river-cell ${latest ? 'latest' : ''} ${freshKeys.has(key) ? 'just-discarded' : ''}" data-river-index="${i}" data-motion-key="${key}">${tile(r.tile)}</span>`;
    }).join('');
  }
}

function renderHand(s) {
  const oldTiles = [...$('hand').querySelectorAll('button')].map(el => ({
    tile:Number(el.dataset.tile), index:Number(el.dataset.index), rect:el.getBoundingClientRect()
  })).sort((a,b) => a.index - b.index);
  const can = s.phase === 'turn' && s.turn === 0 && !busy && !dealing;
  const hand = s.players[0].hand;
  const {order, drawn:drawIndex} = handLayout(s, tools.sort && !dealing);
  const drawKey = `${s.round}:${s.wall}:${s.lastDraw}`;
  const newDraw = handDrawKey !== drawKey && previousState && state !== previousState
    && (previousState.lastDraw !== s.lastDraw || previousState.wall !== s.wall);
  if (!busy) handDrawKey = drawKey;
  $('hand').innerHTML = order.map(i => tile(hand[i], {
    button:true, index:i, disabled:!can,
    extra:[can && i === selected ? 'selected' : '', i === drawIndex ? 'drawn' : '', i === drawIndex && newDraw && !busy ? 'draw-enter' : '', ''].join(' ')
  })).join('');
  $('own-melds').innerHTML = s.players[0].melds.map(m => meld(m)).join('');
  $('own-melds').classList.toggle('multiple', s.players[0].melds.length > 2);
  const dock = document.querySelector('.hand-dock');
  const available = dock.clientWidth - 23 - hand.length * 3;
  dock.style.setProperty('--hand-tile', `${Math.max(40, Math.min(76, Math.floor(available / Math.max(1, hand.length))))}px`);
  $('hand-count').textContent = `${hand.length} 张`;
  // Close the gap gently, and continue from the current position if an engine
  // acknowledgement replaces these elements before their movement has ended.
  if (handRound === s.round && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const removed = pendingAction?.kind === 'discard' && oldTiles.length === hand.length + 1
      ? oldTiles.find(t => t.index === selected && t.tile === pendingAction.tile)
        || oldTiles.find(t => t.tile === pendingAction.tile) : null;
    const remaining = oldTiles.filter(t => t !== removed);
    const scale = $('stage').getBoundingClientRect().width / $('stage').clientWidth;
    for (const el of $('hand').querySelectorAll('button')) {
      const i = remaining.findIndex(t => t.tile === Number(el.dataset.tile));
      if (i < 0) continue;
      const old = remaining.splice(i, 1)[0], next = el.getBoundingClientRect();
      const dx = (old.rect.x - next.x) / scale, dy = (old.rect.y - next.y) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 1) el.animate([
        {translate:`${dx}px ${dy}px`}, {translate:'0 0'}
      ], {duration:220, easing:'cubic-bezier(.22,.7,.25,1)'});
    }
  }
  handRound = s.round;
}

function renderHints(s = displayedState()) {
  if (!s) return;
  const candidate = hoveredTile ?? (selected === null ? null : s.players[0].hand[selected]);
  const discard = s.phase === 'turn' && s.turn === 0 && !busy
    ? s.hints?.discards.find(d => d.tile === candidate) : null;
  const waits = discard?.waits || [];
  $('wait-hint').hidden = !waits.length || s.phase === 'over';
  if (!waits.length) return;
  const remaining = waits.reduce((sum, w) => sum + w.remaining, 0);
  $('wait-hint').innerHTML = `<div class="wait-heading"><strong>${discard ? `打 ${label(discard.tile)} · 听` : '听牌'}</strong><span>余 ${remaining} 张</span></div><div class="wait-tiles">${waits.map(w => `<span class="wait-tile ${w.remaining ? '' : 'dead-wait'}">${tile(w.tile)}<small>${w.remaining}</small></span>`).join('')}</div>`;
  $('wait-hint').title = '剩余张数按手牌与公开牌计算';
}

function renderActions(s) {
  const own = s.phase === 'turn' && s.turn === 0;
  $('discard').hidden = !own || !touchInput;
  $('discard').disabled = busy || selected === null;
  $('help').textContent = own && !busy ? touchInput ? '选牌后出牌 · 双击直接出牌' : '点击出牌' : '';
  $('options').replaceChildren();
  const chis = s.options.filter(o => o.kind === 'chi');
  if (choosingChi && !chis.length) choosingChi = false;
  const shownOptions = choosingChi ? chis : s.options.filter(o => o.kind !== 'chi' || o === chis[0]);
  for (const option of shownOptions) {
    if (tools.noCall && ['chi','pon','kan'].includes(option.kind)) continue;
    const button = document.createElement('button');
    const win = ['win','ron'].includes(option.kind), pass = option.kind === 'pass';
    button.className = `response-button action-${option.kind} ${win ? 'win' : ''} ${pass ? 'pass' : ''}`;
    const title = {chi:'吃',pon:'碰',kan:'杠',ankan:'暗杠',kakan:'加杠',ron:'胡',win:'自摸',pass:'跳过'}[option.kind];
    button.setAttribute('aria-label', option.label);
    let preview = [];
    if (option.kind === 'chi' && choosingChi) preview = [option.start, option.start + 1, option.start + 2].filter(t => t !== s.pending.tile);
    if (option.kind === 'ankan') preview = Array(4).fill(option.tile);
    if (option.kind === 'kakan') preview = Array(4).fill(s.players[0].melds[option.index].tile);
    button.innerHTML = `<span>${choosingChi ? '' : title}</span>${preview.length ? `<span class="option-tiles">${preview.map(t => tile(t)).join('')}</span>` : ''}`;
    button.disabled = busy;
    button.onclick = () => { playSound('click'); if (option.kind === 'chi' && !choosingChi && chis.length > 1) {choosingChi = true;renderActions(s);} else send(option); };
    $('options').append(button);
  }
  $('offered-tile').replaceChildren();
  $('options').classList.toggle('chi-choices', choosingChi);
  if (choosingChi) {
    const back = document.createElement('button');back.className='chi-back';back.textContent='返回';
    back.onclick=()=>{choosingChi=false;renderActions(s);};$('options').append(back);
  }
  document.querySelectorAll('.river-cell.responding').forEach(el=>el.classList.remove('responding'));
  if (s.phase === 'response' && s.pending) $('river-' + s.pending.source).lastElementChild?.classList.add('responding');
  let prompt;
  if (s.phase === 'over') prompt = '本局结束';
  else if (s.phase === 'resolving') prompt = '等待其他玩家响应';
  else if (s.phase === 'response') prompt = `${names[s.pending.source]}打出 ${label(s.pending.tile)}`;
  else if (own) prompt = busy ? '正在计算…' : '轮到你出牌';
  else prompt = `${names[s.turn]}${busy ? '思考中…' : '的回合'}`;
  $('status').textContent = prompt;
  $('turn-prompt').classList.toggle('own-turn', own && !busy);
  $('turn-prompt').classList.toggle('thinking', busy);
}

function render() {
  if (!state) return;
  const s = displayedState();
  const firstDeal = dealRound !== s.round && s.phase !== 'over';
  if (firstDeal) {
    playSound('deal');
    dealRound = s.round; dealing = true; clearTimeout(dealTimer);
    for (const key of ['win','noCall','cut']) {tools[key]=false;$('tool-'+key).setAttribute('aria-pressed','false');}
  }
  const transitions = discardTransitions(renderedState, s);
  if (transitions.length) playSound('discard');
  tileMotion?.prepare(transitions, {round:s.round, ownIndex:selected});
  $('round').textContent = `第 ${s.round} 局`;
  $('center-round').textContent = `第 ${s.round} 局`;
  $('wall').textContent = s.wall;
  renderPlayers(s); renderRivers(s, transitions); renderHand(s); renderActions(s); renderHints(s);
  renderedState = s;
  if (firstDeal) {
    const rows = [$('hand'), ...[1,2,3].map(p=>$('concealed-'+p))];
    for (const row of rows) [...row.querySelectorAll('.tile')].forEach((el,i)=>{
      el.style.setProperty('--deal-delay', `${Math.floor(i / 4) * 230}ms`);el.classList.add('deal-tile');
    });
    $('table-world').classList.add('dealing');
    dealTimer=setTimeout(()=>{dealing=false;$('table-world').classList.remove('dealing');render();},1150);
  }
  if (s.phase === 'over' && lastResult !== s.round) {
    playSound('win');
    lastResult = s.round;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(showResult, 1800);
  }
  clearTimeout(timer);
  if (!busy && !dealing) {
    const action = automaticAction(s, tools);
    if (action) timer = setTimeout(() => send(action), 350);
    else if (s.phase === 'turn' && s.turn !== 0) timer = setTimeout(() => send({kind:'step'}), 250);
  }
}

function selectTile(button) {
  selected = Number(button.dataset.index);
  for (const b of $('hand').querySelectorAll('button')) {
    const active = Number(b.dataset.index) === selected;
    b.classList.toggle('selected', active);
    b.setAttribute('aria-pressed', String(active));
  }
  $('discard').disabled = false;
  renderHints();
}
$('hand').addEventListener('pointerdown', event => {
  touchInput = event.pointerType === 'touch' || event.pointerType === 'pen';
  if (state) renderActions(displayedState());
});
$('hand').addEventListener('click', event => {
  const button = event.target.closest('button[data-index]');
  if (button && !button.disabled) {
    selectTile(button);
    if (!touchInput) send({kind:'discard', tile:Number(button.dataset.tile)});
  }
});
$('hand').addEventListener('dblclick', event => {
  const button = event.target.closest('button[data-index]');
  if (touchInput && button && !button.disabled) send({kind:'discard', tile:Number(button.dataset.tile)});
});
$('hand').addEventListener('keydown', event => {
  const button = event.target.closest('button[data-index]');
  if (!button || button.disabled) return;
  const buttons = [...$('hand').querySelectorAll('button')], i = buttons.indexOf(button);
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const next = buttons[(i + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    selectTile(next); next.focus();
  } else if (event.key === 'Enter' && selected === Number(button.dataset.index)) {
    event.preventDefault(); send({kind:'discard', tile:Number(button.dataset.tile)});
  }
});

// Like a physical table, matching visible faces help the eye follow a tile across the rivers.
function highlight(t) {
  for (const el of document.querySelectorAll('.tile[data-tile]')) el.classList.toggle('tile-match', t !== null && el.dataset.tile === t);
}
$('stage').addEventListener('pointerover', event => {
  const face = event.target.closest('.tile[data-tile]');
  if (face) highlight(face.dataset.tile);
  const handTile = event.target.closest('#hand button[data-tile]');
  if (handTile) { hoveredTile = Number(handTile.dataset.tile); renderHints(); }
});
$('stage').addEventListener('pointerout', event => {
  if (event.target.closest('.tile[data-tile]') && !event.relatedTarget?.closest?.('.tile[data-tile]')) highlight(null);
  if (event.target.closest('#hand button') && !event.relatedTarget?.closest?.('#hand button')) { hoveredTile = null; renderHints(); }
});
$('hand').addEventListener('focusin', event => {
  if (event.target.dataset.tile) { highlight(event.target.dataset.tile); hoveredTile = Number(event.target.dataset.tile); renderHints(); }
});
$('hand').addEventListener('focusout', () => { highlight(null); hoveredTile = null; renderHints(); });

for (const key of Object.keys(tools)) $('tool-' + key).onclick = () => {
  tools[key] = !tools[key];
  $('tool-' + key).setAttribute('aria-pressed', String(tools[key]));
  render();
};

function announceCall() {
  if (!previousState || previousState.round !== state.round) return;
  const calls = [];
  for (let p = 0; p < 4; p++) {
    const before = previousState.players[p].melds, after = state.players[p].melds;
    if (after.length > before.length) calls.push([p, {chi:'吃',pon:'碰',kan:'杠',ankan:'杠'}[after.at(-1).kind] || '']);
    else if (after.some((m, i) => m.kind === 'kakan' && before[i]?.kind === 'pon')) calls.push([p, '杠']);
  }
  if (state.phase === 'over' && state.result.type === 'win')
    for (const winner of state.result.winners) calls.push([winner.player, state.result.source === -1 ? '自摸' : '胡']);
  if (calls.length && state.phase !== 'over') playSound('call');
  for (const [p, text] of calls) {
    clearTimeout(effectTimers.get(p));
    const effect = $('call-effect-' + p); effect.classList.remove('show');
    effect.textContent = text;
    requestAnimationFrame(() => effect.classList.add('show'));
    effectTimers.set(p, setTimeout(() => effect.classList.remove('show'), 1150));
  }
}

function showResult() {
  if (state.phase !== 'over') return;
  const r = state.result;
  $('result-round').textContent = `第 ${state.round} 局 · 结算`;
  $('result-title').textContent = r.type === 'draw' ? '流局'
    : r.winners.map(w => names[w.player]).join('、') + (r.source === -1 ? '自摸' : r.robbery ? '抢杠胡' : '胡牌');
  const patterns = (r.winners || []).map(w => {
    const payments = w.payments.filter(n => n > 0);
    const amount = payments[0];
    const summary = payments.length > 1 && payments.every(n => n === amount) ? `每家付 ${amount}`
      : w.payments.flatMap((n, p) => n > 0 ? [`${names[p]}付 ${n}`] : []).join('、');
    return `<span class="pattern-chip">${names[w.player]} · ${w.patterns.map(escape).join('＋')} · ${summary}</span>`;
  }).join('');
  const revealed = state.players.flatMap((player, p) => {
    if (!r.winners?.some(w=>w.player===p)) return [];
    const {tiles, winningTile} = winningHandLayout(player.hand, r);
    const extra = winningTile === null ? '' : tile(winningTile, {extra:'winning-tile'});
    return `<div class="reveal-row"><span class="reveal-name">${names[p]}</span><div class="reveal-tiles">${tiles.map(t => tile(t)).join('')}${extra}${player.melds.map(m => meld(m, p)).join('')}</div></div>`;
  }).join('');
  $('result-content').innerHTML = `<div class="result-hands">${revealed}</div><div class="result-patterns">${patterns}</div>`;
  $('next').textContent='确认';
  if (!$('result').open) $('result').showModal();
}

$('tools-expand').onclick = () => {
  const expanded = $('tools-expand').getAttribute('aria-expanded') !== 'true';
  $('tools-expand').setAttribute('aria-expanded', String(expanded));
  $('tools-expand').setAttribute('aria-label', expanded ? '收起快捷选项' : '展开快捷选项');
  $('tools-expand').textContent = expanded ? '◀' : '▶';
  $('tools-expand').parentElement.classList.toggle('expanded', expanded);
};
$('discard').onclick = () => selected !== null && send({kind:'discard', tile:state.players[0].hand[selected]});
function showScoreAnimation() {
  if (state?.phase !== 'over' || document.getElementById('score-overlay')) return;
  $('result').close();
  const overlay=document.createElement('div');overlay.id='score-overlay';
  const end=[...state.scores],delta=state.result.delta,start=end.map((n,p)=>n-delta[p]);
  const rank=end.map((n,p)=>p).sort((a,b)=>end[b]-end[a]||a-b);
  const oldRank=start.map((n,p)=>p).sort((a,b)=>start[b]-start[a]||a-b);
  overlay.innerHTML=names.map((name,p)=>`<section class="score-card score-card-${p}"><header>${name}</header><b data-rank="${p}">${oldRank.indexOf(p)+1}<small>位</small></b><span class="score-change ${delta[p]>=0?'positive':'negative'}">${number(delta[p])}</span><strong data-score="${p}">${start[p]}</strong></section>`).join('');
  const positions=[[800,750],[1355,450],[800,155],[245,450]];
  const paths=[];
  for(const [recipient,payments] of state.result.paymentsByRecipient.entries()){
    for(const [payer,amount] of payments.entries()){
      if(!amount)continue;
      const a=positions[payer],b=positions[recipient],dx=b[0]-a[0],dy=b[1]-a[1];
      const inset=Math.min(200/Math.max(1,Math.abs(dx)),125/Math.max(1,Math.abs(dy)));
      const x1=a[0]+dx*inset,y1=a[1]+dy*inset,x2=b[0]-dx*inset,y2=b[1]-dy*inset;
      paths.push(`<path d="M${x1} ${y1} Q${(x1+x2)/2-dy*.12} ${(y1+y2)/2+dx*.12} ${x2} ${y2}"/>`);
    }
  }
  overlay.insertAdjacentHTML('beforeend',`<svg class="score-arrows" viewBox="0 0 1600 900" aria-hidden="true"><defs><marker id="score-arrowhead" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="4" markerHeight="4" orient="auto" overflow="visible"><path d="M0 0L12 6L0 12L3 6Z" fill="#ecfcff" stroke="none"/></marker></defs><g fill="none" stroke="#ecfcff" stroke-width="9" marker-end="url(#score-arrowhead)">${paths.join('')}</g></svg>`);
  $('stage').append(overlay);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const begun=performance.now(),lead=reduced?0:750,duration=reduced?0:1500,hold=reduced?0:650;
  const dropped=new Set();let scoreSound=false,settled=false;
  function tick(now){
    const elapsed=now-begun;
    const t=duration?Math.max(0,Math.min(1,(elapsed-lead)/duration)):1;
    if(elapsed>=lead&&!scoreSound){scoreSound=true;playSound('score');}
    overlay.querySelectorAll('[data-score]').forEach(el=>{const p=Number(el.dataset.score);el.textContent=String(Math.round(start[p]+delta[p]*(1-(1-t)**3)));});
    if(t===1&&!settled){settled=true;overlay.classList.add('scores-settled');}
    const rankElapsed=elapsed-lead-duration-hold;
    if(rankElapsed>=0)for(let place=3;place>=0;place--){
      if(rankElapsed<(reduced?0:(3-place)*300)||dropped.has(place))continue;
      dropped.add(place);const p=rank[place],el=overlay.querySelector(`[data-rank="${p}"]`);
      el.innerHTML=`${place+1}<small>位</small>`;el.style.setProperty('--rank-delay','0ms');el.classList.add('rank-drop');playSound('rank');
    }
    if(elapsed<lead+duration+hold+(reduced?0:900)+1200)scoreFrame=requestAnimationFrame(tick);
    else {
      const confirm=document.createElement('button');confirm.className='score-confirm';confirm.textContent='确认';confirm.onclick=newRound;overlay.append(confirm);confirm.focus({preventScroll:true});
    }
  }
  scoreFrame=requestAnimationFrame(tick);
}
function newRound() {
  cancelAnimationFrame(scoreFrame);clearTimeout(scoreTimer);document.getElementById('score-overlay')?.remove();
  clearTimeout(resultTimer);
  for (const [p, timeout] of effectTimers) { clearTimeout(timeout); $('call-effect-' + p).classList.remove('show'); }
  $('error').hidden = true; $('result').close(); send({kind:'new'});
}
$('next').onclick = showScoreAnimation;
$('close-result').onclick = showScoreAnimation;
$('result').addEventListener('cancel', event=>{event.preventDefault();showScoreAnimation();});
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch {}
};
start();
