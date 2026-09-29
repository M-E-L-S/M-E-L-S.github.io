(function (root) {
    'use strict';
    const core = root.MELSTextCore;
    const xml = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const paragraph = (body, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${body || '<w:r><w:t xml:space="preserve"> </w:t></w:r>'}</w:p>`;
    function run(text, flags = {}) {
        const properties = [flags.bold && '<w:b/>', flags.italic && '<w:i/>', flags.strike && '<w:strike/>', flags.code && '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>', flags.link && '<w:color w:val="176B9E"/><w:u w:val="single"/>'].filter(Boolean).join('');
        return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
    }
    const mathRun = text => `<m:r><m:t xml:space="preserve">${xml(text)}</m:t></m:r>`;
    function mathContent(latex) {
        const source = String(latex);
        if (source.length > 8000 || /\\(?:begin|end|newcommand|renewcommand|tag)\b/.test(source)) return mathRun(source);
        const symbols = {
            alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', phi: 'φ', omega: 'ω',
            Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω',
            times: '×', cdot: '·', pm: '±', mp: '∓', leq: '≤', geq: '≥', neq: '≠', approx: '≈', infty: '∞',
            sum: '∑', prod: '∏', int: '∫', partial: '∂', nabla: '∇', to: '→', rightarrow: '→', leftarrow: '←',
            ldots: '…', cdots: '⋯', forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆'
        };
        let index = 0;
        function parse(end = '', depth = 0) {
            if (depth > 32) throw new Error('Formula nesting is too deep');
            const nodes = [];
            while (index < source.length && (!end || source[index] !== end)) {
                let base = primary(depth + 1);
                if (!base) continue;
                let sub = '', sup = '';
                while (source[index] === '^' || source[index] === '_') {
                    const script = source[index++];
                    const content = argument(depth + 1) || mathRun(' ');
                    if (script === '^') sup = content;
                    else sub = content;
                }
                if (sub && sup) base = `<m:sSubSup><m:e>${base}</m:e><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>`;
                else if (sub) base = `<m:sSub><m:e>${base}</m:e><m:sub>${sub}</m:sub></m:sSub>`;
                else if (sup) base = `<m:sSup><m:e>${base}</m:e><m:sup>${sup}</m:sup></m:sSup>`;
                nodes.push(base);
            }
            if (end && source[index] === end) index++;
            return nodes.join('');
        }
        function argument(depth) {
            while (/\s/.test(source[index] || '') && index < source.length) index++;
            return primary(depth + 1);
        }
        function primary(depth) {
            if (index >= source.length) return '';
            const char = source[index++];
            if (char === '{') return parse('}', depth + 1);
            if (char === '\\') {
                const command = /^[A-Za-z]+/.exec(source.slice(index));
                const name = command ? command[0] : source[index] || '';
                index += name.length;
                if (['frac', 'dfrac', 'tfrac', 'binom'].includes(name)) {
                    const numerator = argument(depth + 1) || mathRun(' ');
                    const denominator = argument(depth + 1) || mathRun(' ');
                    const properties = name === 'binom' ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : '';
                    return `<m:f>${properties}<m:num>${numerator}</m:num><m:den>${denominator}</m:den></m:f>`;
                }
                if (name === 'sqrt') {
                    let degree = '';
                    if (source[index] === '[') { index++; degree = parse(']', depth + 1); }
                    return `<m:rad><m:radPr><m:degHide m:val="${degree ? '0' : '1'}"/></m:radPr><m:deg>${degree}</m:deg><m:e>${argument(depth + 1) || mathRun(' ')}</m:e></m:rad>`;
                }
                if (['text', 'mathrm', 'mathbf', 'mathit'].includes(name)) return argument(depth + 1);
                if (name === 'left' || name === 'right') {
                    const delimiter = source[index] === '\\' ? source[++index] : source[index];
                    index++;
                    return delimiter === '.' ? '' : mathRun(delimiter || '');
                }
                if (name === ',' || name === ';' || name === '!' || name === ' ') return mathRun(' ');
                return mathRun(symbols[name] || `\\${name}`);
            }
            if (char === '\n' || /\s/.test(char)) return mathRun(' ');
            return mathRun(char);
        }
        try { return parse() || mathRun(' '); }
        catch (_) { return mathRun(source); }
    }
    const equation = latex => `<m:oMath>${mathContent(latex)}</m:oMath>`;
    const equationParagraph = latex => `<w:p><m:oMathPara>${equation(latex)}</m:oMathPara></w:p>`;
    function plainBody(source, spans) {
        const valid = spans.filter(span => Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && source.slice(span.start, span.end) === span.text)
            .sort((a, b) => a.start - b.start);
        let body = '', content = '', cursor = 0;
        const flush = () => { body += paragraph(content); content = ''; };
        const addText = value => {
            const lines = value.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (i) flush();
                if (lines[i]) content += run(lines[i]);
            }
        };
        for (const span of valid) {
            if (span.start < cursor) continue;
            addText(source.slice(cursor, span.start));
            if (span.display) {
                if (content) flush();
                body += equationParagraph(span.text);
            } else content += equation(span.text);
            cursor = span.end;
            if (span.display && source[cursor] === '\n') cursor++;
        }
        addText(source.slice(cursor));
        if (content || !body || source.endsWith('\n')) flush();
        return body;
    }
    async function exportDocx(markdown, options = {}) {
        if (typeof root.JSZip !== 'function') throw new Error('DOCX 组件未加载，请刷新页面后重试。');
        const relationships = [];
        function inline(text, extra = {}) {
            let content = '';
            for (const part of core.inlineParts(text)) {
                if (part.math) content += equation(part.text);
                else if (part.link && /^https?:\/\//i.test(part.link)) {
                    const id = `rId${relationships.length + 2}`;
                    relationships.push({ id, target: part.link });
                    content += `<w:hyperlink r:id="${id}">${run(part.text, { ...part, ...extra, link: true })}</w:hyperlink>`;
                } else content += run(part.link ? `${part.text} (${part.link})` : part.text, { ...part, ...extra });
            }
            return content;
        }
        const body = options.plain ? plainBody(String(markdown), options.mathSpans || []) : core.parseMarkdown(markdown).map(block => {
            if (block.kind === 'blank') return paragraph('');
            if (block.kind === 'rule') return paragraph(run('────────────────────────'), 'Rule');
            if (block.kind === 'math') return equationParagraph(block.text);
            if (block.kind === 'table') {
                const columns = Math.max(...block.rows.map(row => row.length));
                const cellWidth = Math.floor(9026 / columns);
                const grid = `<w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${cellWidth}"/>`).join('')}</w:tblGrid>`;
                const rows = block.rows.map((row, index) => `<w:tr>${index === 0 ? '<w:trPr><w:tblHeader w:val="true"/></w:trPr>' : ''}${Array.from({ length: columns }, (_, col) => {
                    const alignment = block.align?.[col] || 'left';
                    const content = inline(row[col] || '', index === 0 ? { bold: true } : {});
                    return `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/>${index === 0 ? '<w:shd w:fill="E8F1F7"/>' : ''}</w:tcPr><w:p><w:pPr><w:jc w:val="${alignment}"/></w:pPr>${content || run(' ')}</w:p></w:tc>`;
                }).join('')}</w:tr>`).join('');
                return `<w:tbl><w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="CCCCCC"/>`).join('')}</w:tblBorders></w:tblPr>${grid}${rows}</w:tbl>`;
            }
            let content = '';
            if (block.kind === 'list') content += run(`${'　'.repeat(block.depth)}${block.ordered ? block.marker.replace(/[)]$/, '.') : '•'} `);
            if (block.kind === 'quote') content += run('│ ', { italic: true });
            if (block.kind === 'code') content = run(block.text, { code: true });
            else content += inline(block.text);
            const style = block.kind === 'heading' ? `Heading${block.level}` : block.kind === 'quote' ? 'Quote' : block.kind === 'code' ? 'Code' : block.kind === 'list' ? 'List' : 'Normal';
            return paragraph(content, style);
        }).join('');
        const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
        const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="320" w:lineRule="auto"/></w:pPr></w:style>${[1,2,3,4,5,6].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="${Math.max(24, 40 - level * 3)}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="500"/><w:pBdr><w:left w:val="single" w:sz="12" w:color="8ACBF2" w:space="8"/></w:pBdr></w:pPr><w:rPr><w:i/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:fill="F3F4F5"/><w:ind w:left="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="List"><w:name w:val="List"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Rule"><w:name w:val="Rule"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="999999"/></w:rPr></w:style></w:styles>`;
        const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${relationships.map(link => `<Relationship Id="${link.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(link.target)}" TargetMode="External"/>`).join('')}</Relationships>`;
        const zip = new root.JSZip();
        zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
        zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        zip.file('word/document.xml', document);
        zip.file('word/styles.xml', styles);
        zip.file('word/_rels/document.xml.rels', rels);
        return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }
    root.MELSTextDocx = { exportDocx };
})(globalThis);
