(() => {
    const selector = '.tool-tabs a[data-freshcup-tool]';
    let requestController = null;

    function copyScript(source, tool) {
        return new Promise((resolve, reject) => {
            document.getElementById('freshcup-tool-script')?.remove();
            const script = document.createElement('script');
            script.id = 'freshcup-tool-script';
            script.dataset.tool = tool;
            script.src = source;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    function swapTheme(source) {
        return new Promise((resolve, reject) => {
            const current = document.getElementById('freshcup-tool-theme');
            if (current?.href === new URL(source, location.href).href) {
                resolve();
                return;
            }
            const link = document.createElement('link');
            link.id = 'freshcup-tool-theme-next';
            link.rel = 'stylesheet';
            link.href = source;
            link.onload = () => {
                current?.remove();
                link.id = 'freshcup-tool-theme';
                resolve();
            };
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    async function openTool(url, { push = false, fallback = false } = {}) {
        const targetUrl = new URL(url, location.href);
        const active = document.querySelector(`${selector}[href="${targetUrl.pathname}"]`);
        const currentScript = document.getElementById('freshcup-tool-script');
        if (active?.hasAttribute('aria-current') && currentScript) {
            if (push && location.pathname !== targetUrl.pathname) {
                history.pushState({ page: 'freshcup', tool: currentScript.dataset.tool }, '', targetUrl.pathname);
            }
            return;
        }

        requestController?.abort();
        requestController = new AbortController();
        const container = document.getElementById('freshcup-tool');
        if (!container) return;
        container.setAttribute('aria-busy', 'true');

        try {
            const response = await fetch(targetUrl, {
                signal: requestController.signal,
                headers: { 'X-Requested-With': 'freshcup-navigation' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const nextDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
            const nextTool = nextDocument.getElementById('freshcup-tool');
            const nextTheme = nextDocument.getElementById('freshcup-tool-theme');
            const nextScript = nextDocument.getElementById('freshcup-tool-script');
            if (!nextTool || !nextTheme || !nextScript) throw new Error('目标工具页面不完整');

            await swapTheme(nextTheme.getAttribute('href'));
            container.replaceChildren(...Array.from(nextTool.childNodes).map(node => document.importNode(node, true)));
            await copyScript(nextScript.getAttribute('src'), nextScript.dataset.tool);

            document.querySelectorAll(selector).forEach(link => {
                if (link.dataset.freshcupTool === nextScript.dataset.tool) link.setAttribute('aria-current', 'page');
                else link.removeAttribute('aria-current');
            });
            if (push) history.pushState({ page: 'freshcup', tool: nextScript.dataset.tool }, '', targetUrl.pathname);
            document.title = '鲜蔬杯 · MELS';
            document.querySelector('.tool-tabs')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('鲜蔬杯工具切换失败', error);
            if (fallback) location.assign(targetUrl.href);
        } finally {
            container.removeAttribute('aria-busy');
        }
    }

    document.addEventListener('click', event => {
        const link = event.target.closest(selector);
        if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openTool(link.href, { push: true, fallback: true });
    });

    addEventListener('popstate', () => {
        if (location.pathname.startsWith('/freshcup')) openTool(location.href);
    });
})();
