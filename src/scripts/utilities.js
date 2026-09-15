(function () {
    'use strict';
    if (typeof document === 'undefined') return;

    const API_URL = 'https://lab.magiconch.com/api/nbnhhsh/guess';
    const cache = new Map();
    let controller = null;
    let debounceTimer = null;

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

    function init() {
        const picker = document.getElementById('utility-picker');
        const pickerBtn = document.getElementById('utility-picker-btn');
        const menu = document.getElementById('utility-picker-menu');
        const input = document.getElementById('acronym-input');
        const form = document.getElementById('acronym-form');
        const submit = document.getElementById('acronym-submit');
        const results = document.getElementById('acronym-results');
        if (!picker || !pickerBtn || !menu || !input || !form || !submit || !results) return;

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
                document.title = '缩写转义 · 小功能 · MELS';
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

        if (location.pathname.startsWith('/tools')) document.title = '缩写转义 · 小功能 · MELS';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
