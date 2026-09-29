import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker as NodeWorker} from 'node:worker_threads';
import {search} from '../src/scripts/arg-engine.js';
import {searchParallel} from '../src/scripts/arg-parallel.js';
import {createAcgData} from '../src/scripts/arg-acg.js';

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

const input=(await readFile(new URL('./fixtures/arg-acg-parallel-regression.txt',import.meta.url),'utf8')).trim();
const englishWords=new Set((await readFile(new URL('../assets/data/arg-english-words.txt',import.meta.url),'utf8')).toLowerCase().split(/\s+/).filter(Boolean));
const acgData=createAcgData(
    JSON.parse(await readFile(new URL('../assets/data/arg-acg-names.json',import.meta.url),'utf8')),
    await readFile(new URL('../assets/data/arg-acg-words.txt',import.meta.url),'utf8')
);
const expected='Nakano Miku kept the final clue inside a small blue notebook.';
const options={maxDepth:8,englishWords,acgWords:acgData.words};
const standard=await search(input,{...options,maxNodes:10000});
assert.equal(standard.candidates[0]?.text,expected);
const parallel=await searchParallel(input,{...options,effort:'极多',workerCount:8});
assert.equal(parallel.candidates[0]?.text,expected);
assert.deepEqual(parallel.candidates[0].path.map(step=>step.decoder),standard.candidates[0].path.map(step=>step.decoder));
console.log('OK ACG eight-layer parallel regression',parallel.stats.expanded,parallel.stats.attempted);
