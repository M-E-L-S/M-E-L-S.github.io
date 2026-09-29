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

function compactWorkerAction(action,cache){
    const node=action.state;
    const needsAncestors=['caesar','atbash','keyboardshift','reverse'].includes(action.decoder);
    const cached=needsAncestors&&cache.get(node);
    if(cached)return {decoder:action.decoder,confidence:action.confidence,state:cached};
    const ancestors=[];
    if(needsAncestors){
        for(let cursor=node.parent;cursor;cursor=cursor.parent){
            ancestors.push(cursor);
            if(!cursor.step||!['caesar','atbash','railfence','reverse','keyboardshift'].includes(cursor.step.decoder))break;
            if(cursor.step.decoder==='keyboardshift'){
                if(cursor.parent)ancestors.push(cursor.parent);
                break;
            }
        }
    }
    let parent=null;
    for(let index=ancestors.length-1;index>=0;index--)parent={text:ancestors[index].text,step:ancestors[index].step,parent};
    const state={text:node.text,depth:node.depth,step:node.step,parent};
    if(needsAncestors)cache.set(node,state);
    return {decoder:action.decoder,confidence:action.confidence,state};
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
    async expand(actions,{maxDepth}){
        await this.ready;
        if(this.closed)throw new DOMException('Search stopped','AbortError');
        const jobs=[];
        // Nodes arrive in priority order. Small jobs keep all workers busy and
        // give the strongest part of the frontier the earliest CPU slots.
        for(let start=0;start<actions.length;start+=2)jobs.push({start,actions:actions.slice(start,start+2)});
        const results=new Array(actions.length);
        let next=0;
        await Promise.all(this.workers.map(async slot=>{
            while(next<jobs.length&&!this.closed){
                const job=jobs[next++];
                const value=await new Promise((resolve,reject)=>{
                    const id=++this.nextId;
                    slot.pending={id,resolve,reject};
                    const compactCache=new WeakMap();
                    slot.worker.postMessage({type:'expand',id,actions:job.actions.map(action=>compactWorkerAction(action,compactCache)),maxDepth});
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
    // Each Worker owns a dictionary copy. Keep the default small, but allow
    // wider searches on devices with enough cores and reported memory.
    const workerCount=Math.max(1,Math.min(maxWorkerCount(),Math.floor(options.workerCount||1)));
    const effort=Object.hasOwn(baseWork,options.effort)?options.effort:'中';
    const anchorBudget=baseWork[effort];
    // More workers buy both throughput and breadth; the queue remains bounded
    // independently so additional workers do not multiply frontier memory.
    const baseline=Math.min(40000,Math.round(baseWork[effort]*(1+Math.log2(workerCount))));
    const pool=new WorkerPool(workerCount,options.englishWords??null,options.acgWords??null,options.signal);
    let budget=baseline;
    try{
        await pool.ready;
        const shared={
            ...options,
            batchSize:Math.max(16,workerCount*8),
            expandBatch:(nodes,config)=>pool.expand(nodes,config)
        };
        // A larger budget changes the allowance at every depth and can push a
        // path that succeeds at the ordinary budget out of a later frontier.
        // Finish that narrower search first, then widen only if it has not
        // found a strong plaintext result.
        const anchor=await search(input,{...shared,maxNodes:anchorBudget,adjustBudget:undefined});
        if(anchor.stats.stoppedOnPlaintext||anchor.stats.aborted)
            return {...anchor,stats:{...anchor.stats,workers:workerCount,effort}};
        const outcome=await search(input,{
            ...shared,
            maxNodes:baseline,
            onProgress:progress=>options.onProgress?.({
                ...progress,
                expanded:anchor.stats.expanded+progress.expanded,
                attempted:anchor.stats.attempted+progress.attempted,
                generated:anchor.stats.generated+progress.generated
            }),
            adjustBudget:({frontier,expanded,nodeBudget})=>{
                if(!frontier.length)return nodeBudget;
                let best=-Infinity,close=0;
                for(const node of frontier)best=Math.max(best,node.priority);
                for(const node of frontier)if(node.priority>=best-.18)close++;
                const pressure=Math.min(1,frontier.length/Math.max(1,nodeBudget*.4));
                const promise=Math.min(1,Math.max(0,(best-.7)/1.4));
                const competition=Math.min(1,close/Math.max(1,nodeBudget*.15));
                // Competing high-priority continuations earn extra search width.
                // The effort label supplies a baseline, not a fixed node count.
                budget=Math.max(budget,Math.min(60000,Math.round(baseline*(1+pressure*promise*(.35+.65*competition)))));
                return Math.max(expanded+1,budget);
            }
        });
        const candidates=new Map();
        for(const item of [...anchor.candidates,...outcome.candidates]){
            const previous=candidates.get(item.text);
            if(!previous||item.score>previous.score)candidates.set(item.text,item);
        }
        return {
            candidates:[...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,20),
            stats:{
                ...outcome.stats,
                expanded:anchor.stats.expanded+outcome.stats.expanded,
                attempted:anchor.stats.attempted+outcome.stats.attempted,
                generated:anchor.stats.generated+outcome.stats.generated,
                redundantPruned:anchor.stats.redundantPruned+outcome.stats.redundantPruned,
                workers:workerCount,effort
            }
        };
    }finally{
        pool.close();
    }
}
