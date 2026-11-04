import {loadAI} from './ai.mjs';
import {loadRules} from './rules.mjs';
const ready=loadRules().then(loadAI);
self.onmessage=async ({data:{id,kind,args}})=>{
  try {
    const ai=await ready;
    const result=kind==='ready'?true:await ai[kind](...args);
    self.postMessage({id,result});
  } catch(error) {
    console.error(error);
    self.postMessage({id,error:true});
  }
};
