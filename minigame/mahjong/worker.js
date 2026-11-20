import {Game} from './game.js';
let module,game;
function invoke(name,types,args){const cap=131072,p=module._malloc(cap);try{const rc=module.cwrap(name,'number',[...types,'number','number'])(...args,p,cap);if(rc!==0)throw Error('牌局计算失败，请重新开局');const r=JSON.parse(module.UTF8ToString(p));if(r.error)throw Error(r.error);return r;}finally{module._free(p);}}
const engine={hints:(h,m,k)=>invoke('alphamah_hints',['string','string','string'],[h,m,k]),evaluate:(h,m,k,r)=>invoke('alphamah_evaluate',['string','string','string','number'],[h,m,k,+r]),search:async(...a)=>{await new Promise(resolve=>setTimeout(resolve,0));return invoke('alphamah_search_timed',['string','string','string','string','string','string','number','number','number','number'],a.map((x,i)=>i===6?+x:x));}};
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{try{
 if(data.kind==='init'){const {default:create}=await import(data.threaded===true?'./engine/mt/alphamah.js':'./engine/st/alphamah.js');module=await create();game=new Game(engine,async()=>{const phase=game.phase;game.phase="resolving";self.postMessage({state:game.view()});await new Promise(resolve=>setTimeout(resolve,1000));game.phase=phase;});if(Array.isArray(data.scores)&&data.scores.length===4&&data.scores.every(Number.isSafeInteger))game.scores=[...data.scores];await game.new();}
 else if(data.kind==='new')await game.new();
 else await game.action(data);
 if(game.phase!=='over')game.refreshHints();
 self.postMessage({state:game.view()});
 }catch(e){self.postMessage({error:e.message});}});};
