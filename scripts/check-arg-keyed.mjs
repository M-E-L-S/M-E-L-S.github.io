import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {search,validateKeyConfig,decoders,createSearchContext,expandTextNode,evaluateText} from '../src/scripts/arg-engine.js';

const fixtures={affine:'5, 8',keyword:'LEMON',columnar:'ZEBRAS',nihilist:'SIMPLE / EASY',playfair:'PLAYFAIREXAMPLE',twosquare:'DIALOGUE / BIOGRAPHY',trisquare:'NSFMUOAGPWVBHQXECIRYLDKTZ / READING / PASTINOQRMLYZUEKXWVBHGFDC',foursquare:'EXAMPLE / KEYWORD',hill:'3 3; 2 5'};
const keys=['5, 8','LEMON','SIMPLE / EASY','ONE / TWO / THREE','3 3; 2 5'];
const configured=validateKeyConfig(keys);
assert.deepEqual(configured.errors,[]);
assert.equal(configured.decoders.length,11);

const fieldFor=id=>['vigenere','beaufort','porta'].includes(id)?'keyword':id;
const decode=(id,text,config=fixtures)=>{
    const validation=validateKeyConfig([config[fieldFor(id)]]);assert.deepEqual(validation.errors,[]);
    return validation.decoders.find(decoder=>decoder.id===id).decode(text).map(item=>item.text);
};
assert.deepEqual(decode('affine','IHHWVCSWFRCP'),['AFFINECIPHER']);
assert.deepEqual(decode('vigenere','LXFOPV EF RNHR'),['ATTACK AT DAWN']);
assert.deepEqual(decode('beaufort','PAMOPGWSODEKKT',{keyword:'RECIPROCAL'}),['CEQUALSKMINUSP']);
// Published ACA examples, including the full spiral/column keys in Tri-Square.
// https://www.cryptogram.org/downloads/aca.info/ciphers/{Porta,TwoSquare,TriSquare,NihilistSubstitution}.pdf
assert.deepEqual(decode('porta','YGXRCOYJVRGMQJEYWQGEHWVU',{keyword:'PORTA'}),['ENCIPHERMENTISRECIPROCAL']);
assert.deepEqual(decode('twosquare','IR RT EH MK GI ME QG RU NM MZ SV'),['ANOTHERDIGRAPHICSETUPX']);
assert.deepEqual(decode('trisquare','RHL QXR LXO EVZ BAT XSE RXD DIU AAA BFZ'),['THREEKEYSQUARESUSEDX']);
assert.deepEqual(decode('nihilist','65 55 32 75 43 65 26 08 44 34 54 79'),['THEEARLYBIRD']);
assert.deepEqual(decode('nihilist','655532754365260844345479'),['THEEARLYBIRD']);
assert.deepEqual(decode('nihilist','65 55 32 75 43 65 26 108 44 34 54 79'),['THEEARLYBIRD']);
assert.deepEqual(decode('playfair','BMODZBXDNABEKUDMUIXMMOUVIF'),['HIDETHEGOLDINTHETREXESTUMP']);
assert.deepEqual(decode('foursquare','MMOWPAMMEWWG'),['ATTACKATDAWN']);
assert.deepEqual(decode('hill','HIAT'),['HELP']);
assert.deepEqual(decode('hill','POH',{hill:'6 24 1; 13 16 10; 20 17 15'}),['ACT']);
// Invertible mod 26 without any invertible entries: modular Gaussian pivoting
// would reject this valid matrix, while the adjugate inverse must accept it.
assert.deepEqual(decode('hill','CP',{hill:'2 13; 13 2'}),['BO']);
assert.deepEqual(decode('columnar','EVLNACDTESEAROFODEECWIREE'),['WEAREDISCOVEREDFLEEATONCE']);
assert.deepEqual(decode('columnar','EVLNACDTESEAROFODEECWIREE',{columnar:'6 3 2 4 1 5'}),['WEAREDISCOVEREDFLEEATONCE']);
assert.deepEqual(decode('columnar','BDACE',{columnar:'2 1'}),['ABCDE']);
assert.deepEqual(decode('columnar','a🙂b c!',{columnar:'AAA'}),['abc🙂 !']);
assert.deepEqual(decode('hill','PO!'),[]);
assert.deepEqual(decode('playfair','ABC'),[]);
assert.deepEqual(decode('trisquare','AB'),[]);
assert.deepEqual(decode('nihilist','99 999 11'),[]);
for(const id of ['affine','vigenere','beaufort','porta','playfair','twosquare','trisquare','foursquare','hill']){
    for(const text of ['ABCD1E','ABCD!E','ABCD中文','ABCD🙂','ABCD\u0001','   ']){
        assert.deepEqual(decode(id,text),[],`${id} must reject nonletter input rather than partially transform it`);
        const decoder=validateKeyConfig([fixtures[fieldFor(id)]]).decoders.find(d=>d.id===id);
        assert.equal(decoder.probe(text),0,`${id} must not score unsupported input`);
        const context=createSearchContext();context.decoders=[decoder];
        assert.equal(evaluateText(text,context),0,`${id} must not score unsupported input`);
    }
}

assert.equal(validateKeyConfig([]).errors[0].field,'');
for(const value of ['2,8','5,26','-5,8','a b','密钥','KEY1','A'.repeat(65),'1 1 2','AB/BA/','KEY /','ONE / TWO / THREE / FOUR','2 4; 2 4','1 2; 3','1 0; 0 26']){
    assert.equal(validateKeyConfig([value]).errors[0]?.field,'0',value);
}
assert(validateKeyConfig(Array(6).fill('KEY')).errors.length);
assert.deepEqual(validateKeyConfig(['1 2']).decoders.map(d=>d.id).sort(),['affine','columnar'],'Ambiguous numeric keys must try both interpretations');
assert.deepEqual(validateKeyConfig(['KEY']).decoders.map(d=>d.id).sort(),['beaufort','columnar','playfair','porta','vigenere']);
assert.deepEqual(validateKeyConfig(['ONE/TWO']).decoders.map(d=>d.id).sort(),['foursquare','nihilist','twosquare']);
assert.equal(validateKeyConfig(['KEY','KEY']).decoders.find(d=>d.id==='vigenere').decode('ABC').length,1,'Duplicate keys must not multiply work');
await assert.rejects(search('TEXT',{keyMode:true}),error=>error.keyErrors?.length===1);
await assert.rejects(search('TEXT',{keyMode:true,keys:['KEY','2 4; 2 4']}));
const englishWords=new Set((await readFile(new URL('../assets/data/arg-english-words.txt',import.meta.url),'utf8')).toLowerCase().split(/\s+/).filter(Boolean));
const reuseContext=createSearchContext(['LEMON','SHADOW']);
const reuseRoot={text:'WBRCCG IR FASV',priority:0,depth:0,usedKeys:[]};
const reuseTransitions=expandTextNode(reuseRoot,{englishWords,context:reuseContext}).transitions.filter(t=>t.step.decoder==='vigenere');
for(const transition of reuseTransitions){
    const used=transition.step.keyId;
    assert.deepEqual(transition.usedKeys,[used]);
    assert(expandTextNode(transition,{englishWords,context:reuseContext}).transitions.some(t=>t.step.decoder==='vigenere'&&t.step.keyId===used),'Used keys remain legal');
}
assert.equal(validateKeyConfig(['5,8','5, 8']).decoders.find(d=>d.id==='affine').decode('IHHWVC').length,1,'Formatting aliases must share a key identity');
const repeated=await search(reuseRoot.text,{keyMode:true,keys:['LEMON','SHADOW'],maxDepth:2,maxNodes:500,englishWords});
assert(repeated.candidates.some(c=>c.text==='ATTACK AT DAWN'&&c.path.every(step=>step.decoder==='vigenere'&&step.keyId==='LEMON')),'The same key must remain reusable in consecutive layers');
for(const [id,ciphertext,expected] of [
    ['affine','IHHWVCSWFRCP','AFFINE CIPHER'],['vigenere','LXFOPV EF RNHR','ATTACK AT DAWN'],
    ['playfair','LADEOMOMOCDMAL','PLEASE SEND HELP'],
    ['foursquare','GLEOTYTYKYFYNF','PLEASE SEND HELP'],['hill','HIAT','HELP'],
    ['columnar','EVLNACDTESEAROFODEECWIREE','WE ARE DISCOVERED FLEE AT ONCE'],['nihilist','65 55 32 75 43 65 26 08 44 34 54 79','THE EARLY BIRD']
]){
    const actions=[];
    const result=await search(ciphertext,{keyMode:true,keys:[fixtures[fieldFor(id)],'UNRELATED'],maxDepth:2,maxNodes:500,englishWords,onNode:node=>actions.push(...node.path.map(step=>step.decoder))});
    const compact=text=>text.replace(/\s/g,'');
    assert(result.candidates.some(item=>compact(item.text)===compact(expected)),`Keyed search lost ${id}`);

}
const mixed=await search(Buffer.from('LXFOPV EF RNHR').toString('base64'),{keyMode:true,keys,maxDepth:2,maxNodes:500,englishWords});
assert(mixed.candidates.some(item=>item.text==='ATTACK AT DAWN'&&item.path.map(step=>step.decoder).join(',')==='base64,vigenere'));
const twoKeys=await search('LTHAFJ CH PVRP',{keyMode:true,keys,maxDepth:2,maxNodes:500,englishWords});
assert(twoKeys.candidates.some(item=>item.text==='ATTACK AT DAWN'&&item.path.map(step=>step.decoder).join(',')==='affine,vigenere'));
const fifth=await search('LXFOPV EF RNHR',{keyMode:true,keys:['WRONG','OTHER','DUMMY','EXTRA','LEMON'],maxDepth:1,maxNodes:100,englishWords});
assert(fifth.candidates.some(item=>item.text==='ATTACK AT DAWN'&&item.path[0].label.includes('LEMON')),'The fifth key must be tried alongside other keys');
let fiveLayerInput='LXFOPV EF RNHR';
for(let i=0;i<4;i++)fiveLayerInput=Buffer.from(fiveLayerInput).toString('base64');
const fiveLayer=await search(fiveLayerInput,{keyMode:true,keys,maxDepth:5,maxNodes:500,englishWords});
assert(fiveLayer.candidates.some(item=>item.text==='ATTACK AT DAWN'&&item.depth===5),'Five-layer search lost a keyed final layer');
const unused=await search('SGVsbG8gV29ybGQ=',{keyMode:true,keys,maxDepth:1,maxNodes:100,englishWords});
assert(unused.candidates.some(item=>item.text==='Hello World'&&item.path.every(step=>!configured.decoders.some(decoder=>decoder.id===step.decoder))),'Keys must remain optional in a result path');
const acg=await search('ZSYIELCGAV',{keyMode:true,keys:['LEMON'],maxDepth:1,maxNodes:100,englishWords,acgWords:{full:new Set(['oomurayumi']),parts:new Set(),maxLength:10}});
assert(acg.candidates.some(item=>item.text==='OOMURAYUMI'&&item.evidence.includes('ACG Name 词库命中')),'Key mode lost the ACG Name setting');
const visited=[];
const capped=await search('QZXVJKBMWP',{keyMode:true,keys:['LEMON'],maxDepth:10,maxNodes:100,onNode:node=>visited.push(node.depth),expandBatch:()=>{throw new Error('Key mode started a worker batch');}});
assert(visited.length&&Math.max(...visited)<=4);
assert(capped.candidates.every(item=>item.depth<=5));
assert(capped.stats.expanded<=100);
const standardActions=[];
await search('LXFOPVEFRNHR',{keys,maxDepth:1,maxNodes:50,onNode:node=>standardActions.push(...node.path.map(step=>step.decoder))});
assert(standardActions.every(id=>decoders.some(decoder=>decoder.id===id)),'Keyed methods leaked into standard mode');
const control=new AbortController();
const cancelled=await search('QZXVJKBMWP',{keyMode:true,keys,maxDepth:5,maxNodes:500,signal:control.signal,onProgress:()=>control.abort()});
assert(cancelled.stats.aborted);
console.log('OK keyed ARG: 11 ciphers, format validation, mixed/unused keys, isolation, depth, budget and cancellation');
