// ==========================================================
// 蜘蛛纸牌小游戏（纯前端实现）
// 规则：两副牌共 104 张，发成 10 列（前 4 列 6 张、后 6 列 5 张），每列只有最上面一张翻开。
//       把「同花色、K→A」的 13 张连成一组即自动收起，收满 8 组获胜。
//       只有「同花色且点数依次递减」的连续牌才能整组搬动；
//       落点要求目标列顶牌点数正好比它大 1（花色不限），空列可以放任意一组牌。
//       剩下 50 张在牌堆里，分 5 次发完，发牌前 10 列都不能为空。
// 结构：核心逻辑（Spider 类，无 DOM，可在 Node 中直接测试）
//       + 界面控制（IIFE，仅在浏览器中运行）。
// ==========================================================
(function (root) {
    'use strict';

    const SUITS = ['♠', '♥', '♣', '♦'];
    const SUIT_NAMES = ['黑桃', '红桃', '梅花', '方块'];
    const RANK_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const COLS = 10;
    const GROUPS = 8;

    // par：通关奖励的基准用时（秒）；mult：难度倍率；hints / undos：每局道具次数
    const LEVELS = {
        easy:   { id: 'easy',   suits: 1, label: '单色', par: 300, mult: 1, hints: 5, undos: 2 },
        normal: { id: 'normal', suits: 2, label: '双色', par: 480, mult: 2, hints: 5, undos: 3 },
        hard:   { id: 'hard',   suits: 4, label: '四色', par: 780, mult: 3, hints: 5, undos: 5 }
    };

    class Spider {
        // level 可以是 'easy' / 'normal' / 'hard'，也可以直接传入自定义配置对象（便于测试）
        constructor(level, options = {}) {
            const cfg = (level && typeof level === 'object') ? level : (LEVELS[level] || LEVELS.easy);
            this.cfg = cfg;
            this.level = cfg.id || 'custom';
            this.suitCount = [1, 2, 4].indexOf(cfg.suits) >= 0 ? cfg.suits : 1;
            this.rng = typeof options.rng === 'function' ? options.rng : Math.random;
            this.maxHistory = options.maxHistory || 400;
            this.reset();
        }

        reset() {
            const deck = this.buildDeck();
            this.cols = [];
            for (let c = 0; c < COLS; c++) this.cols.push([]);
            let k = 0;
            for (let c = 0; c < COLS; c++) {
                const n = c < 4 ? 6 : 5;                    // 前 4 列 6 张，后 6 列 5 张 = 54 张
                for (let i = 0; i < n; i++) this.cols[c].push(deck[k++]);
            }
            this.stock = deck.slice(k);                     // 剩下 50 张，正好发 5 轮
            this.done = [];                                 // 已收好的花色（每项是一个花色编号）
            this.history = [];
            this.cols.forEach((col) => { if (col.length) col[col.length - 1].up = true; });
            this.moves = 0;
            this.deals = 0;
            this.score = 0;
            this.over = false;
            this.won = false;
            this.stuck = !this.hasMoves();
            return this;
        }

        // ---------- 牌堆：两副牌，按难度决定用几种花色 ----------
        buildDeck() {
            const copies = 8 / this.suitCount;              // 单色 8 份 / 双色 4 份 / 四色 2 份
            const deck = [];
            for (let s = 0; s < this.suitCount; s++) {
                for (let k = 0; k < copies; k++) {
                    for (let r = 1; r <= 13; r++) deck.push({ s: s, r: r, up: false });
                }
            }
            for (let i = deck.length - 1; i > 0; i--) {     // Fisher-Yates 洗牌
                const j = Math.floor(this.rng() * (i + 1));
                const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
            }
            return deck;
        }

        // ---------- 基础查询 ----------
        get completed() { return this.done.length; }
        get dealsLeft() { return Math.floor(this.stock.length / COLS); }
        col(c) { return this.cols[c] || []; }
        count(c) { return this.col(c).length; }
        cardAt(c, i) { const col = this.cols[c]; return (col && col[i]) || null; }
        top(c) { const col = this.cols[c]; return (col && col.length) ? col[col.length - 1] : null; }
        isRed(s) { return s === 1 || s === 3; }
        name(card) { return card ? RANK_NAMES[card.r] + SUITS[card.s] : ''; }
        faceUpTotal() {
            let n = 0;
            this.cols.forEach((col) => col.forEach((cd) => { if (cd.up) n++; }));
            return n;
        }
        cardsLeft() {
            return this.stock.length + this.cols.reduce((a, col) => a + col.length, 0);
        }

        // 一列末尾「同花色且依次递减」的连续牌起点；没有可动的牌时返回 -1
        runStart(c) {
            const col = this.cols[c];
            if (!col || !col.length || !col[col.length - 1].up) return -1;
            let i = col.length - 1;
            while (i > 0) {
                const cur = col[i], prev = col[i - 1];
                if (!prev.up || prev.s !== cur.s || prev.r !== cur.r + 1) break;
                i--;
            }
            return i;
        }

        // 从第 c 列第 i 张（含）到列尾，能否整组拿起
        canPick(c, i) {
            const col = this.cols[c];
            if (!col || !(i >= 0) || i >= col.length || !col[i].up) return false;
            const st = this.runStart(c);
            return st >= 0 && i >= st;
        }

        // 能否把这组牌放到第 to 列
        canDrop(c, i, to) {
            if (c === to || !(to >= 0) || to >= COLS) return false;
            if (!this.canPick(c, i)) return false;
            const moving = this.cols[c][i];
            const target = this.top(to);
            return !target || target.r === moving.r + 1;
        }

        // 这组牌的所有合法落点
        targets(c, i) {
            const out = [];
            for (let to = 0; to < COLS; to++) if (this.canDrop(c, i, to)) out.push(to);
            return out;
        }

        canDeal() {
            if (!this.stock.length) return false;
            for (let c = 0; c < COLS; c++) if (!this.cols[c].length) return false;
            return true;
        }

        emptyCol() {
            for (let c = 0; c < COLS; c++) if (!this.cols[c].length) return c;
            return -1;
        }

        // 还有没有牌可走（「还能发牌」也算有路）
        hasMoves() {
            for (let c = 0; c < COLS; c++) {
                const st = this.runStart(c);
                if (st < 0) continue;
                for (let i = st; i < this.cols[c].length; i++) {
                    if (this.targets(c, i).length) return true;
                }
            }
            return this.canDeal();
        }

        emptyCount() {
            let n = 0;
            for (let c = 0; c < COLS; c++) if (!this.cols[c].length) n++;
            return n;
        }

        // ---------- 存档：撤销用的完整快照 ----------
        snapshot() {
            return {
                cols: this.cols.map((col) => col.map((cd) => ({ s: cd.s, r: cd.r, up: cd.up }))),
                stock: this.stock.map((cd) => ({ s: cd.s, r: cd.r, up: cd.up })),
                done: this.done.slice(),
                moves: this.moves,
                deals: this.deals,
                score: this.score
            };
        }

        restore(snap) {
            this.cols = snap.cols.map((col) => col.map((cd) => ({ s: cd.s, r: cd.r, up: cd.up })));
            this.stock = snap.stock.map((cd) => ({ s: cd.s, r: cd.r, up: cd.up }));
            this.done = snap.done.slice();
            this.moves = snap.moves;
            this.deals = snap.deals;
            this.score = snap.score;
            return this;
        }

        pushHistory() {
            this.history.push(this.snapshot());
            if (this.history.length > this.maxHistory) this.history.shift();
        }

        // ---------- 收牌：把每列末尾「同花色 K→A」的完整 13 张收走 ----------
        collect() {
            const out = [];
            for (let c = 0; c < COLS; c++) {
                const col = this.cols[c];
                if (col.length < 13) continue;
                const st = col.length - 13;
                const s = col[st].s;
                let ok = col[st].r === 13;
                for (let i = 0; ok && i < 13; i++) {
                    const cd = col[st + i];
                    if (!cd.up || cd.s !== s || cd.r !== 13 - i) ok = false;
                }
                if (!ok) continue;
                const cards = col.splice(st, 13);
                this.done.push(s);
                let flip = null;
                if (col.length && !col[col.length - 1].up) {
                    col[col.length - 1].up = true;
                    flip = col.length - 1;
                }
                out.push({ col: c, suit: s, cards: cards, from: st, flip: flip });
            }
            return out;
        }

        // ---------- 移动一组牌 ----------
        move(from, i, to) {
            if (this.over) return { status: 'reject', reason: 'over' };
            if (!this.canDrop(from, i, to)) {
                let reason = 'same';
                if (from !== to) reason = this.canPick(from, i) ? 'rank' : 'not-run';
                return { status: 'reject', reason: reason, from: from, index: i, to: to };
            }
            this.pushHistory();
            const src = this.cols[from];
            const cards = src.splice(i);
            this.cols[to] = this.cols[to].concat(cards);
            let flipped = null;
            if (src.length && !src[src.length - 1].up) {
                src[src.length - 1].up = true;
                flipped = { col: from, index: src.length - 1 };
            }
            this.moves++;
            this.score += 5;
            const collected = this.collect();
            if (collected.length) this.score += 100 * collected.length;
            return this.finish({
                status: 'ok', from: from, index: i, to: to,
                cards: cards, flipped: flipped, collected: collected,
                moves: this.moves, score: this.score
            });
        }

        // ---------- 发牌：牌堆给 10 列各补一张（有空列时不允许） ----------
        deal() {
            if (this.over) return { status: 'reject', reason: 'over' };
            if (!this.stock.length) return { status: 'reject', reason: 'empty-stock' };
            const hole = this.emptyCol();
            if (hole >= 0) return { status: 'reject', reason: 'hole', col: hole };
            this.pushHistory();
            const cards = [];
            for (let c = 0; c < COLS; c++) {
                const cd = this.stock.pop();
                cd.up = true;
                this.cols[c].push(cd);
                cards.push({ col: c, index: this.cols[c].length - 1, card: cd });
            }
            this.deals++;
            const collected = this.collect();
            if (collected.length) this.score += 100 * collected.length;
            return this.finish({
                status: 'ok', cards: cards, collected: collected,
                deals: this.deals, dealsLeft: this.dealsLeft, score: this.score
            });
        }

        // ---------- 悔棋 ----------
        undo() {
            if (!this.history.length) return { status: 'none' };
            this.restore(this.history.pop());
            this.over = false;
            this.won = false;
            this.stuck = !this.hasMoves();
            return {
                status: 'ok', stuck: this.stuck, score: this.score,
                moves: this.moves, completed: this.completed, dealsLeft: this.dealsLeft
            };
        }

        // ---------- 提示：挑一步评分最高的走法 ----------
        // 评分思路：能翻出新牌、能腾空列、能同花色接龙的走法优先；牌堆还有牌时兜底提示发牌。
        hint() {
            if (this.over) return { status: 'none' };
            const empties = this.emptyCount();
            let best = null;
            for (let c = 0; c < COLS; c++) {
                const col = this.cols[c];
                const st = this.runStart(c);
                if (st < 0) continue;
                for (let i = st; i < col.length; i++) {
                    const tgts = this.targets(c, i);
                    for (let k = 0; k < tgts.length; k++) {
                        const to = tgts[k];
                        const target = this.top(to);
                        let v = col.length - i;                          // 一次搬得越多越划算
                        if (target) {
                            v += 12;
                            if (target.s === col[i].s) v += 20;          // 同花色接龙最有价值
                        } else {
                            v -= empties > 1 ? 4 : 14;                   // 空列很宝贵，别轻易占掉
                        }
                        if (i === st && i > 0 && !col[i - 1].up) v += 18;  // 能翻开一张新牌
                        if (i === st && i === 0) v += 10;                  // 能腾空一整列
                        v -= (i - st) * 2;                               // 能少搬就少搬
                        if (!best || v > best.v) best = { v: v, from: c, index: i, to: to };
                    }
                }
            }
            if (best) return { status: 'ok', from: best.from, index: best.index, to: best.to, value: best.v };
            if (this.canDeal()) return { status: 'deal' };
            return { status: 'none' };
        }

        // ---------- 收尾：判定获胜 / 无路可走 ----------
        finish(res) {
            if (this.completed >= GROUPS) {
                this.won = true;
                this.over = true;
                res.status = 'win';
                return res;
            }
            this.stuck = !this.hasMoves();
            if (this.stuck) res.status = 'stuck';
            return res;
        }
    }

    Spider.LEVELS = LEVELS;
    Spider.SUITS = SUITS;
    Spider.SUIT_NAMES = SUIT_NAMES;
    Spider.RANK_NAMES = RANK_NAMES;
    Spider.COLS = COLS;
    Spider.GROUPS = GROUPS;
    root.Spider = Spider;
    root.SPIDER_LEVELS = LEVELS;
    if (typeof module !== 'undefined' && module.exports) module.exports = Spider;
})(globalThis);

// ==========================================================
// 界面控制（仅浏览器环境运行）
// ==========================================================
(function () {
    'use strict';
    if (typeof document === 'undefined' || !globalThis.Spider) return;

    const Spider = globalThis.Spider;
    const LEVELS = Spider.LEVELS;
    const SUITS = Spider.SUITS;
    const RANK_NAMES = Spider.RANK_NAMES;
    const COLS = Spider.COLS;
    const GROUPS = Spider.GROUPS;
    const BEST_KEY = 'winy_spider_best_v1';
    const $ = (id) => document.getElementById(id);

    // ---------- DOM ----------
    let stageEl, scrollEl, boardEl, foundEl, doneEl;
    let stockPileEl, stockCardsEl, stockLabelEl;
    let overlayEl, overlayText, overlayBtn, toastEl;
    let stockEl, timeEl, movesEl, scoreEl, bestEl, progressEl;
    let startBtn, undoBtn, undoCountEl, hintBtn, hintCountEl, pauseBtn, soundBtn;
    let colEls = [];
    let dragLayer = null;

    // ---------- 状态 ----------
    let level = 'easy';
    let game = new Spider(level);
    let started = false;        // 是否已按「开始游戏」
    let clockStarted = false;   // 计时是否已随第一次操作启动
    let paused = false, autoPaused = false, deadEnd = false;
    let seconds = 0, timerId = null, bonus = 0;
    let hintsLeft = LEVELS[level].hints, undosLeft = LEVELS[level].undos;
    let soundOn = true, audioCtx = null;
    let bestMap = {};
    let sel = null;             // 当前选中的一组牌 { c, i }
    let hintMark = null;        // 提示高亮 { from, index, to }
    let drag = null;            // 拖拽过程中的临时状态
    let suppressClick = false;  // 拖拽结束后吃掉随之而来的 click
    let clickAutoMoveAt = 0;  // 单击「已选中的牌」触发自动搬移的时刻，用来吞掉紧随其后的 dblclick
    let resizeTimer = null, toastTimer = null, flyTimer = null, hintTimer = null, shakeTimer = null;
    // 牌面尺寸：宽 / 高 / 背面露出 / 正面露出 / 列间距 / 圆角 / 角标字号 / 中心花色字号
    let dim = { w: 60, h: 85, down: 9, up: 22, gap: 6, r: 7, fs: 16, pip: 31 };

    // ---------- 工具 ----------
    function fmt(sec) {
        sec = Math.max(0, Math.min(999, Math.round(sec || 0)));
        return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    }

    function isRed(s) { return s === 1 || s === 3; }

    // 兼容极简 DOM 桩：优先用 removeChild，没有就手动从 children 里摘。
    // 真实 DOM 的 parentNode 是只读 getter，严格模式下赋值会抛 TypeError；
    // 一旦抛出去就会打断整个 render（牌被摘走却没插到新列里），所以断链这步必须兜住。
    function removeEl(el) {
        if (!el) return;
        const p = el.parentNode;
        if (p && typeof p.removeChild === 'function') {
            try { p.removeChild(el); } catch (e) { /* 落到兜底分支 */ }
        }
        if (el.parentNode && p && p.children && typeof p.children.indexOf === 'function') {
            const i = p.children.indexOf(el);
            if (i >= 0) p.children.splice(i, 1);
        }
        try { el.parentNode = null; } catch (e) { /* 真实 DOM 里 parentNode 只读，忽略 */ }
    }

    function levelIntro() {
        const cfg = LEVELS[level];
        return '当前难度：' + cfg.label + '（' + cfg.suits + ' 种花色 · 104 张牌）<br>' +
            '同花色的 K→A 连满 13 张会自动收起，收齐 8 组获胜<br>' +
            '点击「开始游戏」发牌';
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
            filter.frequency.value = 1200;
            const g = audioCtx.createGain();
            g.gain.setValueAtTime(gain, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
            src.connect(filter).connect(g).connect(audioCtx.destination);
            src.start();
        } catch (e) { /* 忽略 */ }
    }

    const sfx = {
        select()    { tone(560, 0.05, 'triangle', 0.035); },
        move(n)     { tone(340 + Math.min(12, n || 1) * 24, 0.07, 'triangle', 0.05); noiseBurst(0.05, 0.02); },
        flip()      { tone(720, 0.05, 'sine', 0.035); noiseBurst(0.07, 0.03); },
        deal()      { for (let i = 0; i < 5; i++) tone(300 + i * 42, 0.05, 'triangle', 0.03, i * 0.05); noiseBurst(0.12, 0.035); },
        collect(k)  { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.17, 'triangle', 0.06, (k || 0) * 0.06 + i * 0.06)); },
        undo()      { tone(430, 0.07, 'sine', 0.04); tone(300, 0.09, 'sine', 0.035, 0.05); },
        hint()      { tone(784, 0.09, 'sine', 0.05); tone(1046, 0.12, 'sine', 0.045, 0.07); },
        deny()      { tone(196, 0.12, 'sawtooth', 0.03); },
        stuck()     { tone(233, 0.3, 'sawtooth', 0.045); tone(160, 0.42, 'sine', 0.05, 0.1); },
        win()       { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, 'triangle', 0.08, i * 0.13)); },
        start()     { tone(523, 0.09, 'triangle', 0.05); tone(784, 0.12, 'triangle', 0.05, 0.07); }
    };

    // ---------- 牌面尺寸 ----------
    // 固定十列，按整屏内容空间放大；保持牌面比例和最小可读尺寸。
    // 固定导航栏和音乐栏不属于可玩区域；另留上下各 24px 的呼吸空间。
    function contentViewportHeight() {
        const topBar = document.querySelector('.navbar');
        const bottomBar = document.querySelector('.music-player');
        return (window.innerHeight || 800) - (topBar?.offsetHeight || 0) -
            (bottomBar?.offsetHeight || 0);
    }

    function layout() {
        if (!boardEl) return;
        const vw = window.innerWidth || 1280;
        const gap = vw <= 520 ? 3 : vw <= 900 ? 5 : 7;
        const available = (stageEl?.clientWidth || vw - (vw <= 520 ? 24 : 96)) - 96;
        const minW = vw <= 360 ? 26 : vw <= 520 ? 30 : 34;
        const height = contentViewportHeight() - 172;
        let w = Math.max(minW, Math.floor((available - gap * (COLS - 1)) / COLS));
        const columnHeight = (col, width) => {
            const h = Math.round(width * 1.42);
            return h + col.slice(0, -1).reduce((sum, card) => sum +
                (card.up ? Math.max(14, Math.round(h * 0.26)) : Math.max(6, Math.round(h * 0.1))), 0);
        };
        while (w > minW && game.cols.some(col => columnHeight(col, w) > height)) w--;
        dim = {
            w: w,
            h: Math.round(w * 1.42),
            down: Math.max(6, Math.round(w * 1.42 * 0.1)),
            up: Math.max(14, Math.round(w * 1.42 * 0.26)),
            gap: gap,
            r: Math.max(4, Math.round(w * 0.11)),
            fs: Math.max(11, Math.round(w * 0.26)),
            pip: Math.max(18, Math.round(w * 0.52))
        };
        boardEl.style.setProperty('--spider-w', dim.w + 'px');
        boardEl.style.setProperty('--spider-h', dim.h + 'px');
        boardEl.style.setProperty('--spider-gap', dim.gap + 'px');
        boardEl.style.setProperty('--spider-r', dim.r + 'px');
        boardEl.style.setProperty('--spider-fs', dim.fs + 'px');
        boardEl.style.setProperty('--spider-pip', dim.pip + 'px');
        if (stageEl) {
            const padX = Math.max(vw <= 520 ? 4 : 10, Math.min(26, Math.round(w * 0.28)));
            const padY = Math.max(vw <= 520 ? 6 : 10, Math.min(22, Math.round(w * 0.24)));
            stageEl.style.padding = padY + 'px ' + padX + 'px';
        }
        // 高度与页面滚动位置无关，长牌列在牌桌内滚动。
        if (scrollEl) scrollEl.style.maxHeight = Math.max(180, height + 16) + 'px';
        for (let c = 0; c < COLS; c++) layoutColumn(c);
    }

    // ---------- 建棋盘 ----------
    function buildBoard() {
        if (!boardEl) return;
        boardEl.innerHTML = '';
        colEls = [];
        const frag = document.createDocumentFragment();
        for (let c = 0; c < COLS; c++) {
            const el = document.createElement('div');
            el.className = 'spider-col';
            el.dataset.col = c;
            el.setAttribute('role', 'group');
            el.setAttribute('aria-label', '第 ' + (c + 1) + ' 列，空');
            frag.appendChild(el);
            colEls.push(el);
        }
        boardEl.appendChild(frag);
        if (scrollEl) { scrollEl.scrollTop = 0; scrollEl.scrollLeft = 0; }
        layout();
    }

    function makeCard(cd) {
        const el = document.createElement('div');
        el.className = 'spider-card';
        const corner = document.createElement('span');
        corner.className = 'sc-corner';
        const pip = document.createElement('span');
        pip.className = 'sc-pip';
        el.appendChild(corner);
        el.appendChild(pip);
        el._corner = corner;
        el._pip = pip;
        el._card = cd;
        return el;
    }

    // ---------- 同步 / 绘制 ----------
    // 把第 c 列的子节点对齐成 game.cols[c]：搬走的牌摘掉，搬来的牌按顺序插回去。
    // 返回这一列新建的牌元素（用来播放发牌动画）。
    function syncColumn(c, created) {
        const colEl = colEls[c];
        if (!colEl) return;
        const model = game.cols[c] || [];
        const want = [];
        for (let i = 0; i < model.length; i++) {
            let el = model[i]._el;
            if (!el) { el = makeCard(model[i]); model[i]._el = el; if (created) created.push(el); }
            want.push(el);
        }
        const kids = Array.prototype.slice.call(colEl.children || []);
        for (let i = 0; i < kids.length; i++) if (want.indexOf(kids[i]) < 0) removeEl(kids[i]);
        for (let i = 0; i < want.length; i++) {
            if (colEl.children[i] === want[i]) continue;
            if (typeof colEl.insertBefore === 'function') colEl.insertBefore(want[i], colEl.children[i] || null);
            else colEl.appendChild(want[i]);
        }
    }

    function paintCard(c, i) {
        const cd = game.cardAt(c, i);
        const el = cd && cd._el;
        if (!el) return;
        const up = !!cd.up;
        const red = isRed(cd.s);
        const st = game.runStart(c);
        el.classList.toggle('up', up);
        el.classList.toggle('down', !up);
        el.classList.toggle('red', red);
        el.classList.toggle('black', !red);
        el.classList.toggle('movable', up && st >= 0 && i >= st);
        el.classList.toggle('selected', !!(sel && sel.c === c && i >= sel.i));
        el.classList.toggle('hint', !!(hintMark && hintMark.from === c && i >= hintMark.index));
        el.classList.toggle('hint-to', !!(hintMark && hintMark.to === c && i === game.count(c) - 1));
        const label = RANK_NAMES[cd.r];
        if (el._corner) el._corner.textContent = up ? label : '';
        if (el._pip) el._pip.textContent = up ? SUITS[cd.s] : '';
        el.dataset.col = c;
        el.dataset.i = i;
        el.dataset.up = up ? '1' : '0';
        el.setAttribute('aria-label', '第 ' + (c + 1) + ' 列第 ' + (i + 1) + ' 张，' +
            (up ? label + SUITS[cd.s] : '背面朝上'));
    }

    function paintColumn(c) {
        const colEl = colEls[c];
        const n = game.count(c);
        for (let i = 0; i < n; i++) paintCard(c, i);
        if (colEl) {
            colEl.classList.toggle('hint-to', !!(hintMark && hintMark.to === c && n === 0));
            colEl.setAttribute('aria-label', '第 ' + (c + 1) + ' 列，' + (n ? n + ' 张牌' : '空'));
        }
    }

    // 牌是绝对定位的，这里累加「露出高度」算出每张牌的 top
    function layoutColumn(c) {
        const colEl = colEls[c];
        if (!colEl) return;
        const col = game.cols[c] || [];
        let top = 0;
        for (let i = 0; i < col.length; i++) {
            const el = col[i]._el;
            if (el) {
                el.style.top = top + 'px';
                el.style.zIndex = String(i + 1);
            }
            top += (i === col.length - 1) ? dim.h : (col[i].up ? dim.up : dim.down);
        }
        colEl.style.height = Math.max(dim.h, top) + 'px';
    }

    function renderTop() {
        if (foundEl) {
            foundEl.innerHTML = '';
            for (let i = 0; i < GROUPS; i++) {
                const s = i < game.done.length ? game.done[i] : -1;
                const el = document.createElement('div');
                el.className = 'found-suit' + (s < 0 ? ' empty' : (isRed(s) ? ' red' : ' black'));
                if (s === game.done.length - 1 && s >= 0) el.classList.add('just');
                el.textContent = SUITS[s < 0 ? 0 : s];
                foundEl.appendChild(el);
            }
        }
        if (doneEl) doneEl.textContent = game.completed;
    }

    function renderStock() {
        if (stockCardsEl) {
            stockCardsEl.innerHTML = '';
            const n = Math.min(5, game.dealsLeft);
            for (let i = 0; i < n; i++) {
                const el = document.createElement('div');
                el.className = 'stock-card';
                el.style.setProperty('--i', String(i));
                stockCardsEl.appendChild(el);
            }
        }
        if (stockLabelEl) stockLabelEl.textContent = game.stock.length ? '发牌 ×' + game.dealsLeft : '已发完';
        if (stockPileEl) {
            stockPileEl.disabled = !game.stock.length;
            stockPileEl.setAttribute('aria-label', game.stock.length
                ? '牌堆，还剩 ' + game.stock.length + ' 张，可发 ' + game.dealsLeft + ' 轮'
                : '牌堆已发完');
        }
    }

    function updateStatus() {
        if (stockEl) stockEl.textContent = game.dealsLeft;
        if (timeEl) timeEl.textContent = fmt(seconds);
        if (movesEl) movesEl.textContent = game.moves;
        if (scoreEl) scoreEl.textContent = game.score;
        if (bestEl) bestEl.textContent = typeof bestMap[level] === 'number' ? bestMap[level] : '--';
        if (progressEl) {
            progressEl.style.width = (game.completed / GROUPS * 100).toFixed(1) + '%';
            progressEl.classList.toggle('done', game.won);
        }
        if (doneEl) doneEl.textContent = game.completed;
        if (undoCountEl) undoCountEl.textContent = undosLeft;
        if (undoBtn) undoBtn.disabled = undosLeft <= 0 || !game.history.length || game.won;
        if (hintCountEl) hintCountEl.textContent = hintsLeft;
        if (hintBtn) hintBtn.disabled = hintsLeft <= 0;
    }

    function render(opts) {
        opts = opts || {};
        renderTop();
        renderStock();
        if (boardEl && colEls.length) {
            const created = [];
            for (let c = 0; c < COLS; c++) syncColumn(c, created);
            for (let c = 0; c < COLS; c++) paintColumn(c);
            layout();
            if (opts.popNew && created.length) popCards(created);
        }
        updateStatus();
        if (opts.pre) applyFly(opts.pre);
    }

    // ---------- 最佳成绩：分数越高越好 ----------
    function loadBest() {
        try { bestMap = JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (e) { bestMap = {}; }
    }

    function saveBest(v) {
        const prev = bestMap[level];
        if (typeof prev === 'number' && prev >= v) return false;
        bestMap[level] = v;
        try { localStorage.setItem(BEST_KEY, JSON.stringify(bestMap)); } catch (e) { /* 隐私模式下忽略 */ }
        return true;
    }

    // ---------- 遮罩 / 提示条 ----------
    function showOverlay(emoji, title, html, withBtn, btnText) {
        if (!overlayEl) return;
        const e = overlayEl.querySelector('.overlay-emoji');
        const t = overlayEl.querySelector('.overlay-title');
        if (e) e.textContent = emoji;
        if (t) t.textContent = title;
        if (overlayText) overlayText.innerHTML = html;
        if (overlayBtn) {
            overlayBtn.style.display = withBtn ? 'inline-flex' : 'none';
            overlayBtn.textContent = btnText || '开始游戏';
        }
        overlayEl.classList.add('show');
    }

    function hideOverlay() { if (overlayEl) overlayEl.classList.remove('show'); }

    function showToast(msg) {
        if (!toastEl) return;
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
        if (!started || paused || deadEnd || game.over || document.hidden) return;
        timerId = setInterval(() => {
            if (!started || paused || deadEnd || game.over || document.hidden) return;
            seconds = Math.min(999, seconds + 1);
            if (timeEl) timeEl.textContent = fmt(seconds);
        }, 1000);
    }

    function stopTimer() {
        if (timerId) clearInterval(timerId);
        timerId = null;
    }

    // ---------- 动画辅助 ----------
    let popTimer = null;

    // 新发出 / 新翻开的牌「弹」一下
    function popCards(els) {
        if (!els || !els.length) return;
        const n = Math.min(els.length, 60);
        for (let k = 0; k < n; k++) {
            const el = els[k];
            if (!el || !el.classList) continue;
            el.classList.remove('pop');
            el.style.animationDelay = (k * 20) + 'ms';
            void el.offsetWidth;
            el.classList.add('pop');
        }
        clearTimeout(popTimer);
        popTimer = setTimeout(() => {
            for (let k = 0; k < n; k++) {
                const el = els[k];
                if (el && el.classList) { el.classList.remove('pop'); el.style.animationDelay = ''; }
            }
        }, n * 20 + 340);
    }

    // FLIP 第一步：记录变化前每张牌在屏幕上的位置
    function captureRects() {
        const map = new Map();
        for (let c = 0; c < COLS; c++) {
            const col = game.cols[c] || [];
            for (let i = 0; i < col.length; i++) {
                const el = col[i]._el;
                if (el && typeof el.getBoundingClientRect === 'function') map.set(el, el.getBoundingClientRect());
            }
        }
        return map;
    }

    // FLIP 第二 / 三步：先把牌平移回旧位置，再用过渡滑到新位置
    function applyFly(pre) {
        if (!pre || typeof pre.forEach !== 'function') return;
        clearFly();
        const moved = [];
        pre.forEach((oldRect, el) => {
            if (!el || !el.parentNode) return;                    // 被收走的牌已经离场
            if (typeof el.getBoundingClientRect !== 'function') return;
            const now = el.getBoundingClientRect();
            const dx = (oldRect.left || 0) - (now.left || 0);
            const dy = (oldRect.top || 0) - (now.top || 0);
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.style.transition = 'none';
            el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            moved.push(el);
        });
        if (!moved.length) return;
        void (boardEl && boardEl.offsetWidth);
        for (let k = 0; k < moved.length; k++) {
            moved[k].style.transition = 'transform 0.2s ease';
            moved[k].style.transform = '';
        }
        clearTimeout(flyTimer);
        flyTimer = setTimeout(clearFly, 260);
    }

    function clearFly() {
        if (flyTimer) { clearTimeout(flyTimer); flyTimer = null; }
        for (let c = 0; c < COLS; c++) {
            const col = game.cols[c] || [];
            for (let i = 0; i < col.length; i++) {
                const el = col[i]._el;
                if (el && el.style) { el.style.transition = ''; el.style.transform = ''; }
            }
        }
    }

    // 走不通 / 不能动时抖一下这一组牌
    function shakeCards(c, i) {
        const col = game.cols[c] || [];
        if (!col.length) { shakeCol(c); return; }
        let start = (typeof i === 'number' && i >= 0) ? i : col.length - 1;
        const rs = game.runStart(c);
        if (rs >= 0 && start < rs) start = rs;
        if (start > col.length - 1) start = col.length - 1;
        for (let k = start; k < col.length; k++) {
            const el = col[k]._el;
            if (el && el.classList) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
        }
        clearTimeout(shakeTimer);
        shakeTimer = setTimeout(() => {
            const cc = game.cols[c] || [];
            for (let k = start; k < cc.length; k++) { const el = cc[k]._el; if (el && el.classList) el.classList.remove('shake'); }
        }, 480);
    }

    // 空列不能发牌时，抖一下那一列
    function shakeCol(c) {
        const el = colEls[c];
        if (!el || !el.classList) return;
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        clearTimeout(shakeTimer);
        shakeTimer = setTimeout(() => { if (el.classList) el.classList.remove('shake'); }, 480);
    }

    // 飘字（收牌 +100 之类）
    function floatText(text, refEl) {
        if (!stageEl || typeof document.createElement !== 'function') return;
        const el = document.createElement('div');
        if (!el) return;
        el.className = 'float-score';
        el.textContent = text;
        let x = 40, y = 16;
        if (refEl && typeof refEl.getBoundingClientRect === 'function' && typeof stageEl.getBoundingClientRect === 'function') {
            const r = refEl.getBoundingClientRect();
            const sr = stageEl.getBoundingClientRect();
            x = (r.left || 0) + (r.width || 0) / 2 - (sr.left || 0);
            y = (r.top || 0) - (sr.top || 0);
        }
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        if (typeof stageEl.appendChild === 'function') stageEl.appendChild(el);
        setTimeout(() => removeEl(el), 950);
    }

    // 收起一组后的反馈：音效 + 飘字 + 提示条
    function handleCollected(groups) {
        if (!groups || !groups.length) return;
        sfx.collect(groups.length);
        for (let k = 0; k < groups.length; k++) floatText('+100', colEls[groups[k].col]);
        showToast(groups.length > 1
            ? '一次收起 ' + groups.length + ' 组！+' + (100 * groups.length) + ' 分'
            : '收齐一组 ' + SUITS[groups[0].suit] + '！+100 分');
    }

    // ---------- 游戏流程 ----------
    // 只有在「未暂停、未判负、未结束」时才允许操作；尚未开局则顺手开局
    function guardActive() {
        if (paused || deadEnd || game.over) return false;
        if (!started) beginGame();
        return true;
    }

    // 尝试把第 from 列第 i 张起的一组牌移到第 to 列
    function tryMove(from, i, to, pre) {
        if (!guardActive()) return null;
        const rects = pre || captureRects();
        const res = game.move(from, i, to);
        if (res.status === 'reject') {
            sfx.deny();
            shakeCards(from, i);
            const why = res.reason === 'not-run' ? '只有同花色且依次递减的连续牌才能整组搬动'
                : res.reason === 'rank' ? '只能放到点数正好大 1 的牌上（或空列）'
                : res.reason === 'same' ? '不能移回原来那一列'
                : '对局已经结束';
            showToast(why);
            return res;
        }
        markFirstAction();
        sel = null;
        hintMark = null;
        render({ pre: rects });
        sfx.move(res.cards ? res.cards.length : 1);
        if (res.flipped) sfx.flip();
        if (res.collected && res.collected.length) handleCollected(res.collected);
        if (res.status === 'win') { winGame(); return res; }
        if (res.status === 'stuck') { stuckGame(); return res; }
        return res;
    }

    // 双击 / 再次点击选中的牌：自动挑一个最划算的落点搬过去
    function doAutoMove(c, i) {
        if (!guardActive()) return null;
        if (!game.canPick(c, i)) {
            sfx.deny();
            shakeCards(c, i);
            showToast('只有同花色且依次递减的连续牌才能整组搬动');
            return null;
        }
        const tgts = game.targets(c, i);
        if (!tgts.length) { sfx.deny(); showToast('这组牌暂时没有可放的位置'); return null; }
        const moving = game.cardAt(c, i);
        let best = tgts[0], bestScore = -1;
        for (let k = 0; k < tgts.length; k++) {
            const to = tgts[k];
            const target = game.top(to);
            const s = !target ? 1 : (target.s === moving.s ? 3 : 2);   // 同花色接龙 > 异花色吻合 > 空列
            if (s > bestScore) { bestScore = s; best = to; }
        }
        return tryMove(c, i, best);
    }

    // 发牌：牌堆给 10 列各补一张
    function doDeal() {
        if (!guardActive()) return;
        const res = game.deal();
        if (res.status === 'reject') {
            sfx.deny();
            if (res.reason === 'empty-stock') showToast('牌堆已经发完了');
            else if (res.reason === 'hole') { shakeCol(res.col); showToast('第 ' + (res.col + 1) + ' 列是空的，发牌前每列都得有牌'); }
            else showToast('对局已经结束');
            return;
        }
        markFirstAction();
        sel = null;
        hintMark = null;
        render({ popNew: true });
        sfx.deal();
        if (res.collected && res.collected.length) handleCollected(res.collected);
        if (res.status === 'win') { winGame(); return; }
        if (res.status === 'stuck') { stuckGame(); return; }
    }

    // 悔棋：回退一步，也能把「无路可走」救回来
    function doUndo() {
        if (paused || game.won) return;
        if (!started && !deadEnd) return;
        if (undosLeft <= 0) { sfx.deny(); showToast('本局悔棋次数已用完'); return; }
        if (!game.history.length) { sfx.deny(); showToast('没有可以悔的棋'); return; }
        const res = game.undo();
        if (res.status !== 'ok') { sfx.deny(); showToast('没有可以悔的棋'); return; }
        undosLeft--;
        sel = null;
        hintMark = null;
        if (deadEnd && !res.stuck) {
            deadEnd = false;
            hideOverlay();
            startBtn.innerHTML = '<i class="fas fa-rotate-right"></i> 重新开始';
            showToast('已悔棋，继续加油（剩余 ' + undosLeft + ' 次）');
        } else {
            showToast('已悔棋（剩余 ' + undosLeft + ' 次）');
        }
        render();
        sfx.undo();
        if (res.stuck && !deadEnd) stuckGame();
    }

    // 提示：高亮一步评分最高的走法，或提示该发牌了
    function doHint() {
        if (!started || paused || game.over || deadEnd) return;
        if (hintsLeft <= 0) { sfx.deny(); showToast('本局提示次数已用完'); return; }
        const res = game.hint();
        if (res.status === 'none') { sfx.deny(); showToast('暂时没有可提示的走法'); return; }
        hintsLeft--;
        markFirstAction();
        sfx.hint();
        sel = null;
        clearTimeout(hintTimer);
        if (res.status === 'deal') {
            hintMark = null;
            render();
            if (stockPileEl && stockPileEl.classList) {
                stockPileEl.classList.add('hint');
                hintTimer = setTimeout(() => { if (stockPileEl.classList) stockPileEl.classList.remove('hint'); }, 1800);
            }
            showToast('现在没有好走法，点牌堆发一轮牌吧（剩余 ' + hintsLeft + ' 次）');
            updateStatus();
            return;
        }
        hintMark = { from: res.from, index: res.index, to: res.to };
        render();
        showToast('把第 ' + (res.from + 1) + ' 列的牌移到第 ' + (res.to + 1) + ' 列（剩余 ' + hintsLeft + ' 次）');
        hintTimer = setTimeout(() => { hintMark = null; render(); }, 2200);
        updateStatus();
    }

    // 获胜：结算通关奖励并刷新最佳成绩
    function winGame() {
        stopTimer();
        started = false;
        const cfg = LEVELS[level];
        bonus = Math.max(0, cfg.par - seconds) * cfg.mult + hintsLeft * 40 + undosLeft * 6;
        game.score += bonus;
        const record = saveBest(game.score);
        updateStatus();
        sfx.win();
        startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        showOverlay('🎉', '全部收齐！',
            '难度：' + cfg.label + ' · 用时 <b>' + fmt(seconds) + '</b> · 步数 <b>' + game.moves + '</b>' +
            (record ? ' · 新纪录！' : (typeof bestMap[level] === 'number' ? ' · 最佳 ' + bestMap[level] : '')) +
            '<br>通关奖励 +' + bonus + '，最终得分 <b>' + game.score + '</b>', true, '再来一局');
        if (window.showFireworks) {
            window.showFireworks();
            setTimeout(() => { if (window.hideFireworks) window.hideFireworks(); }, 6000);
        }
    }

    // 无路可走：判负，但允许悔棋救回
    function stuckGame() {
        deadEnd = true;
        sel = null;
        hintMark = null;
        sfx.stuck();
        render();
        showOverlay('🕸️', '无路可走',
            '没有可以移动的牌，牌堆也帮不上忙了。<br>点工具栏的「悔棋」回退一步，或重新开始。', true, '重新开始');
    }

    function togglePause() {
        if (!started || game.over || deadEnd) return;
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

    function toggleSound() {
        soundOn = !soundOn;
        soundBtn.innerHTML = soundOn ? '<i class="fas fa-volume-high"></i>' : '<i class="fas fa-volume-xmark"></i>';
        soundBtn.classList.toggle('off', !soundOn);
        if (soundOn) { ensureAudio(); sfx.select(); }
    }

    // 开一局新牌（可选切换难度）
    function newGame(nextLevel) {
        if (nextLevel && LEVELS[nextLevel]) level = nextLevel;
        stopTimer();
        clearTimeout(flyTimer); flyTimer = null;
        clearTimeout(hintTimer);
        clearTimeout(shakeTimer);
        clearTimeout(popTimer);
        game = new Spider(level);
        started = false;
        clockStarted = false;
        paused = false;
        autoPaused = false;
        deadEnd = false;
        seconds = 0;
        bonus = 0;
        hintsLeft = LEVELS[level].hints;
        undosLeft = LEVELS[level].undos;
        sel = null;
        hintMark = null;
        drag = null;
        stageEl.classList.remove('paused');
        startBtn.innerHTML = '<i class="fas fa-play"></i> 开始游戏';
        pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        buildBoard();
        render();
        showOverlay('🕷️', '蜘蛛纸牌', levelIntro(), true, '开始游戏');
    }

    // 正式开始（隐藏遮罩、起计时、播报难度）
    function beginGame() {
        if (game.over) newGame();
        started = true;
        deadEnd = false;
        ensureAudio();
        hideOverlay();
        startBtn.innerHTML = '<i class="fas fa-rotate-right"></i> 重新开始';
        sfx.start();
        showToast(LEVELS[level].label + ' · 把同花色的 K→A 收齐 8 组即可获胜');
    }

    // ---------- 交互：点击 / 双击 ----------
    // 从事件里找到被点到的那张牌，返回 { c, i }；找不到返回 null
    function cardFromEvent(e) {
        const t = e && e.target;
        if (!t || typeof t.closest !== 'function') return null;
        const el = t.closest('.spider-card');
        if (!el || !el.dataset) return null;
        const c = parseInt(el.dataset.col, 10);
        const i = parseInt(el.dataset.i, 10);
        if (!(c >= 0) || !(i >= 0)) return null;
        return { c: c, i: i };
    }

    // 从事件里找到所在的那一列（点在空列的空白处也能识别）
    function colFromEvent(e) {
        const t = e && e.target;
        if (!t || typeof t.closest !== 'function') return null;
        const el = t.closest('.spider-col');
        if (!el || !el.dataset) return null;
        const c = parseInt(el.dataset.col, 10);
        return (c >= 0 && c < COLS) ? c : null;
    }

    // 选中一组牌；这组牌拿不起来时给出抖动和说明
    function selectAt(c, i) {
        hintMark = null;
        clearTimeout(hintTimer);
        if (!game.canPick(c, i)) {
            sel = null;
            render();
            sfx.deny();
            shakeCards(c, i);
            showToast('背面朝上、或不是同花色依次递减的牌不能整组搬动');
            return;
        }
        sel = { c: c, i: i };
        render();
        sfx.select();
    }

    function clearSel() {
        if (!sel) return;
        sel = null;
        render();
    }

    // 单击：选中 / 放下 / 再点一次自动找落点
    function onBoardClick(e) {
        if (suppressClick) { suppressClick = false; return; }   // 拖拽松手后浏览器会补发一次 click
        if (!guardActive()) return;
        const hit = cardFromEvent(e);
        if (!hit) {
            const c = colFromEvent(e);                          // 点在空列上：把选中的牌放过去
            if (c !== null && sel && game.count(c) === 0) tryMove(sel.c, sel.i, c);
            return;
        }
        if (sel && sel.c === hit.c && sel.i === hit.i) { clickAutoMoveAt = Date.now(); doAutoMove(hit.c, hit.i); return; }
        if (sel) {
            const from = sel;
            const res = tryMove(from.c, from.i, hit.c);
            if (!res || res.status === 'reject') selectAt(hit.c, hit.i);
            return;
        }
        selectAt(hit.c, hit.i);
    }

    // 双击：直接自动搬去最划算的一列
    function onBoardDblClick(e) {
        const hit = cardFromEvent(e);
        if (!hit) return;
        // 双击前的两次单击里，第二次已经走完「再点选中牌 = 自动搬移」；
        // 若这里再搬一次，会对刚移完的牌重找落点：轻则误报「这组牌暂时没有可放的位置」，重则多搬一步。
        if (Date.now() - clickAutoMoveAt < 700) { clickAutoMoveAt = 0; return; }
        if (e && e.preventDefault) e.preventDefault();
        if (!guardActive()) return;
        sel = null;
        doAutoMove(hit.c, hit.i);
    }

    // ---------- 交互：拖拽 ----------
    // 拖拽不接管真实的牌，而是照着画一组「影子牌」跟着指针走。
    // 这样渲染管线始终只有 render() 一条路径，松手后不会出现牌丢在拖拽层里的情况。
    function ghostCard(cd) {
        const el = document.createElement('div');
        if (!el) return null;
        el.className = 'spider-card up drag-ghost ' + (isRed(cd.s) ? 'red' : 'black');
        const corner = document.createElement('span');
        corner.className = 'sc-corner';
        corner.textContent = RANK_NAMES[cd.r];
        const pip = document.createElement('span');
        pip.className = 'sc-pip';
        pip.textContent = SUITS[cd.s];
        if (el.appendChild) { el.appendChild(corner); el.appendChild(pip); }
        return el;
    }

    // 把这一组牌的所有合法落点标出来
    function markDropTargets(from, i, on) {
        for (let c = 0; c < COLS; c++) {
            const el = colEls[c];
            if (el && el.classList) el.classList.toggle('drop-ok', !!(on && game.canDrop(from, i, c)));
        }
    }

    function onPointerDown(e) {
        suppressClick = false;
        if (e && typeof e.button === 'number' && e.button !== 0) return;   // 只跟左键 / 触摸
        const hit = cardFromEvent(e);
        if (!hit) return;
        if (paused || deadEnd || game.over) return;
        if (!game.canPick(hit.c, hit.i)) return;
        drag = {
            c: hit.c, i: hit.i,
            x0: (e && e.clientX) || 0, y0: (e && e.clientY) || 0,
            ox: 0, oy: 0, on: false, layer: null
        };
    }

    function startDrag(e) {
        const col = game.cols[drag.c] || [];
        const cards = col.slice(drag.i);
        if (!cards.length) { drag = null; return; }
        if (!started) beginGame();
        const layer = document.createElement('div');
        if (!layer) { drag = null; return; }
        layer.className = 'spider-drag';
        for (let k = 0; k < cards.length; k++) {
            const g = ghostCard(cards[k]);
            if (!g) continue;
            if (g.style) g.style.top = (k * dim.up) + 'px';
            if (layer.appendChild) layer.appendChild(g);
        }
        if (layer.style) {
            layer.style.width = dim.w + 'px';
            layer.style.height = (dim.h + dim.up * (cards.length - 1)) + 'px';
            // 拖拽层挂在 body 下，继承不到牌桌上的尺寸变量，这里手动带过去
            layer.style.setProperty('--spider-w', dim.w + 'px');
            layer.style.setProperty('--spider-h', dim.h + 'px');
            layer.style.setProperty('--spider-r', dim.r + 'px');
            layer.style.setProperty('--spider-fs', dim.fs + 'px');
            layer.style.setProperty('--spider-pip', dim.pip + 'px');
        }
        if (document.body && document.body.appendChild) document.body.appendChild(layer);
        drag.layer = layer;
        drag.on = true;
        drag.ox = dim.w * 0.5;
        drag.oy = Math.max(10, Math.round(dim.h * 0.28));
        for (let k = drag.i; k < col.length; k++) {
            const el = col[k]._el;
            if (el && el.classList) el.classList.add('dragging');
        }
        markDropTargets(drag.c, drag.i, true);
        moveDragLayer(e);
    }

    function moveDragLayer(e) {
        if (!drag || !drag.layer || !drag.layer.style) return;
        drag.layer.style.left = (((e && e.clientX) || 0) - drag.ox) + 'px';
        drag.layer.style.top = (((e && e.clientY) || 0) - drag.oy) + 'px';
    }

    function onPointerMove(e) {
        if (!drag) return;
        if (!drag.on) {
            const dx = ((e && e.clientX) || 0) - drag.x0;
            const dy = ((e && e.clientY) || 0) - drag.y0;
            if (dx * dx + dy * dy < 36) return;      // 6px 以内仍然算「点击」，不启动拖拽
            startDrag(e);
            return;
        }
        moveDragLayer(e);
    }

    // 松手时判断落在哪一列：优先 elementFromPoint，退化用「列中心线到指针的距离」
    function colAtPoint(e) {
        const x = (e && e.clientX) || 0;
        const y = (e && e.clientY) || 0;
        if (typeof document.elementFromPoint === 'function') {
            let el = null;
            try { el = document.elementFromPoint(x, y); } catch (err) { el = null; }
            const hit = el && typeof el.closest === 'function' ? el.closest('.spider-col') : null;
            if (hit && hit.dataset) {
                const n = parseInt(hit.dataset.col, 10);
                if (n >= 0 && n < COLS) return n;
            }
        }
        let best = null, bestD = Infinity;
        for (let c = 0; c < COLS; c++) {
            const el = colEls[c];
            if (!el || typeof el.getBoundingClientRect !== 'function') continue;
            const r = el.getBoundingClientRect();
            const cx = (r.left || 0) + (r.width || 0) / 2;
            const d = Math.abs(cx - x);
            if (d < bestD) { bestD = d; best = c; }
        }
        return bestD <= dim.w * 1.2 ? best : null;
    }

    function releaseDrag(e, commit) {
        if (!drag) return;
        const d = drag;
        drag = null;
        markDropTargets(d.c, d.i, false);
        const col = game.cols[d.c] || [];
        for (let k = d.i; k < col.length; k++) {
            const el = col[k]._el;
            if (el && el.classList) el.classList.remove('dragging');
        }
        if (d.layer) removeEl(d.layer);
        if (!commit || !d.on) return;
        suppressClick = true;                        // 吃掉松手后补发的那次 click
        const to = colAtPoint(e);
        sel = null;
        if (to === null || to === d.c) { render(); return; }
        tryMove(d.c, d.i, to);
    }

    function onPointerUp(e) { releaseDrag(e, true); }
    function onPointerCancel() { releaseDrag(null, false); }

    // ---------- 交互：键盘 ----------
    // Esc 取消选中 · Ctrl/Cmd+Z 悔棋 · Ctrl/Cmd+H 提示 · D 发牌
    function onKeydown(e) {
        if (!e || !isVisible()) return;
        const k = e.key;
        const mod = !!(e.ctrlKey || e.metaKey);
        if (k === 'Escape' || k === 'Esc') { clearSel(); return; }
        if (mod && (k === 'z' || k === 'Z')) {
            if (e.preventDefault) e.preventDefault();
            doUndo();
            return;
        }
        if (mod && (k === 'h' || k === 'H')) {
            if (e.preventDefault) e.preventDefault();
            doHint();
            return;
        }
        if (!mod && (k === 'd' || k === 'D')) doDeal();
    }

    // ---------- 绑定 ----------
    function onStockClick(e) {
        if (e && e.preventDefault) e.preventDefault();
        doDeal();
    }

    function bindBoard() {
        if (!boardEl || typeof boardEl.addEventListener !== 'function') return;
        boardEl.addEventListener('click', onBoardClick);
        boardEl.addEventListener('dblclick', onBoardDblClick);
        boardEl.addEventListener('contextmenu', (e) => { if (e && e.preventDefault) e.preventDefault(); });
        boardEl.addEventListener('pointerdown', onPointerDown);
        const win = (typeof window !== 'undefined' && window) ? window : null;
        if (win && typeof win.addEventListener === 'function') {
            win.addEventListener('pointermove', onPointerMove);
            win.addEventListener('pointerup', onPointerUp);
            win.addEventListener('pointercancel', onPointerCancel);
            win.addEventListener('blur', onPointerCancel);
        }
        if (typeof document.addEventListener === 'function') document.addEventListener('keydown', onKeydown);
        if (stockPileEl && stockPileEl.addEventListener) stockPileEl.addEventListener('click', onStockClick);
    }

    // ---------- 可见性：切页 / 切游戏时自动暂停 ----------
    function isVisible() {
        const page = $('game');
        const view = $('spider-view');
        return !!(page && view && page.classList.contains('active') && !view.hidden);
    }

    function setVisible(visible) {
        if (visible) {
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(layout);
            else layout();
            if (started && autoPaused) {
                paused = false;
                autoPaused = false;
                if (stageEl) stageEl.classList.remove('paused');
                if (pauseBtn) pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
                hideOverlay();
                showToast('游戏已自动继续');
                if (clockStarted) startTimer();
            }
        } else {
            onPointerCancel();
            if (started && !game.over) {
                stopTimer();
                if (!paused) {
                    paused = true;
                    autoPaused = true;
                    if (stageEl) stageEl.classList.add('paused');
                    if (pauseBtn) pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                    showOverlay('⏸', '已暂停', '切换到其他页面或其他小游戏会自动暂停，<br>回到本页将自动继续', false);
                }
            }
        }
    }

    // ---------- 初始化 ----------
    function init() {
        stageEl = $('spider-stage');
        scrollEl = $('spider-scroll');
        boardEl = $('spider-board');
        foundEl = $('spider-found');
        doneEl = $('spider-done');
        stockPileEl = $('spider-stock-pile');
        stockCardsEl = $('spider-stock-cards');
        stockLabelEl = $('spider-stock-label');
        overlayEl = $('spider-overlay');
        overlayText = $('spider-overlay-text');
        overlayBtn = $('spider-overlay-btn');
        toastEl = $('spider-toast');
        stockEl = $('spider-stock');
        timeEl = $('spider-time');
        movesEl = $('spider-moves');
        scoreEl = $('spider-score');
        bestEl = $('spider-best');
        progressEl = $('spider-progress-fill');
        startBtn = $('spider-start-btn');
        undoBtn = $('spider-undo-btn');
        undoCountEl = $('spider-undo-count');
        hintBtn = $('spider-hint-btn');
        hintCountEl = $('spider-hint-count');
        pauseBtn = $('spider-pause-btn');
        soundBtn = $('spider-sound-btn');
        if (!boardEl || !overlayEl) return;

        loadBest();
        bindBoard();

        if (startBtn) startBtn.addEventListener('click', () => { newGame(); beginGame(); });
        if (undoBtn) undoBtn.addEventListener('click', doUndo);
        if (hintBtn) hintBtn.addEventListener('click', doHint);
        if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
        if (soundBtn) soundBtn.addEventListener('click', toggleSound);

        if (overlayBtn) overlayBtn.addEventListener('click', (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            if (paused) togglePause();
            else if (!started && !game.over) beginGame();
            else { newGame(); beginGame(); }
        });
        if (overlayEl) overlayEl.addEventListener('click', () => {
            if (paused) togglePause();
            else if (!started && !game.over) beginGame();
        });

        if (typeof document.querySelectorAll === 'function') {
            document.querySelectorAll('.spider-diff-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const next = btn.dataset.spiderDiff;
                    document.querySelectorAll('.spider-diff-btn').forEach((b) => b.classList.remove('active'));
                    btn.classList.add('active');
                    newGame(next);
                });
            });
        }

        const win = (typeof window !== 'undefined' && window) ? window : null;
        if (win && typeof win.addEventListener === 'function') {
            win.addEventListener('resize', () => {
                if (!isVisible()) return;
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(layout, 120);
            });
        }

        newGame();
    }

    // 调试 / 联动入口
    globalThis.__SPIDER = {
        setVisible: setVisible,
        newGame: (lv) => newGame(lv),
        begin: () => beginGame(),
        move: (c, i, to) => tryMove(c, i, to),
        auto: doAutoMove,
        deal: doDeal,
        undo: doUndo,
        hint: doHint,
        get: () => ({
            level: level,
            started: started,
            paused: paused,
            deadEnd: deadEnd,
            seconds: seconds,
            moves: game.moves,
            score: game.score,
            bonus: bonus,
            hintsLeft: hintsLeft,
            undosLeft: undosLeft,
            completed: game.completed,
            dealsLeft: game.dealsLeft
        }),
        core: () => game,
        dim: () => dim
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
