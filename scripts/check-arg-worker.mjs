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
const cases=JSON.parse(await readFile(new URL('./fixtures/arg-layered-cases.json',import.meta.url),'utf8'));
const words=new Set((await readFile(new URL('../assets/data/arg-english-words.txt',import.meta.url),'utf8')).toLowerCase().split(/\s+/).filter(Boolean));
for(const id of [8,32,35]){
    const sample=cases.find(item=>item.id===id);
    const workerCount=id===35?4:2;
    const result=await searchParallel(sample.input,{maxDepth:sample.depth,effort:id===35?'中':'少',workerCount,englishWords:words});
    assert.equal(result.candidates[0]?.text,sample.expected,`Worker search lost fixture ${id}`);
    assert.equal(result.stats.workers,workerCount);
    console.log('OK actual Worker channel',id,result.stats.expanded,result.stats.attempted);
}
const eightLayer=cases.find(item=>item.id===35);
const nineLayerInput=Buffer.from(eightLayer.input,'utf8').toString('base64');
const nineLayer=await searchParallel(nineLayerInput,{maxDepth:9,effort:'中',workerCount:4,englishWords:words});
assert.equal(nineLayer.candidates[0]?.text,eightLayer.expected,'Worker search lost a ninth outer Base64 layer');
assert.equal(nineLayer.candidates[0]?.depth,9);
console.log('OK actual Worker channel nine layers',nineLayer.stats.expanded,nineLayer.stats.attempted);
