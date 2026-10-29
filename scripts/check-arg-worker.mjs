import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';

class BrowserWorker{
    constructor(url){
        const wrapper=`
            import {parentPort,workerData} from 'node:worker_threads';
            const pending=[];
            globalThis.self={location:{href:workerData.url},postMessage:data=>parentPort.postMessage(data)};
            parentPort.on('message',data=>self.onmessage?self.onmessage({data}):pending.push(data));
            await import(workerData.url);
            for(const data of pending)self.onmessage({data});
        `;
        this.worker=new NodeWorker(new URL('data:text/javascript;base64,'+Buffer.from(wrapper).toString('base64')),{type:'module',workerData:{url:url.href}});
        this.worker.on('message',data=>this.onmessage?.({data}));
        this.worker.on('error',error=>this.onerror?.({message:error.message}));
    }
    postMessage(data){this.worker.postMessage(data);}
    terminate(){this.worker.terminate();}
}
globalThis.Worker=BrowserWorker;
const {searchParallel}=await import('../src/scripts/arg-parallel.js');
const {search}=await import('../src/scripts/arg-engine.js');
const cases=JSON.parse(await readFile(new URL('./fixtures/arg-layered-cases.json',import.meta.url),'utf8'));
const words=new Set((await readFile(new URL('../assets/data/arg-english-words.txt',import.meta.url),'utf8')).toLowerCase().split(/\s+/).filter(Boolean));
for(const id of [8,33]){
    const sample=cases.find(item=>item.id===id);
    const options={maxDepth:sample.depth,maxNodes:100,alpha:.5,qInterval:id===8?2:7,lookahead:id===8,baseModel:id===8?'counts':'presence',englishWords:words};
    const serial=await search(sample.input,options);
    const parallel=await searchParallel(sample.input,{...options,workerCount:2});
    assert.deepEqual(parallel.candidates,serial.candidates,`Worker candidate/path parity failed for ${id}`);
    const {workers,effort,...stats}=parallel.stats;
    assert.deepEqual(stats,serial.stats,`Worker accounting parity failed for ${id}`);
    console.log('OK actual Worker text-node parity',id,{found:parallel.candidates.some(c=>c.text===sample.expected),expanded:stats.expanded});
}
const expected='THIS IS A LONG ENOUGH SECRET MESSAGE';
let input=expected;
for(let i=0;i<9;i++)input=Buffer.from(input).toString('base64');
const options={maxDepth:9,maxNodes:500,englishWords:words};
const serial=await search(input,options);
const parallel=await searchParallel(input,{...options,workerCount:4});
assert.deepEqual(parallel.candidates,serial.candidates);
const nineLayerFound=parallel.candidates.some(c=>c.text===expected&&c.depth===9);
console.log('Actual Worker nine-layer text-state expansion',{found:nineLayerFound,expanded:parallel.stats.expanded});
const acgWords={full:new Set(['oomurayumi']),parts:new Set(),maxLength:10};
const acgInput=Buffer.from('OOMURAYUMI').toString('base64');
const acgOptions={maxDepth:1,maxNodes:1,englishWords:words,acgWords};
const acgSerial=await search(acgInput,acgOptions);
const acgParallel=await searchParallel(acgInput,{...acgOptions,workerCount:1});
assert.deepEqual(acgParallel.candidates,acgSerial.candidates);
assert(acgParallel.candidates.some(c=>c.text==='OOMURAYUMI'&&c.evidence.includes('ACG Name 词库命中')));
console.log('OK actual Worker ACG plaintext scoring');
const control=new AbortController();
const stopped=searchParallel(input,{...options,workerCount:2,signal:control.signal});
setTimeout(()=>control.abort(),20);
await assert.rejects(stopped,error=>error.name==='AbortError');
console.log('OK actual Worker cancellation');
// Preserve the coverage assertion, but run the other Worker checks even if
// the current search policy misses this performance regression fixture.
assert(nineLayerFound,'Worker failed the nine-layer decoding boundary');
