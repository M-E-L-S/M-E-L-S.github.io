const engineUrl=new URL('./arg-engine.js',import.meta.url);
engineUrl.search=new URL(import.meta.url).search;
const {search}=await import(engineUrl.href);

export const effortLevels=['少','中','多','极多'];
const baseWork={少:500,中:1500,多:4000,极多:10000};

export function availableThreads(){
    return Math.max(1,Math.floor(navigator.hardwareConcurrency||4));
}

class WorkerPool{
    constructor(count,englishWords,acgWords,signal){
        this.workers=[];
        this.closed=false;
        this.signal=signal;
        const workerUrl=new URL('./arg-worker.js',import.meta.url);
        workerUrl.search=new URL(import.meta.url).search;
        this.ready=Promise.all(Array.from({length:count},()=>new Promise((resolve,reject)=>{
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
        })));
        this.nextId=0;
        this.abort=()=>this.close();
        signal?.addEventListener('abort',this.abort,{once:true});
    }
    async expand(nodes,{maxDepth,plaintextGrace}){
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
                    slot.worker.postMessage({type:'expand',id,nodes:job.nodes,maxDepth,plaintextGrace});
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
    const workerCount=Math.max(1,Math.min(availableThreads(),Math.floor(options.workerCount||1)));
    const effort=Object.hasOwn(baseWork,options.effort)?options.effort:'中';
    const baseline=Math.round(baseWork[effort]*Math.sqrt(workerCount));
    const pool=new WorkerPool(workerCount,options.englishWords??null,options.acgWords??null,options.signal);
    let budget=baseline;
    try{
        await pool.ready;
        const outcome=await search(input,{
            ...options,
            maxNodes:baseline,
            batchSize:Math.max(16,workerCount*8),
            expandBatch:(nodes,config)=>pool.expand(nodes,config),
            adjustBudget:({frontier,expanded,nodeBudget})=>{
                if(!frontier.length)return nodeBudget;
                let best=-Infinity,close=0;
                for(const node of frontier)best=Math.max(best,node.priority);
                for(const node of frontier)if(node.priority>=best-18)close++;
                const pressure=Math.min(1,frontier.length/Math.max(1,nodeBudget*.4));
                const promise=Math.min(1,Math.max(0,(best-45)/55));
                const competition=Math.min(1,close/Math.max(1,nodeBudget*.15));
                // Competing high-priority continuations earn extra search width.
                // The effort label supplies a baseline, not a fixed node count.
                budget=Math.max(budget,Math.round(baseline*(1+pressure*promise*(.35+.65*competition))));
                return Math.max(expanded+1,budget);
            }
        });
        return {...outcome,stats:{...outcome.stats,workers:workerCount,effort}};
    }finally{
        pool.close();
    }
}
