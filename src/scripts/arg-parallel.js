const engineUrl=new URL('./arg-engine.js',import.meta.url);
engineUrl.search=new URL(import.meta.url).search;
const {search}=await import(engineUrl.href);

export const effortLevels=['少','中','多','极多'];
const baseWork={少:500,中:1500,多:4000,极多:10000};

export function availableThreads(){
    return Math.max(1,Math.floor(navigator.hardwareConcurrency||4));
}
export function maxWorkerCount(){
    const memory=navigator.deviceMemory;
    return Math.min(8,availableThreads(),memory&&memory<8?4:8);
}

class WorkerPool{
    constructor(count,englishWords,acgWords,signal){
        this.workers=[];
        this.closed=false;
        this.signal=signal;
        const workerUrl=new URL('./arg-worker.js',import.meta.url);
        workerUrl.search=new URL(import.meta.url).search;
        // Initializing serially avoids cloning the large dictionaries into
        // every Worker at the same instant.
        this.ready=(async()=>{
            for(let index=0;index<count;index++){
                if(this.closed)throw new DOMException('Search stopped','AbortError');
                await new Promise((resolve,reject)=>{
                    const worker=new Worker(workerUrl,{type:'module'});
                    const slot={worker,pending:null,readyReject:reject};
                    this.workers.push(slot);
                    worker.onmessage=event=>{
                        const data=event.data;
                        if(data.type==='ready'){slot.readyReject=null;resolve();return;}
                        if(data.type==='initError'){slot.readyReject=null;reject(new Error(data.message));return;}
                        if(!slot.pending||data.id!==slot.pending.id)return;
                        const pending=slot.pending;
                        slot.pending=null;
                        if(data.type==='error')pending.reject(new Error(data.message));
                        else pending.resolve(data.results);
                    };
                    worker.onerror=event=>{
                        const error=new Error(event.message||'ARG Worker failed');
                        if(slot.pending){slot.pending.reject(error);slot.pending=null;}
                        slot.readyReject=null;
                        reject(error);
                    };
                    worker.postMessage({type:'init',englishWords,acgWords});
                });
            }
        })();
        this.nextId=0;
        this.abort=()=>this.close();
        signal?.addEventListener('abort',this.abort,{once:true});
    }
    async expand(nodes,{alpha,maxDepth,lookahead,baseModel}){
        await this.ready;
        if(this.closed)throw new DOMException('Search stopped','AbortError');
        const jobs=[];
        // Nodes arrive in priority order. Small jobs keep all workers busy and
        // give the strongest part of the frontier the earliest CPU slots.
        for(let start=0;start<nodes.length;start+=2)jobs.push({start,nodes:nodes.slice(start,start+2)});
        const results=new Array(nodes.length);
        let next=0;
        await Promise.all(this.workers.map(async slot=>{
            while(next<jobs.length&&!this.closed){
                const job=jobs[next++];
                const value=await new Promise((resolve,reject)=>{
                    const id=++this.nextId;
                    slot.pending={id,resolve,reject};
                    slot.worker.postMessage({type:'expand',id,nodes:job.nodes.map(node=>({text:node.text,depth:node.depth,priority:node.priority,usedKeys:node.usedKeys})),alpha,maxDepth,lookahead,baseModel});
                });
                for(let index=0;index<value.length;index++)results[job.start+index]=value[index];
            }
        }));
        if(this.closed)throw new DOMException('Search stopped','AbortError');
        return results;
    }
    close(){
        if(this.closed)return;
        this.closed=true;
        this.signal?.removeEventListener('abort',this.abort);
        for(const slot of this.workers){
            slot.readyReject?.(new DOMException('Search stopped','AbortError'));
            slot.pending?.reject(new DOMException('Search stopped','AbortError'));
            slot.worker.terminate();
        }
    }
}

export async function searchParallel(input,options={}){
    if(options.keyMode)return search(input,options);
    const workerCount=Math.max(1,Math.min(maxWorkerCount(),Math.floor(options.workerCount||1)));
    const effort=Object.hasOwn(baseWork,options.effort)?options.effort:'中';
    const maxNodes=options.maxNodes??Math.min(40000,Math.round(baseWork[effort]*(1+Math.log2(workerCount))));
    const pool=new WorkerPool(workerCount,options.englishWords??null,options.acgWords??null,options.signal);
    try{
        await pool.ready;
        const result=await search(input,{...options,maxNodes,batchSize:Math.max(4,workerCount*2),expandBatch:(nodes,config)=>pool.expand(nodes,config)});
        return {...result,stats:{...result.stats,workers:workerCount,effort}};
    }finally{pool.close();}
}
