import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/scripts/arg-engine.js', import.meta.url), 'utf8');
const { search, decoders, textQuality } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const reference = await readFile(new URL('../src/pages/arg.html', import.meta.url), 'utf8');
const dictionaryText = await readFile(new URL('../assets/data/wordle-words.txt', import.meta.url), 'utf8');
const englishWords = new Set(dictionaryText.toLowerCase().split(/\s+/).filter(Boolean));
for (const decoder of decoders) {
    assert(reference.includes(`id="decoder-${decoder.id}"`), `Missing reference entry for decoder ${decoder.id}`);
}

async function expectCandidate(input, expected, options={}) {
    const result = await search(input, { maxDepth: 3, maxNodes: 300, ...options });
    assert(result.candidates.some(candidate => candidate.text === expected), `${JSON.stringify(expected)} was not found for ${JSON.stringify(input)}`);
}

await expectCandidate('U0dWc2JHOGdWMjl5YkdRPQ==', 'Hello World');
await expectCandidate('48656c6c6f20576f726c64', 'Hello World');
await expectCandidate('Uryyb Jbeyq', 'Hello World', { maxDepth: 1 });
await expectCandidate('Hello%2520World', 'Hello World');
await expectCandidate('&#72;&#105;', 'Hi', { maxDepth: 1 });
await expectCandidate('&amp;#72;&amp;#105;', 'Hi', { maxDepth: 2 });
await expectCandidate('JBSWY3DPEBLW64TMMQ======', 'Hello World', { maxDepth: 1 });
await expectCandidate('JxF12TrwUP45BMd', 'Hello World', { maxDepth: 1 });
await expectCandidate('<~87cURD]i,"Ebo7~>', 'Hello World', { maxDepth: 1 });
await expectCandidate('\\u0048\\u0065\\u006c\\u006c\\u006f', 'Hello', { maxDepth: 1 });
await expectCandidate('8 5 12 12 15', 'HELLO', { maxDepth: 1 });
await expectCandidate('aabbb aabaa ababb ababb abbba', 'HELLO', { maxDepth: 1 });
await expectCandidate('110 145 154 154 157', 'Hello', { maxDepth: 1 });
await expectCandidate('NM&qnZy;B1a%^M', 'Hello World', { maxDepth: 1 });
await expectCandidate('fPNKd', 'test', { maxDepth: 1 });
await expectCandidate('fPNKd', 'test', { maxDepth: 2, maxNodes: 500, englishWords });
await expectCandidate('○●○○●○○○ ○●●○●○○●', 'Hi', { maxDepth: 1 });
await expectCandidate('01001000 | 01101001', 'H i', { maxDepth: 1 });
await expectCandidate('01001000 / 01101001', 'H i', { maxDepth: 1 });
await expectCandidate('23 15 31 31 34', 'HELLO', { maxDepth: 1 });
await expectCandidate('DF AX FA FA FG', 'HELLO', { maxDepth: 1 });
await expectCandidate('.. ... . .....', 'HE', { maxDepth: 1 });
await expectCandidate('xx xxx x xxxxx', 'HE', { maxDepth: 1 });
await expectCandidate('. ... .. .....', 'CJ', { maxDepth: 1 });
await expectCandidate('xx xxx x xxxxx | x xxx', 'HE C', { maxDepth: 1 });
await expectCandidate('.. ...  . .....', 'H E', { maxDepth: 1 });
await expectCandidate('aabbb aabaa | ababb ababb abbba', 'HE LLO', { maxDepth: 1 });
await expectCandidate('aabbb aabaa\nababb ababb abbba', 'HE LLO', { maxDepth: 1 });
await expectCandidate('.... .. | - .... . .-. .', 'HI THERE', { maxDepth: 1 });
await expectCandidate('.... ..  - .... .', 'HI THE', { maxDepth: 1 });
await expectCandidate('•••• •• / —', 'HI T', { maxDepth: 1 });
await expectCandidate('0011100100010110101101110', 'HELLO', { maxDepth: 1 });
for (const [id, input] of [
    ['morse','••••:••:—'],
    ['bacon','aab bbaabaaababbababbabbba'],
    ['binary','01001000,01101001'],
    ['tap','xx xxx, x xxxxx']
]) assert.equal(decoders.find(decoder=>decoder.id===id).probe(input),0,`${id} should use fixed separators`);
for (const title of ['编码（固定映射）','密码（需要密钥）','特殊领域','数学与代码']) assert(reference.includes(title));
assert(textQuality('this is a secret message', englishWords).score > textQuality('xqzt plmn vrkk', englishWords).score, 'English dictionary hits should improve text quality');
assert.equal(textQuality('这是一个正常的中文线索', englishWords).plainTextLikely, true, 'Normal Chinese should be accepted as plaintext');
assert.equal(textQuality('锟斤拷烫烫烫', englishWords).plainTextLikely, false, 'Typical Chinese mojibake should not be accepted as plaintext');
const chineseResult = await search(Buffer.from('这是一个中文答案').toString('base64'), { maxDepth: 3, maxNodes: 100, englishWords });
const chineseCandidate = chineseResult.candidates.find(candidate => candidate.text === '这是一个中文答案');
assert(chineseCandidate?.plainTextLikely, 'Decoded Chinese should be returned as plaintext');
assert.equal(chineseCandidate.depth, 1, 'Plain Chinese should stop expanding after it is found');
console.log('OK ARG engine: decoders, Wordle dictionary scoring and Chinese plaintext detection');
