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
    ['音量 35%', 'Volume 35%']
]);
for (const [source, expected] of fixtures) assert.equal(i18n.t(source), expected, source);
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
console.log(`OK i18n: ${fixtures.size} translation fixtures, split markup, dynamic updates, round trips, protected content`);
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
