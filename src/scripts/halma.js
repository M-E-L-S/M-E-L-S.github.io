const version = new URL(import.meta.url).search;
const { HalmaGame, CELLS, NEXT, NAMES, BUDGETS, estimatedSteps } = await import('./halma-model.js' + version);
const { HalmaEngine } = await import('./halma-client.js' + version);
const { MovePlayback } = await import('./halma-motion.js' + version);
const { CloudflareHalma, NetlifyHalma } = await import('./halma-online.js' + version);
const byId = id => document.getElementById('halma-' + id);
const view = byId('view'), board = byId('board'), engine = new HalmaEngine();
const ai = Array(7).fill(false), buttons = [];
const firstByPlayers = { 2: 1, 3: 1, 4: 1, 6: 1 };
const colors = ['#d45252', '#367ec7', '#30946b', '#ce9b23', '#9255bc', '#db7935'];
const points = CELLS.map(([q, r]) => [50 + 3.55 * (q + 2 * r), 50 - 5.65 * q]);
const svgNS = 'http://www.w3.org/2000/svg';
let game = new HalmaGame(), visible = false, thinking = false, paused = false;
let selected = null, revision = 0, queued = null, clock = null, animation = null;
let searchStarted = 0, detail = '', message = '', estimate = null, animatingTo = null;
let mode = 'local', onlineKey = '', settingsKey = '', invitationSeen = '', networkSound = null;
let authorityKey = '';
let roomOptions = { first: 1, mirror: false, hostColor: 1, ai: [false, false] };
const sound = window.MELSGameAudio.create(byId('sound-btn'), () => visible);
const cloud = new CloudflareHalma(() => render()), netlify = new NetlifyHalma(() => render());
let online = cloud;
const isOnline = () => mode !== 'local';
const onlineReady = () => online.status === 'connected' && online.state?.players.every(Boolean) && !online.state?.offer && !online.pending;
function syncOnline() {
    if (!isOnline()) return;
    if (!online.state) {
        if (onlineKey) { invalidate(); game = new HalmaGame(game.players, roomOptions.mirror, roomOptions.first); onlineKey = ''; }
        return;
    }
    const state = online.state;
    const key = `${mode}:${state.room}:${state.playerCount}:${state.first}:${state.mirror}:${state.layoutVersion ?? 1}:${JSON.stringify(state.moves)}`;
    const authority = `${mode}:${state.room}:${state.revision}:${state.you}:${state.players.join('')}`;
    if (authority !== authorityKey) { stopThinking(); selected = null; authorityKey = authority; }
    if (key !== onlineKey) {
        const animate = networkSound?.connected && online.status === 'connected' && networkSound.room === state.room
            && state.moves.length === game.moves.length + 1 && networkSound.moves.every((m, i) => m.from === state.moves[i]?.from && m.to === state.moves[i]?.to);
        invalidate(); game = new HalmaGame(state.playerCount, state.mirror, state.first, state.layoutVersion ?? 1);
        for (const move of state.moves) if (!game.play(move)) throw new Error('Invalid room snapshot');
        onlineKey = key;
        if (animate) void animateMove(game.moves.at(-1));
    }
    const context = `${mode}:${state.room}:${state.first}:${state.mirror}:${state.hostColor}`;
    if (settingsKey !== context) {
        settingsKey = context; roomOptions = { first: state.first, mirror: state.mirror, hostColor: state.hostColor };
    }
}
function svgElement(tag, attributes) {
    const el = document.createElementNS(svgNS, tag);
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    return el;
}
const grid = svgElement('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', class: 'halma-grid', preserveAspectRatio: 'none' });
for (let region = 0; region < 6; ++region) {
    const camp = CELLS.map((cell, i) => cell[2] === region ? i : -1).filter(i => i >= 0);
    // Triangle corners are exactly the three cells with only two camp neighbours.
    const corners = camp.filter(i => NEXT[i].filter(n => camp.includes(n)).length === 2);
    grid.append(svgElement('polygon', { points: corners.map(i => points[i].join(',')).join(' '), class: 'halma-camp', 'data-region': region }));
}
CELLS.forEach((_, i) => NEXT[i].filter(j => j > i).forEach(j => grid.append(svgElement('line', {
    x1: points[i][0], y1: points[i][1], x2: points[j][0], y2: points[j][1], class: 'halma-edge'
}))));
const trail = svgElement('polyline', { class: 'halma-trail', fill: 'none' }); grid.append(trail); board.append(grid);
const movingPiece = document.createElement('span'); movingPiece.className = 'halma-moving'; movingPiece.hidden = true; movingPiece.setAttribute('aria-hidden', 'true'); board.append(movingPiece);
const playback = new MovePlayback(movingPiece, points, sound);
const isAI = () => isOnline() ? !!online.state?.isHost && !!online.state?.ai?.[game.turn - 1] : !!ai[game.turn];
const interactive = () => visible && !thinking && !animation && game.outcome === null && (isOnline() ? onlineReady() && game.turn === online.state.you : !isAI());

function render() {
    syncOnline();
    const network = isOnline(), state = online.state;
    const enabled = interactive(), options = selected === null ? [] : game.legalMoves(selected), destinations = new Set(options.map(m => m.to));
    const last = game.moves.at(-1);
    buttons.forEach((button, i) => {
        const piece = game.board[i];
        button.dataset.piece = String(piece);
        const target = game.seats.indexOf((CELLS[i][2] + 3) % 6);
        const campPlayer = CELLS[i][2] >= 0 && target >= 0 ? target + 1 : 0;
        button.dataset.target = String(campPlayer);
        button.style.setProperty('--camp-bg', campPlayer ? `color-mix(in srgb, ${colors[campPlayer - 1]} 18%, var(--surface))` : 'var(--surface)');
        button.style.setProperty('--piece', colors[piece - 1] || 'transparent');
        button.classList.toggle('occupied', !!piece && i !== animatingTo);
        button.classList.toggle('selected', i === selected);
        button.classList.toggle('destination', destinations.has(i));
        button.classList.toggle('last', !!last && (last.to === i || last.from === i));
        button.setAttribute('aria-disabled', String(!enabled || piece !== game.turn && !destinations.has(i)));
        button.setAttribute('aria-pressed', String(i === selected));
        button.setAttribute('aria-label', `${CELLS[i][0]},${CELLS[i][1]}，${piece ? NAMES[piece - 1] : '空位'}${destinations.has(i) ? '，可落子' : ''}`);
    });
    grid.querySelectorAll('.halma-camp').forEach(camp => {
        const region = Number(camp.dataset.region), player = game.seats.indexOf((region + 3) % 6);
        camp.dataset.target = String(player + 1);
        camp.style.fill = player >= 0 ? colors[player] : 'var(--muted)';
        camp.style.stroke = player >= 0 ? colors[player] : 'var(--muted)';
    });
    trail.setAttribute('points', (last?.path || []).map(i => points[i].join(',')).join(' '));
    view.querySelectorAll('[data-halma-players]').forEach(button => {
        button.disabled = network && !!online.session;
        button.setAttribute('aria-pressed', String(Number(button.dataset.halmaPlayers) === game.players));
        button.classList.toggle('active', Number(button.dataset.halmaPlayers) === game.players);
    });
    const selectedMirror = network ? roomOptions.mirror : game.mirror;
    byId('mirror').setAttribute('aria-pressed', String(selectedMirror)); byId('mirror').classList.toggle('active', selectedMirror);
    const locked = network && !!online.session && (!state?.isHost || online.status !== 'connected' || !!state.offer || !!online.pending);
    byId('mirror').disabled = locked;
    const firstControl = byId('first');
    if (firstControl.options.length !== game.players) {
        firstControl.replaceChildren(...Array.from({ length: game.players }, (_, i) => {
            const option = document.createElement('option'); option.value = String(i + 1); option.textContent = NAMES[i]; return option;
        }));
    }
    firstControl.value = String(network ? roomOptions.first : firstByPlayers[game.players]); firstControl.disabled = locked;
    byId('first-hint').textContent = network && game.layoutVersion === 1 && game.players > 2 ? '旧版房间：同意重开后启用新布局与多人 AI'
        : network && (state?.humanJoined ?? state?.joined)?.filter(Boolean).length > 1 ? '房主设置在全员同意重开后生效' : '';
    renderAI();
    byId('undo').disabled = network ? !onlineReady() || !state?.canUndo : !game.moves.length;
    byId('undo').textContent = network ? '申请悔棋' : '悔棋';
    byId('start').textContent = network ? online.session ? '申请重开' : '创建房间' : '重新开局';
    byId('start').disabled = network && !!online.session && !onlineReady();
    byId('retry').hidden = game.outcome !== null || !isAI() || thinking || !!animation || network && !onlineReady();
    byId('retry').textContent = paused ? '继续 AI' : '重试 AI';
    byId('side').replaceChildren(...Array.from({ length: game.players }, (_, i) => {
        const span = document.createElement('span'); span.className = 'halma-player'; span.style.setProperty('--piece', colors[i]);
        span.classList.toggle('current', game.turn === i + 1 && game.outcome === null);
        const label = network ? state ? state.ai?.[i] ? 'AI' : state.you === i + 1 ? '你' : !state.joined[i] ? '待加入' : state.players[i] ? '在线' : '离线' : '待加入' : ai[i + 1] ? 'AI' : '玩家';
        span.textContent = `${NAMES[i]}：${label}`; return span;
    }));
    byId('moves').textContent = `${game.moves.length} 手`;
    byId('status').textContent = network && online.status !== 'connected' ? ({ idle: '创建房间，或输入好友房间码', connecting: '正在连接房间…', reconnecting: '连接中断，正在重连…', disconnected: '已断开，可重新连接' })[online.status]
        : network && !state?.joined.every(Boolean) ? '等待玩家加入…' : network && !state?.players.every(Boolean) ? '有玩家未在线，等待重连'
        : network && state?.offer ? '等待全员处理对局申请' : message || (game.outcome === 0 ? '和棋 · 重复局面或无合法着'
        : game.outcome !== null ? `${NAMES[game.outcome - 1]}获胜！` : thinking || network && state?.ai?.[game.turn - 1] ? `${NAMES[game.turn - 1]} AI 正在思考…`
        : animation ? '正在走子…' : paused && isAI() ? 'AI 已暂停' : `${NAMES[game.turn - 1]}${selected === null ? '选子' : '选择落点'}`);
    byId('detail').textContent = network ? online.error || online.syncHint || (state ? `你执${NAMES[state.you - 1]}` : '') : thinking ? `本手已思考 ${((performance.now() - searchStarted) / 1000).toFixed(1)} 秒` : detail;
    byId('estimate').hidden = network || !estimate;
    if (estimate) byId('estimate-text').replaceChildren(...estimate.map((value, i) => {
        const span = document.createElement('span'); span.textContent = `${NAMES[i]}：${value} 步`; return span;
    }));
    board.setAttribute('aria-busy', String(thinking || !!animation));
    renderRoom();
    schedule();
}

function renderAI() {
    const network = isOnline(), state = online.state, holder = byId('ai-toggles');
    byId('ai-options').hidden = network && !!online.session && !state?.isHost;
    byId('ai-help').hidden = !network;
    if (holder.children.length !== game.players) holder.replaceChildren(...Array.from({ length: game.players }, (_, i) => {
        const button = document.createElement('button'); button.type = 'button'; button.id = 'halma-ai-' + (i + 1);
        button.className = 'game-btn gomoku-ai-toggle'; button.dataset.player = String(i + 1); button.textContent = 'AI 执' + NAMES[i].replace('方', ''); return button;
    }));
    for (let p = 1; p <= game.players; ++p) {
        const on = network ? online.session ? state?.ai?.[p - 1] : roomOptions.ai?.[p - 1] : ai[p];
        const occupied = online.session ? (state?.humanJoined ?? state?.joined)?.[p - 1] : roomOptions.hostColor === p;
        const disabled = network && (online.session ? !state?.isHost || online.status !== 'connected' || !!state.offer || !!online.pending
            || occupied || game.layoutVersion === 1 && game.players > 2 : occupied);
        byId('ai-' + p).disabled = !!disabled;
        byId('ai-' + p).setAttribute('aria-pressed', String(!!on)); byId('ai-' + p).classList.toggle('active', !!on);
    }
    byId('speed').disabled = network && !!online.session && (!state?.isHost || online.status !== 'connected' || !!state.offer || !!online.pending);
    if (network && state) byId('speed').value = state.difficulty || 'fast';
    updateBudget();
}

function renderRoom() {
    const network = isOnline(), state = online.state, connected = online.status === 'connected';
    for (const button of view.querySelectorAll('[data-halma-mode]')) {
        const active = button.dataset.halmaMode === mode;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    byId('online-panel').hidden = !network;
    byId('host-control').hidden = !network || !!online.session && !state?.isHost;
    const select = byId('host-color');
    if (select.options.length !== game.players) select.replaceChildren(...Array.from({ length: game.players }, (_, i) => {
        const option = document.createElement('option'); option.value = String(i + 1); option.textContent = NAMES[i]; return option;
    }));
    select.value = String(roomOptions.hostColor); select.disabled = byId('first').disabled;
    byId('room-actions').hidden = !online.session; byId('room-code').textContent = online.session?.room || '';
    byId('join').disabled = byId('room-input').disabled = !!online.session;
    byId('reconnect').hidden = connected || ['connecting', 'reconnecting'].includes(online.status);
    byId('copy-room').disabled = !state;
    byId('invitation').hidden = !network || !state;
    if (network && state) byId('invitation').textContent = byId('invitation').href = invitationURL();
    byId('online-help').textContent = mode === 'netlify' ? 'Netlify源，境内可尝试使用，可能卡顿。长时间无操作会暂停同步，可点击重新连接继续。'
        : 'Cloudflare源，需境外使用，更流畅。创建房间后分享邀请链接，好友加入即可开局。';
    byId('offer').hidden = !network || !state?.offer;
    if (network && state?.offer) {
        const offer = state.offer, own = offer.by === state.you;
        const config = offer.options;
        const settings = config ? ` · ${NAMES[config.first - 1]}先手 · ${config.mirror ? '镜像模式' : '普通规则'} · 房主执${NAMES[config.hostColor - 1]}` : '';
        const required = offer.required ?? Array.from({ length: state.playerCount }, (_, i) => i + 1);
        byId('offer-text').textContent = offer.kind === 'swap' ? `${NAMES[offer.by - 1]}申请与${NAMES[offer.target - 1]}交换颜色`
            : `${NAMES[offer.by - 1]}申请${offer.kind === 'undo' ? '悔棋' : '重新开局'} · 已同意 ${offer.accepted.length}/${required.length}${settings}`;
        byId('accept').hidden = !required.includes(state.you) || offer.accepted.includes(state.you);
        byId('accept').disabled = !connected || !required.every(p => state.players[p - 1]) || !!online.pending;
        byId('decline').textContent = own ? '取消申请' : '拒绝';
        byId('decline').hidden = !required.includes(state.you);
        byId('decline').disabled = !connected || !required.every(p => state.players[p - 1]) || !!online.pending;
    }
    byId('swap-control').hidden = !network || !state || game.players <= 2;
    const swap = byId('swap-target'), previous = swap.value;
    const candidates = state ? Array.from({ length: state.playerCount }, (_, i) => i + 1).filter(p => p !== state.you && !state.ai?.[p - 1] && (state.humanJoined ?? state.joined)[p - 1]) : [];
    if (swap.dataset.colors !== candidates.join(',')) {
        swap.replaceChildren(...candidates.map(p => { const option = document.createElement('option'); option.value = String(p); option.textContent = NAMES[p - 1]; return option; }));
        swap.dataset.colors = candidates.join(','); if (candidates.includes(Number(previous))) swap.value = previous;
    }
    byId('swap').disabled = !connected || !candidates.length || !!state?.offer || !!online.pending || !state?.players[Number(swap.value) - 1];
    if (network && state) {
        const next = { room: state.room, connected, moves: state.moves };
        if (networkSound?.connected && connected && networkSound.room === next.room) {
            const before = networkSound.moves, after = next.moves;
            const prefix = before.slice(0, Math.min(before.length, after.length)).every((move, i) => move.from === after[i].from && move.to === after[i].to);
            if (prefix && after.length < before.length) sound.play(after.length ? 'undo' : 'start');
        }
        networkSound = next;
    } else networkSound = null;
}
function invitationURL() {
    const url = new URL('/minigame/halma/', location.origin);
    url.hash = (mode === 'netlify' ? 'backend=netlify&' : '') + 'room=' + online.session.room; return url.href;
}
function roomURL(room, push = false) {
    const url = new URL('/minigame/halma/', location.origin), hash = new URLSearchParams();
    if (mode === 'netlify') hash.set('backend', 'netlify'); if (room) hash.set('room', room); url.hash = hash.toString();
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState']({ ...history.state }, '', url);
    invitationSeen = `${mode}:${room || ''}`;
}
function selectMode(next) {
    invalidate(); sound.stop(); online.disconnect(); mode = next; online = mode === 'netlify' ? netlify : cloud;
    try { sessionStorage.setItem('mels_halma_mode_v1', mode); } catch {}
    onlineKey = settingsKey = ''; networkSound = null; paused = false;
    game = new HalmaGame(game.players, game.mirror, firstByPlayers[game.players]);
    roomOptions = { first: game.first, mirror: game.mirror, hostColor: 1, ai: Array(game.players).fill(false) };
    roomURL(isOnline() ? online.session?.room : null); render();
    if (isOnline() && visible) online.resume(); else schedule();
}
function syncRoomURL() {
    if (location.pathname.replace(/\/$/, '') !== '/minigame/halma') return;
    const hash = new URLSearchParams(location.hash.slice(1)), value = hash.get('room');
    const room = /^[a-f0-9]{20}$/.test(value || '') ? value : null;
    const requested = hash.get('backend') === 'netlify' ? 'netlify' : room ? 'online' : mode;
    const context = `${requested}:${room || ''}`;
    if (context === invitationSeen) return;
    invitationSeen = context;
    if (requested !== mode) { online.disconnect(); mode = requested; online = mode === 'netlify' ? netlify : cloud; }
    invalidate(); sound.stop(); onlineKey = settingsKey = ''; networkSound = null; online.prepareRoom(room);
    game = new HalmaGame(game.players, game.mirror, firstByPlayers[game.players]);
    byId('room-input').value = room || '';
    if (room || requested === 'netlify') try { sessionStorage.setItem('mels_halma_mode_v1', mode); } catch {}
    render(); if (isOnline() && visible && online.session) online.resume();
}
function changeRoomOptions(change) {
    if (change.hostColor && roomOptions.ai) roomOptions.ai[change.hostColor - 1] = false;
    Object.assign(roomOptions, change);
    if (online.session && online.state?.isHost && !online.state.moves.length && (online.state.humanJoined ?? online.state.joined).filter(Boolean).length === 1)
        online.send('settings', { options: { ...roomOptions, players: game.players, difficulty: byId('speed').value } });
    render();
}
function invalidate() {
    stopThinking(); animation?.cancel(); animation = null; movingPiece.hidden = true; animatingTo = null;
    selected = null; message = ''; detail = ''; estimate = null; sound.stop();
}
function stopThinking() {
    ++revision; clearTimeout(queued); queued = null; clearInterval(clock); clock = null;
    engine.stop(); thinking = false;
}
function schedule() {
    if (queued || !visible || thinking || animation || paused || game.outcome !== null || !isAI() || isOnline() && (!onlineReady() || online.error)) return;
    queued = setTimeout(() => { queued = null; void think(); }, 160);
}
async function commit(candidate, keepAnalysis = false) {
    const player = game.turn, move = game.play(candidate);
    if (!move) return false;
    selected = null; message = '';
    if (!keepAnalysis) { estimate = null; detail = ''; }
    await animateMove({ ...move, player }); return true;
}
async function animateMove(move) {
    animatingTo = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? null : move.to;
    animation = playback;
    const done = playback.play(move, colors[move.player - 1]); render();
    if (!await done) return;
    animation = null; animatingTo = null;
    if (game.outcome !== null) sound.play(game.outcome === 0 ? 'draw' : 'win', .12);
    render(); schedule();
}
async function think() {
    if (!visible || paused || thinking || animation || game.outcome !== null || !isAI() || isOnline() && !onlineReady()) return;
    const token = revision;
    thinking = true; selected = null; estimate = null; detail = ''; message = ''; searchStarted = performance.now(); render();
    clock = setInterval(() => { byId('detail').textContent = `本手已思考 ${((performance.now() - searchStarted) / 1000).toFixed(1)} 秒`; }, 100);
    try {
        const result = await engine.search(game.position(), byId('speed').value);
        if (token !== revision) return;
        thinking = false; clearInterval(clock); clock = null;
        if (!result.move) throw new Error('AI 未返回合法着，请重试');
        estimate = estimatedSteps(result, game.players);
        detail = `搜索深度 ${result.depth} · 用时 ${(result.elapsed_ms / 1000).toFixed(1)} 秒`;
        if (isOnline()) {
            if (!game.legalMoves(result.move.from).some(move => move.to === result.move.to)) throw new Error('AI 未返回合法着，请重试');
            online.send('move', { move: { from: result.move.from, to: result.move.to }, ai: true }); render();
        } else if (!await commit(result.move, true)) throw new Error('AI 未返回合法着，请重试');
    } catch (error) {
        if (token !== revision) return;
        clearInterval(clock); clock = null; thinking = false; paused = true; engine.stop();
        message = 'AI 暂时不可用，请重试'; detail = ''; estimate = null; render();
        console.error('Halma AI:', error);
    }
}
function reset(players = game.players, mirror = game.mirror) {
    invalidate(); sound.stop(); game = new HalmaGame(players, mirror, firstByPlayers[players]); paused = false; render(); schedule();
}
CELLS.forEach((_, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'halma-cell';
    button.style.left = points[i][0] + '%'; button.style.top = points[i][1] + '%'; button.tabIndex = i === 60 ? 0 : -1;
    button.addEventListener('click', () => {
        if (!interactive()) return;
        if (game.board[i] === game.turn) { selected = selected === i ? null : i; sound.play('select'); render(); }
        else if (selected !== null) {
            if (isOnline()) {
                if (game.legalMoves(selected).some(move => move.to === i)) {
                    online.send('move', { move: { from: selected, to: i } }); selected = null; render();
                }
            } else void commit({ from: selected, to: i });
        }
    });
    button.addEventListener('focus', () => buttons.forEach(cell => { cell.tabIndex = cell === button ? 0 : -1; }));
    button.addEventListener('keydown', event => {
        if (event.key === 'Escape') { selected = null; render(); return; }
        const vector = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!vector) return;
        event.preventDefault();
        const candidates = points.map(([x, y], j) => ({ j, dx: x - points[i][0], dy: y - points[i][1] }))
            .filter(p => p.dx * vector[0] + p.dy * vector[1] > .1)
            .sort((a, b) => (a.dx ** 2 + a.dy ** 2) / (a.dx * vector[0] + a.dy * vector[1]) - (b.dx ** 2 + b.dy ** 2) / (b.dx * vector[0] + b.dy * vector[1]));
        if (candidates.length) buttons[candidates[0].j].focus();
    });
    buttons.push(button); board.append(button);
});
view.querySelectorAll('[data-halma-players]').forEach(button => button.addEventListener('click', () => {
    const n = Number(button.dataset.halmaPlayers);
    if (isOnline() && online.session) return;
    if (n !== game.players) { roomOptions.first = firstByPlayers[n]; roomOptions.hostColor = 1; roomOptions.ai = Array(n).fill(false); reset(n); }
}));
byId('mirror').addEventListener('click', () => {
    if (isOnline()) changeRoomOptions({ mirror: !roomOptions.mirror }); else reset(game.players, !game.mirror);
});
byId('first').addEventListener('change', () => {
    if (isOnline()) { changeRoomOptions({ first: Number(byId('first').value) }); return; }
    firstByPlayers[game.players] = Number(byId('first').value);
    if (!game.moves.length) reset(); else render();
});
byId('start').addEventListener('click', () => {
    sound.unlock();
    if (!isOnline()) { reset(); return; }
    if (online.session) online.send('offer', { kind: 'restart', ...(online.state?.isHost ? { options: {
        first: roomOptions.first, mirror: roomOptions.mirror, hostColor: roomOptions.hostColor, players: game.players, difficulty: byId('speed').value } } : {}) });
    else { online.create({ ...roomOptions, players: game.players, difficulty: byId('speed').value }); roomURL(online.session.room, true); }
});
byId('undo').addEventListener('click', () => {
    if (isOnline()) { online.send('offer', { kind: 'undo' }); return; }
    invalidate(); game.undo(ai); paused = !!ai[game.turn]; sound.play('undo'); render(); schedule();
});
view.querySelectorAll('[data-halma-mode]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.halmaMode !== mode) selectMode(button.dataset.halmaMode);
}));
byId('host-color').addEventListener('change', () => changeRoomOptions({ hostColor: Number(byId('host-color').value) }));
byId('swap').addEventListener('click', () => online.send('offer', { kind: 'swap', target: Number(byId('swap-target').value) }));
byId('swap-target').addEventListener('change', render);
byId('join-form').addEventListener('submit', event => {
    event.preventDefault(); online.join(byId('room-input').value.trim().toLowerCase());
    if (online.session) roomURL(online.session.room, true);
});
byId('reconnect').addEventListener('click', () => online.resume(true));
byId('leave').addEventListener('click', () => { online.forget(); onlineKey = settingsKey = ''; roomURL(null); });
byId('accept').addEventListener('click', () => online.send('respond', { accept: true, offerId: online.state?.offer?.id }));
byId('decline').addEventListener('click', () => online.send('respond', { accept: false, offerId: online.state?.offer?.id }));
byId('copy-room').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(invitationURL()); byId('detail').textContent = '邀请链接已复制'; }
    catch { byId('detail').textContent = '复制失败，请长按或复制下方邀请链接'; }
});
byId('ai-toggles').addEventListener('click', event => {
    const button = event.target.closest('[data-player]'); if (!button || button.disabled) return;
    const p = Number(button.dataset.player);
    if (isOnline()) {
        if (online.session) online.send('ai', { color: p, enabled: !online.state?.ai?.[p - 1] });
        else { roomOptions.ai ??= Array(game.players).fill(false); roomOptions.ai[p - 1] = !roomOptions.ai[p - 1]; render(); }
    } else { invalidate(); ai[p] = !ai[p]; paused = false; render(); schedule(); }
});
byId('retry').addEventListener('click', () => { invalidate(); paused = false; online.error = ''; render(); schedule(); });
function updateBudget() {
    const budget = BUDGETS[byId('speed').value];
    byId('budget').textContent = `${byId('speed').value === 'simple' ? 'AI随机性增强· ' : ''}目标 ${budget.soft_ms / 1000} 秒 · 上限 ${budget.hard_ms / 1000} 秒 · 下一手生效`;
}
byId('speed').addEventListener('change', () => {
    if (isOnline() && online.session) online.send('ai', { difficulty: byId('speed').value });
    updateBudget();
});
globalThis.__HALMA = { setVisible(next) {
    const changed = visible !== !!next; visible = !!next;
    if (!visible) { if (changed) { invalidate(); online.disconnect(); networkSound = null; } sound.stop(); }
    render(); if (visible) { if (isOnline()) online.resume(); else schedule(); }
} };
view.addEventListener('pointerdown', sound.unlock); view.addEventListener('keydown', sound.unlock);
window.addEventListener('hashchange', syncRoomURL);
window.addEventListener('popstate', syncRoomURL);
window.addEventListener('pageshow', syncRoomURL);
try { const saved = sessionStorage.getItem('mels_halma_mode_v1'); if (['online', 'netlify'].includes(saved)) mode = saved; } catch {}
online = mode === 'netlify' ? netlify : cloud;
visible = globalThis.__MINI_GAMES?.current() === 'halma' && document.getElementById('game').classList.contains('active') && !document.hidden;
syncRoomURL(); render(); if (visible && isOnline()) online.resume();
