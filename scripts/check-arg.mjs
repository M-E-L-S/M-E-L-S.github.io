import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/scripts/arg-engine.js', import.meta.url), 'utf8');
const { search, decoders, textQuality, redundantTransform } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const reference = await readFile(new URL('../src/pages/arg.html', import.meta.url), 'utf8');
const searchMarkup=reference.split('<div id="arg-search-panel">')[1].split('<article class="arg-reference"')[0];
assert(!searchMarkup.includes('arg-acg-toggle'),'The ACG switch belongs on the reference page only');
assert.equal((reference.match(/id="arg-acg-toggle"/g)||[]).length,1,'There must be one ACG switch shared by search and reference views');
const dictionaryText = await readFile(new URL('../assets/data/arg-english-words.txt', import.meta.url), 'utf8');
const englishWords = new Set(dictionaryText.toLowerCase().split(/\s+/).filter(Boolean));
const acgSource = await readFile(new URL('../src/scripts/arg-acg.js', import.meta.url), 'utf8');
const { createAcgData, matchAcgNames } = await import(`data:text/javascript;base64,${Buffer.from(acgSource).toString('base64')}`);
const acgData=createAcgData([
    {roman:'Oomura Yumi',chinese:'大村裕美',url:'https://bangumi.tv/character/39'},
    {roman:'Mai',chinese:'舞',url:'https://bangumi.tv/character/3'},
    {roman:'Sakurajima Mai',chinese:'樱岛麻衣',url:'https://bangumi.tv/character/1'},
    {roman:'Sakurajima Mai',chinese:'另一角色',url:'https://bangumi.tv/character/2'}
], 'full\tai\nfull\tmai\nfull\toomurayumi\nfull\tsakurajimamai\npart\tai\npart\toomura\npart\tyumi\npart\tsakurajima\n');
assert(!acgData.words.full.has('ai')&&!acgData.words.parts.has('ai'),'Two-letter ACG names must be rejected even in supplied data');
assert.deepEqual(matchAcgNames('OOMURAYUMI',acgData).map(hit=>hit.text),['OOMURAYUMI'],'Full names must hide overlapping surname/given-name hits');
assert.equal(matchAcgNames('Oomura Yumi',acgData)[0].entry?.chinese,'大村裕美');
assert.equal(matchAcgNames('Sakurajima Mai',acgData)[0].entry,null,'Ambiguous full names must have no link target');
assert.deepEqual(matchAcgNames('Mai',acgData).map(hit=>[hit.text,hit.entry]),[['Mai',null]],'A full name that is also a name part must not carry a link');
const archiveNames=JSON.parse(await readFile(new URL('../assets/data/arg-acg-names.json',import.meta.url),'utf8'));
const archiveWords=await readFile(new URL('../assets/data/arg-acg-words.txt',import.meta.url),'utf8');
assert(archiveWords.trim().split(/\r?\n/).every(line=>line.split('\t')[1]?.length>=3),'Generated ACG words must exclude two-letter names and parts');
assert(archiveNames.length>50000,'The generated ACG display table is incomplete');
assert(archiveNames.every(entry=>/^[A-Za-z ]+$/.test(entry.roman)&&/[\u3400-\u9fff]/u.test(entry.chinese)&&/^https:\/\/bangumi\.tv\/character\/\d+$/.test(entry.url)),'ACG entries must have valid romanization, Chinese names, and Bangumi character URLs');
const archiveData=createAcgData(archiveNames,archiveWords);
assert.equal(matchAcgNames('Furukawa Nagisa',archiveData)[0].entry?.url,'https://bangumi.tv/character/4');
assert.equal(matchAcgNames('Alice',archiveData)[0].entry,null,'Duplicate real Archive names must not resolve to one character');
assert.deepEqual(matchAcgNames('AI',archiveData),[],'Removed two-letter ACG parts must not appear in results');
assert(englishWords.size>270000,'ARG dictionary must contain the full npm word-list, not Wordle-length entries');
for(const word of ['path','scan','can','look','structured']) assert(englishWords.has(word),`ARG dictionary is missing ${word}`);
const quality=(text)=>textQuality(text,englishWords,archiveData.words);
const garbledChinese='菜\u0018\u0008\u000b軤\u0008';
assert(quality(garbledChinese).score<25&&quality(garbledChinese).readableCoverage<.5,'Control characters must count against whole-text Chinese readability');
assert(!quality('你好\u0008').plainTextLikely,'Chinese text with an embedded control character is not clean plaintext');
assert(quality('A範¶A匚').score<50,'Two unrelated Han characters must not force a 96-point plaintext score');
assert(!quality('中文线索 hello').plainTextLikely,'A short Han fragment beside Latin text is not complete Chinese plaintext');
const morseSample='.---- / ..--- ..--- / .---- ....- / ---.. / ....- / ---.. / ..--- -.... / ---.. / .---- ---.. / .---- -.... / .---- ---.. / ..--- ..---';
for(const acgWords of [null,archiveData.words]){
    const outcome=await search(morseSample,{maxDepth:5,maxNodes:500,englishWords,acgWords});
    assert(outcome.candidates.every(candidate=>candidate.score<80),`Morse sample produced an overconfident garbage candidate with ACG ${acgWords?'on':'off'}`);
}
const segmentedPlain='PUNCTUATION HIDES A VALID TRANSPOSITION';
const fragmentedPlain='PUNCTUATION HIDES AVA LID TRANS POS IT ION';
assert(quality(segmentedPlain).score>quality(fragmentedPlain).score,'Scoring should prefer complete words to excessive fragmentation');
for(const acgWords of [null,archiveData.words]){
    const outcome=await search(Buffer.from(segmentedPlain.replace(/ /g,'')).toString('base64'),{maxDepth:1,maxNodes:200,englishWords,acgWords});
    assert.equal(outcome.candidates[0]?.text,segmentedPlain,`Automatic segmentation should keep complete words with ACG ${acgWords?'on':'off'}`);
}
for(const [plain,mixed] of [
    ['this is a secret message','HELLO qxz4@mvjxqp'],
    ['这是一个完整的中文答案','这是答案 qxz49?ASDZ'],
    ['Furukawa Nagisa','Furukawa qxz49?ASDZ']
]){
    assert(quality(plain).score>quality(mixed).score+12,`A local word match raised mixed gibberish above whole-text plaintext: ${mixed}`);
    assert(quality(mixed).readableCoverage<.7,`Mixed gibberish must have low readable coverage: ${mixed}`);
}
assert(!quality('这是答案 qxz49?ASDZ').plainTextLikely,'A Chinese fragment in gibberish must not stop search as plaintext');
assert(quality('这是一个完整的中文答案').plainTextLikely,'Fully readable Chinese should still stop search as plaintext');
assert(!quality('这是一个完整的中文答案这是一个完整的中文答案qxz').plainTextLikely,'A mostly Chinese intermediate state with an unreadable tail is not complete plaintext');
assert(quality('This is Furukawa Nagisa').readableCoverage>.95,'A complete ACG name inside readable text should count toward whole-text coverage');
assert(quality('Furukawa Nagisa').score>quality('Furukawa qxz49?ASDZ').score+12,'A complete spaced ACG name should outweigh an isolated part in gibberish');
for (const decoder of decoders) {
    assert(reference.includes(`id="decoder-${decoder.id}"`), `Missing reference entry for decoder ${decoder.id}`);
}

async function expectCandidate(input, expected, options={}) {
    const result = await search(input, { maxDepth: 3, maxNodes: 300, ...options });
    assert(result.candidates.some(candidate => candidate.text === expected), `${JSON.stringify(expected)} was not found for ${JSON.stringify(input)}`);
}

await expectCandidate('U0dWc2JHOGdWMjl5YkdRPQ==', 'Hello World');
await expectCandidate(Buffer.from('HELLOOOMURAYUMIWORLD').toString('base64'),'HELLO OOMURAYUMI WORLD',{maxDepth:1,englishWords,acgWords:acgData.words});
await expectCandidate('48656c6c6f20576f726c64', 'Hello World');
await expectCandidate('Uryyb Jbeyq', 'Hello World', { maxDepth: 1 });
await expectCandidate('Uryyb', 'Hello', { maxDepth: 2, maxNodes: 500, englishWords });
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
const rail = decoders.find(decoder => decoder.id === 'railfence');
assert(rail.probe('WEAREDISCOVEREDFLEEATONCE')>rail.probe('HELLO123WORLD'));
assert(rail.probe('HELLO123WORLD')>rail.probe('HELLO!WORLD'));
assert(rail.probe('HELLO!WORLD')>rail.probe('A1B2C3!D4?'));
assert(rail.probe('○●○●○●○●')>0,'Rail Fence must accept non-ASCII encoding symbols');
assert.equal(rail.probe('HELLO\u0001WORLD'),0,'Rail Fence must reject control characters');
assert.deepEqual(rail.decode('WECRLTEERDSOEEFEAOCAIVDEN').map(result => result.parameter), [2,3,4,5,6,7,8,9,10]);
assert(rail.decode('WECRLTEERDSOEEFEAOCAIVDEN').some(result => result.parameter === 3 && result.text === 'WEAREDISCOVEREDFLEEATONCE'));
await expectCandidate('WECRLTEERDSOEEFEAOCAIVDEN', 'WEAREDISCOVEREDFLEEATONCE', { maxDepth: 2, maxNodes: 500, englishWords });
await expectCandidate('WECRLTEERDSOEEFEAOCAIVDEN', 'WE ARE DISCOVERED FLEE AT ONCE', { maxDepth: 2, maxNodes: 500, englishWords });
function encodeRail(text,rails){
    const rows=Array.from({length:rails},()=>[]);
    let row=0,direction=1;
    for(const char of text){
        rows[row].push(char);
        if(row===0)direction=1;else if(row===rails-1)direction=-1;
        row+=direction;
    }
    return rows.flat().join('');
}
for(const [plaintext,rails] of [['0123456789',3],['A1B2C3D4E5F6G7H8',4],['12 34 56 78',3]]){
    const encoded=encodeRail(plaintext,rails);
    assert(rail.probe(encoded)>0,`Rail Fence did not detect digits in ${encoded}`);
    assert(rail.decode(encoded).some(result=>result.parameter===rails&&result.text===plaintext));
    await expectCandidate(encoded,plaintext,{maxDepth:1,maxNodes:100,englishWords});
}
for(const [plaintext,rails] of [['HELLO:WORLD!?',3],['○●○○●○○○ | ○●●○●○○●',4],['🔺🔹🔺🔹🔺🔹🔺🔹',3]]){
    const encoded=encodeRail(plaintext,rails);
    assert(rail.probe(encoded)>0,`Rail Fence did not detect symbols in ${encoded}`);
    assert(rail.decode(encoded).some(result=>result.parameter===rails&&result.text===plaintext),`Rail Fence did not preserve symbols in ${encoded}`);
}
await expectCandidate(encodeRail('○●○○●○○○ | ○●●○●○○●',4),'H i',{maxDepth:2,maxNodes:500});
const square='ABCDEFGHIKLMNOPQRSTUVWXYZ',axis='ADFGX';
function encodeLayered(text,rails,shift) {
    const pairs=[...text].map(char=>{
        const index=square.indexOf(char);
        assert(index>=0,`ADFGX test cannot encode ${char}`);
        return axis[Math.floor(index/5)]+axis[index%5];
    }).join('');
    const shifted=[...pairs].map(char=>String.fromCharCode((char.charCodeAt(0)-65+shift)%26+65));
    return encodeRail(shifted,rails);
}
for(const [plaintext,rails,shift] of [
    ['FOLLOWTHEHIDDENPATH',4,11],
    ['THESECRETMESSAGEISBELOW',6,3],
    ['WRONGPATHSCANSTILLLOOKSTRUCTURED',9,7]
]) {
    const encoded=encodeLayered(plaintext,rails,shift);
    const outcome=await search(encoded,{maxDepth:3,maxNodes:500,englishWords});
    const match=outcome.candidates.find(candidate=>candidate.text===plaintext);
    assert(match,`Three-layer route was not found for ${plaintext}`);
    assert.equal(outcome.candidates[0].text.replace(/ /g,''),plaintext,`Three-layer route was ranked below a false positive for ${plaintext}`);
    assert.equal(match.depth,3);
    assert.deepEqual(new Set(match.path.map(step=>step.decoder)),new Set(['railfence','caesar','adfgx']));
    assert(match.path.some(step=>step.label===`Rail Fence ${rails} rails`));
    assert(match.path.some(step=>step.label===`Caesar -${shift}`));
    if(rails===9){
        const segmented=outcome.candidates.find(candidate=>candidate.text==='WRONG PATHS CAN STILL LOOK STRUCTURED');
        assert(segmented?.evidence.includes('自动分词'),'Long plaintext should be segmented with the complete ARG dictionary');
        assert.equal(outcome.candidates[0],segmented,'Confident word segmentation should lead the results');
    }
}
assert.equal(encodeLayered('WRONGPATHSCANSTILLLOOKSTRUCTURED',9,7),'EKMNKNMNHNKNNNNKMNNHKHMNHMEEMHHNMNHHNEMMHEMKMMHNMKNNMKHMNNNEKMMN');
const nested=Buffer.from(Buffer.from(encodeLayered('FOLLOWTHEHIDDENPATH',4,11)).toString('hex')).toString('base64');
await expectCandidate(nested,'FOLLOWTHEHIDDENPATH',{maxDepth:5,maxNodes:500,englishWords});
const baconPlaintext='KEEPBADSTATESALIVELONGER';
const baconCipher=[...baconPlaintext].map(char=>(char.charCodeAt(0)-65).toString(2).padStart(5,'0').replace(/0/g,'A').replace(/1/g,'B')).join('');
const baconRows=Array.from({length:9},()=>[]);
let baconRow=0,baconDirection=1;
for(const char of baconCipher){
    baconRows[baconRow].push(char);
    if(baconRow===0)baconDirection=1;else if(baconRow===8)baconDirection=-1;
    baconRow+=baconDirection;
}
const baconBits=baconRows.flat().map(char=>char.charCodeAt(0).toString(2).padStart(8,'0')).join('');
const baconInput=[...baconBits].reverse().join('');
const baconOutcome=await search(baconInput,{maxDepth:5,maxNodes:500,englishWords});
assert.equal(baconOutcome.candidates[0]?.text,'KEEP BAD STATES ALIVE LONGER','Four-layer plaintext should be segmented and ranked first');
assert(baconOutcome.candidates.some(candidate=>candidate.text===baconPlaintext),'Unsegmented plaintext should remain available');
await expectCandidate('UryybJbeyq', 'Hello World', { maxDepth: 2, maxNodes: 500, englishWords });
await expectCandidate('dGhpc2lzYXNlY3JldG1lc3NhZ2U=', 'this is a secret message', { maxDepth: 2, maxNodes: 500, englishWords });
const noDictionary = await search('UryybJbeyq', { maxDepth: 1, maxNodes: 100 });
assert(!noDictionary.candidates.some(candidate=>candidate.text==='Hello World'), 'Automatic word segmentation requires the English dictionary');
const keyboard = decoders.find(decoder => decoder.id === 'keyboardshift');
for (const [ciphertext, offset] of [['Jr;;p',-1],['Gwkki',1],["Kt''[",-2],['Fqjju',2]]) {
    assert(keyboard.decode(ciphertext).some(result => result.parameter === offset && result.text === 'Hello'), `Keyboard Shift ${offset} failed for ${ciphertext}`);
    await expectCandidate(ciphertext, 'Hello', { maxDepth: 2, maxNodes: 500, englishWords });
}
for(const [ciphertext,direction,steps,expected] of [
    ['Asdfgh','up',1,'Qwerty'],
    ['Zxcvbn','up',2,'Qwerty'],
    ['Qwerty','down',1,'Asdfgh'],
    ['Qwerty','down',2,'Zxcvbn']
]) {
    assert(keyboard.decode(ciphertext).some(result=>result.label===`Keyboard Shift ${direction} ${steps}`&&result.text===expected),`Keyboard Shift ${direction} ${steps} failed for ${ciphertext}`);
    await expectCandidate(ciphertext,expected,{maxDepth:1,maxNodes:100,englishWords});
}
assert(keyboard.probe('123456')>0,'Numeric keyboard row should be eligible for vertical shifts');
await expectCandidate('123456','qwerty',{maxDepth:1,maxNodes:100,englishWords});
const pathNode=(parent,decoder,result)=>({text:result.text,parent,step:{decoder,parameter:result.parameter}});
const digitInput='341351435234114421215444143332235541331314314325';
const digitRoot={text:digitInput,parent:null,step:null};
const down=keyboard.decode(digitInput).find(result=>result.label==='Keyboard Shift down 1');
const downNode=pathNode(digitRoot,'keyboardshift',down);
const digitRail=rail.decode(down.text).find(result=>result.parameter===8);
const digitRailNode=pathNode(downNode,'railfence',digitRail);
const up=keyboard.decode(digitRail.text).find(result=>result.label==='Keyboard Shift up 1');
assert(redundantTransform(digitRailNode,keyboard,up),'Opposite keyboard shifts across a transposition should be pruned');
const digitOutcome=await search(digitInput,{maxDepth:5,maxNodes:500,englishWords});
assert.equal(digitOutcome.candidates[0]?.text,'PRUNE LATE OR LOSE THE SIGNAL');
assert.deepEqual(digitOutcome.candidates[0].path.map(step=>step.decoder),['railfence','polybius']);
assert(digitOutcome.stats.redundantPruned>0,'Search should report equivalent paths pruned before generation');
const caesar=decoders.find(decoder=>decoder.id==='caesar');
const atbash=decoders.find(decoder=>decoder.id==='atbash');
const reverse=decoders.find(decoder=>decoder.id==='reverse');
const letterRoot={text:'HELLOWORLD',parent:null,step:null};
const firstCaesar=caesar.decode(letterRoot.text).find(result=>result.parameter===7);
const caesarNode=pathNode(letterRoot,'caesar',firstCaesar);
const middleRail=rail.decode(firstCaesar.text).find(result=>result.parameter===3);
const caesarRailNode=pathNode(caesarNode,'railfence',middleRail);
assert(redundantTransform(caesarRailNode,caesar,caesar.decode(middleRail.text).find(result=>result.parameter===3)),'Two Caesar shifts across Rail Fence should be combined');
const middleAtbash=atbash.decode(firstCaesar.text)[0];
const affineNode=pathNode(caesarNode,'atbash',middleAtbash);
assert(redundantTransform(affineNode,caesar,caesar.decode(middleAtbash.text).find(result=>result.parameter===3)),'Three affine letter substitutions should reduce to two');
const atbashNode=pathNode(letterRoot,'atbash',atbash.decode(letterRoot.text)[0]);
const atbashRailNode=pathNode(atbashNode,'railfence',rail.decode(atbashNode.text).find(result=>result.parameter===3));
assert(redundantTransform(atbashRailNode,atbash,atbash.decode(atbashRailNode.text)[0]),'Two Atbash steps across Rail Fence should cancel');
const reverseNode=pathNode(letterRoot,'reverse',reverse.decode(letterRoot.text)[0]);
const reverseCaesarNode=pathNode(reverseNode,'caesar',caesar.decode(reverseNode.text).find(result=>result.parameter===7));
assert(redundantTransform(reverseCaesarNode,reverse,reverse.decode(reverseCaesarNode.text)[0]),'Two Reverse steps across Caesar should cancel');
const keyboardRoot={text:'yuiop',parent:null,step:null};
const firstLeft=keyboard.decode(keyboardRoot.text).find(result=>result.label==='Keyboard Shift left 2');
const leftNode=pathNode(keyboardRoot,'keyboardshift',firstLeft);
assert(!redundantTransform(leftNode,keyboard,keyboard.decode(firstLeft.text).find(result=>result.label==='Keyboard Shift left 2')),'A four-key displacement still needs two supported steps');
const upperRoot={text:'QWERTY',parent:null,step:null};
const upperNode=pathNode(upperRoot,'keyboardshift',keyboard.decode(upperRoot.text).find(result=>result.label==='Keyboard Shift up 1'));
assert(redundantTransform(upperNode,keyboard,keyboard.decode(upperNode.text).find(result=>result.label==='Keyboard Shift down 1')),'Case loss should not make opposite keyboard shifts useful');
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
const morseDecoder=decoders.find(decoder=>decoder.id==='morse');
for(const symbol of ['\u0001','\u0085','\u200B','\uFFFD']){
    const input=`@@@@ @@ / ${symbol}${symbol}${symbol}`;
    assert.equal(morseDecoder.probe(input),0,`Morse accepted an invalid binary symbol ${JSON.stringify(symbol)}`);
    assert.deepEqual(morseDecoder.decode(input),[],`Morse decoded an invalid binary symbol ${JSON.stringify(symbol)}`);
}
assert(morseDecoder.decode('@@@@ @@ / ---').length>0,'Morse should still accept two printable symbols');
await expectCandidate('0011100100010110101101110', 'HELLO', { maxDepth: 1 });
for(const [id,encoded,decoded] of [
    ['base64','SGVsbG8=','Hello'],['base32','JBSWY3DP','Hello'],
    ['base58','JxF12TrwUP45BMd','Hello World'],['ascii85','<~87cURD]i,"Ebo7~>','Hello World'],
    ['base85','NM&qnZy;B1a%^M','Hello World'],['base91','fPNKd','test'],
    ['hex','48 65 6c 6c 6f','Hello'],['octal','110 145 154 154 157','Hello'],
    ['decimal','72 101 108 108 111','Hello'],['a1z26','8 5 12 12 15','HELLO'],
    ['polybius','23 15 31 31 34','HELLO'],['adfgx','DF AX FA FA FG','HELLO']
]) {
    const decoder=decoders.find(item=>item.id===id);
    for(const separator of [' | ','  ','\n',' / ']) {
        const input=encoded+separator+encoded;
        assert(decoder.probe(input)>0,`${id} did not detect explicit word separator`);
        assert(decoder.decode(input).some(result=>result.text===decoded+' '+decoded),`${id} lost word boundary for ${JSON.stringify(separator)}`);
    }
}
for (const [id, input] of [
    ['morse','••••:••:—'],
    ['bacon','aab bbaabaaababbababbabbba'],
    ['binary','01001000,01101001'],
    ['tap','xx xxx, x xxxxx']
]) assert.equal(decoders.find(decoder=>decoder.id===id).probe(input),0,`${id} should use fixed separators`);
for (const title of ['编码（固定映射）','密码（需要密钥）','特殊领域','数学与代码']) assert(reference.includes(title));
assert(textQuality('this is a secret message', englishWords).score > textQuality('xqzt plmn vrkk', englishWords).score, 'English dictionary hits should improve text quality');
const unsegmentedQuality=textQuality('PRUNELATEORLOSETHESIGNAL',englishWords);
assert(unsegmentedQuality.trigramSignal>0&&unsegmentedQuality.score<=54,'Letter-pattern scoring should remain a weak signal until words are segmented');
assert.equal(textQuality('这是一个正常的中文线索', englishWords).plainTextLikely, true, 'Normal Chinese should be accepted as plaintext');
assert.equal(textQuality('锟斤拷烫烫烫', englishWords).plainTextLikely, false, 'Typical Chinese mojibake should not be accepted as plaintext');
const chineseResult = await search(Buffer.from('这是一个中文答案').toString('base64'), { maxDepth: 3, maxNodes: 100, englishWords });
const chineseCandidate = chineseResult.candidates.find(candidate => candidate.text === '这是一个中文答案');
assert(chineseCandidate?.plainTextLikely, 'Decoded Chinese should be returned as plaintext');
assert.equal(chineseCandidate.depth, 1, 'Plain Chinese should stop expanding after it is found');
console.log('OK ARG engine: decoders, English/ACG dictionaries, matching, and Chinese plaintext detection');
