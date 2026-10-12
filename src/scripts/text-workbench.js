(function () {
    'use strict';
    const core = globalThis.MELSTextCore;
    if (!core) return;
    const $ = id => document.getElementById(id);
    const active = { replace: false, strip: false, clean: false };
    const labels = {
        replace: ['一键替换', '✓ 替换已启用 · 点击取消'],
        strip: ['一键去 Markdown', '✓ 去 Markdown 已启用 · 点击取消'],
        clean: ['一键清理文本', '✓ 清理已启用 · 点击取消']
    };
    let worker = null, workerTimer = null, workerReject = null, inputTimer = null, revision = 0, docxSource = null, docxMathSpans = [];
    const copyFeedback = new WeakMap();
    function showCopied(button) {
        if (!button) return;
        const previous = copyFeedback.get(button) || { text: button.textContent, label: button.getAttribute('aria-label') };
        clearTimeout(previous.timer);
        button.textContent = '已复制';
        button.setAttribute('aria-label', '已复制');
        previous.timer = setTimeout(() => {
            button.textContent = previous.text;
            if (previous.label === null) button.removeAttribute('aria-label');
            else button.setAttribute('aria-label', previous.label);
            copyFeedback.delete(button);
        }, 1600);
        copyFeedback.set(button, previous);
    }
    function copy(value, status, button) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value).then(() => {
            status.textContent = '已复制到剪贴板。';
            showCopied(button);
        }).catch(() => fallbackCopy(value, status, button));
        return fallbackCopy(value, status, button);
    }
    function fallbackCopy(value, status, button) {
        const input = document.createElement('textarea');
        input.value = value; input.style.position = 'fixed'; input.style.opacity = '0';
        document.body.appendChild(input); input.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } catch (_) {}
        input.remove();
        status.textContent = copied ? '已复制到剪贴板。' : '复制失败，请手动选择文本。';
        if (copied) showCopied(button);
    }
    function cancelWorker(message = '已取消旧操作。') {
        if (worker) worker.terminate();
        if (workerTimer) clearTimeout(workerTimer);
        if (workerReject) workerReject(new Error(message));
        worker = null; workerTimer = null; workerReject = null;
    }
    function runReplace(input, options) {
        return new Promise((resolve, reject) => {
            if (typeof Worker === 'undefined') { reject(new Error('当前浏览器不支持安全执行正则替换。')); return; }
            cancelWorker();
            const script = document.querySelector('script[src*="text-workbench.js"]');
            const version = script ? new URL(script.src).search : '';
            worker = new Worker('/src/scripts/text-worker.js' + version);
            workerReject = reject;
            workerTimer = setTimeout(() => cancelWorker('规则执行超过 2 秒，请简化正则表达式。'), 2000);
            worker.onmessage = event => {
                const data = event.data;
                worker.terminate(); clearTimeout(workerTimer);
                worker = null; workerTimer = null; workerReject = null;
                data.ok ? resolve(data.result) : reject(new Error(data.error));
            };
            worker.onerror = () => {
                worker.terminate(); clearTimeout(workerTimer);
                worker = null; workerTimer = null; workerReject = null;
                reject(new Error('替换执行失败，请检查规则。'));
            };
            worker.postMessage({ input, options });
        });
    }
    function updateButtons() {
        for (const [name, id] of [['replace', 'text-run-replace'], ['strip', 'text-strip-markdown'], ['clean', 'text-clean']]) {
            const button = $(id);
            button.setAttribute('aria-pressed', String(active[name]));
            button.classList.toggle('is-active', active[name]);
            button.textContent = labels[name][Number(active[name])];
        }
    }
    function setDiff(before, after) {
        const diff = $('text-diff'); diff.replaceChildren();
        if (before === after) { const p = document.createElement('p'); p.className = 'text-empty'; p.textContent = '原文与结果相同。'; diff.appendChild(p); $('text-change-count').textContent = '没有变化'; return; }
        const changes = core.diffLines(before, after);
        const changed = changes.filter(change => change.type === 'add' || change.type === 'remove').length;
        $('text-change-count').textContent = changes[0]?.type === 'notice' ? '差异预览已简化' : `${changed} 行变化`;
        const shown = changes.length > 250 ? [...changes.slice(0, 125), { type: 'notice', text: `已省略 ${changes.length - 250} 行` }, ...changes.slice(-125)] : changes;
        for (let index = 0; index < shown.length; index++) {
            const change = shown[index];
            const row = document.createElement('div'); row.className = `text-diff-line is-${change.type}`;
            const sign = document.createElement('span'); sign.className = 'text-diff-sign'; sign.textContent = change.type === 'add' ? '+' : change.type === 'remove' ? '−' : change.type === 'notice' ? '⋯' : ' ';
            const content = document.createElement('span'); content.className = 'text-diff-content'; content.translate = false;
            const next = shown[index + 1];
            const pair = change.type === 'remove' && next?.type === 'add' ? next : change.type === 'add' && shown[index - 1]?.type === 'remove' ? shown[index - 1] : null;
            if (pair) {
                const a = change.text, b = pair.text; let left = 0, right = 0;
                while (left < a.length && left < b.length && a[left] === b[left]) left++;
                while (right < a.length - left && right < b.length - left && a[a.length - right - 1] === b[b.length - right - 1]) right++;
                content.append(document.createTextNode(a.slice(0, left)));
                const mark = document.createElement('mark'); mark.textContent = a.slice(left, a.length - right); content.append(mark);
                content.append(document.createTextNode(right ? a.slice(-right) : ''));
            } else content.textContent = change.text || ' ';
            row.append(sign, content); diff.appendChild(row);
        }
    }
    function clearResult(message) {
        $('text-output').value = ''; $('text-copy-output').disabled = true; $('text-change-count').textContent = '尚未处理';
        $('text-diff').replaceChildren();
        const p = document.createElement('p'); p.className = 'text-empty'; p.textContent = '按下一个操作后显示修改部分。'; $('text-diff').appendChild(p);
        $('text-status').textContent = message;
    }
    function renderDetections(source) {
        const findings = core.detect(source);
        const container = $('text-detections'); container.replaceChildren();
        $('text-detect-count').textContent = findings.length ? `${findings.length} 项` : '未发现';
        if (!findings.length) { const p = document.createElement('p'); p.className = 'text-empty'; p.textContent = source ? '未发现可提取的信息。' : '输入原文后，这里会自动显示结果。'; container.appendChild(p); return; }
        function makeRow(item) {
            const row = document.createElement('div'); row.className = 'text-detection';
            const value = document.createElement('span'); value.className = 'text-detection-value'; value.textContent = item.value; value.translate = false;
            const reason = document.createElement('span'); reason.className = 'text-detection-reason'; reason.textContent = item.reason || '';
            const actions = document.createElement('div'); actions.className = 'text-detection-actions';
            const button = document.createElement('button'); button.type = 'button'; button.className = 'text-subtle'; button.textContent = '复制'; button.setAttribute('aria-label', `复制${item.type}`);
            button.addEventListener('click', () => copy(item.value, $('text-status'), button));
            actions.appendChild(button);
            function addLink(label, url) {
                const link = document.createElement('a'); link.className = 'text-subtle'; link.textContent = label;
                link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
                actions.appendChild(link);
            }
            if (item.type === '网址') addLink('直接跳转', item.value);
            if (item.type === '疑似 PIXIV ID') {
                addLink('作品链接', `https://www.pixiv.net/artworks/${item.value}`);
                addLink('用户链接', `https://www.pixiv.net/users/${item.value}`);
            }
            row.append(value, reason, actions);
            return row;
        }
        const groups = new Map();
        for (const item of findings.slice(0, 100)) {
            if (!groups.has(item.type)) groups.set(item.type, []);
            groups.get(item.type).push(item);
        }
        for (const [type, items] of groups) {
            const group = document.createElement('section'); group.className = 'text-detection-group';
            const heading = document.createElement('h5'); heading.className = 'text-detection-type';
            const tag = document.createElement('span'); tag.textContent = type;
            const count = document.createElement('span'); count.className = 'text-count'; count.textContent = `${items.length} 项`;
            heading.append(tag, count); group.append(heading, makeRow(items[0]));
            if (items.length > 1) {
                const details = document.createElement('details'); details.className = 'text-detection-more';
                const summary = document.createElement('summary');
                const updateSummary = () => {
                    const label = details.open ? '收起其余 {count} 项' : '展开其余 {count} 项';
                    if (globalThis.MELSI18n) globalThis.MELSI18n.bind(summary, label, { count: items.length - 1 });
                    else summary.textContent = label.replace('{count}', items.length - 1);
                };
                updateSummary(); details.addEventListener('toggle', updateSummary);
                const rest = document.createElement('div'); rest.className = 'text-detection-rest';
                for (const item of items.slice(1)) rest.appendChild(makeRow(item));
                details.append(summary, rest); group.appendChild(details);
            }
            container.appendChild(group);
        }
        if (findings.length > 100) { const p = document.createElement('p'); p.className = 'text-card-help'; p.textContent = `只显示前 100 项，共发现 ${findings.length} 项。`; container.appendChild(p); }
    }
    async function recompute() {
        const current = ++revision, source = $('text-source').value;
        cancelWorker(); docxSource = null; docxMathSpans = [];
        $('text-export-docx').disabled = true;
        if (!source) { clearResult('请先输入原文。'); $('text-export-docx').disabled = false; return; }
        if (!Object.values(active).some(Boolean)) { clearResult('按下操作后可在上方核对结果。'); docxSource = source; $('text-export-docx').disabled = false; return; }
        let output = source, replaced = null;
        try {
            if (active.replace) {
                if (!$('text-find').value) throw new Error('请输入要查找的内容。');
                $('text-status').textContent = '正在处理…';
                replaced = await runReplace(output, { mode: 'auto', find: $('text-find').value, replacement: $('text-replacement').value, caseSensitive: true, all: true });
                output = replaced.output;
            }
            if (current !== revision) return;
            if (active.strip) {
                const stripped = core.stripMarkdown(output);
                output = stripped.output; docxMathSpans = stripped.mathSpans;
            }
            if (active.clean) {
                const cleaned = core.cleanWithMathSpans(output, docxMathSpans);
                output = cleaned.output; docxMathSpans = cleaned.mathSpans;
            }
            docxSource = output;
            $('text-output').value = output; $('text-copy-output').disabled = false;
            setDiff(source, output);
            $('text-status').textContent = replaced ? `已应用所选操作；替换 ${replaced.count} 处。` : '已应用所选操作；再次按下按钮即可取消。';
        } catch (error) {
            if (current === revision) { clearResult(error.message || '处理失败。'); docxSource = null; }
        } finally { if (current === revision) $('text-export-docx').disabled = false; }
    }
    function init() {
        if (!$('text-view')) return;
        const source = $('text-source'), status = $('text-status');
        updateButtons();
        source.addEventListener('input', () => {
            $('text-source-meta').textContent = `${source.value.length} 字符 · 粘贴后自动嗅探特殊信息`;
            renderDetections(source.value); recompute();
        });
        $('text-clear').addEventListener('click', () => { source.value = ''; source.dispatchEvent(new Event('input')); source.focus(); });
        $('text-copy-output').addEventListener('click', () => copy($('text-output').value, status, $('text-copy-output')));
        for (const [name, id] of [['replace', 'text-run-replace'], ['strip', 'text-strip-markdown'], ['clean', 'text-clean']]) {
            $(id).addEventListener('click', () => { active[name] = !active[name]; updateButtons(); recompute(); });
        }
        for (const id of ['text-find', 'text-replacement']) $(id).addEventListener('input', () => {
            if (!active.replace) return;
            clearTimeout(inputTimer); inputTimer = setTimeout(recompute, 160);
        });
        $('text-guide').addEventListener('change', () => {
            const guide = $('text-guide').value;
            if (!guide) return;
            $('text-find').value = core.rules[guide];
            $('text-replacement').value = guide === 'spaces' ? ' ' : guide === 'blank-lines' ? '\\n\\n' : '';
            if (active.replace) recompute();
            $('text-find').focus();
        });
        $('text-export-docx').addEventListener('click', async () => {
            if (!source.value) { status.textContent = '请先输入 Markdown 原文。'; source.focus(); return; }
            if (docxSource === null) { status.textContent = '请先修正替换规则。'; return; }
            const button = $('text-export-docx'), current = revision, text = docxSource;
            const options = { plain: active.strip, mathSpans: docxMathSpans };
            button.disabled = true; status.textContent = '正在生成 DOCX…';
            try {
                const blob = await globalThis.MELSTextDocx.exportDocx(text, options);
                if (current !== revision) return;
                const url = URL.createObjectURL(blob), link = document.createElement('a');
                link.href = url; link.download = '快捷文本工作台.docx'; document.body.appendChild(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                status.textContent = 'DOCX 已生成，下载应已开始。导出内容与当前处理结果一致。';
            } catch (error) { if (current === revision) status.textContent = error.message || 'DOCX 生成失败。'; }
            finally { if (current === revision) button.disabled = false; }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
