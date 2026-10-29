import assert from 'node:assert/strict';
import {search,decoders,createSearchContext,evaluateText,expandTextNode} from '../src/scripts/arg-engine.js';

const contextFor=decoders=>({decoders,cache:new Map(),plaintextCache:new Map()});
let zeroScoreCalls=0;
const graph=contextFor([
    {id:'zero',probe:()=>0,decode:t=>{zeroScoreCalls++;return t==='ROOT'?[{text:'CHILD',label:'Zero score'}]:[];}},
    {id:'continuation',probe:()=>.8,decode:t=>t==='CHILD'?[{text:'END',label:'Continuation'}]:[]},
    {id:'invalid',probe:()=>1,decode:()=>[]}
]);
assert.equal(evaluateText('ROOT',graph),0,'A decoder without legal output must score zero');
const expansion=expandTextNode({text:'ROOT',priority:.4,depth:0,usedKeys:[]},{alpha:.9,context:graph});
assert(zeroScoreCalls>0);
assert.equal(expansion.transitions.length,1,'A legal zero-score method must still decode');
assert.equal(expansion.transitions[0].q,.8);
assert(Math.abs(expansion.transitions[0].priority-(.8+.9*.4))<1e-12);
assert(!('decoder' in expansion.transitions[0]),'Text states must not select a future decoder');

const base64=decoders.find(d=>d.id==='base64');
const caesar=decoders.find(d=>d.id==='caesar');
for(const text of ['HELLO1','HELLO!','HELLO中文','HELLO🙂','HELLO\u0001','   ']){
    assert.deepEqual(caesar.decode(text),[],'Caesar must reject the entire unsupported input');
    assert.equal(caesar.probe(text),0);
    assert.equal(evaluateText(text,contextFor([caesar])),0);
}
assert(caesar.decode('Uryyb\tJbeyq\n').some(r=>r.text==='Hello\tWorld\n'),'Letter mapping must retain whitespace separators');
const keyboard=decoders.find(d=>d.id==='keyboardshift');
for(const text of ['HELLO WORLD','HELLO\tWORLD','HELLO\nWORLD','HELLO!','HELLO中文','HELLO🙂','HELLO\u0001','HELLOK']){
    assert.deepEqual(keyboard.decode(text),[],'Keyboard Shift must reject every character outside the keyboard table');
    assert.equal(keyboard.probe(text),0);
    assert.equal(evaluateText(text,contextFor([keyboard])),0);
}
for(const [text,direction,steps] of [
    ['qqqqq','left',1],['wwwww','left',2],['=====','right',1],['-----','right',2],
    ['11111','up',1],['qqqqq','up',2],['zzzzz','down',1],['aaaaa','down',2],
    ['\\\\\\\\\\','down',1] // Unequal row lengths also create missing targets.
])assert(!keyboard.decode(text).some(r=>r.label===`Keyboard Shift ${direction} ${steps}`),'A single missing target must invalidate the entire direction');
assert(keyboard.decode('qqqqq').some(r=>r.label==='Keyboard Shift right 1'&&r.text==='wwwww'),'One illegal direction must not suppress other legal directions');
assert.deepEqual(keyboard.decode('1=z/\\'),[],'Boundary characters can jointly rule out every direction');
assert.equal(keyboard.probe('1=z/\\'),0);
assert.equal(evaluateText('1=z/\\',contextFor([keyboard])),0);
assert.equal(keyboard.probe('KOKKSNFXPGFRFETGNUEHHDHDSEFLOCPDXXCIEQTXGKFLQHWUOWPINFPOEGOY'),.34,'English unigram evidence must not inflate a keyboard score');
const atbash=decoders.find(d=>d.id==='atbash'),reverse=decoders.find(d=>d.id==='reverse');
assert.equal(atbash.probe(atbash.decode('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE')[0].text),.3,'Atbash must not reward frequent English output letters');
assert.equal(reverse.probe('EGASSEMTERCESEHTWOLLOF'),.14,'Reverse must not reward English word fragments');
assert.equal(evaluateText('NOT BASE64!',contextFor([base64])),0);
assert.equal(evaluateText('AA==',contextFor([base64])),0,'Unusable byte outputs must score zero');
assert(!expandTextNode({text:'AA==',priority:0,depth:0,usedKeys:[]},{context:contextFor([base64])}).transitions.length,'Unusable outputs must still be rejected at execution');
assert(evaluateText('SGVsbG8=',contextFor([base64]))>0);
assert.equal(evaluateText('=SGVsbG8',contextFor([base64])),0,'Misplaced padding must score zero');
for(const [id,input] of [['hex','F12'],['base32','=JBSWY3DP'],['base85','zzzzz'],['morse','------ ..'],['a1z26','99 88 77']]){
    const only=contextFor([decoders.find(d=>d.id===id)]);
    assert.equal(evaluateText(input,only),0,`${id} must not score illegal input/output`);
}
const hillOnly=contextFor([createSearchContext(['3 3;2 5']).decoders.find(d=>d.id==='hill')]);
assert.equal(evaluateText('ABC!',hillOnly),0,'An unsupported character must score zero');
assert.equal(evaluateText('ABC',hillOnly),0,'An incomplete block must score zero');
const permutationContext=createSearchContext();
permutationContext.decoders=permutationContext.decoders.filter(d=>['reverse','hex'].includes(d.id));
const scrambled=[...Buffer.from('HELLO WORLD NOW').toString('hex')].reverse().join('');
const directScore=evaluateText(scrambled,permutationContext,1);
assert(evaluateText(scrambled,permutationContext,2)>directScore+.5,'A legal position transform revealing a verified format must improve q');
assert.equal(evaluateText(scrambled,permutationContext,1),directScore,'A cached lookahead must not leak past the remaining depth');
const badFuture=createSearchContext();badFuture.decoders=badFuture.decoders.filter(d=>['reverse','base64'].includes(d.id));
assert.equal(evaluateText('==AA',badFuture,2),evaluateText('==AA',badFuture,1),'An illegal follow-up must not contribute lookahead');
const keyed=createSearchContext(['LEMON','SHADOW']);
const vig=keyed.decoders.find(d=>d.id==='vigenere');
const onlyVig=contextFor([vig]);
const input='WBRCCG IR FASV';
assert.equal(evaluateText(input,onlyVig),vig.probe(input),'Text evaluation must not award a future key bonus');
const first=expandTextNode({text:input,priority:1,depth:0,usedKeys:[]},{context:onlyVig});
const lemon=first.transitions.find(t=>t.step.keyId==='LEMON');
assert.deepEqual(lemon.usedKeys,['LEMON']);
assert.equal(lemon.keyBonus,2,'Actually using a new key earns the bonus');
assert.equal(lemon.q,lemon.maxQ+2,'The bonus belongs above max q, not to a future decoder');
assert.equal(lemon.priority,lemon.q+.5,'The keyed result score must enter the history recurrence');
assert.deepEqual(first.transitions.find(t=>t.step.keyId==='SHADOW').usedKeys,['SHADOW']);
const second=expandTextNode(lemon,{context:onlyVig});
assert(second.transitions.some(t=>t.text==='ATTACK AT DAWN'&&t.step.keyId==='LEMON'),'Used keys must remain legal');
assert.equal(second.transitions.find(t=>t.step.keyId==='LEMON').keyBonus,1,'Reusing a key must not borrow the unused SHADOW bonus');
assert.equal(second.transitions.find(t=>t.step.keyId==='SHADOW').keyBonus,2,'A different unused key still earns its own bonus');
const mixedContext=createSearchContext(['3 3;2 5']);
mixedContext.decoders=mixedContext.decoders.filter(d=>['hill','caesar'].includes(d.id));
const mixedTransitions=expandTextNode({text:'ABCDEFGH',depth:0,priority:.48,usedKeys:[]},{context:mixedContext});
assert.equal(evaluateText('ABCDEFGH',mixedContext),.48);
assert(mixedTransitions.transitions.filter(t=>t.step.decoder==='caesar').every(t=>t.keyBonus===0&&t.q===t.maxQ),'Ordinary decoders cannot borrow an unused Hill key');
assert(mixedTransitions.transitions.filter(t=>t.step.decoder==='hill').every(t=>t.keyBonus===2&&t.q===t.maxQ+2));
const rewardContext=contextFor([
    {id:'keyed-step',keyed:true,keyVariants:[{keyId:'ACTUAL',probe:()=>.1}],decode:t=>t==='KEYROOT'?[{text:'KEYCHILD',label:'Actual key',keyId:'ACTUAL'}]:[]},
    {id:'ordinary-step',probe:()=>.2,decode:t=>t==='KEYROOT'?[{text:'KEYCHILD',label:'Ordinary step'}]:[]},
    {id:'strong-followup',probe:()=>.9,decode:t=>t==='KEYCHILD'?[{text:'NEXTTEXT',label:'Strong followup'}]:[]}
]);
const rewardTransitions=expandTextNode({text:'KEYROOT',depth:0,priority:.2,usedKeys:[]},{context:rewardContext}).transitions;
const rewarded=rewardTransitions.find(t=>t.step.keyId==='ACTUAL'),ordinary=rewardTransitions.find(t=>!t.step.keyId);
assert.equal(rewarded.maxQ,.9);
assert.equal(rewarded.q,2.9,'An actual key reward is added after the maximum over all decoders');
assert.equal(ordinary.q,.9,'The same child text reached by an ordinary decoder gets no key reward');
assert.equal(ordinary.keyBonus,0);
let keyedRoot;
await search('ABCDEFGH',{keyMode:true,keys:['3 3;2 5'],maxDepth:1,maxNodes:1,onNode:n=>{keyedRoot=n;}});
assert.equal(keyedRoot.keyBonus,0,'The root has not executed any keyed step');
assert.equal(keyedRoot.q,keyedRoot.maxQ);

const final=await search('SGVsbG8gV29ybGQ=',{maxDepth:1,maxNodes:1});
assert(final.candidates.some(c=>c.text==='Hello World'&&c.depth===1),'Observe plaintext at generation, including final depth');
assert.equal(final.stats.expanded,1,'One popped text spends one node');
const tiny=await search('SGVsbG8gV29ybGQ=',{maxDepth:5,maxNodes:1});
assert.equal(tiny.stats.expanded,1,'A small budget must still expand the root');
assert(tiny.candidates.some(c=>c.text==='Hello World'));
const empty=await search('HELLO\u0000',{maxDepth:2,maxNodes:100});
assert.equal(empty.stats.generated,0);
await assert.rejects(search('TEXT',{alpha:1}));
await assert.rejects(search('TEXT',{alpha:-.01}));
await assert.rejects(search('TEXT',{qInterval:-1}));
await assert.rejects(search('TEXT',{qInterval:1.5}));
const control=new AbortController();control.abort();
assert((await search('TEXT',{signal:control.signal})).stats.aborted);

const nodes=[];
await search('Uryyb Jbeyq',{maxDepth:4,maxNodes:120,onNode:node=>nodes.push(node)});
assert(nodes.length<=120&&nodes.every(n=>typeof n.text==='string'&&Number.isFinite(n.priority)&&!('decoder' in n)));
assert.equal(new Set(nodes.map(n=>JSON.stringify([n.depth,n.text,[...n.usedKeys].sort()]))).size,nodes.length,'Identical same-layer text/history states must be merged');
assert.equal(new Set(nodes.map(n=>n.text)).size,nodes.length,'A longer route must not expand a previously reached text');
for(const qInterval of [0,1,2,3,4,7]){
    const levels=new Map();
    await search('UryybJbeyq',{maxDepth:3,maxNodes:120,qInterval,onNode:(node,stats)=>{if(!levels.has(node.depth))levels.set(node.depth,[]);levels.get(node.depth).push({...node,selection:stats.expanded-1});}});
    assert(levels.get(1).length>5&&levels.get(2).length>5);
    for(const layer of levels.values())for(let i=0;i<layer.length;i++){
        const byQ=qInterval>0&&layer[i].selection%(qInterval+1)===qInterval,score=byQ?'q':'priority';
        assert(layer.slice(i+1).every(n=>n[score]<=layer[i][score]),`Selection ${layer[i].selection} must maximize ${score} over remaining states`);
    }
}
console.log('OK text-state search: actual key-step rewards, no future-key bonus, reuse, zero illegal scores, bounded lookahead, recurrence, cycles, sampling, terminal observation, budget and cancellation');
