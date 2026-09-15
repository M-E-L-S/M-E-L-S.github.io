(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const button = $('boss-key-button');
    if (!button) return;
    const defaults = { action: 'switch', shortcut: { code: 'KeyB', ctrl: false, alt: true, shift: false, meta: false } };
    const actions = ['switch', 'minimize', 'close-tab', 'close-browser'];
    const validShortcut = s => s && /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/.test(s.code) &&
        [s.ctrl, s.alt, s.shift, s.meta].every(v => typeof v === 'boolean') && (s.ctrl || s.alt || s.meta);
    let settings = JSON.parse(JSON.stringify(defaults));
    try {
        const saved = JSON.parse(localStorage.getItem('winy-boss-key-v1'));
        if (saved && actions.includes(saved.action)) settings.action = saved.action;
        if (validShortcut(saved?.shortcut)) {
            const old = saved.shortcut;
            // 迁移旧默认组合，保留用户自定义快捷键。
            if (!(old.code === 'KeyB' && old.ctrl && old.alt && old.shift && !old.meta)) settings.shortcut = old;
        }
    } catch (_) {}
    const input = $('boss-key-shortcut');
    const select = $('boss-key-action');
    const support = $('boss-key-support');
    const note = $('boss-key-shortcut-note');
    const label = s => [s.ctrl && 'Ctrl', s.alt && 'Alt', s.shift && 'Shift', s.meta && 'Meta',
        s.code.replace(/^Key|^Digit/g, '')].filter(Boolean).join(' + ');
    function paint() {
        input.value = label(settings.shortcut);
        select.value = settings.action;
        button.dataset.action = settings.action;
        button.dataset.shortcut = JSON.stringify(settings.shortcut);
        button.title = '老板键 · ' + label(settings.shortcut);
        button.setAttribute('aria-keyshortcuts', label(settings.shortcut).replaceAll(' ', '').replace('Ctrl', 'Control'));
        support.textContent = document.documentElement.dataset.bossKeyExtension === 'ready'
            ? '浏览器助手已连接。切换优先选择最近使用的其他标签页；没有其他网页时保留首页。'
            : '未连接浏览器助手：会先暂停游戏并切回首页；关闭当前网页会尝试执行，其余浏览器动作需要配套扩展。可在下方查看安装方法。';
    }
    function save() {
        try { localStorage.setItem('winy-boss-key-v1', JSON.stringify(settings)); } catch (_) {}
        paint();
    }
    document.querySelectorAll('.settings-category').forEach(category => {
        category.addEventListener('click', () => {
            document.querySelectorAll('.settings-category').forEach(item => {
                const active = item === category;
                if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
                const panel = $(item.getAttribute('aria-controls'));
                if (panel) panel.hidden = !active;
            });
        });
    });
    select.addEventListener('change', () => { if (actions.includes(select.value)) { settings.action = select.value; save(); } });
    input.addEventListener('keydown', event => {
        if (event.key === 'Tab') return;
        if (event.key === 'Escape') { event.stopPropagation(); input.blur(); paint(); return; }
        event.preventDefault();
        event.stopPropagation();
        const shortcut = { code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey };
        if (event.isComposing || event.repeat || !validShortcut(shortcut)) {
            note.textContent = '请使用 Ctrl、Alt 或 Meta 搭配字母、数字或功能键，建议同时加入 Shift 以减少冲突。';
            return;
        }
        settings.shortcut = shortcut;
        save();
        note.textContent = '已保存：' + label(shortcut) + '。若被浏览器或系统占用，请换一个组合。';
        input.blur();
    });
    $('boss-key-reset').addEventListener('click', () => {
        settings = JSON.parse(JSON.stringify(defaults)); save(); note.textContent = '已恢复默认快捷键。';
    });
    function activate() {
        if (!$('game').classList.contains('active')) return;
        // 先同步隐藏并暂停，再尝试浏览器动作；失败也不会让游戏继续露在屏幕上。
        if ($('settings-dialog').open) $('settings-dialog').close();
        document.querySelector('.nav-link[data-page="home"]').click();
        document.querySelectorAll('audio, video').forEach(media => media.pause());
        window.scrollTo(0, 0);
        if (document.documentElement.dataset.bossKeyExtension !== 'ready' && settings.action === 'close-tab') {
            try { window.close(); } catch (_) {}
        }
    }
    button.addEventListener('click', activate);
    document.addEventListener('keydown', event => {
        if (event.repeat || event.isComposing || $('settings-dialog').open ||
            event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        const s = settings.shortcut;
        if (event.code === s.code && event.ctrlKey === s.ctrl && event.altKey === s.alt &&
            event.shiftKey === s.shift && event.metaKey === s.meta && $('game').classList.contains('active')) {
            event.preventDefault(); activate();
        }
    });
    document.addEventListener('boss-key-extension-ready', paint);
    paint();
})();
