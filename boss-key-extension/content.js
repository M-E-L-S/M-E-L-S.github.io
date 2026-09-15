(() => {
    const button = document.getElementById('boss-key-button');
    if (!button) return;
    document.documentElement.dataset.bossKeyExtension = 'ready';
    document.dispatchEvent(new Event('boss-key-extension-ready'));
    const active = () => document.getElementById('game')?.classList.contains('active');
    function send() {
        // 只接受真实按键或点击，页面脚本不能合成事件来关闭浏览器。
        const disconnected = () => {
            delete document.documentElement.dataset.bossKeyExtension;
            document.dispatchEvent(new Event('boss-key-extension-ready'));
        };
        try {
            chrome.runtime.sendMessage({ type: 'boss-key', action: button.dataset.action })
                .then(result => { if (!result?.ok) disconnected(); }, disconnected);
        } catch (_) { disconnected(); }
    }
    document.addEventListener('click', e => {
        if (e.isTrusted && active() && (e.target === button || button.contains(e.target))) send();
    }, true);
    document.addEventListener('keydown', e => {
        if (!e.isTrusted || e.repeat || e.isComposing || !active() ||
            document.getElementById('settings-dialog')?.open ||
            e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        let s;
        try { s = JSON.parse(button.dataset.shortcut); } catch (_) { return; }
        if (s && e.code === s.code && e.ctrlKey === s.ctrl && e.altKey === s.alt &&
            e.shiftKey === s.shift && e.metaKey === s.meta) send();
    }, true);
})();
