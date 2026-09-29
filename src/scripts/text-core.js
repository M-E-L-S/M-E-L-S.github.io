/* Small, dependency-free text operations shared by the workbench and its checks. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.MELSTextCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const normalize = value => String(value || '').replace(/\r\n?/g, '\n');
    const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rules = {
        digits: '\\d+',
        spaces: '[ \\t]{2,}',
        'blank-lines': '(?:\\n[ \\t]*){3,}',
        urls: 'https?:\\/\\/[^\\s<>"\']+',
        emails: '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}'
    };
    function usesRegexSyntax(value) {
        return value.includes('\\') || /\[[^\]]+\]|\([^)]*\)|\.\*|\.\+|\{\d+(?:,\d*)?\}|^\^|\$$|\|/.test(value);
    }
    function replace(input, options) {
        const source = normalize(input);
        const mode = options.mode || 'auto';
        const find = options.find || '';
        const regexMode = mode === 'regex' || mode === 'guided' || (mode === 'auto' && usesRegexSyntax(find));
        const pattern = mode === 'guided' ? rules[options.guide] : regexMode ? find : escapeRegex(find);
        if (!pattern) throw new Error('请输入要查找的内容。');
        if (pattern.length > 500) throw new Error('查找规则过长，请缩短后重试。');
        const flags = (options.all === false ? '' : 'g') + (options.caseSensitive ? '' : 'i') + (mode === 'guided' && options.guide === 'emails' ? 'i' : '');
        const re = new RegExp(pattern, [...new Set(flags)].join(''));
        const replacement = String(options.replacement || '').replace(/\\([\\nt])/g, (_, char) => char === 'n' ? '\n' : char === 't' ? '\t' : '\\');
        let count = 0;
        // Literal replacement must not interpret $&, $1, etc. Regex mode deliberately does.
        const output = source.replace(re, function (...args) {
            count++;
            if (!regexMode) return replacement;
            const match = args[0];
            const groups = typeof args[args.length - 1] === 'object' ? args[args.length - 1] : undefined;
            const offset = args[groups ? args.length - 3 : args.length - 2];
            return replacement.replace(/\$\$|\$&|\$`|\$'|\$<([^>]+)>|\$(\d{1,2})/g, (token, name, index) => {
                if (token === '$$') return '$';
                if (token === '$&') return match;
                if (token === '$`') return source.slice(0, offset);
                if (token === "$'") return source.slice(offset + match.length);
                if (name !== undefined) return groups?.[name] ?? token;
                const n = Number(index);
                return n > 0 && n < args.length - (groups ? 3 : 2) ? args[n] ?? '' : token;
            });
        });
        return { output, count, pattern };
    }
    function detect(input) {
        const source = normalize(input);
        const found = [];
        const seen = new Set();
        const occupied = [];
        function add(type, value, index, reason, occupy = true) {
            const key = `${type}:${value}`;
            if (!value || seen.has(key)) return;
            seen.add(key); found.push({ type, value, index, reason });
            if (occupy) occupied.push([index, index + value.length]);
        }
        function collect(type, regex, clean) {
            for (const match of source.matchAll(regex)) {
                const value = clean ? clean(match[1] || match[0]) : match[1] || match[0];
                add(type, value, match.index + match[0].indexOf(match[1] || match[0]), '明确格式');
            }
        }
        collect('网址', /https?:\/\/[^\s<>"'`]+/gi, value => value.replace(/[.,;!?，。；！？)）\]}]+$/u, ''));
        collect('邮箱', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi);
        collect('电话', /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g);
        const labels = /(?:邀请码|邀请口令|提取码|访问码|兑换码|礼品码|激活码|分享码|取件码|兑换代码|invite\s*code|redeem\s*code|code|码)\s*(?:[:：=是为]\s*)?[\[【(（「『"“']?([A-Za-z0-9][A-Za-z0-9_-]{3,39})/gi;
        for (const match of source.matchAll(labels)) {
            const value = match[1];
            const index = match.index + match[0].lastIndexOf(value);
            if (occupied.some(([start, end]) => index < end && index + value.length > start)) continue;
            const type = /兑换|礼品|redeem/i.test(match[0]) ? '兑换码' : /提取/.test(match[0]) ? '提取码' : '邀请码';
            add(type, value, index, '附近有“码”或代码提示');
        }
        const entropy = value => {
            const counts = new Map();
            for (const char of value) counts.set(char, (counts.get(char) || 0) + 1);
            return [...counts.values()].reduce((sum, count) => { const p = count / value.length; return sum - p * Math.log2(p); }, 0);
        };
        const candidates = /(?<![A-Za-z0-9_])[A-Za-z0-9][A-Za-z0-9_-]{3,39}(?![A-Za-z0-9_])/g;
        for (const match of source.matchAll(candidates)) {
            const value = match[0], index = match.index;
            if (occupied.some(([start, end]) => index < end && index + value.length > start)) continue;
            if (/^\d+$/.test(value)) continue;
            const before = source.slice(Math.max(0, index - 24), index);
            const after = source.slice(index + value.length, index + value.length + 1);
            const wrapped = /[\[【(（「『"“]\s*$/.test(before) && /^[\]】)）」』"”]/.test(after);
            const nearCode = /(?:码|口令|code)\s*[:：=为是]?\s*[\[【(（「『"“]?\s*$/i.test(before);
            const classes = Number(/[a-z]/.test(value)) + Number(/[A-Z]/.test(value)) + Number(/\d/.test(value));
            const random = value.length >= 10 && classes >= 2 && entropy(value) >= 3.1 && new Set(value).size / value.length >= .55;
            if (!wrapped && !nearCode && !random) continue;
            const reason = nearCode ? '附近有“码”' : wrapped ? '括号包裹' : '高熵字符组合';
            add('疑似代码', value, index, reason);
        }
        return found.sort((a, b) => a.index - b.index);
    }
    function cleanText(input) {
        let output = normalize(input)
            .replace(/[\u0085\u2028\u2029]/g, '\n')
            .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
            .replace(/[\u00AD\u200B-\u200F\u2060\u2066-\u2069\uFEFF\u202A-\u202E\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
        output = output.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
        output = output.trim();
        const lines = output.split('\n'), merged = [];
        let inFence = false;
        for (const line of lines) {
            if (/^(`{3,}|~{3,})/.test(line)) inFence = !inFence;
            const previous = merged[merged.length - 1];
            const canJoin = !inFence && previous && line && previous.length >= 35 &&
                !/[。！？.!?;；:：]$/.test(previous) && !/^(?:[-*•#>|]|\d+[.)]|`{3,}|~{3,})/.test(previous) &&
                /^[a-z\u4E00-\u9FFF]/.test(line);
            if (canJoin) merged[merged.length - 1] += /[\u4E00-\u9FFF]$/.test(previous) && /^[\u4E00-\u9FFF]/.test(line) ? line : ` ${line}`;
            else merged.push(line);
        }
        return merged.filter(Boolean).join('\n');
    }
    function inlineParts(input) {
        // Keep escaped Markdown punctuation literal while parsing other markers.
        const text = input.replace(/\\([\\`*_{}\[\]()#+.!>~-])/g, (_, char) => `\uE000${char.codePointAt(0)}\uE001`);
        const parts = [];
        const token = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)|\[([^\]]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)|`([^`]+)`|\*\*(.+?)\*\*(?!\*)|__(.+?)__(?!_)|~~(.+?)~~|\*([^*\n]+)\*|_([^_\n]+)_|<[^>\n]+>/g;
        let cursor = 0, match;
        while ((match = token.exec(text))) {
            if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index) });
            if (match[1] !== undefined) parts.push({ text: `[图片: ${match[1]}] (${match[2]})` });
            else if (match[3] !== undefined) parts.push({ text: match[3], link: match[4] });
            else if (match[5] !== undefined) parts.push({ text: match[5], code: true });
            else if (match[6] !== undefined || match[7] !== undefined) parts.push(...inlineParts(match[6] || match[7]).map(part => ({ ...part, bold: true })));
            else if (match[8] !== undefined) parts.push(...inlineParts(match[8]).map(part => ({ ...part, strike: true })));
            else if (match[9] !== undefined || match[10] !== undefined) parts.push(...inlineParts(match[9] || match[10]).map(part => ({ ...part, italic: true })));
            cursor = token.lastIndex;
        }
        if (cursor < text.length) parts.push({ text: text.slice(cursor) });
        return parts.map(part => ({ ...part, text: part.text.replace(/\uE000(\d+)\uE001/g, (_, code) => String.fromCodePoint(Number(code))) }));
    }
    function plainInline(input) {
        return inlineParts(input).map(part => part.link && part.link !== part.text ? `${part.text} (${part.link})` : part.text).join('');
    }
    function parseMarkdown(input) {
        const lines = normalize(input).split('\n');
        const blocks = [];
        const tableSeparator = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
        const cells = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
        let fence = null;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const fenceMatch = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
            if (fenceMatch) {
                if (fence) {
                    if (fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length) { fence = null; continue; }
                } else { fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length }; continue; }
            }
            if (fence) { blocks.push({ kind: 'code', text: line }); continue; }
            if (/^\s*$/.test(line)) { blocks.push({ kind: 'blank', text: '' }); continue; }
            if (i + 1 < lines.length && line.includes('|') && tableSeparator.test(lines[i + 1])) {
                const rows = [cells(line)];
                const align = cells(lines[i + 1]).map(cell => /^:.*:$/.test(cell) ? 'center' : /:$/.test(cell) ? 'right' : 'left');
                i++;
                while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) rows.push(cells(lines[++i]));
                blocks.push({ kind: 'table', rows, align }); continue;
            }
            if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) { blocks.push({ kind: 'rule', text: '' }); continue; }
            const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
            if (heading) { blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] }); continue; }
            if (i + 1 < lines.length && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
                blocks.push({ kind: 'heading', level: lines[i + 1].trim()[0] === '=' ? 1 : 2, text: line.trim() }); i++; continue;
            }
            const quote = /^\s{0,3}>\s?(.*)$/.exec(line);
            if (quote) { blocks.push({ kind: 'quote', text: quote[1] }); continue; }
            const list = /^(\s{0,6})([-+*]|\d+[.)])\s+(.*)$/.exec(line);
            if (list) { blocks.push({ kind: 'list', ordered: /\d/.test(list[2][0]), marker: list[2], depth: Math.min(3, Math.floor(list[1].length / 2)), text: list[3].replace(/^\[[ xX]\]\s*/, '') }); continue; }
            blocks.push({ kind: 'paragraph', text: line.replace(/\s{2,}$/, '') });
        }
        return blocks;
    }
    function stripMarkdown(input) {
        const blocks = parseMarkdown(input);
        const output = blocks.map(block => {
            if (block.kind === 'blank') return '';
            if (block.kind === 'rule') return '────────';
            if (block.kind === 'code') return block.text;
            if (block.kind === 'table') return block.rows.map(row => row.map(plainInline).join('\t')).join('\n');
            if (block.kind === 'list') return `${'  '.repeat(block.depth)}${block.ordered ? block.marker.replace(/[)]$/, '.') : '•'} ${plainInline(block.text)}`;
            if (block.kind === 'quote') return `引用：${plainInline(block.text)}`;
            return plainInline(block.text);
        }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
        return { output, blocks };
    }
    function diffLines(before, after) {
        const oldLines = normalize(before).split('\n'), newLines = normalize(after).split('\n');
        if (oldLines.length * newLines.length > 45000) return [{ type: 'notice', text: '文本较长，差异预览已简化；请对照下方完整原文与结果。' }];
        const dp = Array.from({ length: oldLines.length + 1 }, () => new Uint16Array(newLines.length + 1));
        for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--)
            dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        const changes = []; let i = 0, j = 0;
        while (i < oldLines.length || j < newLines.length) {
            if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { changes.push({ type: 'same', text: oldLines[i++] }); j++; }
            else if (j < newLines.length && (i === oldLines.length || dp[i][j + 1] > dp[i + 1][j])) changes.push({ type: 'add', text: newLines[j++] });
            else changes.push({ type: 'remove', text: oldLines[i++] });
        }
        return changes;
    }
    return { normalize, replace, detect, cleanText, parseMarkdown, stripMarkdown, inlineParts, diffLines, rules };
});
