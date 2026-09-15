// ==========================================================
// 小游戏切换器
// 职责：标题栏「小游戏」右侧的箭头按钮展开自绘菜单，
//       在「连连看 / 扫雷 / 蜘蛛纸牌」之间切换，
//       并把「当前是否可见」通知给对应游戏，使其自动暂停 / 继续。
// 依赖：game.js 暴露的 __LLK.setVisible、minesweeper.js 暴露的 __MINE.setVisible、
//       spider.js 暴露的 __SPIDER.setVisible
// ==========================================================
(function () {
    'use strict';
    if (typeof document === 'undefined') return;

    const CHOICE_KEY = 'winy_minigame_choice_v1';
    const GAMES = ['llk', 'mine', 'spider', 'wordle'];
    const NAMES = { llk: '连连看', mine: '扫雷', spider: '蜘蛛纸牌', wordle: 'Wordle' };
    const ROUTES = {
        llk: '/minigame/link/',
        mine: '/minigame/minesweeper/',
        spider: '/minigame/spider/',
        wordle: '/minigame/wordle/'
    };
    const GAME_BY_ROUTE = Object.fromEntries(Object.entries(ROUTES).map(([game, route]) => [route.replace(/\/$/, ''), game]));

    let pickerEl = null;
    let btnEl = null;
    let itemEls = [];
    let current = 'llk';
    let opened = false;

    function viewOf(id) { return document.getElementById(id + '-view'); }

    function itemOf(id) {
        for (let i = 0; i < itemEls.length; i++) {
            if (itemEls[i].dataset.game === id) return itemEls[i];
        }
        return null;
    }

    function onGamePage() {
        const page = document.getElementById('game');
        return !!(page && page.classList.contains('active'));
    }

    // 各游戏把自己的控制钩子挂在全局，这里按 id 查表转发可见性
    const HOOKS = { llk: '__LLK', mine: '__MINE', spider: '__SPIDER', wordle: '__WORDLE' };

    function notify(id, visible) {
        const hook = globalThis[HOOKS[id]];
        if (hook && typeof hook.setVisible === 'function') hook.setVisible(visible);
    }

    function syncAll() {
        const pageActive = onGamePage() && !document.hidden;
        const bossButton = document.getElementById('boss-key-button');
        if (bossButton) bossButton.hidden = !onGamePage();
        GAMES.forEach((key) => {
            const el = viewOf(key);
            if (el) el.hidden = key !== current;
            notify(key, pageActive && key === current);
        });
    }

    // ---------- 菜单开合 ----------
    function setOpen(next) {
        if (!pickerEl) return;
        opened = !!next;
        pickerEl.classList.toggle('open', opened);
        if (btnEl) btnEl.setAttribute('aria-expanded', opened ? 'true' : 'false');
        if (opened) {
            const it = itemOf(current);
            if (it && typeof it.focus === 'function') it.focus();
        }
    }

    // 键盘上下键在菜单里循环移动焦点
    function moveFocus(dir) {
        if (!itemEls.length) return;
        let i = itemEls.indexOf(document.activeElement);
        if (i < 0) i = itemEls.indexOf(itemOf(current));
        if (i < 0) i = 0;
        const next = itemEls[(i + dir + itemEls.length) % itemEls.length];
        if (next && typeof next.focus === 'function') next.focus();
    }

    // ---------- 选中态 ----------
    function paintPicker() {
        itemEls.forEach((el) => {
            const on = el.dataset.game === current;
            el.classList.toggle('active', on);
            el.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        if (btnEl) {
            btnEl.setAttribute('aria-label', '切换游戏，当前：' + (NAMES[current] || current));
            btnEl.setAttribute('title', '切换游戏（当前：' + (NAMES[current] || current) + '）');
        }
    }

    function apply(id, remember, updateHistory) {
        current = GAMES.indexOf(id) >= 0 ? id : 'llk';
        paintPicker();
        if (remember) {
            try { localStorage.setItem(CHOICE_KEY, current); } catch (e) { /* 隐私模式下忽略 */ }
        }
        syncAll();
        if (updateHistory && onGamePage()) {
            const route = ROUTES[current];
            if (location.pathname !== route) history.pushState({ page: 'game', game: current }, '', route);
        }
        if (onGamePage()) document.title = `${NAMES[current]} · 小游戏 · MELS`;
    }

    function init() {
        pickerEl = document.getElementById('game-picker');
        btnEl = document.getElementById('game-picker-btn');
        itemEls = [];
        document.querySelectorAll('.game-picker-item').forEach((el) => {
            if (el.dataset.game) itemEls.push(el);
        });
        if (!pickerEl || !btnEl || !itemEls.length) return;

        let saved = null;
        try { saved = localStorage.getItem(CHOICE_KEY); } catch (e) { saved = null; }
        if (saved && GAMES.indexOf(saved) < 0) saved = null;

        btnEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();          // 不要把这次点击当成「点在外面」
            setOpen(!opened);
        });

        itemEls.forEach((el) => {
            el.addEventListener('click', (e) => {
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                e.stopPropagation();
                apply(el.dataset.game, true, true);
                setOpen(false);
                if (typeof btnEl.focus === 'function') btnEl.focus();
            });
        });

        // 点菜单以外的地方 → 收起
        document.addEventListener('click', () => { if (opened) setOpen(false); });

        // Esc 收起，上下键切换焦点
        document.addEventListener('keydown', (e) => {
            if (!opened) return;
            const k = e.key;
            if (k === 'Escape' || k === 'Esc') {
                setOpen(false);
                if (typeof btnEl.focus === 'function') btnEl.focus();
            } else if (k === 'ArrowDown' || k === 'ArrowUp') {
                if (e.preventDefault) e.preventDefault();
                moveFocus(k === 'ArrowDown' ? 1 : -1);
            }
        });

        // 顶部导航切换（script.js 已先更新 .active，这里只负责暂停 / 恢复游戏）
        document.querySelectorAll('.nav-link').forEach((link) => {
            link.addEventListener('click', () => { setOpen(false); apply(current, false); });
        });

        // 窗口尺寸变化后，可见的那个游戏需要重新排版
        window.addEventListener('resize', () => { setOpen(false); if (onGamePage()) syncAll(); });

        document.addEventListener('visibilitychange', syncAll);
        window.addEventListener('pagehide', () => GAMES.forEach(key => notify(key, false)));
        window.addEventListener('pageshow', syncAll);

        const routeGame = GAME_BY_ROUTE[location.pathname.replace(/\/$/, '')];
        apply(routeGame || saved || 'llk', false, false);

        window.addEventListener('popstate', () => {
            if (!location.pathname.startsWith('/minigame')) return;
            const selected = GAME_BY_ROUTE[location.pathname.replace(/\/$/, '')];
            if (selected) apply(selected, false, false);
        });
    }

    globalThis.__MINI_GAMES = {
        select: (id) => apply(id, true, true),
        current: () => current,
        games: () => GAMES.slice(),
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen(!opened),
        isOpen: () => opened
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
