import * as ort from './vendor/ort.wasm.min.mjs';
import {bidFeatures, legalBids} from './game.mjs';

ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths=new URL('./vendor/',import.meta.url).href;
const make=name=>ort.InferenceSession.create(new URL('./models/'+name+'.onnx',import.meta.url).href,
  {executionProviders:['wasm']});
const ints=(v,d)=>new ort.Tensor('int64',BigInt64Array.from(v,BigInt),d);
const floats=(v,d)=>new ort.Tensor('float32',Float32Array.from(v),d);
function pick(values) {
  let best=0;
  for(let i=0;i<values.length;i++) {
    if(!Number.isFinite(values[i])) throw Error('Nonfinite policy score');
    if(values[i]>values[best]) best=i;
  }
  return best;
}
export async function loadAI(rules) {
  // Initialize sequentially: all sessions share one browser WASM runtime.
  const bidders=[];
  for(const p of ['first','second','third']) bidders.push(await make(p));
  const player=await make('play');
  return {
    async bid(hand,history) {
      const actions=legalBids(history);
      const {scores}=await bidders[history.indexOf(-1)].run({z:floats(bidFeatures(hand,history,actions),[actions.length,5,54])});
      return actions[pick(scores.data)];
    },
    async play(info) {
      let pending='';
      for(let depth=0;depth<32;depth++) {
        const {actions,tokens,channels,player:seat}=rules.observe(info,pending);
        let index=0;
        if(actions.length>1) {
          const n=actions.length;
          const {scores}=await player.run({
            tokens:ints(tokens.flat(),[1,tokens.length,tokens[0].length]),
            channels:ints(channels,[1,1,channels.length]),
            player:ints([seat],[1,1]),
            actions:ints(actions.flatMap(a=>a[3]),[n,actions[0][3].length]),
            weights:floats(actions.map(a=>a[2]),[n])
          });
          index=pick(scores.data);
        }
        const [move,commit]=actions[index];
        if(commit) return move;
        pending=move;
      }
      throw Error('Action did not commit');
    }
  };
}
