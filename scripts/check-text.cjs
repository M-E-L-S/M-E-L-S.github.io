const assert = require('node:assert/strict');
const core = require('../src/scripts/text-core.js');
const JSZip = require('../vendor/jszip.min.js');
globalThis.JSZip = JSZip;
require('../src/scripts/text-docx.js');

async function main() {
    assert.deepEqual(core.replace('a.b a.b', { mode: 'literal', find: 'a.b', replacement: '$1' }), { output: '$1 $1', count: 2, pattern: 'a\\.b' });
    assert.equal(core.replace('foo-123', { mode: 'regex', find: '(foo)-(\\d+)', replacement: '$2/$1' }).output, '123/foo');
    assert.equal(core.replace('foo.c fooXc', { find: 'foo.c', replacement: 'bar' }).output, 'bar fooXc');
    assert.equal(core.replace('foo.c fooXc', { find: 'foo\\.c', replacement: 'bar' }).output, 'bar fooXc');
    assert.equal(core.replace('foo-123', { find: '(foo)-(\\d+)', replacement: '$2/$1' }).output, '123/foo');
    assert.equal(core.replace('a,b', { find: ',', replacement: '\\n' }).output, 'a\nb');
    assert.equal(core.replace('a   b', { mode: 'guided', guide: 'spaces', replacement: ' ' }).output, 'a b');
    assert.throws(() => core.replace('abc', { mode: 'regex', find: '[' }), SyntaxError);
    const found = core.detect('邀请码：ABCD12，详见 https://example.com/a). 联系 a@example.com');
    assert.deepEqual(found.map(item => [item.type, item.value]), [['邀请码', 'ABCD12'], ['网址', 'https://example.com/a'], ['邮箱', 'a@example.com']]);
    const suspicious = core.detect('码 Q7K2P9L4；另见 [ABCD12] 和 xK9pQ2rT8v，普通文字 hello world');
    assert(suspicious.some(item => item.value === 'Q7K2P9L4'));
    assert(suspicious.some(item => item.value === 'ABCD12' && item.reason === '括号包裹'));
    assert(suspicious.some(item => item.value === 'xK9pQ2rT8v' && item.reason === '高熵字符组合'));
    assert(!suspicious.some(item => item.value === 'hello'));
    assert.equal(core.cleanText('  A\u00A0  B\u200B \r\n\r\n\r\n C\u2028  D\t E  '), 'A B\nC\nD E');
    assert.equal(core.cleanText('\n A\n \t\n\nB\n\n'), 'A\nB');
    const markdown = '# 标题\n\n- **加粗** [链接](https://example.com)\n\n```js\nconst a = 1;\n```';
    assert.equal(core.stripMarkdown(markdown).output, '标题\n\n• 加粗 链接 (https://example.com)\n\nconst a = 1;');
    assert.equal(core.stripMarkdown('2) second\n3) third\n\\*literal\\*').output, '2. second\n3. third\n*literal*');
    assert.equal(core.stripMarkdown('| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | **2** |').output, '名称\t数量\n苹果\t2');
    assert.deepEqual(core.inlineParts('**bold *italic* text**').filter(part => part.text === 'italic')[0], { text: 'italic', italic: true, bold: true });
    assert.equal(core.stripMarkdown('前缀 **`foo.c`** 后缀').output, '前缀 foo.c 后缀');
    for (const [input, expected] of [
        ['**$ 123 $**', '123'],
        ['***$ 123 $***', '123'],
        ['**x *y* z**', 'x y z'],
        ['*a **b** c*', 'a b c'],
        ['~~**x _y_**~~', 'x y'],
        ['__**`foo.c`**__', 'foo.c'],
        ['a_b_c', 'a_b_c'],
        ['\\*literal\\*', '*literal*']
    ]) assert.equal(core.stripMarkdown(input).output, expected, input);
    assert.deepEqual(core.stripMarkdown('**$ 123 $**').mathSpans, [{ start: 0, end: 3, text: '123', display: false }]);
    assert.deepEqual(core.stripMarkdown('前文\n$$\\frac{a}{b}$$\n后文').mathSpans, [{ start: 3, end: 14, text: '\\frac{a}{b}', display: true }]);
    const beforeClean = core.stripMarkdown('前文 **$x^2$**\n\n$$\\frac{a}{b}$$\n\n后文');
    const cleanedMath = core.cleanWithMathSpans(beforeClean.output, beforeClean.mathSpans);
    assert.equal(cleanedMath.output, '前文 x^2\n\\frac{a}{b}\n后文');
    assert.deepEqual(cleanedMath.mathSpans, [
        { start: 3, end: 6, text: 'x^2', display: false },
        { start: 7, end: 18, text: '\\frac{a}{b}', display: true }
    ]);
    assert.equal(core.stripMarkdown('前文 **`foo.c`** :chatgpt-content-reference{index="0"}\t后文').output, '前文 foo.c 后文');
    assert.equal(core.stripMarkdown('第一段\n:chatgpt-content-reference{index="0"}\t\n第二段').output, '第一段\n第二段');
    assert.equal(core.stripMarkdown(':root{color:red}').output, ':root{color:red}');
    assert(core.diffLines('前\n旧', '前\n新').some(item => item.type === 'add' && item.text === '新'));
    const blob = await globalThis.MELSTextDocx.exportDocx(markdown + '\n\n| Name | Count |\n| --- | --- |\n| Apple | 2 |');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']) assert(zip.file(name), `${name} missing`);
    const document = await zip.file('word/document.xml').async('string');
    const rels = await zip.file('word/_rels/document.xml.rels').async('string');
    assert.match(document, /Heading1/);
    assert.match(document, /<w:b\/>/);
    assert.match(document, /<w:hyperlink r:id="rId2">/);
    assert.match(document, /<w:tbl>/);
    assert.match(document, /<w:tblHeader w:val="true"\/>/);
    assert.match(document, /<w:tcW w:w="4513" w:type="dxa"\/>/);
    assert.equal((document.match(/<w:tr>/g) || []).length, 2);
    assert.match(rels, /Target="https:\/\/example.com"/);
    const mathMarkdown = '行内 **$x^2$** 与 $\\sqrt{x_1}$\n\n$$\\frac{a}{b} + \\alpha$$';
    const mathZip = await JSZip.loadAsync(await (await globalThis.MELSTextDocx.exportDocx(mathMarkdown)).arrayBuffer());
    const mathXml = await mathZip.file('word/document.xml').async('string');
    assert.match(mathXml, /<m:oMath>/);
    assert.match(mathXml, /<m:oMathPara>/);
    assert.match(mathXml, /<m:sSup>/);
    assert.match(mathXml, /<m:sSub>/);
    assert.match(mathXml, /<m:rad>/);
    assert.match(mathXml, /<m:f>/);
    assert.match(mathXml, /<m:t xml:space="preserve">α<\/m:t>/);
    const stripped = core.stripMarkdown('前文 **$x^2$**\n$$\\frac{a}{b}$$\n后文');
    const plainZip = await JSZip.loadAsync(await (await globalThis.MELSTextDocx.exportDocx(stripped.output, { plain: true, mathSpans: stripped.mathSpans })).arrayBuffer());
    const plainXml = await plainZip.file('word/document.xml').async('string');
    assert.match(plainXml, /前文/);
    assert.match(plainXml, /<m:sSup>/);
    assert.match(plainXml, /<m:oMathPara>/);
    assert.match(plainXml, /<m:f>/);
    assert.doesNotMatch(plainXml, /\*\*|\$\$/);
    const cleanedZip = await JSZip.loadAsync(await (await globalThis.MELSTextDocx.exportDocx(cleanedMath.output, { plain: true, mathSpans: cleanedMath.mathSpans })).arrayBuffer());
    const cleanedXml = await cleanedZip.file('word/document.xml').async('string');
    assert.match(cleanedXml, /<m:sSup>/);
    assert.match(cleanedXml, /<m:oMathPara>/);
    assert.match(cleanedXml, /<m:f>/);
    assert.doesNotMatch(cleanedXml, /\$\$|\*\*/);
    console.log('Text workbench checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
