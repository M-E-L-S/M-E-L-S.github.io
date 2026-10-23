// Dependency-free regression checks for the DOM translation layer.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
    nodeType = 1;
    childNodes = [];
    attrs = {};
    constructor(children = []) { this.childNodes = children; children.forEach(n => n.parentElement = this); }
    closest() { return this.attrs.translate === 'no' ? this : this.parentElement?.closest() || null; }
    matches() { return false; }
    hasAttribute(name) { return name in this.attrs; }
    getAttribute(name) { return this.attrs[name]; }
    setAttribute(name, value) { this.attrs[name] = value; }
}
const text = value => ({nodeType: 3, nodeValue: value});
const root = new Element();
let init, observer;
const context = {
    window: {dispatchEvent() {}, addEventListener() {}},
    document: {readyState: 'loading', documentElement: root, querySelector() {return null;}, querySelectorAll() {return [];}, getElementById() {return null;}, addEventListener(_, cb) {init = cb;}},
    navigator: {language: 'zh-CN'}, localStorage: {getItem() {return 'zh-CN';}, setItem() {}},
    Node: {TEXT_NODE: 3, ELEMENT_NODE: 1}, CustomEvent: class {},
    MutationObserver: class {
        pending = [];
        constructor(cb) {this.callback = cb; observer = this;}
        observe() {} disconnect() {} takeRecords() {return this.pending.splice(0);}
    }
};
vm.runInNewContext(fs.readFileSync('src/scripts/i18n.js', 'utf8'), context);
init();
const i18n = context.window.MELSI18n;
i18n.setLanguage('en');
const fixtures = new Map([
    ['正在播放：没有如果', 'Now playing: 没有如果'],
    ['随机播放 · 1 首歌曲', 'Shuffle · 1 track'],
    ['顺序播放 · 12 首歌曲', 'In order · 12 tracks'],
    ['单曲循环 · 0 首歌曲', 'Repeat one · 0 tracks'],
    ['找到 2 首歌曲', 'Found: 2 tracks'],
    ['难度：初级 · 用时 ', 'Difficulty: Beginner · Time'],
    ['难度：单色 · 用时 ', 'Difficulty: One suit · Time'],
    [' · 步数 ', '· Moves'],
    [' · 最佳 0:28', '· Best 0:28'],
    ['通关奖励 +27，最终得分 ', 'Clear bonus +27 · Final score'],
    ['发牌 ×4', 'Deal ×4'],
    ['切换游戏（当前：蜘蛛纸牌）', 'Switch game (current: Spider Solitaire)'],
    ['第 2 行第 3 列，已插旗', 'Row 2, column 3, flagged'],
    ['还没有播放历史', 'No listening history yet'],
    ['没有找到匹配的缩写', 'No matching initialism found'],
    ['总分: -50', 'Total: -50'],
    ['总计个人得分: -100', 'Total individual score: -100'],
    ['命中 −20 HP', 'Hit −20 HP'],
    ['成绩单 (模式: 普通)', 'Score sheet (mode: 普通)'],
    ['临时招募6星（+50/次）', '临时招募6星（+50/次）'],
    ['选择干员', '选择干员'],
    ['攻速藏品', '攻速藏品'],
    ['请输入敌方防御力！', '请输入敌方防御力！'],
    ['音量 35%', 'Volume 35%'],
    ['全自动多层解密工具', 'Automatic Multi-layer Decoder'],
    ['开始解密', 'Start decoding'],
    ['可打印字符 100%', 'Printable characters 100%'],
    ['正常中文，视为明文', 'Natural Chinese detected; treated as plaintext']
]);
for (const [source, expected] of fixtures) assert.equal(i18n.t(source), expected, source);
const gomokuFixtures = new Map([
    ['五子棋 · 小游戏 · MELS', 'Gomoku · Games · MELS'],
    ['切换游戏，当前：五子棋', 'Switch game (current: Gomoku)'],
    ['切换游戏（当前：五子棋）', 'Switch game (current: Gomoku)'],
    ['0 手', '0 moves'], ['1 手', '1 move'], ['225 手', '225 moves'],
    ['黑棋：玩家 · 白棋：AI', 'Black: Player · White: AI'],
    ['你执白棋 · 对方执黑棋', 'You: White · Opponent: Black'],
    ['白棋获胜！', 'White wins!'], ['黑棋落子', 'Black to move'],
    ['白棋 AI 等待继续', 'White AI is waiting to resume'],
    ['黑棋 AI 正在思考…', 'Black AI is thinking…'],
    ['轮到你落子 · 白棋', 'Your turn · White'],
    ['黑棋确定杀棋 · 至多 7 次落子', 'Black has a proven forced win · At most 7 moves'],
    ['本手已思考 0.0 秒', 'Thinking for 0.0 s'],
    ['白棋 AI 落在 O15 · 用时 1.00 秒', 'White AI played O15 · 1.00 s'],
    ['简单模式 · 目标 0.3 秒 · 上限 1 秒 · 下一手生效', 'Easy mode · Target 0.3 s · Limit 1 s · Applies next move'],
    ['目标 1 秒 · 上限 3 秒 · 下一手生效', 'Target 1 s · Limit 3 s · Applies next move'],
    ['你申请悔棋，等待对方同意', 'You requested an undo. Waiting for your opponent’s agreement'],
    ['对方申请重新开局（房主执白）', 'Your opponent requested a restart (host plays White)'],
    ['再次点按预选位置确认落子', 'Tap the selected position again to place your stone'],
    ['H8，预选黑棋，再次点按落子', 'H8, Black preview, tap again to place'],
    ['O15，预选白棋，再次点按落子', 'O15, White preview, tap again to place']
]);
// Cover every board accessibility label, player pairing and negotiation variant.
for (const column of 'ABCDEFGHIJKLMNO') for (let row = 1; row <= 15; row++) {
    for (const [state, target] of [['空位', 'Empty'], ['黑棋', 'Black'], ['白棋', 'White']]) {
        gomokuFixtures.set(`${column}${row}，${state}`, `${column}${row}, ${target}`);
    }
}
for (const [color, target] of [['黑棋', 'Black'], ['白棋', 'White']]) {
    gomokuFixtures.set(`${color}获胜！`, `${target} wins!`);
    gomokuFixtures.set(`${color}落子`, `${target} to move`);
    gomokuFixtures.set(`${color} AI 正在思考…`, `${target} AI is thinking…`);
    gomokuFixtures.set(`${color} AI 等待继续`, `${target} AI is waiting to resume`);
    gomokuFixtures.set(`轮到你落子 · ${color}`, `Your turn · ${target}`);
    gomokuFixtures.set(`${color}确定杀棋 · 至多 1 次落子`, `${target} has a proven forced win · At most 1 move`);
}
for (const [black, blackEn] of [['玩家', 'Player'], ['AI', 'AI']]) {
    for (const [white, whiteEn] of [['玩家', 'Player'], ['AI', 'AI']]) {
        gomokuFixtures.set(`黑棋：${black} · 白棋：${white}`, `Black: ${blackEn} · White: ${whiteEn}`);
    }
}
for (const who of ['你', '对方']) for (const kind of ['悔棋', '重新开局']) {
    for (const color of ['', '黑', '白']) {
        const source = `${who}申请${kind}${color ? `（房主执${color}）` : ''}${who === '你' ? '，等待对方同意' : ''}`;
        const target = `${who === '你' ? 'You requested' : 'Your opponent requested'} ${kind === '悔棋' ? 'an undo' : 'a restart'}${color ? ` (host plays ${color === '黑' ? 'Black' : 'White'})` : ''}${who === '你' ? '. Waiting for your opponent’s agreement' : ''}`;
        gomokuFixtures.set(source, target);
    }
}
for (const [source, expected] of gomokuFixtures) assert.equal(i18n.t(source), expected, source);
// Catch missing static controls, help, placeholders, ARIA labels and client errors.
const gomokuMarkup = fs.readFileSync('src/site.html', 'utf8').match(/<div class="game-view" id="gomoku-view"[\s\S]*?<!-- 连连看 -->/)[0];
const gomokuStatic = new Set();
for (const match of gomokuMarkup.matchAll(/>([^<>]*[\u3400-\u9fff][^<>]*)<|(?:aria-label|aria-description|title|placeholder)="([^"]+)"/g)) {
    gomokuStatic.add((match[1] || match[2]).trim());
}
for (const file of ['gomoku-client.js', 'gomoku-online.js']) {
    const source = fs.readFileSync('src/scripts/' + file, 'utf8');
    for (const match of source.matchAll(/'([^'\n]*[\u3400-\u9fff][^'\n]*)'/g)) gomokuStatic.add(match[1]);
}
for (const source of gomokuStatic) assert.ok(!/[\u3400-\u9fff]/.test(i18n.t(source)), source);
for (const file of ['src/pages/home-sections.html', 'src/pages/arg.html']) {
    const markup = fs.readFileSync(file, 'utf8').replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, '');
    for (const match of markup.matchAll(/>([^<>]*[\u3400-\u9fff][^<>]*)</g)) {
        const source = match[1].trim().replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
        assert.ok(!/[\u3400-\u9fff]/.test(i18n.t(source)), `${file}: ${source}`);
    }
}
const gomokuSources = [...new Set([...gomokuFixtures.keys(), ...gomokuStatic])];
root.childNodes = gomokuSources.map(text);
i18n.setLanguage('en');
assert.ok(root.childNodes.every(n => !/[\u3400-\u9fff]/.test(n.nodeValue)));
i18n.setLanguage('zh-CN');
assert.deepEqual(root.childNodes.map(n => n.nodeValue), gomokuSources);
i18n.setLanguage('en');
assert.equal(i18n.t('候选 {index}', {index: 3}), 'Candidate 3');
assert.equal(i18n.t('文本评分 {score} · 深度 {depth}', {score: '82.5', depth: 2}), 'Text score 82.5 · Depth 2');
assert.equal(i18n.t('搜索完成。展开 {expanded} 个节点，生成 {generated} 个候选状态，显示前 {count} 个候选。', {expanded: 40, generated: 90, count: 12}), 'Search complete. Expanded 40 nodes, generated 90 candidate states, and showing the top 12 candidates.');
// HTML breaks a result into separate nodes; all nodes must round-trip independently.
const sources = ['难度：单色 · 用时 ', '6:56', ' · 步数 ', '115', ' · 新纪录！', '通关奖励 +6，最终得分 ', '1381'];
root.childNodes = sources.map(text);
i18n.setLanguage('en');
assert.ok(root.childNodes.every(n => !/[\u3400-\u9fff]/.test(n.nodeValue)));
i18n.setLanguage('zh-CN');
assert.deepEqual(root.childNodes.map(n => n.nodeValue), sources);
// Multiple writes to a single text/attribute in one mutation batch must not
// capture a translated value as the source on the second record.
const node = root.childNodes[0];
i18n.setLanguage('en');
node.nodeValue = '正在播放：没有如果';
const record = {type: 'characterData', target: node};
observer.callback([record, record]);
assert.equal(node.nodeValue, 'Now playing: 没有如果');
i18n.setLanguage('zh-CN');
assert.equal(node.nodeValue, '正在播放：没有如果');
node.nodeValue = '已收藏：没有如果';
observer.pending.push(record);
i18n.setLanguage('en');
assert.equal(node.nodeValue, 'Favorited: 没有如果');
i18n.setLanguage('zh-CN');
assert.equal(node.nodeValue, '已收藏：没有如果');
const button = new Element();
root.childNodes.push(button);
button.setAttribute('title', '取消收藏');
i18n.setLanguage('en');
button.setAttribute('title', '收藏当前歌曲');
const attr = {type: 'attributes', target: button, attributeName: 'title'};
observer.callback([attr, attr]);
i18n.setLanguage('zh-CN');
assert.equal(button.getAttribute('title'), '收藏当前歌曲');
const song = new Element([text('随机播放')]);
song.setAttribute('translate', 'no');
root.childNodes.push(song);
i18n.setLanguage('en');
assert.equal(song.childNodes[0].nodeValue, '随机播放');
assert.equal(i18n.t('正在播放：{name}', {name: '随机播放'}), 'Now playing: 随机播放');
button.setAttribute('data-damage', '命中 −20 HP');
observer.callback([{type: 'attributes', target: button, attributeName: 'data-damage'}]);
assert.equal(button.getAttribute('data-damage'), 'Hit −20 HP');
i18n.setLanguage('zh-CN');
assert.equal(button.getAttribute('data-damage'), '命中 −20 HP');
i18n.setLanguage('en');
console.log(`OK i18n: ${fixtures.size} existing and ${gomokuSources.length} Gomoku fixtures, split markup, dynamic updates, round trips, protected content`);
if (process.argv.includes('--audit')) {
    for (const file of fs.readdirSync('src/scripts').filter(f => f.endsWith('.js') && f !== 'i18n.js')) {
        const source = fs.readFileSync('src/scripts/' + file, 'utf8');
        const missing = new Set();
        for (const match of source.matchAll(/(['"])([^'"\n]*[\u3400-\u9fff][^'"\n]*)\1/g)) {
            const value = match[2];
            if (/[\u3400-\u9fff]/.test(i18n.t(value))) missing.add(value);
        }
        if (missing.size) console.log(file, [...missing]);
    }
}
