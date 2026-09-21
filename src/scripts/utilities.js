(function () {
    'use strict';
    if (typeof document === 'undefined') return;

    const API_URL = 'https://lab.magiconch.com/api/nbnhhsh/guess';
    const cache = new Map();
    let controller = null;
    let debounceTimer = null;
    let faviconFiles = null;
    let previewUrls = [];

    function extractTerms(value) {
        return (String(value || '').match(/[a-z0-9]{2,}/ig) || []).slice(0, 12);
    }

    function splitTranslation(value) {
        const text = String(value || '');
        const match = text.match(/^(.+?)[（(](.+?)[）)]$/);
        return match ? { text: match[1], note: match[2] } : { text };
    }

    function make(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function renderMessage(results, icon, message) {
        results.replaceChildren();
        const box = make('div', 'acronym-empty');
        box.append(make('span', '', icon), make('p', '', message));
        results.appendChild(box);
    }

    function renderResults(results, data) {
        results.replaceChildren();
        if (!Array.isArray(data) || !data.length) {
            renderMessage(results, '🤔', '没有找到匹配的缩写');
            return;
        }

        data.forEach((entry) => {
            const card = make('article', 'acronym-result-card');
            card.appendChild(make('h4', '', entry.name || '未知缩写'));
            const translations = Array.isArray(entry.trans) ? entry.trans : [];
            if (translations.length) {
                const list = make('ul', 'acronym-translation-list');
                list.setAttribute('translate', 'no');
                translations.forEach((value) => {
                    const item = make('li');
                    const parsed = splitTranslation(value);
                    item.appendChild(make('span', '', parsed.text));
                    if (parsed.note) item.appendChild(make('small', '', parsed.note));
                    list.appendChild(item);
                });
                card.appendChild(list);
            } else {
                card.appendChild(make('p', 'acronym-no-result', '暂无已收录释义'));
            }
            if (Array.isArray(entry.inputting) && entry.inputting.length) {
                const guesses = make('p', 'acronym-guesses');
                guesses.appendChild(make('strong', '', '有可能是：'));
                guesses.appendChild(document.createTextNode(entry.inputting.join('、')));
                card.appendChild(guesses);
            }
            results.appendChild(card);
        });
    }

    async function lookup(input, results, submit) {
        const terms = extractTerms(input.value);
        if (!terms.length) {
            renderMessage(results, '⌨️', '请输入至少两个连续的字母或数字');
            return;
        }
        const text = terms.join(',').toLowerCase();
        if (cache.has(text)) {
            renderResults(results, cache.get(text));
            return;
        }
        if (controller) controller.abort();
        controller = new AbortController();
        const requestController = controller;
        results.setAttribute('aria-busy', 'true');
        submit.disabled = true;
        renderMessage(results, '⏳', '正在寻找可能的原文…');
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
                signal: requestController.signal
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            cache.set(text, data);
            renderResults(results, data);
        } catch (error) {
            if (error.name !== 'AbortError') renderMessage(results, '⚠️', '查询暂时不可用，请稍后再试');
        } finally {
            if (controller === requestController) {
                controller = null;
                results.setAttribute('aria-busy', 'false');
                submit.disabled = false;
            }
        }
    }

    function canvasBlob(canvas) {
        return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片导出失败')), 'image/png'));
    }

    async function loadImage(file) {
        if (typeof createImageBitmap === 'function') return createImageBitmap(file);
        const url = URL.createObjectURL(file);
        try {
            const image = new Image();
            image.decoding = 'async';
            image.src = url;
            await image.decode();
            return image;
        } finally { URL.revokeObjectURL(url); }
    }

    async function makePng(source, size) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.clearRect(0, 0, size, size);
        context.drawImage(source, 0, 0, size, size);
        return canvasBlob(canvas);
    }

    async function makeIco(blobs, sizes) {
        const data = await Promise.all(blobs.map((blob) => blob.arrayBuffer()));
        const headerSize = 6 + data.length * 16;
        const totalSize = headerSize + data.reduce((sum, value) => sum + value.byteLength, 0);
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        view.setUint16(0, 0, true);
        view.setUint16(2, 1, true);
        view.setUint16(4, data.length, true);
        let offset = headerSize;
        data.forEach((value, index) => {
            const entry = 6 + index * 16;
            const size = sizes[index];
            view.setUint8(entry, size >= 256 ? 0 : size);
            view.setUint8(entry + 1, size >= 256 ? 0 : size);
            view.setUint8(entry + 2, 0);
            view.setUint8(entry + 3, 0);
            view.setUint16(entry + 4, 1, true);
            view.setUint16(entry + 6, 32, true);
            view.setUint32(entry + 8, value.byteLength, true);
            view.setUint32(entry + 12, offset, true);
            new Uint8Array(buffer, offset, value.byteLength).set(new Uint8Array(value));
            offset += value.byteLength;
        });
        return new Blob([buffer], { type: 'image/x-icon' });
    }

    function renderFaviconPreview(grid, generated) {
        previewUrls.forEach(URL.revokeObjectURL);
        previewUrls = [];
        grid.replaceChildren();
        [16, 32, 48, 180, 192, 512].forEach((size) => {
            const card = make('article', 'favicon-preview-card' + (size <= 48 ? ' is-small' : ''));
            const image = new Image();
            image.alt = `${size} × ${size} 像素图标预览`;
            const url = URL.createObjectURL(generated.get(size));
            previewUrls.push(url);
            image.src = url;
            card.append(image, make('span', '', `${size} × ${size} px`));
            grid.appendChild(card);
        });
    }

    async function prepareFavicon(file, elements) {
        const { dropzone, preview, grid, status, download } = elements;
        if (!file || !file.type.startsWith('image/')) {
            status.textContent = '请选择 PNG、JPG、BMP 或 WebP 图片。';
            status.classList.add('is-error');
            return;
        }
        status.classList.remove('is-error');
        status.textContent = '正在生成各尺寸图标…';
        download.disabled = true;
        try {
            const source = await loadImage(file);
            const sizes = [16, 32, 48, 180, 192, 512];
            const blobs = await Promise.all(sizes.map((size) => makePng(source, size)));
            if (typeof source.close === 'function') source.close();
            const generated = new Map(sizes.map((size, index) => [size, blobs[index]]));
            faviconFiles = {
                'favicon.ico': await makeIco([generated.get(16), generated.get(32), generated.get(48)], [16, 32, 48]),
                'favicon-16x16.png': generated.get(16),
                'favicon-32x32.png': generated.get(32),
                'apple-touch-icon.png': generated.get(180),
                'android-chrome-192x192.png': generated.get(192),
                'android-chrome-512x512.png': generated.get(512),
                'site.webmanifest': new Blob([JSON.stringify({
                    name: '', short_name: '',
                    icons: [
                        { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
                        { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
                    ],
                    theme_color: '#ffffff', background_color: '#ffffff', display: 'standalone'
                })], { type: 'application/manifest+json' })
            };
            renderFaviconPreview(grid, generated);
            dropzone.hidden = true;
            preview.hidden = false;
            status.textContent = '预览已生成。确认效果后即可下载。';
            download.disabled = false;
        } catch (error) {
            faviconFiles = null;
            status.textContent = '无法读取这张图片，请换一张后重试。';
            status.classList.add('is-error');
        }
    }

    function initFavicon() {
        const input = document.getElementById('favicon-input');
        const dropzone = document.getElementById('favicon-dropzone');
        const preview = document.getElementById('favicon-preview');
        const grid = document.getElementById('favicon-preview-grid');
        const status = document.getElementById('favicon-status');
        const download = document.getElementById('favicon-download');
        const change = document.getElementById('favicon-change');
        if (!input || !dropzone || !preview || !grid || !status || !download || !change) return;
        const elements = { input, dropzone, preview, grid, status, download };
        const choose = () => input.click();
        dropzone.addEventListener('click', choose);
        dropzone.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
        });
        input.addEventListener('change', () => prepareFavicon(input.files[0], elements));
        ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => {
            event.preventDefault(); dropzone.classList.add('is-dragging');
        }));
        ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (event) => {
            event.preventDefault(); dropzone.classList.remove('is-dragging');
        }));
        dropzone.addEventListener('drop', (event) => prepareFavicon(event.dataTransfer.files[0], elements));
        change.addEventListener('click', () => { input.value = ''; choose(); });
        download.addEventListener('click', async () => {
            if (!faviconFiles || typeof JSZip === 'undefined') {
                status.textContent = 'ZIP 组件未能加载，请刷新页面后重试。';
                status.classList.add('is-error');
                return;
            }
            download.disabled = true;
            status.textContent = '正在打包 ZIP…';
            try {
                const zip = new JSZip();
                Object.entries(faviconFiles).forEach(([name, blob]) => zip.file(name, blob));
                const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'favicon_package.zip';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                status.textContent = '图包已生成，下载应已开始。';
            } catch (error) {
                status.textContent = 'ZIP 生成失败，请重试。';
                status.classList.add('is-error');
            } finally { download.disabled = false; }
        });
    }

    function init() {
        const picker = document.getElementById('utility-picker');
        const pickerBtn = document.getElementById('utility-picker-btn');
        const menu = document.getElementById('utility-picker-menu');
        const input = document.getElementById('acronym-input');
        const form = document.getElementById('acronym-form');
        const submit = document.getElementById('acronym-submit');
        const results = document.getElementById('acronym-results');
        if (!picker || !pickerBtn || !menu || !input || !form || !submit || !results) return;

        function showUtility(name, updateTitle = true) {
            const selected = ['favicon', 'aicu', 'arg'].includes(name) ? name : 'acronym';
            document.querySelectorAll('.utility-view').forEach((view) => { view.hidden = view.id !== `${selected}-view`; });
            menu.querySelectorAll('.utility-picker-item').forEach((item) => {
                const active = item.dataset.utility === selected;
                item.classList.toggle('active', active);
                item.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            const label = { favicon: 'Favicon 图包', aicu: 'B站记录查询', arg: 'ARG 辅助器', acronym: '缩写转义' }[selected];
            pickerBtn.title = `切换功能（当前：${label}）`;
            pickerBtn.setAttribute('aria-label', `切换功能，当前：${label}`);
            if (updateTitle) document.title = `${label} · 小功能 · MELS`;
        }

        function setOpen(open) {
            picker.classList.toggle('open', open);
            pickerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) menu.querySelector('[aria-selected="true"]')?.focus();
        }
        pickerBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(!picker.classList.contains('open'));
        });
        menu.addEventListener('click', (event) => {
            const item = event.target.closest('.utility-picker-item');
            if (!item) return;
            if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                event.preventDefault();
                if (location.pathname !== item.getAttribute('href')) {
                    history.pushState({ page: 'tools', utility: item.dataset.utility }, '', item.getAttribute('href'));
                }
                showUtility(item.dataset.utility);
            }
            setOpen(false);
        });
        document.addEventListener('click', () => setOpen(false));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') setOpen(false);
        });

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            clearTimeout(debounceTimer);
            lookup(input, results, submit);
        });
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            if (controller) {
                controller.abort();
                controller = null;
                results.setAttribute('aria-busy', 'false');
                submit.disabled = false;
            }
            if (!input.value.trim()) {
                renderMessage(results, '⌨️', '先输入一个缩写试试');
                return;
            }
            debounceTimer = setTimeout(() => lookup(input, results, submit), 450);
        });

        const fromPath = () => location.pathname.startsWith('/tools/aicu') ? 'aicu' : location.pathname.startsWith('/tools/favicon') ? 'favicon' : location.pathname.startsWith('/tools/arg') ? 'arg' : 'acronym';
        const utilityFromPath = fromPath();
        showUtility(utilityFromPath, location.pathname.startsWith('/tools'));
        addEventListener('popstate', () => showUtility(fromPath(), location.pathname.startsWith('/tools')));
        initFavicon();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
