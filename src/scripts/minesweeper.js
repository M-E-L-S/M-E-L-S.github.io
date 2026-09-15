// ==========================================================
// 扫雷小游戏（纯前端实现）
// 规则：翻开所有「不含地雷」的格子即获胜。
//       数字 = 周围 8 格中的地雷数量；首次点击必定安全且必定连片展开。
// 结构：核心逻辑（Minesweeper 类，无 DOM，可在 Node 中直接测试）
//       + 界面控制（IIFE，仅在浏览器中运行）。
// ==========================================================
(function (root) {
    'use strict';

    const LEVELS = {
        easy:   { id: 'easy',   cols: 9,  rows: 9,  mines: 10, label: '初级', par: 60,  mult: 1, hints: 1 },
        normal: { id: 'normal', cols: 16, rows: 16, mines: 40, label: '中级', par: 180, mult: 2, hints: 2 },
        hard:   { id: 'hard',   cols: 30, rows: 16, mines: 99, label: '高级', par: 420, mult: 3, hints: 3 }
    };

    const HIDDEN = 0, OPEN = 1, FLAG = 2;

    class Minesweeper {
        // level 可以是 'easy' / 'normal' / 'hard'，也可以直接传入自定义配置对象（便于测试）
        constructor(level, options = {}) {
            const cfg = (level && typeof level === 'object') ? level : (LEVELS[level] || LEVELS.easy);
            this.cfg = cfg;
            this.level = cfg.id || 'custom';
            this.cols = cfg.cols;
            this.rows = cfg.rows;
            // 极端情况下保证至少留出首次点击的 3×3 安全区
            this.mineTotal = Math.max(0, Math.min(cfg.mines, Math.max(0, cfg.cols * cfg.rows - 9)));
            this.rng = typeof options.rng === 'function' ? options.rng : Math.random;
            this.reset();
        }

        reset() {
            const n = this.cols * this.rows;
            this.mine = new Uint8Array(n);
            this.adj = new Uint8Array(n);
            this.state = new Uint8Array(n);
            this.armed = false;      // 是否已布雷（首次点击后才布雷）
            this.over = false;
            this.won = false;
            this.flags = 0;
            this.opened = 0;
            this.boomCell = null;
            return this;
        }

        // ---------- 基础查询 ----------
        get total() { return this.cols * this.rows; }
        get safeTotal() { return this.total - this.mineTotal; }
        idx(r, c) { return r * this.cols + c; }
        rc(i) { return [Math.floor(i / this.cols), i % this.cols]; }
        inside(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
        stateOf(r, c) { return this.inside(r, c) ? this.state[this.idx(r, c)] : HIDDEN; }
        isMine(r, c) { return this.inside(r, c) && this.mine[this.idx(r, c)] === 1; }
        isOpen(r, c) { return this.stateOf(r, c) === OPEN; }
        isFlag(r, c) { return this.stateOf(r, c) === FLAG; }
        isHidden(r, c) { return this.stateOf(r, c) === HIDDEN; }
        adjOf(r, c) { return this.inside(r, c) ? this.adj[this.idx(r, c)] : 0; }
        minesLeft() { return this.mineTotal - this.flags; }
        safeLeft() { return this.safeTotal - this.opened; }

        neighbors(r, c) {
            const out = [];
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    const nr = r + dr, nc = c + dc;
                    if (this.inside(nr, nc)) out.push([nr, nc]);
                }
            }
            return out;
        }

        // ---------- 布雷：排除点击格与其 8 邻格 ----------
        arm(safeR, safeC) {
            if (this.armed) return this;
            const banned = new Set([this.idx(safeR, safeC)]);
            this.neighbors(safeR, safeC).forEach(([r, c]) => banned.add(this.idx(r, c)));
            const pool = [];
            for (let i = 0; i < this.total; i++) if (!banned.has(i)) pool.push(i);
            for (let i = 0; i < this.mineTotal; i++) {
                const j = i + Math.floor(this.rng() * (pool.length - i));
                const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
            }
            this.mine.fill(0);
            for (let i = 0; i < this.mineTotal; i++) this.mine[pool[i]] = 1;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const i = this.idx(r, c);
                    if (this.mine[i]) { this.adj[i] = 0; continue; }
                    let n = 0;
                    this.neighbors(r, c).forEach(([nr, nc]) => { if (this.mine[this.idx(nr, nc)]) n++; });
                    this.adj[i] = n;
                }
            }
            this.armed = true;
        }

        // ---------- 翻开 ----------
        reveal(r, c) {
            if (this.over || !this.inside(r, c)) return { status: 'ignore', changed: [] };
            if (!this.armed) this.arm(r, c);
            const i = this.idx(r, c);
            if (this.state[i] !== HIDDEN) return { status: 'ignore', changed: [] };
            const changed = [];
            if (this.mine[i]) {
                this.state[i] = OPEN;
                this.boomCell = [r, c];
                changed.push([r, c]);
                return this.explode(changed);
            }
            this.flood(r, c, changed);
            if (this.checkWin()) return { status: 'win', changed: changed.concat(this.autoFlag()) };
            return { status: 'ok', changed };
        }

        flood(sr, sc, changed) {
            const stack = [[sr, sc]];
            while (stack.length) {
                const cell = stack.pop();
                const r = cell[0], c = cell[1];
                const i = this.idx(r, c);
                if (this.state[i] !== HIDDEN || this.mine[i]) continue;
                this.state[i] = OPEN;
                this.opened++;
                changed.push([r, c]);
                if (this.adj[i] === 0) {
                    this.neighbors(r, c).forEach(([nr, nc]) => {
                        const ni = this.idx(nr, nc);
                        if (this.state[ni] === HIDDEN && !this.mine[ni]) stack.push([nr, nc]);
                    });
                }
            }
            return changed;
        }

        checkWin() {
            if (this.over) return false;
            if (this.opened >= this.safeTotal) {
                this.won = true;
                this.over = true;
                return true;
            }
            return false;
        }

        autoFlag() {
            const out = [];
            for (let i = 0; i < this.total; i++) {
                if (this.mine[i] && this.state[i] !== FLAG) {
                    this.state[i] = FLAG;
                    out.push(this.rc(i));
                }
            }
            this.flags = this.mineTotal;
            return out;
        }

        explode(changed) {
            this.over = true;
            this.won = false;
            const mines = [], wrongFlags = [];
            for (let i = 0; i < this.total; i++) {
                const rc = this.rc(i);
                if (this.mine[i]) {
                    if (this.state[i] !== OPEN) { this.state[i] = OPEN; mines.push(rc); changed.push(rc); }
                } else if (this.state[i] === FLAG) {
                    wrongFlags.push(rc);
                }
            }
            return { status: 'boom', changed, mines, wrongFlags, boom: this.boomCell };
        }

        // ---------- 插旗 ----------
        toggleFlag(r, c) {
            if (this.over || !this.inside(r, c)) return { status: 'ignore', cell: [r, c] };
            const i = this.idx(r, c);
            if (this.state[i] === HIDDEN) {
                this.state[i] = FLAG; this.flags++;
                return { status: 'flag', cell: [r, c] };
            }
            if (this.state[i] === FLAG) {
                this.state[i] = HIDDEN; this.flags--;
                return { status: 'unflag', cell: [r, c] };
            }
            return { status: 'ignore', cell: [r, c] };
        }

        // ---------- 双击和弦：旗数与数字相符时一次翻开周围格子 ----------
        chord(r, c) {
            if (this.over || !this.isOpen(r, c)) return { status: 'ignore', changed: [] };
            const need = this.adjOf(r, c);
            if (!need) return { status: 'ignore', changed: [] };
            const around = this.neighbors(r, c);
            let flagged = 0;
            around.forEach(([nr, nc]) => { if (this.isFlag(nr, nc)) flagged++; });
            if (flagged !== need) return { status: 'ignore', changed: [] };
            const changed = [];
            for (const [nr, nc] of around) {
                const ni = this.idx(nr, nc);
                if (this.state[ni] !== HIDDEN) continue;
                if (this.mine[ni]) {
                    this.state[ni] = OPEN;
                    this.boomCell = [nr, nc];
                    changed.push([nr, nc]);
                    return this.explode(changed);
                }
                this.flood(nr, nc, changed);
            }
            if (!changed.length) return { status: 'ignore', changed: [] };
            if (this.checkWin()) return { status: 'win', changed: changed.concat(this.autoFlag()), chord: true };
            return { status: 'ok', changed, chord: true };
        }

        // ---------- 提示：翻开一个安全格（优先边界上的 0 格，便于连片展开） ----------
        hint() {
            if (this.over) return { status: 'none', changed: [] };
            if (!this.armed) {
                const r = Math.floor(this.rows / 2), c = Math.floor(this.cols / 2);
                const res = this.reveal(r, c);
                res.cell = [r, c];
                return res;
            }
            const frontier = [], rest = [];
            for (let i = 0; i < this.total; i++) {
                if (this.state[i] !== HIDDEN || this.mine[i]) continue;
                const rc = this.rc(i);
                let nearOpen = false;
                this.neighbors(rc[0], rc[1]).forEach(([nr, nc]) => { if (this.isOpen(nr, nc)) nearOpen = true; });
                (nearOpen ? frontier : rest).push(rc);
            }
            const zeros = frontier.filter(([r, c]) => this.adjOf(r, c) === 0);
            const pool = zeros.length ? zeros : (frontier.length ? frontier : rest);
            if (!pool.length) return { status: 'none', changed: [] };
            const pick = pool[Math.floor(this.rng() * pool.length)];
            const res = this.reveal(pick[0], pick[1]);
            res.cell = pick;
            return res;
        }
    }

    Minesweeper.LEVELS = LEVELS;
    Minesweeper.CELL = { HIDDEN, OPEN, FLAG };
    root.Minesweeper = Minesweeper;
    root.MINE_LEVELS = LEVELS;
    if (typeof module !== 'undefined' && module.exports) module.exports = Minesweeper;
})(globalThis);
// ==========================================================
// 界面控制（仅浏览器环境运行）
// ==========================================================
(function () {
    'use strict';
    if (typeof document === 'undefined' || !globalThis.Minesweeper) return;

    const Minesweeper = globalThis.Minesweeper;
    const LEVELS = Minesweeper.LEVELS;
    const BEST_KEY = 'winy_mine_best_v1';
    const OPEN = 1, FLAG = 2;
    const $ = (id) => document.getElementById(id);

    // ---------- DOM ----------
    let stageEl, scrollEl, gridEl, overlayEl, overlayText, overlayBtn, toastEl;
    let flagsEl, timeEl, scoreEl, bestEl, progressEl;
    let startBtn, hintBtn, hintCountEl, flagModeBtn, pauseBtn, soundBtn;
    let cellEls = [];

    // ---------- 状态 ----------
    let level = 'easy';
    let game = new Minesweeper(level);
    let started = false;        // 是否已按「开始游戏」
    let clockStarted = false;   // 计时是否已随第一次操作启动
    let paused = false, autoPaused = false;
    let seconds = 0, timerId = null;
    let score = 0, hintsLeft = LEVELS[level].hints;
    let flagMode = false, soundOn = true, audioCtx = null;
    let bestMap = {};
    let popTimer = null, resizeTimer = null, toastTimer = null;
    let pressTimer = null, longPressed = false, touchMoved = false;
    let press = null, suppressUntil = 0;
    function cancelPress() { clearTimeout(pressTimer); pressTimer = null; press = null; }

    // ---------- 工具 ----------
    function fmt(sec) {
        sec = Math.max(0, Math.min(999, Math.round(sec || 0)));
        return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    }

    function levelIntro() {
        const cfg = LEVELS[level];
        return '当前难度：' + cfg.label + '（' + cfg.cols + '×' + cfg.rows + ' · ' + cfg.mines + ' 颗地雷）<br>' +
            '点击「开始游戏」出发，第一次点击必定安全';
    }

    // ---------- 音效（WebAudio 合成） ----------
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
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
            g.gain.setValueAtTime(gain || 0.06, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(g).connect(audioCtx.destination);
            osc.start(t0);
            osc.stop(t0 + dur + 0.05);
        } catch (e) { /* 音效失败不影响游戏 */ }
    }

    function noiseBurst(dur, gain) {
        if (!soundOn || !audioCtx) return;
        try {
            const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
            const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 850;
            const g = audioCtx.createGain();
            g.gain.setValueAtTime(gain, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
            src.connect(filter).connect(g).connect(audioCtx.destination);
            src.start();
        } catch (e) { /* 忽略 */ }
    }

    const sfx = {
        open(n)   { tone(430 + Math.min(14, n || 1) * 38, 0.07, 'triangle', 0.05); },
        chord()   { tone(660, 0.06, 'triangle', 0.05); tone(990, 0.09, 'triangle', 0.05, 0.05); },
        flag()    { tone(880, 0.06, 'square', 0.03); },
        unflag()  { tone(600, 0.05, 'square', 0.025); },
        hint()    { tone(784, 0.09, 'sine', 0.05); tone(1046, 0.12, 'sine', 0.045, 0.07); },
        deny()    { tone(196, 0.12, 'sawtooth', 0.03); },
        boom()    { noiseBurst(0.5, 0.16); tone(110, 0.5, 'sawtooth', 0.1); tone(65, 0.7, 'sine', 0.09, 0.04); },
        win()     { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, i * 0.13)); },
        start()   { tone(523, 0.09, 'triangle', 0.05); tone(784, 0.12, 'triangle', 0.05, 0.07); }
    };

    // ---------- 棋盘尺寸 ----------
    // 内容区域按整屏宽高适配，低于可读尺寸时保留滚动。
    // 固定导航栏和音乐栏不属于可玩区域；另留上下各 24px 的呼吸空间。
    function contentViewportHeight() {
        const topBar = document.querySelector('.navbar');
        const bottomBar = document.querySelector('.music-player');
        return (window.innerHeight || 800) - (topBar?.offsetHeight || 0) -
            (bottomBar?.offsetHeight || 0);
    }

    function updateCellSize() {
        if (!gridEl || !cellEls.length) return;
        const vw = window.innerWidth || 1280;
        const gap = vw <= 520 ? 2 : vw <= 900 ? 3 : 4;
        // 四周额外预留 16px 缓冲。
        const available = (stageEl.clientWidth || vw - (vw <= 520 ? 26 : 96)) - 32;
        const height = contentViewportHeight() - 48;
        const fit = (cols, rows) => Math.min((available - 72 - gap * (cols - 1)) / cols,
            (height - 76 - gap * (rows - 1)) / rows);
        const transposed = fit(game.rows, game.cols) > fit(game.cols, game.rows);
        const cols = transposed ? game.rows : game.cols;
        const rows = transposed ? game.cols : game.rows;
        gridEl.style.gridTemplateColumns = 'repeat(' + cols + ', var(--mine-cell))';
        cellEls.forEach(el => {
            el.style.gridColumn = String(Number(el.dataset[transposed ? 'r' : 'c']) + 1);
            el.style.gridRow = String(Number(el.dataset[transposed ? 'c' : 'r']) + 1);
        });
        const minCell = vw <= 360 ? 22 : vw <= 520 ? 24 : 26;
        let size = Math.max(minCell, Math.floor(Math.min(available / cols, height / rows)));
        while (size > minCell) {
            const px = Math.max(vw <= 520 ? 4 : 10, Math.min(26, Math.round(size * 0.34)));
            const py = Math.max(vw <= 520 ? 6 : 10, Math.min(22, Math.round(size * 0.3)));
            if (cols * size + gap * (cols - 1) + 2 * px + 20 <= available &&
                rows * size + gap * (rows - 1) + 2 * py + 32 <= height) break;
            size--;
        }
        gridEl.style.setProperty('--mine-cell', size + 'px');
        gridEl.style.setProperty('--mine-gap', gap + 'px');
        gridEl.style.setProperty('--mine-fs', Math.max(13, Math.floor(size * 0.52)) + 'px');
        gridEl.style.setProperty('--mine-icon-fs', Math.max(15, Math.floor(size * 0.62)) + 'px');
        if (stageEl) {
            const padX = Math.max(vw <= 520 ? 4 : 10, Math.min(26, Math.round(size * 0.34)));
            const padY = Math.max(vw <= 520 ? 6 : 10, Math.min(22, Math.round(size * 0.3)));
            stageEl.style.padding = padY + 'px ' + padX + 'px';
        }
    }

    function buildGrid() {
        gridEl.innerHTML = '';
        gridEl.style.gridTemplateColumns = 'repeat(' + game.cols + ', var(--mine-cell))';
        cellEls = [];
        const frag = document.createDocumentFragment();
        for (let r = 0; r < game.rows; r++) {
            for (let c = 0; c < game.cols; c++) {
                const el = document.createElement('div');
                el.className = 'mine-cell';
                el.dataset.r = r;
                el.dataset.c = c;
                el.setAttribute('aria-label', '第 ' + (r + 1) + ' 行第 ' + (c + 1) + ' 列，未翻开');
                frag.appendChild(el);
                cellEls.push(el);
            }
        }
        gridEl.appendChild(frag);
        if (scrollEl) scrollEl.scrollLeft = 0;
        updateCellSize();
    }

    // ---------- 绘制 ----------
    function ariaFor(r, c, st, mine) {
        const pos = '第 ' + (r + 1) + ' 行第 ' + (c + 1) + ' 列，';
        if (st === OPEN) {
            if (mine) return pos + '地雷';
            const n = game.adj[game.idx(r, c)];
            return pos + (n ? '周围 ' + n + ' 颗地雷' : '空白');
        }
        if (st === FLAG) return pos + '已插旗';
        return pos + '未翻开';
    }

    function paintCell(r, c, delay) {
        const i = game.idx(r, c);
        const el = cellEls[i];
        if (!el) return;
        const st = game.state[i];
        const mine = game.armed && game.mine[i] === 1;
        const cls = ['mine-cell'];
        let text = '';
        if (st === OPEN) {
            cls.push('open');
            if (mine) {
                cls.push('mine');
                text = '💣';
                if (game.boomCell && game.boomCell[0] === r && game.boomCell[1] === c) cls.push('boom');
            } else {
                const n = game.adj[i];
                if (n > 0) { cls.push('n' + n); text = String(n); }
            }
        } else if (st === FLAG) {
            cls.push('flag');
            if (game.over && !game.won && !mine) { cls.push('wrong'); text = '❌'; }
            else text = '🚩';
        }
        const wasPop = el.classList.contains('pop');
        el.className = cls.join(' ');
        if (el.textContent !== text) el.textContent = text;
        el.setAttribute('aria-label', ariaFor(r, c, st, mine));
        if (delay === undefined || delay === null) {
            el.style.animationDelay = '';
        } else {
            if (wasPop) void el.offsetWidth;   // 强制重排以重启动画
            el.classList.add('pop');
            el.style.animationDelay = delay + 'ms';
        }
    }

    function paintChanged(changed, origin) {
        if (!changed || !changed.length) return;
        let maxDelay = 0;
        changed.forEach((rc) => {
            let delay = 0;
            if (origin) {
                const d = Math.max(Math.abs(rc[0] - origin[0]), Math.abs(rc[1] - origin[1]));
                delay = Math.min(14, d) * 16;
            }
            if (delay > maxDelay) maxDelay = delay;
            paintCell(rc[0], rc[1], delay);
        });
        clearTimeout(popTimer);
        popTimer = setTimeout(clearPops, maxDelay + 340);
    }

    function clearPops() {
        cellEls.forEach((el) => {
            if (el.classList.contains('pop')) {
                el.classList.remove('pop');
                el.style.animationDelay = '';
            }
        });
    }

    function paintAll() {
        for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) paintCell(r, c);
    }

    // ---------- 状态栏 ----------
    function updateStatus() {
        const left = game.minesLeft();
        flagsEl.textContent = left;
        flagsEl.classList.toggle('negative', left < 0);
        timeEl.textContent = fmt(seconds);
        scoreEl.textContent = score;
        bestEl.textContent = typeof bestMap[level] === 'number' ? fmt(bestMap[level]) : '--:--';
        const pct = game.safeTotal ? (game.opened / game.safeTotal * 100) : 0;
        progressEl.style.width = pct.toFixed(1) + '%';
        progressEl.classList.toggle('done', game.won);
    }

    function loadBest() {
        try { bestMap = JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (e) { bestMap = {}; }
    }

    function saveBest(sec) {
        const prev = bestMap[level];
        if (typeof prev === 'number' && prev <= sec) return false;
        bestMap[level] = sec;
        try { localStorage.setItem(BEST_KEY, JSON.stringify(bestMap)); } catch (e) { /* 隐私模式下忽略 */ }
        return true;
    }

    // ---------- 遮罩 / 提示条 ----------
    function showOverlay(emoji, title, html, withBtn, btnText) {
        overlayEl.querySelector('.overlay-emoji').textContent = emoji;
        overlayEl.querySelector('.overlay-title').textContent = title;
        overlayText.innerHTML = html;
        overlayBtn.style.display = withBtn ? 'inline-flex' : 'none';
        overlayBtn.textContent = btnText || '开始游戏';
        overlayEl.classList.add('show');
    }

    function hideOverlay() { overlayEl.classList.remove('show'); }

    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
    }

    // ---------- 计时 ----------
    function markFirstAction() {
        if (clockStarted) return;
        clockStarted = true;
        startTimer();
    }

    function startTimer() {
        stopTimer();
        if (!started || paused || game.over || document.hidden) return;
        timerId = setInterval(() => {
            if (!started || paused || game.over || document.hidden) return;
            seconds = Math.min(999, seconds + 1);
            timeEl.textContent = fmt(seconds);
        }, 1000);
    }

    function stopTimer() {
        if (timerId) clearInterval(timerId);
        timerId = null;
    }

    // ---------- 游戏流程 ----------
    function newGame(nextLevel) {
        if (nextLevel && LEVELS[nextLevel]) level = nextLevel;
        stopTimer();
        clearTimeout(popTimer);
        game = new Minesweeper(level);
        started = false;
        clockStarted = false;
        paused = false;
        autoPaused = false;
        seconds = 0;
        score = 0;
        hintsLeft = LEVELS[level].hints;
        hintCountEl.textContent = hintsLeft;
        hintBtn.disabled = false;
        stageEl.classList.remove('paused');
        startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        buildGrid();
        updateStatus();
        showOverlay('💣', '扫雷', levelIntro(), true, '开始游戏');
    }

    function beginGame() {
        if (game.over) { newGame(); }
        started = true;
        ensureAudio();
        hideOverlay();
        startBtn.innerHTML = '<i class="fas fa-rotate-right"></i> 重新开始';
        sfx.start();
        showToast(LEVELS[level].label + ' · ' + game.cols + '×' + game.rows + ' · 第一次点击必定安全');
    }

    function guardActive() {
        if (game.over || paused) return false;
        if (!started) beginGame();
        return true;
    }

    function doReveal(r, c) {
        if (!guardActive()) return;
        const res = game.reveal(r, c);
        if (res.status === 'ignore') {
            if (game.isFlag(r, c)) { showToast('这一格插着旗子，先取消标记吧'); sfx.deny(); }
            return;
        }
        markFirstAction();
        paintChanged(res.changed, [r, c]);
        if (res.status === 'boom') { loseGame(res); return; }
        score += res.changed.length * 2;
        sfx.open(res.changed.length);
        updateStatus();
        if (res.status === 'win') winGame();
    }

    function doFlag(r, c) {
        if (!guardActive()) return;
        const res = game.toggleFlag(r, c);
        if (res.status === 'ignore') return;
        markFirstAction();
        paintCell(r, c, 0);
        if (res.status === 'flag') sfx.flag(); else sfx.unflag();
        updateStatus();
    }

    function doChord(r, c) {
        if (!guardActive()) return;
        const res = game.chord(r, c);
        if (res.status === 'ignore') { sfx.deny(); return; }
        markFirstAction();
        paintChanged(res.changed, [r, c]);
        if (res.status === 'boom') { loseGame(res); return; }
        score += res.changed.length * 3;
        sfx.chord();
        updateStatus();
        if (res.status === 'win') winGame();
    }

    function doHint() {
        if (!started || paused || game.over) return;
        if (hintsLeft <= 0) { showToast('本局提示次数已用完'); sfx.deny(); return; }
        const res = game.hint();
        if (res.status === 'none') { showToast('没有可提示的格子了'); return; }
        hintsLeft--;
        hintCountEl.textContent = hintsLeft;
        hintBtn.disabled = hintsLeft <= 0;
        markFirstAction();
        paintChanged(res.changed, res.cell);
        sfx.hint();
        showToast('已为你翻开一个安全格（剩余 ' + hintsLeft + ' 次）');
        if (res.status === 'boom') { loseGame(res); return; }
        score += res.changed.length * 2;
        updateStatus();
        if (res.status === 'win') winGame();
    }

    function winGame() {
        stopTimer();
        started = false;
        const cfg = LEVELS[level];
        const bonus = Math.max(0, cfg.par - seconds) * cfg.mult + hintsLeft * 30;
        score += bonus;
        const record = saveBest(seconds);
        updateStatus();
        sfx.win();
        startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        showOverlay('🎉', '排雷成功！',
            '难度：' + cfg.label + ' · 用时 <b>' + fmt(seconds) + '</b>' +
            (record ? ' · 新纪录！' : (typeof bestMap[level] === 'number' ? ' · 最佳 ' + fmt(bestMap[level]) : '')) +
            '<br>通关奖励 +' + bonus + '，最终得分 <b>' + score + '</b>', true, '再来一局');
        if (window.showFireworks) {
            window.showFireworks();
            setTimeout(() => { if (window.hideFireworks) window.hideFireworks(); }, 6000);
        }
    }

    function loseGame(res) {
        stopTimer();
        started = false;
        stageEl.classList.add('shake');
        setTimeout(() => stageEl.classList.remove('shake'), 520);
        paintChanged(res.wrongFlags || [], null);
        sfx.boom();
        updateStatus();
        startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        setTimeout(() => {
            if (game.won) return;
            showOverlay('💥', '踩到地雷！',
                '坚持了 <b>' + fmt(seconds) + '</b>，翻开 ' + game.opened + ' / ' + game.safeTotal + ' 个安全格' +
                '<br>本局得分 <b>' + score + '</b>' +
                (res.wrongFlags && res.wrongFlags.length
                    ? '<br>另有 ' + res.wrongFlags.length + ' 面旗子插错了位置（❌）' : ''),
                true, '再来一局');
        }, 760);
    }

    function togglePause() {
        if (!started || game.over) return;
        paused = !paused;
        autoPaused = false;
        stageEl.classList.toggle('paused', paused);
        pauseBtn.innerHTML = paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
        if (paused) {
            stopTimer();
            showOverlay('⏸', '已暂停', '点击下方按钮或遮罩任意处继续', true, '继续游戏');
        } else {
            if (clockStarted) startTimer();
            hideOverlay();
        }
    }

    function toggleFlagMode() {
        flagMode = !flagMode;
        flagModeBtn.classList.toggle('active', flagMode);
        flagModeBtn.innerHTML = '<i class="fas fa-flag"></i> 标记模式：' + (flagMode ? '开' : '关');
        showToast(flagMode ? '标记模式开启：点击格子插旗' : '标记模式关闭：点击格子翻开');
    }

    function toggleSound() {
        soundOn = !soundOn;
        soundBtn.innerHTML = soundOn ? '<i class="fas fa-volume-high"></i>' : '<i class="fas fa-volume-xmark"></i>';
        soundBtn.classList.toggle('off', !soundOn);
        if (soundOn) { ensureAudio(); sfx.flag(); }
    }

    // ---------- 输入 ----------
    function cellFromEvent(e) {
        const el = e.target.closest ? e.target.closest('.mine-cell') : null;
        return el ? [+el.dataset.r, +el.dataset.c] : null;
    }

    function bindBoard() {
        gridEl.addEventListener('click', (e) => {
            const rc = cellFromEvent(e);
            if (!rc) return;
            if ((longPressed || touchMoved) && Date.now() < suppressUntil) return;
            if (flagMode) doFlag(rc[0], rc[1]);
            else doReveal(rc[0], rc[1]);
        });

        gridEl.addEventListener('dblclick', (e) => {
            const rc = cellFromEvent(e);
            if (!rc) return;
            e.preventDefault();
            doChord(rc[0], rc[1]);
        });

        gridEl.addEventListener('contextmenu', (e) => {
            const rc = cellFromEvent(e);
            if (!rc) return;
            e.preventDefault();
            // 触屏原生长按菜单不能把刚插上的旗再次取消。
            if (press || (longPressed && Date.now() < suppressUntil) || e.pointerType === 'touch') return;
            doFlag(rc[0], rc[1]);
        });

        function startPress(e, point) {
            cancelPress();
            longPressed = false;
            touchMoved = false;
            const rc = cellFromEvent(e);
            if (!rc || paused) return;
            press = { x: point.clientX, y: point.clientY, id: point.pointerId };
            pressTimer = setTimeout(() => {
                if (!press || document.hidden) return;
                longPressed = true;
                suppressUntil = Date.now() + 1000;
                doFlag(rc[0], rc[1]);
                if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} }
            }, 420);
        }
        function movePress(point) {
            if (!press) return;
            // 手指轻微抖动不取消长按，真正滑动才交给滚动。
            if (Math.hypot(point.clientX - press.x, point.clientY - press.y) > 10) {
                touchMoved = true;
                suppressUntil = Date.now() + 1000;
                cancelPress();
            }
        }
        function endPress() {
            if (longPressed || touchMoved) suppressUntil = Date.now() + 1000;
            cancelPress();
        }
        if (window.PointerEvent) {
            gridEl.addEventListener('pointerdown', e => {
                if (e.isPrimary === false) { endPress(); return; }
                if (e.button !== 0) return;
                startPress(e, e);
            });
            gridEl.addEventListener('pointermove', movePress);
            gridEl.addEventListener('pointerleave', endPress);
            window.addEventListener('pointerup', endPress);
            window.addEventListener('pointercancel', endPress);
        } else {
            gridEl.addEventListener('touchstart', e => {
                if (e.touches.length !== 1) { endPress(); return; }
                startPress(e, e.touches[0]);
            }, { passive: true });
            gridEl.addEventListener('touchmove', e => { if (e.touches[0]) movePress(e.touches[0]); }, { passive: true });
            gridEl.addEventListener('touchend', endPress);
            gridEl.addEventListener('touchcancel', endPress);
        }
        document.addEventListener('visibilitychange', () => { if (document.hidden) endPress(); });
        window.addEventListener('blur', endPress);

    }

    // ---------- 可见性：切页 / 切游戏时自动暂停 ----------
    function isVisible() {
        const page = $('game');
        const view = $('mine-view');
        return !!(page && view && page.classList.contains('active') && !view.hidden);
    }

    function setVisible(visible) {
        if (!visible) cancelPress();
        if (visible) {
            requestAnimationFrame(updateCellSize);
            if (started && autoPaused) {
                paused = false;
                autoPaused = false;
                stageEl.classList.remove('paused');
                pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                hideOverlay();
                showToast('游戏已自动继续');
                if (clockStarted) startTimer();
            }
        } else if (started && !game.over) {
            stopTimer();
            if (!paused) {
                paused = true;
                autoPaused = true;
                stageEl.classList.add('paused');
                pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                showOverlay('⏸', '已暂停', '切换到其他页面或其他小游戏会自动暂停，<br>回到本页将自动继续', false);
            }
        }
    }

    // ---------- 初始化 ----------
    function init() {
        stageEl = $('mine-stage');
        scrollEl = $('mine-scroll');
        gridEl = $('mine-board');
        overlayEl = $('mine-overlay');
        overlayText = $('mine-overlay-text');
        overlayBtn = $('mine-overlay-btn');
        toastEl = $('mine-toast');
        flagsEl = $('mine-flags');
        timeEl = $('mine-time');
        scoreEl = $('mine-score');
        bestEl = $('mine-best');
        progressEl = $('mine-progress-fill');
        startBtn = $('mine-start-btn');
        hintBtn = $('mine-hint-btn');
        hintCountEl = $('mine-hint-count');
        flagModeBtn = $('mine-flagmode-btn');
        pauseBtn = $('mine-pause-btn');
        soundBtn = $('mine-sound-btn');
        if (!gridEl || !overlayEl) return;

        loadBest();
        bindBoard();

        startBtn.addEventListener('click', () => { newGame(); beginGame(); });
        hintBtn.addEventListener('click', doHint);
        pauseBtn.addEventListener('click', togglePause);
        flagModeBtn.addEventListener('click', toggleFlagMode);
        soundBtn.addEventListener('click', toggleSound);

        overlayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (paused) togglePause();
            else if (!started && !game.over) beginGame();
            else { newGame(); beginGame(); }
        });
        overlayEl.addEventListener('click', () => {
            if (paused) togglePause();
            else if (!started && !game.over) beginGame();
        });

        document.querySelectorAll('.mine-diff-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const next = btn.dataset.mineDiff;
                document.querySelectorAll('.mine-diff-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                newGame(next);
            });
        });

        window.addEventListener('resize', () => {
            if (!isVisible()) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(updateCellSize, 120);
        });

        newGame();
    }

    // 调试 / 联动入口
    globalThis.__MINE = {
        setVisible: setVisible,
        newGame: (lv) => newGame(lv),
        begin: () => beginGame(),
        reveal: (r, c) => doReveal(r, c),
        flag: (r, c) => doFlag(r, c),
        chord: (r, c) => doChord(r, c),
        hint: () => doHint(),
        get: () => ({
            level, started, paused, seconds, score, hintsLeft,
            opened: game.opened, safeTotal: game.safeTotal, minesLeft: game.minesLeft()
        }),
        core: () => game
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
