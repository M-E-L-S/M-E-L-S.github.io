const version = new URL(import.meta.url).search;
const { GomokuGame, BUDGETS, SIZE, coordinate, mateProof } = await import('./gomoku-model.js' + version);
const { EngineWorker } = await import('./gomoku-client.js' + version);
const { OnlineGame } = await import('./gomoku-online.js' + version);
const { onlineFeedback } = await import('./gomoku-feedback.js' + version);
const { MovePreview, isTouchClick } = await import('./gomoku-input.js' + version);
const byId = id => document.getElementById('gomoku-' + id);
const view = byId('view'), engine = new EngineWorker(), cells = [];
const colorName = color => color === 1 ? '黑棋' : '白棋';
const ai = [false, false, false];
let mode = 'local', game = new GomokuGame(), started = false, visible = false;
let thinking = false, pausedAI = false, revision = 0, timer = null, aiStepTimer = null;
let message = '', lastSearch = '', proof = null;
let nextHostColor = 1, hostContext = '', invitationSeen = null;
let soundSnapshot = null;
const sound = window.MELSGameAudio.create(byId('sound-btn'), () => visible);
const preview = new MovePreview();
const online = new OnlineGame(() => render());
const isOnline = () => mode === 'online';
const isAITurn = () => !!ai[game.turn];
const positionKey = () => `${mode}:${online.state?.room || ''}:${game.moves.length}:${game.turn}`;

function moveSound() {
    sound.play('stone');
    if (game.outcome === null) return;
    const lost = isOnline() ? game.outcome !== game.human : ai[1] !== ai[2] && ai[game.outcome];
    sound.play(game.outcome === 0 ? 'draw' : lost ? 'lose' : 'win', .12);
}

function render() {
    const network = isOnline(), state = online.state, connected = online.status === 'connected';
    if (network) {
        game = new GomokuGame(state?.you || nextHostColor);
        for (const move of state?.moves || []) game.play(move);
        const context = state ? `${state.room}:${state.hostColor}` : '';
        if (context && context !== hostContext) nextHostColor = state.hostColor || state.you;
        hostContext = context;
    }
    const ready = network ? connected && state?.players.every(Boolean) && !state.offer : started;
    const enabled = ready && visible && !thinking && game.outcome === null && (network ? game.turn === game.human : !isAITurn());
    preview.sync(positionKey(), enabled);
    const last = game.moves.at(-1), winning = new Set(game.winningLine.map(([x, y]) => y * SIZE + x));
    cells.forEach((cell, i) => {
        const color = game.board[i];
        cell.classList.toggle('black', color === 1); cell.classList.toggle('white', color === 2);
        cell.classList.toggle('last', !!last && i === last[1] * SIZE + last[0]);
        cell.classList.toggle('winning', winning.has(i));
        cell.classList.toggle('preview', preview.index === i);
        cell.setAttribute('aria-disabled', String(!enabled || !!color));
        cell.setAttribute('aria-label', `${coordinate([i % SIZE, Math.floor(i / SIZE)])}，${preview.index === i ? `预选${colorName(game.turn)}，再次点按落子` : color ? colorName(color) : '空位'}`);
    });
    byId('board').classList.toggle('playable', enabled);
    byId('board').classList.toggle('human-white', (network ? game.human : game.turn) === 2);
    byId('board').setAttribute('aria-busy', String(thinking));
    for (const button of view.querySelectorAll('[data-gomoku-mode]')) {
        const active = button.dataset.gomokuMode === mode;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    for (const color of [1, 2]) {
        byId('ai-' + color).setAttribute('aria-pressed', String(ai[color]));
        byId('ai-' + color).classList.toggle('active', ai[color]);
        const button = byId('color-' + color), selected = nextHostColor === color;
        button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
        button.disabled = !!online.session && (!connected || !state?.isHost || !!state.offer);
    }
    byId('local-options').hidden = network;
    byId('color-control').hidden = !network || !!online.session && !state?.isHost;
    byId('color-label').textContent = state?.joined.every(Boolean) ? '房主下局执棋' : '房主执棋';
    byId('undo').disabled = !ready || !(network ? game.canUndo : game.canUndoLocal(ai));
    byId('undo').textContent = network ? '申请悔棋' : '悔棋';
    byId('start').textContent = network ? online.session ? '申请重开' : '创建房间' : '开始 / 重新开局';
    byId('start').disabled = network && !!online.session && (!connected || !state?.players.every(Boolean) || !!state.offer);
    byId('online-panel').hidden = !network;
    byId('join').disabled = !!online.session; byId('room-input').disabled = !!online.session;
    byId('room-actions').hidden = !online.session; byId('room-code').textContent = online.session?.room || '';
    byId('reconnect').hidden = connected || ['connecting', 'reconnecting'].includes(online.status);
    byId('copy-room').disabled = !state;
    byId('offer').hidden = !network || !state?.offer;
    if (state?.offer) {
        const own = state.offer.by === state.you, offer = state.offer;
        const colors = offer.kind === 'restart' && offer.hostColor ? `（房主执${offer.hostColor === 1 ? '黑' : '白'}）` : '';
        byId('offer-text').textContent = `${own ? '你' : '对方'}申请${offer.kind === 'undo' ? '悔棋' : '重新开局'}${colors}${own ? '，等待对方同意' : ''}`;
        byId('accept').hidden = own;
        byId('accept').disabled = !connected || !state.players.every(Boolean);
        byId('decline').textContent = own ? '取消申请' : '拒绝';
        byId('decline').disabled = !connected || !state.players.every(Boolean);
    }
    byId('rules').textContent = network
        ? '15 × 15 自由五子棋，无禁手。只有房主可选择执棋颜色。'
        : '15 × 15 自由五子棋，无禁手。';
    byId('retry').hidden = network || !started || thinking || game.outcome !== null || !isAITurn();
    byId('retry').disabled = !visible;
    byId('retry').textContent = pausedAI ? '继续 AI' : '重试 AI';
    byId('moves').textContent = `${game.moves.length} 手`;
    byId('side').textContent = network ? state ? `你执${colorName(state.you)} · 对方执${colorName(3 - state.you)}` : '邀请好友，一起开局'
        : `黑棋：${ai[1] ? 'AI' : '玩家'} · 白棋：${ai[2] ? 'AI' : '玩家'}`;
    let status;
    if (network && !connected) status = ({ idle: '创建房间，或输入好友房间码', connecting: '正在连接房间…', reconnecting: '连接中断，正在重连…', disconnected: '已断开，可重新连接' })[online.status];
    else if (network && !state.joined.every(Boolean)) status = '等待好友加入…';
    else if (network && !state.players.every(Boolean)) status = '对方已断线，等待重连';
    else if (!network && !started) status = '点击开始，黑棋先行';
    else if (game.outcome === 0) status = '和棋 · 棋盘已满';
    else if (game.outcome !== null) status = `${colorName(game.outcome)}获胜！`;
    else if (network && state.offer) status = '等待处理对局申请';
    else if (thinking) status = `${colorName(game.turn)} AI 正在思考…`;
    else if (!network && pausedAI && isAITurn()) status = 'AI 已暂停';
    else if (network) status = game.turn === state.you ? `轮到你落子 · ${colorName(state.you)}` : '等待对方落子';
    else status = `${colorName(game.turn)}${isAITurn() ? ' AI 等待继续' : '落子'}`;
    byId('status').textContent = preview.index !== null ? '再次点按预选位置确认落子' : network ? status : message || status;
    byId('detail').textContent = network ? online.error || (state ? '双方在线时可继续对局' : '') : thinking ? '本手已思考 0.0 秒' : lastSearch;
    byId('proof').hidden = network || !proof;
    if (proof) byId('proof-text').textContent = `${colorName(proof.winner)}确定杀棋 · 至多 ${proof.plies} 次落子`;
    if (network) {
        const next = { connected, room: state?.room, moves: state?.moves || [], offer: state?.offer, error: online.error };
        const effect = onlineFeedback(soundSnapshot, next);
        if (online.error && soundSnapshot && soundSnapshot.error !== online.error) sound.play('error');
        soundSnapshot = next;
        if (effect === 'stone') moveSound(); else if (effect) { sound.stop(); sound.play(effect); }
    } else soundSnapshot = null;
}

function invalidate() {
    preview.clear();
    ++revision; engine.stop(); clearInterval(timer); clearTimeout(aiStepTimer);
    timer = null; aiStepTimer = null; thinking = false; message = '';
}
function scheduleThink() {
    if (aiStepTimer || pausedAI || isOnline() || !visible || !started || game.outcome !== null || !isAITurn()) return;
    aiStepTimer = setTimeout(() => { aiStepTimer = null; void think(); }, 120);
}
async function think() {
    if (isOnline() || !started || !visible || thinking || pausedAI || game.outcome !== null || !isAITurn()) return;
    const token = ++revision, color = game.turn, began = performance.now();
    let moved = false;
    thinking = true; message = ''; proof = null; render();
    timer = setInterval(() => { byId('detail').textContent = `本手已思考 ${((performance.now() - began) / 1000).toFixed(1)} 秒`; }, 100);
    const { soft_ms, hard_ms, beginner = false } = BUDGETS[byId('speed').value];
    try {
        const result = await engine.search(game.moves, { depth: 64, soft_ms, hard_ms, beginner });
        if (token !== revision) return;
        if (result.evaluator !== 'classical-v2' || !game.play(result.move)) throw new Error('AI 返回了无效落子');
        moved = true; proof = mateProof(result, color);
        moveSound();
        lastSearch = `${colorName(color)} AI 落在 ${coordinate(result.move)} · 用时 ${(result.elapsed_ms / 1000).toFixed(2)} 秒`;
    } catch (error) {
        if (token !== revision) return;
        message = 'AI 暂时无法落子，请点击「重试 AI」'; lastSearch = error.message;
        sound.play('error');
    } finally {
        if (token === revision) {
            clearInterval(timer); timer = null; thinking = false; render();
            if (moved) scheduleThink();
        }
    }
}
function startLocal() {
    sound.stop();
    invalidate(); game = new GomokuGame(); started = true; pausedAI = false;
    lastSearch = ''; proof = null; render(); scheduleThink();
    sound.play('start');
}
function rememberMode() { try { sessionStorage.setItem('mels_gomoku_mode_v1', mode); } catch {} }
function roomURL(room, push = false) {
    const url = new URL(location.href); url.pathname = '/minigame/gomoku/'; url.hash = room ? 'room=' + room : '';
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState']({ ...history.state }, '', url);
    invitationSeen = room;
}
function selectMode(next) {
    sound.stop();
    invalidate(); online.disconnect(); mode = next; rememberMode();
    started = false; game = new GomokuGame(); lastSearch = ''; proof = null; pausedAI = false; render();
    if (isOnline()) {
        if (online.session) roomURL(online.session.room);
        if (visible) online.resume();
    } else if (new URLSearchParams(location.hash.slice(1)).has('room')) roomURL(null);
}
function syncRoomURL() {
    const candidate = new URLSearchParams(location.hash.slice(1)).get('room');
    const room = /^[a-f0-9]{20}$/.test(candidate || '') ? candidate : null;
    if (room === invitationSeen) return;
    invitationSeen = room;
    sound.stop(); soundSnapshot = null;
    invalidate(); online.prepareRoom(room); started = false; proof = null; lastSearch = '';
    byId('room-input').value = room || '';
    if (room) { mode = 'online'; rememberMode(); }
    render();
    if (room && visible && online.session) online.resume();
}

for (let y = 0; y < SIZE; ++y) for (let x = 0; x < SIZE; ++x) {
    const cell = document.createElement('button');
    cell.type = 'button'; cell.className = 'gomoku-cell'; cell.tabIndex = x === 7 && y === 7 ? 0 : -1;
    if ([3, 7, 11].includes(x) && [3, 7, 11].includes(y) && (x !== 7 && y !== 7 || x === y)) cell.classList.add('star');
    cell.addEventListener('click', event => {
        if (cell.getAttribute('aria-disabled') !== 'false') return;
        if (!preview.confirm(y * SIZE + x, positionKey(), isTouchClick(event))) { sound.play('select'); render(); return; }
        if (isOnline()) { online.send('move', { move: [x, y] }); render(); return; }
        if (!game.play([x, y])) return;
        moveSound();
        message = ''; proof = null; lastSearch = ''; render(); scheduleThink();
    });
    cell.addEventListener('focus', () => cells.forEach(button => { button.tabIndex = button === cell ? 0 : -1; }));
    cell.addEventListener('keydown', event => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta) return;
        event.preventDefault();
        cells[Math.max(0, Math.min(SIZE - 1, y + delta[1])) * SIZE + Math.max(0, Math.min(SIZE - 1, x + delta[0]))].focus();
    });
    cells.push(cell); byId('board').appendChild(cell);
}
for (const button of view.querySelectorAll('[data-gomoku-mode]')) button.addEventListener('click', () => {
    if (button.dataset.gomokuMode !== mode) selectMode(button.dataset.gomokuMode);
});
for (const color of [1, 2]) {
    byId('ai-' + color).addEventListener('click', () => {
        invalidate(); ai[color] = !ai[color]; pausedAI = false; proof = null; render(); scheduleThink();
    });
    byId('color-' + color).addEventListener('click', () => {
        nextHostColor = color;
        if (online.state?.isHost && !online.state.joined.every(Boolean)) online.send('color', { hostColor: color });
        render();
    });
}
byId('start').addEventListener('click', () => {
    if (!isOnline()) { startLocal(); return; }
    if (online.session) online.send('offer', { kind: 'restart', ...(online.state?.isHost ? { hostColor: nextHostColor } : {}) });
    else { online.create(nextHostColor); roomURL(online.session.room, true); }
});
byId('speed').addEventListener('change', updateBudget);
byId('undo').addEventListener('click', () => {
    if (isOnline()) { online.send('offer', { kind: 'undo' }); return; }
    if (!game.canUndoLocal(ai)) return;
    invalidate(); game.undoLocal(ai); pausedAI = isAITurn(); lastSearch = ''; proof = null; render();
    sound.stop(); sound.play('undo');
});
byId('retry').addEventListener('click', () => { pausedAI = false; void think(); });
byId('join-form').addEventListener('submit', event => {
    event.preventDefault(); online.join(byId('room-input').value);
    if (online.session) roomURL(online.session.room, true);
});
byId('reconnect').addEventListener('click', () => online.resume());
byId('leave').addEventListener('click', () => { online.forget(); hostContext = ''; roomURL(null); });
byId('accept').addEventListener('click', () => online.send('respond', { accept: true }));
byId('decline').addEventListener('click', () => online.send('respond', { accept: false }));
byId('copy-room').addEventListener('click', async () => {
    if (!online.session) return;
    const url = new URL('/minigame/gomoku/', location.origin); url.hash = 'room=' + online.session.room;
    try { await navigator.clipboard.writeText(url.href); byId('detail').textContent = '邀请链接已复制'; }
    catch { byId('detail').textContent = '复制失败，请将房间码发给好友'; }
});
function updateBudget() {
    const budget = BUDGETS[byId('speed').value];
    byId('budget').textContent = `${budget.beginner ? '简单模式 · ' : ''}目标 ${budget.soft_ms / 1000} 秒 · 上限 ${budget.hard_ms / 1000} 秒 · 下一手生效`;
}
function setVisible(next) {
    const changed = visible !== !!next; visible = !!next;
    if (!visible) { sound.stop(); soundSnapshot = null; preview.clear(); }
    if (!visible && (thinking || engine.worker || aiStepTimer)) invalidate();
    if (!visible && (view.hidden || !document.getElementById('game').classList.contains('active'))) online.disconnect();
    if (changed) {
        render();
        if (visible) { if (isOnline()) online.resume(); else scheduleThink(); }
    }
}
function syncVisibility() { setVisible(document.getElementById('game').classList.contains('active') && !view.hidden && !document.hidden); }

view.addEventListener('pointerdown', sound.unlock);
view.addEventListener('keydown', sound.unlock);
globalThis.__GOMOKU = { setVisible };
new MutationObserver(syncVisibility).observe(document.getElementById('game'), { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', syncVisibility);
window.addEventListener('pagehide', () => { setVisible(false); online.disconnect(); });
window.addEventListener('pageshow', () => { syncRoomURL(); syncVisibility(); });
window.addEventListener('hashchange', syncRoomURL);
window.addEventListener('popstate', () => { syncRoomURL(); syncVisibility(); });
try { if (sessionStorage.getItem('mels_gomoku_mode_v1') === 'online') mode = 'online'; } catch {}
syncRoomURL(); updateBudget(); render(); syncVisibility();
