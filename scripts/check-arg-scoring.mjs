import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decoders,createSearchContext,evaluateText,search,baseAlphabetPosterior} from '../src/scripts/arg-engine.js';
const englishWords=new Set((await readFile(new URL('../assets/data/arg-english-words.txt',import.meta.url),'utf8')).trim().split(/\s+/));
const only=(id,options={})=>{const c=createSearchContext(null,{englishWords,...options});c.decoders=c.decoders.filter(d=>d.id===id);return c;};
const atbash=decoders.find(d=>d.id==='atbash');
for(const text of ['HELLO1','HELLO!','HELLO中文','HELLO🙂']){
 assert.equal(atbash.probe(text),0);assert.deepEqual(atbash.decode(text),[]);assert.equal(evaluateText(text,only('atbash')),0);
}
assert.equal(atbash.decode('Svool Dliow')[0].text,'Hello World');
for(const [id,input] of [['reverse','DLROW OLLEH'],['caesar','UryybJbeyq'],['atbash','SvoolDliow'],['railfence','WECRLTEERDSOEEFEAOCAIVDEN']]){
 const c=only(id),raw=evaluateText(input,c,0),terminal=evaluateText(input,c,1);
 assert(terminal>raw+.15,`${id} must see plaintext with one layer remaining`);
 assert.equal(evaluateText(input,c,0),raw,'Remaining-depth cache must not leak');
 assert.equal(evaluateText(input,only(id,{lookahead:false}),1),raw);
}
for(const mode of ['presence','counts']){
 assert.equal(baseAlphabetPosterior('base64','ABC!',mode),0);
 const c=createSearchContext(null,{baseModel:mode,englishWords});
 assert(evaluateText('SGVsbG8=',c)>0);
 const score=baseAlphabetPosterior('base91','A'.repeat(80)+'"',mode);
 assert(Number.isFinite(score)&&score>=0&&score<=1);
}
for(const [input,expected,depth] of [
 ['%48%65%6C%6C%6F','Hello',1],[encodeURIComponent('这是一个完整的中文答案'),'这是一个完整的中文答案',1],
 ['%2548%2565%256C%256C%256F','Hello',2]
]){
 const result=await search(input,{maxDepth:depth,maxNodes:100,englishWords});
 assert(result.candidates.some(c=>c.text===expected),`Percent-only input failed: ${input}`);
}
assert.equal(decoders.find(d=>d.id==='url').decode('%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C')[0].text,'你好世界','Short percent-only text must decode even below the plaintext acceptance threshold');
for(const qInterval of [0,1,7]){
 const nodes=[];
 await search('ABCDEFGH',{keyMode:true,keys:['LEMON'],maxDepth:2,maxNodes:60,qInterval,alpha:.999,onNode:n=>nodes.push(n)});
 const layer=nodes.filter(n=>n.depth===1);
 assert(layer.length>5);
 assert(layer.slice(0,5).every(n=>n.keyTier===2),'All five keyed variants must precede ordinary variants');
 assert(layer.slice(5).every(n=>!n.keyTier));
}
console.log('OK scoring: strict Atbash, terminal plaintext lookahead, Base models, percent-only UTF-8 and key-first selection');
