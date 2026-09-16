// ==========================================================
// 连连看小游戏（纯前端实现）
// 规则：点击两个相同图案，若二者之间存在转弯不超过 2 次、
//       且不穿过其他方块的路径（可绕出棋盘外圈），即可消除。
// ==========================================================
(function () {
    'use strict';

    // ---------- 常量配置 ----------
    const ICONS = [
        '🎂', '🎁', '🎈', '🍰', '🌸', '🌟', '🎀', '🍓',
        '🍑', '🌈', '🦄', '🐱', '🐶', '🐰', '🍬', '🍭',
        '🎠', '🪁', '🥳', '🎉', '✨', '💖', '🍒', '🌻',
        '🎵', '🍩', '🧸', '🌙', '🍀', '🍎', '🍦', '🎨'
    ];

    const DIFFS = {
        easy:   { cols: 8,  rows: 8, time: 94, label: '竞速' },
        normal: { cols: 12,  rows: 10, time: 600, label: '常规' },
        hard:   { cols: 9, rows: 8, time: 0, label: 'BOSS对决！' }
    };

    const MAX_HINTS = 3;      // 每局提示次数
    const MAX_SHUFFLES = 3;   // 每局手动洗牌次数
    const COMBO_WINDOW = 4000; // 连击判定时间窗口（毫秒）

    // ---------- 游戏状态 ----------
    let diff = 'easy';
    let cols = 0, rows = 0;
    let board = [];       // board[r][c]：0 表示空，其余为图标编号（从 1 起）
    let tileEls = [];     // tileEls[r][c]：对应 DOM 元素（消除后仍保留占位）
    let selected = null;  // 当前选中 {r, c}
    let playing = false;  // 是否在一局进行中的游戏里
    let paused = false;
    let autoPaused = false; // 因切换页面自动暂停
    let locking = false;    // 消除动画期间锁定输入
    let timeLeft = 0, totalTime = 0, timerId = null;
    let score = 0, remain = 0;
    let hintsLeft = (diff === 'normal') ? MAX_HINTS * 2 : MAX_HINTS, shufflesLeft = (diff === 'normal') ? 0 : MAX_SHUFFLES;
    let comboCount = 0, lastMatchAt = 0;
    let soundOn = true;
    let audioCtx = null;
    let battle = null, bossPair = null, playerHintPair = null, boardVersion = 0, frameId = null, lastFrame = 0;
    let resizeTimer = null;
    let bossHud;
    let rageCueUntil = 0;
    let damageCue = '', damageCueUntil = 0;

    // ---------- DOM 引用 ----------
    const $ = (sel) => document.querySelector(sel);
    let gridEl, wrapEl, svgEl, overlayEl, overlayText, overlayBtn, toastEl;
    let timeEl, scoreEl, remainEl, timebarEl;
    let startBtn, hintBtn, shuffleBtn, pauseBtn, soundBtn;
    let hintCountEl, shuffleCountEl;

    // ---------- 通用工具 ----------
    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function fmtTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m + ':' + String(s).padStart(2, '0');
    }

    // ---------- 音效（WebAudio 合成，无需音频文件） ----------
    function ensureAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) { audioCtx = null; }
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }

    function tone(freq, dur, type, gain, when) {
        if (!soundOn || !audioCtx) return;
        try {
            const t0 = audioCtx.currentTime + (when || 0);
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, t0);
            g.gain.setValueAtTime(gain || 0.08, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(g).connect(audioCtx.destination);
            osc.start(t0);
            osc.stop(t0 + dur + 0.05);
        } catch (e) { /* 音效失败不影响游戏 */ }
    }

    const sfx = {
        select()  { tone(660, 0.08, 'triangle', 0.05); },
        match()   { tone(523, 0.12, 'triangle', 0.07); tone(784, 0.18, 'triangle', 0.07, 0.06); },
        combo(n)  { tone(523 + n * 60, 0.10, 'triangle', 0.06); tone(784 + n * 60, 0.16, 'triangle', 0.06, 0.05); },
        error()   { tone(196, 0.16, 'sawtooth', 0.035); },
        shuffle() { tone(392, 0.08, 'sine', 0.05); tone(330, 0.08, 'sine', 0.05, 0.07); tone(392, 0.08, 'sine', 0.05, 0.14); },
        win()     { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, i * 0.15)); },
        lose()    { [440, 349, 262].forEach((f, i) => tone(f, 0.30, 'sine', 0.06, i * 0.2)); }
    };

    // ---------- 棋盘生成与渲染 ----------
    // 固定导航栏和音乐栏不属于可玩区域；另留上下各 24px 的呼吸空间。
    function contentViewportHeight() {
        const topBar = document.querySelector('.navbar');
        const bottomBar = document.querySelector('.music-player');
        return (window.innerHeight || 800) - (topBar?.offsetHeight || 0) -
            (bottomBar?.offsetHeight || 0);
    }

    function preferredDimensions(baseCols, baseRows) {
        if (baseCols === baseRows) return { cols: baseCols, rows: baseRows };
        const vw = window.innerWidth || 1280;
        const vh = contentViewportHeight();
        const horizontalRoom = (wrapEl?.clientWidth || vw - (vw <= 520 ? 24 : 96)) - 96;
        const verticalRoom = vh - 112 - (diff === 'hard' ? 56 : 0);
        const score = (c, r) => Math.min(horizontalRoom / c, verticalRoom / r);
        return score(baseRows, baseCols) > score(baseCols, baseRows)
            ? { cols: baseRows, rows: baseCols }
            : { cols: baseCols, rows: baseRows };
    }

    function buildBoard(stage) {
        const cfg = DIFFS[diff];
        const base = diff === 'hard' && stage === 2
            ? { cols: 10, rows: 10 }
            : preferredDimensions(cfg.cols, cfg.rows);
        cols = base.cols;
        rows = base.rows;
        const total = cols * rows;
        const iconCount = total / 4; // 每种图案 4 张（两对）

        const icons = shuffleArray(ICONS.slice()).slice(0, iconCount);
        const pool = [];
        icons.forEach((_, i) => pool.push(i + 1, i + 1, i + 1, i + 1));

        // 反复洗牌，直到开局至少存在一步可走
        let tries = 0;
        do {
            shuffleArray(pool);
            board = [];
            for (let r = 0; r < rows; r++) {
                board.push(pool.slice(r * cols, (r + 1) * cols));
            }
            tries++;
        } while (!hasMoves() && tries < 60);

        ensureMove();
        renderBoard();
    }

    function renderBoard() {
        boardVersion++;
        gridEl.innerHTML = '';
        gridEl.style.gridTemplateColumns = 'repeat(' + cols + ', var(--tile-size))';
        tileEls = [];
        for (let r = 0; r < rows; r++) {
            const rowEls = [];
            for (let c = 0; c < cols; c++) {
                const t = document.createElement('div');
                t.className = 'tile';
                t.dataset.r = r;
                t.dataset.c = c;
                const span = document.createElement('span');
                span.textContent = ICONS[board[r][c] - 1];
                t.appendChild(span);
                t.addEventListener('click', onTileClick);
                gridEl.appendChild(t);
                rowEls.push(t);
            }
            tileEls.push(rowEls);
        }
        selected = null;
        updateTileSize();
    }

    // 优先保证图案尺寸；移动端把页面、面板和路径留白压至最小。
    function updateTileSize() {
        if (!tileEls.length) return;
        const vw = window.innerWidth || 1280;
        const gap = vw <= 520 ? 2 : vw <= 900 ? 4 : 6;
        // 四周额外预留 16px 缓冲，避免内容贴着视口边缘。
        const available = (wrapEl.clientWidth || vw - (vw <= 520 ? 24 : 96)) - 32;
        const height = contentViewportHeight() - 48 - (diff === 'hard' ? 56 : 0);
        const minTile = vw <= 360 ? 28 : 32;
        // 包含路径留白，按内容对准屏幕后的完整视口计算，不扣除上方工具栏。
        let tileSize = Math.max(minTile, Math.floor(Math.min(available / cols, height / rows)));
        while (tileSize > minTile) {
            const px = Math.max(vw <= 520 ? 4 : 10, Math.min(32, Math.round(tileSize * 0.34)));
            const py = Math.max(vw <= 520 ? 7 : 12, Math.min(32, Math.round(tileSize * 0.34)));
            if (cols * tileSize + gap * (cols - 1) + 2 * px <= available &&
                rows * tileSize + gap * (rows - 1) + 2 * py <= height) break;
            tileSize--;
        }
        const fs = Math.max(19, Math.floor(tileSize * 0.58));
        gridEl.style.setProperty('--tile-size', tileSize + 'px');
        gridEl.style.setProperty('--tile-fs', fs + 'px');
        gridEl.style.setProperty('--board-gap', gap + 'px');
        const padX = Math.max(vw <= 520 ? 4 : 10, Math.min(32, Math.round(tileSize * 0.34)));
        const padY = Math.max(vw <= 520 ? 7 : 12, Math.min(32, Math.round(tileSize * 0.34)));
        wrapEl.style.padding = (padY + (diff === 'hard' ? 56 : 0)) + 'px ' + padX + 'px ' + padY + 'px';
    }

    function transposePoint(p) {
        return p ? { r: p.c, c: p.r } : null;
    }

    function adaptBoardToViewport() {
        if (!board.length) return;
        if (locking) {
            updateTileSize();
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(adaptBoardToViewport, 500);
            return;
        }
        const desired = preferredDimensions(Math.max(cols, rows), Math.min(cols, rows));
        if (desired.cols === cols && desired.rows === rows) {
            updateTileSize();
            return;
        }
        const oldBoard = board;
        const oldRows = rows;
        const oldCols = cols;
        const savedSelected = transposePoint(selected);
        board = Array.from({ length: oldCols }, (_, r) =>
            Array.from({ length: oldRows }, (_, c) => oldBoard[c][r]));
        rows = oldCols;
        cols = oldRows;
        bossPair = bossPair && bossPair.map(transposePoint);
        playerHintPair = playerHintPair && playerHintPair.map(transposePoint);
        svgEl.innerHTML = '';
        renderBoard();
        if (savedSelected && board[savedSelected.r]?.[savedSelected.c]) {
            selected = savedSelected;
            tileEls[selected.r][selected.c].classList.add('selected');
        }
        clearHints();
        if (bossPair) {
            tileEls.forEach((row, r) => row.forEach((el, c) =>
                el.classList.toggle('boss-reserved', isBossReserved(board[r][c]))));
            if (battle?.state === 'first') tileEls[bossPair[0].r][bossPair[0].c].classList.add('boss-target');
            if (battle?.state === 'second') {
                tileEls[bossPair[0].r][bossPair[0].c].classList.add('boss-chosen');
                tileEls[bossPair[1].r][bossPair[1].c].classList.add('boss-target');
            }
        }
    }

    // ---------- 核心：路径判定（转弯 ≤ 2 次的 BFS） ----------
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    // 棋盘外再包一圈虚拟空格，允许路径绕出棋盘
    function isFree(r, c) {
        if (r < -1 || r > rows || c < -1 || c > cols) return false;
        if (r === -1 || r === rows || c === -1 || c === cols) return true;
        return board[r][c] === 0;
    }

    /**
     * 寻找 a、b 之间转弯不超过 2 次的路径。
     * 成功返回路径拐点数组（含两端点），失败返回 null。
     */
    function findPath(a, b) {
        if (a.r === b.r && a.c === b.c) return null;
        const W = cols + 2;
        const best = new Array((rows + 2) * W * 4).fill(99);
        const idx = (r, c, d) => ((r + 1) * W + (c + 1)) * 4 + d;

        const queue = [];
        for (let d = 0; d < 4; d++) {
            queue.push({ r: a.r, c: a.c, d: d, turns: 0, path: [a] });
        }

        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            const nr = cur.r + DIRS[cur.d][0];
            const nc = cur.c + DIRS[cur.d][1];

            if (nr === b.r && nc === b.c) {
                return simplifyPath(cur.path.concat([b]));
            }
            if (!isFree(nr, nc)) continue;

            // 直行不加转弯数
            if (cur.turns < best[idx(nr, nc, cur.d)]) {
                best[idx(nr, nc, cur.d)] = cur.turns;
                queue.push({ r: nr, c: nc, d: cur.d, turns: cur.turns, path: cur.path.concat([{ r: nr, c: nc }]) });
            }
            // 转向（总转弯数不超过 2）
            if (cur.turns < 2) {
                for (let nd = 0; nd < 4; nd++) {
                    if (nd === cur.d || nd === (cur.d ^ 1)) continue; // 跳过原方向与反方向
                    const t = cur.turns + 1;
                    if (t < best[idx(nr, nc, nd)]) {
                        best[idx(nr, nc, nd)] = t;
                        queue.push({ r: nr, c: nc, d: nd, turns: t, path: cur.path.concat([{ r: nr, c: nc }]) });
                    }
                }
            }
        }
        return null;
    }

    // 去掉路径中的共线中间点，只留拐点（用于画线）
    function simplifyPath(path) {
        if (path.length <= 2) return path;
        const pts = [path[0]];
        for (let i = 1; i < path.length - 1; i++) {
            const p = path[i - 1], q = path[i], n = path[i + 1];
            if ((q.r - p.r) !== (n.r - q.r) || (q.c - p.c) !== (n.c - q.c)) {
                pts.push(q);
            }
        }
        pts.push(path[path.length - 1]);
        return pts;
    }

    // 查找任意一对当前可消除的方块（供提示 / 死局检测使用）
    function findAnyPair(forPlayer = false, forBoss = false) {
        const groups = {};
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const v = board[r][c];
                if (v && !(forPlayer && isBossReserved(v)) && !(forBoss && isPlayerHintCell(r, c))) {
                    (groups[v] = groups[v] || []).push({ r: r, c: c });
                }
            }
        }
        for (const v in groups) {
            const list = groups[v];
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    if (findPath(list[i], list[j])) return [list[i], list[j]];
                }
            }
        }
        return null;
    }

    function hasMoves() {
        return !!findAnyPair();
    }

    // Random retries have a deterministic fallback: place a pair on a connectable route.
    function ensureMove() {
        if (hasMoves()) return;
        const cells = [];
        board.forEach((row, r) => row.forEach((v, c) => { if (v) cells.push({ r, c }); }));
        for (const a of cells) for (const b of cells) {
            if (!findPath(a, b)) continue;
            const mate = cells.find(p => (p.r !== a.r || p.c !== a.c) && board[p.r][p.c] === board[a.r][a.c]);
            if (mate) {
                [board[b.r][b.c], board[mate.r][mate.c]] = [board[mate.r][mate.c], board[b.r][b.c]];
                return;
            }
        }
    }

    function isBossReserved(value) {
        return !!(bossPair && value && board[bossPair[0].r][bossPair[0].c] === value);
    }

    function isPlayerHintCell(r, c) {
        return !!(playerHintPair && playerHintPair.some(p => p.r === r && p.c === c));
    }

    function releasePlayerHint() {
        playerHintPair = null;
        tileEls.flat().forEach(el => el.classList.remove('hint'));
    }

    function releaseBossPair() {
        bossPair = null;
        tileEls.flat().forEach(el => el.classList.remove('boss-reserved', 'boss-target', 'boss-chosen'));
    }

    function refillBossBoard(stage) {
        releaseBossPair(); releasePlayerHint(); clearSelection(); clearHints();
        buildBoard(stage); remain = rows * cols; locking = false;
        svgEl.innerHTML = ''; updateStatus();
    }

    function maintainBossBoard() {
        if (!remain) {
            refillBossBoard(battle.phase === 2 || battle.revival ? 2 : 1);
            showToast('棋盘已清空，自动补满，继续对决！');
        } else if (!hasMoves()) doShuffle(false);
    }

    function setupBattle() {
        battle = new globalThis.BossBattle({
            release: releaseBossPair,
            refill: refillBossBoard,
            shuffle: () => doShuffle(false),
            night: on => gridEl.classList.toggle('nightfall', on),
            skill: id => {
                if (id === 'rage') rageCueUntil = battle.clock + 2400;
                wrapEl.classList.remove('skill-cast');
                void wrapEl.offsetWidth;
                wrapEl.classList.add('skill-cast');
            },
            notice: text => {
                $('#boss-notice').textContent = text;
                bossHud.classList.remove('boss-flash');
                void bossHud.offsetWidth;
                bossHud.classList.add('boss-flash');
            },
            hints: (count, reset) => {
                hintsLeft = reset ? count : hintsLeft + count;
                hintCountEl.textContent = hintsLeft; hintBtn.disabled = hintsLeft <= 0;
            },
            hit: (target, damage) => {
                const el = $('#boss-' + target + '-health');
                damageCue = target === 'boss'
                    ? `💥 命中 BOSS！ −${damage} HP`
                    : `💔 我方受伤！ −${damage} HP`;
                damageCueUntil = battle.clock + 2000;
                el.dataset.damage = target === 'boss'
                    ? `命中 −${damage} HP`
                    : `受伤 −${damage} HP`;
                el.classList.remove('health-hit'); void el.offsetWidth; el.classList.add('health-hit');
            },
            stunned: () => {
                const panel = $('#game .game-panel');
                panel.classList.remove('battle-impact');
                void panel.offsetWidth;
                panel.classList.add('battle-impact');
            },
            reserve: () => {
                maintainBossBoard();
                bossPair = findAnyPair(false, true);
                if (!bossPair) return false;
                if (selected && isBossReserved(board[selected.r][selected.c])) clearSelection();
                tileEls.forEach((row, r) => row.forEach((el, c) => {
                    el.classList.toggle('boss-reserved', isBossReserved(board[r][c]));
                }));
                const a = bossPair[0]; tileEls[a.r][a.c].classList.add('boss-target');
                return true;
            },
            first: () => {
                if (!bossPair) return;
                const [a, b] = bossPair;
                tileEls[a.r][a.c].classList.remove('boss-target');
                tileEls[a.r][a.c].classList.add('boss-chosen');
                tileEls[b.r][b.c].classList.add('boss-target');
            },
            match: () => {
                if (!bossPair) return false;
                const [a, b] = bossPair, path = findPath(a, b);
                if (!path || !board[a.r][a.c] || board[a.r][a.c] !== board[b.r][b.c]) return false;
                drawPath(path);
                board[a.r][a.c] = board[b.r][b.c] = 0;
                tileEls[a.r][a.c].classList.add('removed'); tileEls[b.r][b.c].classList.add('removed');
                remain -= 2; releaseBossPair(); updateStatus(); sfx.error();
                maintainBossBoard();
                return true;
            },
            finish: won => {
                playing = false; stopTimer(); updateBossHud();
                if (won) sfx.win(); else sfx.lose();
                showOverlay(won ? '🏆' : '💔', won ? '击败邪恶机器人！' : '对决失败',
                    '我方生命 ' + battle.playerHp + '/' + battle.playerMaxHp + ' · BOSS 生命 ' + battle.hp + '/400<br>本局得分 <b>' + score + '</b>', true, '再战一局');
                startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
            }
        });
        $('#boss-notice').textContent = '消除即攻击 · 红色锁定的同类方块不可选 · 选块时攻击可打断';
        updateBossHud();
    }

    function setText(selector, value) {
        const element = $(selector);
        if (element.textContent !== value) element.textContent = value;
    }

    function toggleClass(element, name, enabled) {
        if (element.classList.contains(name) !== enabled) element.classList.toggle(name, enabled);
    }

    function updateBossHud() {
        if (!battle) return;
        const boardSkill = battle.ended ? '' : battle.revival ? 'revival' : battle.active || (battle.clock < rageCueUntil ? 'rage' : '');
        if (wrapEl.dataset.skill !== boardSkill) wrapEl.dataset.skill = boardSkill;
        toggleClass(wrapEl, 'skill-urgent', boardSkill === 'contest' && battle.competitionLeft <= 5000);
        toggleClass(wrapEl, 'skill-paused', paused || document.hidden || battle.stun > 0);
        toggleClass(wrapEl, 'boss-stunned', !battle.ended && battle.stun > 0);
        const feedback = $('#board-combat-feedback');
        const feedbackText = battle.revival > 0 && !battle.ended
            ? '🔒 消除已冻结 · 可以观看、点选 · 复活结束后恢复消除'
            : battle.stun > 0 && !battle.ended
            ? `💫 BOSS 已眩晕 ${(battle.stun / 1000).toFixed(1)}s · 无法行动${damageCue && battle.clock < damageCueUntil ? ' · ' + damageCue : ''}`
            : battle.clock < damageCueUntil ? damageCue : '';
        if (feedback.textContent !== feedbackText) feedback.textContent = feedbackText;
        const banner = $('#board-skill-banner');
        let bannerText = '';
        if (boardSkill === 'contest') bannerText = `⚔ 同台竞技 · ${(battle.competitionLeft / 1000).toFixed(1)}s · 消除 ${battle.playerMatches}/4 · 结束后结算`;
        else if (boardSkill === 'night') bannerText = `🌑 夜幕降临 · ${(battle.skillLeft / 1000).toFixed(1)}s · 仍可操作，小心 BOSS 普攻`;
        else if (boardSkill === 'rage') bannerText = '🔥 狂暴模式发动 · BOSS 正在重排剩余方块';
        else if (boardSkill === 'revival') bannerText = `🔧 BOSS 正在复活 · 核心重启 ${(battle.revival / 1000).toFixed(1)}s · 无敌`;
        if (banner.textContent !== bannerText) banner.textContent = bannerText;
        setText('#boss-hp', battle.hp + ' / 400');
        setText('#player-hp', battle.playerHp + ' / ' + battle.playerMaxHp);
        const bossWidth = (battle.hp / 4) + '%';
        const playerWidth = (battle.playerHp / battle.playerMaxHp * 100) + '%';
        const bossFill = $('#boss-hp-fill');
        const playerFill = $('#player-hp-fill');
        if (bossFill.style.width !== bossWidth) bossFill.style.width = bossWidth;
        if (playerFill.style.width !== playerWidth) playerFill.style.width = playerWidth;
        setText('#boss-phase', `第 ${battle.phase} / 2 条生命${battle.enraged ? ' · 狂暴' : ''}${battle.invincible ? ' · 无敌' : ''}`);
        const seconds = ms => (Math.max(0, ms) / 1000).toFixed(1) + 's';
        let state = '等待开始';
        if (battle.ended) state = battle.playerHp ? '核心已摧毁' : '对决结束';
        else if (paused) state = '已暂停';
        else if (playing) {
            if (battle.stun) state = '💫 眩晕 · ' + seconds(battle.stun);
            else if (battle.revival) state = '🔧 无敌复活 · ' + seconds(battle.revival);
            else {
                state = battle.state === 'interval' ? '攻击间隔' : battle.state === 'first' ? '瞄准第一个方块' : '选中第一个 · 瞄准第二个';
                state += ' · ' + seconds(battle.left);
                if (battle.active === 'night') state = '🌑 夜幕 ' + seconds(battle.skillLeft) + ' · ' + state;
                if (battle.active === 'contest') state = `⚔ 竞技 ${seconds(battle.competitionLeft)} · 你 ${battle.playerMatches} : BOSS ${battle.bossMatches} / 目标 4 · ` + state;
            }
        }
        setText('#boss-action', state);
        const hudState = battle.stun ? 'stunned' : battle.revival ? 'reviving' : battle.active || battle.state;
        if (bossHud.dataset.state !== hudState) bossHud.dataset.state = hudState;
        const names = { night: '🌑 夜幕降临', contest: '⚔ 同台竞技', rage: '🔥 狂暴模式' };
        setText('#boss-skills', battle.skills.map(s => names[s.id] + ' · ' + (battle.active === s.id ? '施放中' : s.left ? seconds(s.left) : '就绪')).join('　') || '普通攻击 · 基础 10 / 连击 +5');
    }

    // ---------- 点击与消除 ----------
    function onTileClick(e) {
        if (!playing || paused || locking) return;
        ensureAudio();
        const el = e.currentTarget;
        const r = +el.dataset.r, c = +el.dataset.c;
        if (board[r][c] === 0) return;
        if (isBossReserved(board[r][c])) { showToast('机器人已锁定此类方块'); return; }

        // 第一次选中
        if (!selected) {
            selected = { r: r, c: c };
            el.classList.add('selected');
            sfx.select();
            return;
        }

        // 点击自身：取消选中
        if (selected.r === r && selected.c === c) {
            el.classList.remove('selected');
            selected = null;
            return;
        }

        const prevEl = tileEls[selected.r][selected.c];

        // Revival permits inspecting and changing selection, but never matching.
        if (battle && battle.revival > 0) {
            prevEl.classList.remove('selected');
            selected = { r, c };
            el.classList.add('selected');
            sfx.select();
            showToast('BOSS 正在复活：可点选，暂时无法消除');
            return;
        }

        // 图案相同则尝试连线
        if (board[r][c] === board[selected.r][selected.c]) {
            const path = findPath(selected, { r: r, c: c });
            if (path) {
                doMatch(selected, { r: r, c: c }, path);
                return;
            }
        }

        // 无法消除：抖动提示，选中转移到新方块
        sfx.error();
        el.classList.add('shake');
        prevEl.classList.add('shake');
        setTimeout(() => {
            el.classList.remove('shake');
            prevEl.classList.remove('shake');
        }, 420);
        prevEl.classList.remove('selected');
        selected = { r: r, c: c };
        el.classList.add('selected');
    }

    function doMatch(a, b, path) {
        if (battle && battle.revival > 0) return;
        if (playerHintPair && (isPlayerHintCell(a.r, a.c) || isPlayerHintCell(b.r, b.c))) releasePlayerHint();
        locking = true;
        const elA = tileEls[a.r][a.c], elB = tileEls[b.r][b.c];
        elA.classList.remove('selected');
        elB.classList.remove('selected');
        clearHints();

        // 立即清空逻辑值，防止动画期间被重复选中
        board[a.r][a.c] = 0;
        board[b.r][b.c] = 0;
        selected = null;
        remain -= 2;

        // 连击判定与计分
        const now = Date.now();
        comboCount = (now - lastMatchAt <= COMBO_WINDOW) ? comboCount + 1 : 1;
        lastMatchAt = now;
        const gained = 10 + (comboCount - 1) * 5;
        score += gained;

        if (battle) {
            drawPath(path);
            elA.classList.add('removed'); elB.classList.add('removed');
            showFloatScore(elB, '+' + gained);
            locking = false;
            sfx.match();
            battle.playerMatch(gained);
            if (playing) maintainBossBoard();
            updateStatus(); updateBossHud();
            return;
        }
        const version = boardVersion;

        drawPath(path);
        if (comboCount > 1) sfx.combo(Math.min(comboCount, 8));
        else sfx.match();

        setTimeout(() => {
            elA.classList.add('matched');
            elB.classList.add('matched');
        }, 180);

        setTimeout(() => {
            if (version !== boardVersion) return;
            elA.classList.remove('matched');
            elB.classList.remove('matched');
            elA.classList.add('removed');
            elB.classList.add('removed');
            showFloatScore(elB, '+' + gained + (comboCount > 1
                ? '  连击×' + comboCount
                : ''));
            updateStatus();
            locking = false;

            if (remain <= 0) { winGame(); return; }
            if (!hasMoves()) {
                showToast('没有可消除的组合，自动洗牌！');
                setTimeout(() => { if (version === boardVersion && playing) doShuffle(false); }, 650);
            }
        }, 430);

        updateStatus();
    }

    // ---------- 连线绘制 ----------
    // 将棋盘坐标换算为 board-wrap 内的像素坐标（含外圈虚拟格）
    function cellCenter(r, c) {
        const base = tileEls[0][0].getBoundingClientRect();
        const wrapRect = wrapEl.getBoundingClientRect();
        const stepX = tileEls[0][1] ? tileEls[0][1].getBoundingClientRect().left - base.left : base.width;
        const stepY = tileEls[1] ? tileEls[1][0].getBoundingClientRect().top - base.top : base.height;
        let x = base.left + base.width / 2 + c * stepX - wrapRect.left;
        let y = base.top + base.height / 2 + r * stepY - wrapRect.top;
        x = Math.max(6, Math.min(wrapRect.width - 6, x));
        y = Math.max(6, Math.min(wrapRect.height - 6, y));
        return { x: x, y: y };
    }

    function drawPath(path) {
        const pts = path.map(p => cellCenter(p.r, p.c));
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', pts.map(p => p.x + ',' + p.y).join(' '));
        polyline.setAttribute('class', 'link-line');
        svgEl.appendChild(polyline);
        setTimeout(() => {
            if (polyline.parentNode) polyline.parentNode.removeChild(polyline);
        }, 520);
    }

    // ---------- 提示 / 洗牌 ----------
    function doHint() {
        if (!playing || paused || locking) return;
        if (hintsLeft <= 0) { showToast('提示次数用完啦'); return; }
        const pair = findAnyPair(true);
        if (!pair) { showToast('没有可消除的组合，请洗牌'); return; }
        hintsLeft--;
        hintCountEl.textContent = hintsLeft;
        if (hintsLeft === 0) hintBtn.disabled = true;

        releasePlayerHint();
        playerHintPair = pair.map(p => ({ r: p.r, c: p.c }));
        tileEls[pair[0].r][pair[0].c].classList.add('hint');
        tileEls[pair[1].r][pair[1].c].classList.add('hint');
        sfx.select();
    }

    function clearHints() {
        document.querySelectorAll('.tile.hint').forEach(t => t.classList.remove('hint'));
        if (playerHintPair) {
            playerHintPair.forEach(p => {
                if (board[p.r]?.[p.c]) tileEls[p.r][p.c].classList.add('hint');
            });
        }
    }

    function clearSelection() {
        if (selected) {
            tileEls[selected.r][selected.c].classList.remove('selected');
            selected = null;
        }
    }

    function doShuffle(manual) {
        if (manual) {
            if (!playing || paused || locking) return;
            if (shufflesLeft <= 0) { showToast('洗牌次数用完啦'); return; }
            shufflesLeft--;
            shuffleCountEl.textContent = shufflesLeft;
            if (shufflesLeft === 0) shuffleBtn.disabled = true;
        }
        clearSelection();
        releasePlayerHint();

        // 收集剩余图案重排，直到存在可行步骤
        const positions = [];
        const values = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c]) {
                    positions.push({ r: r, c: c });
                    values.push(board[r][c]);
                }
            }
        }
        let tries = 0;
        do {
            shuffleArray(values);
            positions.forEach((p, i) => { board[p.r][p.c] = values[i]; });
            tries++;
        } while (!hasMoves() && tries < 60);

        ensureMove();
        positions.forEach(p => {
            const el = tileEls[p.r][p.c];
            el.classList.add('shuffling');
            el.querySelector('span').textContent = ICONS[board[p.r][p.c] - 1];
            setTimeout(() => el.classList.remove('shuffling'), 380);
        });
        sfx.shuffle();
        if (manual) showToast('已重新洗牌');
    }

    // ---------- 界面反馈 ----------
    let toastTimer = null;
    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    function showFloatScore(tileEl, text) {
        const wrapRect = wrapEl.getBoundingClientRect();
        const rect = tileEl.getBoundingClientRect();
        const div = document.createElement('div');
        div.className = 'float-score';
        div.textContent = text;
        div.style.left = (rect.left + rect.width / 2 - wrapRect.left) + 'px';
        div.style.top = (rect.top - wrapRect.top) + 'px';
        wrapEl.appendChild(div);
        setTimeout(() => div.remove(), 950);
    }

    function updateStatus() {
        scoreEl.textContent = score;
        remainEl.textContent = remain;
    }

    function updateTimeDisplay() {
        timeEl.textContent = fmtTime(Math.max(0, timeLeft));
        const pct = totalTime ? Math.max(0, timeLeft / totalTime * 100) : 0;
        timebarEl.style.width = pct + '%';
        timebarEl.classList.toggle('danger', timeLeft > 0 && timeLeft <= 30);
    }

    // ---------- 计时与游戏流程 ----------
    function startTimer() {
        stopTimer();
        if (!playing || paused || document.hidden) return;
        if (battle) {
            lastFrame = performance.now();
            const tick = now => {
                if (!playing) return;
                const elapsed = now - lastFrame;
                lastFrame = now;
                if (!paused && !document.hidden) { battle.advance(elapsed); updateBossHud(); }
                if (playing) frameId = requestAnimationFrame(tick);
            };
            frameId = requestAnimationFrame(tick);
            return;
        }
        timerId = setInterval(() => {
            if (paused || document.hidden) return;
            timeLeft--;
            updateTimeDisplay();
            if (timeLeft <= 0) loseGame();
        }, 1000);
    }

    function stopTimer() {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        if (timerId) clearInterval(timerId);
        timerId = null;
    }

    function newGame() {
        stopTimer();
        battle = null; bossPair = null; playerHintPair = null;
        rageCueUntil = 0;
        damageCue = ''; damageCueUntil = 0;
        $('#board-combat-feedback').textContent = '';
        $('#game .game-panel').classList.remove('battle-impact');
        wrapEl.dataset.skill = '';
        wrapEl.classList.remove('skill-cast', 'skill-urgent', 'skill-paused', 'boss-stunned');
        $('#board-skill-banner').textContent = '';
        gridEl.classList.remove('nightfall');
        svgEl.innerHTML = '';
        playing = false;
        paused = false;
        autoPaused = false;
        locking = false;
        score = 0;
        comboCount = 0;
        lastMatchAt = 0;
        hintsLeft = (diff === 'normal') ? MAX_HINTS * 2 : MAX_HINTS;
        shufflesLeft = (diff === 'normal' || diff === 'hard') ? 0 : MAX_SHUFFLES;
        hintBtn.disabled = false;
        shuffleBtn.disabled = shufflesLeft === 0;
        hintCountEl.textContent = hintsLeft;
        shuffleCountEl.textContent = shufflesLeft;
        totalTime = DIFFS[diff].time;
        timeLeft = totalTime;
        buildBoard();
        remain = cols * rows;
        document.getElementById('game').classList.toggle('boss-mode', diff === 'hard');
        if (diff === 'hard') setupBattle();
        updateStatus();
        updateTimeDisplay();
        startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        setPauseIcon();
        hideOverlay();
    }

    function startGame() {
        ensureAudio();
        // 已在局中 / 上一局已结束：重新开局
        if (playing || remain <= 0 || (battle ? battle.ended : timeLeft <= 0)) newGame();
        playing = true;
        paused = false;
        autoPaused = false;
        startTimer();
        hideOverlay();
        startBtn.innerHTML = '<i class="fas fa-rotate-right"></i> 重新开始';
        setPauseIcon();
    }

    function winGame() {
        playing = false;
        stopTimer();
        sfx.win();
        const used = totalTime - timeLeft;
        const bonus = timeLeft * 2; // 剩余时间加分
        const toolBonus = shufflesLeft * 10 + hintsLeft * 5;// 道具剩余加分
        score += bonus + toolBonus;
        updateStatus();
        showOverlay('🎉', '恭喜通关！',
            '用时 ' + fmtTime(used) + '，剩余时间加分 +' + bonus + '，剩余道具加分 +' + toolBonus +
            '<br>最终得分 <b>' + score + '</b>', true, '再来一局');
        startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        if (window.showFireworks) {
            window.showFireworks();
            setTimeout(() => { if (window.hideFireworks) window.hideFireworks(); }, 6000);
        }
    }

    function loseGame() {
        playing = false;
        stopTimer();
        updateTimeDisplay();
        sfx.lose();
        showOverlay('⏰', '时间到！',
            '差一点点，再来一次吧！你可以尝试使用道具！<br>本局得分 <b>' + score + '</b>', true, '再来一局');
        startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
    }

    function togglePause() {
        if (!playing) return;
        paused = !paused;
        autoPaused = false;
        if (paused) {
            stopTimer();
            showOverlay('⏸', '已暂停', '点击下方按钮或遮罩任意处继续', true, '继续游戏');
        } else {
            startTimer();
            hideOverlay();
        }
        setPauseIcon();
    }

    function setPauseIcon() {
        lastFrame = performance.now();
        updateBossHud();
        pauseBtn.innerHTML = paused
            ? '<i class="fas fa-play"></i>'
            : '<i class="fas fa-pause"></i>';
    }

    // ---------- 遮罩层 ----------
    function showOverlay(emoji, title, html, withBtn, btnText) {
        overlayEl.querySelector('.overlay-emoji').textContent = emoji;
        overlayEl.querySelector('.overlay-title').textContent = title;
        overlayText.innerHTML = html;
        overlayBtn.style.display = withBtn ? 'inline-flex' : 'none';
        overlayBtn.textContent = btnText || '开始游戏';
        overlayEl.classList.add('show');
    }

    function hideOverlay() {
        overlayEl.classList.remove('show');
    }

    // ---------- 页面切换：自动暂停 / 恢复 ----------
    function onPageSwitch(targetPageId) {
        if (targetPageId === 'game') {
            requestAnimationFrame(adaptBoardToViewport);
            if (playing && autoPaused) {
                paused = false;
                autoPaused = false;
                hideOverlay();
                setPauseIcon();
                showToast('游戏已自动继续');
                startTimer();
            }
        } else if (playing) {
            stopTimer();
            if (!paused) {
                paused = true;
                autoPaused = true;
                setPauseIcon();
                showOverlay('⏸', '已暂停', '切换到其他页面或其他小游戏会自动暂停，<br>回到本页将自动继续', false);
            }
        }
    }

    // ---------- 初始化 ----------
    function init() {
        gridEl = $('#game-board');
        wrapEl = $('#board-wrap');
        svgEl = $('#game-lines');
        overlayEl = $('#game-overlay');
        overlayText = $('#overlay-text');
        overlayBtn = $('#overlay-btn');
        toastEl = $('#game-toast');
        timeEl = $('#game-time');
        scoreEl = $('#game-score');
        remainEl = $('#game-remain');
        timebarEl = $('#game-timebar');
        startBtn = $('#game-start-btn');
        hintBtn = $('#game-hint-btn');
        shuffleBtn = $('#game-shuffle-btn');
        pauseBtn = $('#game-pause-btn');
        soundBtn = $('#game-sound-btn');
        hintCountEl = $('#hint-count');
        shuffleCountEl = $('#shuffle-count');
        bossHud = $('#boss-hud');

        startBtn.addEventListener('click', startGame);
        hintBtn.addEventListener('click', doHint);
        shuffleBtn.addEventListener('click', () => doShuffle(true));
        pauseBtn.addEventListener('click', togglePause);

        overlayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (playing && paused) togglePause();
            else startGame();
        });
        overlayEl.addEventListener('click', () => {
            if (playing && paused) togglePause();
        });

        soundBtn.addEventListener('click', () => {
            soundOn = !soundOn;
            soundBtn.innerHTML = soundOn
                ? '<i class="fas fa-volume-high"></i>'
                : '<i class="fas fa-volume-xmark"></i>';
            soundBtn.classList.toggle('off', !soundOn);
            if (soundOn) { ensureAudio(); sfx.select(); }
        });

        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.diff === diff) return;
                diff = btn.dataset.diff;
                document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                newGame();
                showOverlay('🎴', '连连看',
                    diff === 'hard' ? '邪恶机器人 · 两条生命各 400 HP<br>你拥有 300 HP · 初始地图 9×8 · 提示 3 次 / 重置 0 次<br>消除即攻击；在机器人选块时消除可打断并眩晕！' :
                    '当前模式：' + DIFFS[diff].label + '（' + cols + '×' + rows + '，限时 ' +
                    fmtTime(DIFFS[diff].time) + '）<br>点击「开始游戏」出发！', false);
            });
        });

        // 监听顶部导航切换（与 script.js 的切换逻辑互不干扰）
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => onPageSwitch(link.dataset.page));
        });

        window.addEventListener('resize', () => {
            if (document.getElementById('game').classList.contains('active')) {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(adaptBoardToViewport, 120);
            }
        });
        // A background tab may stop animation frames entirely; never catch up hidden time.
        document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); });

        newGame();
        showOverlay('🎴', '连连看',
            '当前模式：' + DIFFS[diff].label + '（' + cols + '×' + rows + '，限时 ' +
            fmtTime(DIFFS[diff].time) + '）<br>点击两个相同图案、转弯不超过 2 次即可消除', false);
    }

    // 调试 / 测试入口（不影响正常游戏）
    globalThis.__LLK = {
        // 供「小游戏」下拉框调用：视图隐藏时自动暂停，重新显示时自动继续
        setVisible: (visible) => onPageSwitch(visible ? 'game' : '__hidden__'),
        findPath: (a, b) => findPath(a, b),
        findAnyPair: () => findAnyPair(),
        hasMoves: () => hasMoves(),
        isFree: (r, c) => isFree(r, c),
        setTestBoard: (b) => {
            board = b.map(row => row.slice());
            rows = board.length;
            cols = board[0].length;
        },
        getBoard: () => board.map(row => row.slice())
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();
