(() => {
    const dialog = document.getElementById('settings-dialog');
    const opener = document.getElementById('settings-toggle');
    const flameToggle = document.getElementById('flame-toggle');
    const supportNote = document.getElementById('flame-support');
    const resetButton = document.getElementById('reset-settings');
    const about = document.getElementById('about');
    const content = about.querySelector('.about-content');
    const engine = window.CanvasUIFlameWrap;
    const native = Boolean(engine && engine.supportsHtmlInCanvas());
    let enabled = false;
    try {
        const saved = localStorage.getItem('winy-flame');
        if (saved !== null) enabled = saved === 'true';
    } catch (_) {}
    flameToggle.checked = enabled;

    opener.addEventListener('click', () => dialog.showModal());
    document.getElementById('settings-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => opener.focus());

    let active = null;
    let failed = false;
    let captureFailed = false;
    let captured = false;
    function describeSupport() {
        supportNote.textContent = failed
            ? '当前浏览器不支持此效果，正文仍可正常阅读。'
            : captureFailed
                ? '正文捕获失败，已保留正文与火焰。请打开浏览器控制台查看具体原因。'
            : native
                ? captured ? '完整效果已运行。' : '已检测到 HTML-in-Canvas，当前浏览器可显示完整效果'
                : '当前浏览器尚未启用 HTML-in-Canvas，文字扭曲和页面折射效果已省略。';
    }
    describeSupport();

    function stop() {
        if (!active) return;
        active.instance.destroy();
        active.resize.disconnect();
        active.stage.replaceWith(content);
        content.removeAttribute('drawable');
        active = null;
        about.classList.remove('has-flame');
    }

    function start() {
        if (active || failed) return;
        if (!engine) { failed = true; describeSupport(); return; }
        const stage = document.createElement('div');
        stage.className = 'about-flame-stage';
        content.before(stage);
        stage.append(content);
        about.classList.add('has-flame');

        const source = document.createElement('canvas');
        source.className = 'flame-source';
        source.setAttribute('layoutsubtree', 'true');
        const output = document.createElement('canvas');
        output.className = 'flame-output';
        output.setAttribute('aria-hidden', 'true');
        // Match the original wrapper's reach (170 * 1.5 + 40) and glow (8 * 3 + 16).
        stage.append(source, output);
        const useNative = native && !captureFailed;
        if (useNative) {
            stage.style.height = `${content.offsetHeight}px`;
            stage.classList.add('flame-native');
            // New HTML-in-Canvas implementations require an explicit drawable snapshot target.
            content.setAttribute('drawable', '');
            source.append(content);
        }

        source.addEventListener('flamecaptured', () => {
            captured = true;
            describeSupport();
        });
        source.addEventListener('flamecaptureerror', () => {
            // Let the current paint callback finish before releasing its GL resources.
            queueMicrotask(() => {
                if (active?.source !== source) return;
                captureFailed = true;
                captured = false;
                stop();
                sync();
                describeSupport();
            });
        });

        let instance;
        try {
            // Keep Canvas UI's original heat range so the article body remains readable.
            const radius = parseFloat(getComputedStyle(content).borderTopLeftRadius) || 24;
            instance = engine.createFlameWrap({ source, content, output }, { radius });
        } catch (error) {
            console.warn('Flame Wrap could not initialize:', error);
        }
        if (!instance) {
            stage.replaceWith(content);
            content.removeAttribute('drawable');
            about.classList.remove('has-flame');
            failed = true;
            describeSupport();
            return;
        }
        const resize = new ResizeObserver(() => {
            // Snapshot geometry may be transformed by the canvas; use layout height instead.
            if (useNative) stage.style.height = `${content.offsetHeight}px`;
        });
        resize.observe(content);
        active = { instance, resize, stage, source };
        output.addEventListener('webglcontextlost', () => {
            failed = true;
            stop();
            describeSupport();
        }, { once: true });
    }

    function sync() {
        if (enabled && about.classList.contains('active') && !document.hidden) start();
        else stop();
    }
    flameToggle.addEventListener('change', () => {
        enabled = flameToggle.checked;
        failed = false;
        captureFailed = false;
        captured = false;
        describeSupport();
        try { localStorage.setItem('winy-flame', String(enabled)); } catch (_) {}
        sync();
    });
    resetButton.addEventListener('click', () => {
        enabled = false;
        failed = false;
        captureFailed = false;
        captured = false;
        flameToggle.checked = false;
        try { localStorage.removeItem('winy-flame'); } catch (_) {}
        window.dispatchEvent(new Event('winy-reset-appearance'));
        sync();
        describeSupport();
        const originalText = resetButton.textContent;
        resetButton.textContent = '已恢复默认';
        setTimeout(() => { resetButton.textContent = originalText; }, 1200);
    });
    new MutationObserver(sync).observe(about, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(() => {
        // Repaint captured HTML when the theme changes, including reduced-motion mode.
        active?.instance.resize();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', sync);
    sync();
})();
