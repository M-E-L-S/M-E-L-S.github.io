import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decoders} from '../src/scripts/arg-engine.js';

const cases=JSON.parse(await readFile(new URL('./fixtures/arg-layered-cases.json',import.meta.url),'utf8'));
assert.deepEqual(cases.map(c=>c.id),[1,2,6,7,8,9,10,11,12,13,14,16,17,18,19,20,21,23,33],'Keep the original IDs after removing unsupported Caesar, Atbash and Keyboard Shift constructions');
const compact=t=>t.replace(/\s/g,'');
function replay(text,route,expected,index=0,states=[text]){
    if(index===route.length)return compact(text)===compact(expected)?states:null;
    const step=route[index],decoder=decoders.find(d=>d.id===step.decoder);
    assert(decoder,`Unknown decoder ${step.decoder}`);
    for(const result of decoder.decode(text).filter(r=>r.label===step.label&&JSON.stringify(r.parameter)===JSON.stringify(step.parameter))){
        const tail=replay(result.text,route,expected,index+1,[...states,result.text]);
        if(tail)return tail;
    }
    return null;
}
let caesarSteps=0;
for(const sample of cases){
    assert(sample.route?.length&&sample.route.length<=sample.depth,`Missing witness route for ${sample.id}`);
    const states=replay(sample.input,sample.route,sample.expected);
    assert(states,`Retained route ${sample.id} is not legal under the current input rules`);
    sample.route.forEach((step,index)=>{
        if(step.decoder!=='caesar')return;
        caesarSteps++;
        assert(/^[A-Za-z\s]+$/.test(states[index])&&/[A-Za-z]/.test(states[index]),`Fixture ${sample.id} applies Caesar to nonletter input`);
    });
}
console.log(`OK ${cases.length} retained ARG routes; ${caesarSteps} Caesar inputs contain only letters and whitespace`);
