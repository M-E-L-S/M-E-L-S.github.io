/* Classic Worker. All engine assets must be deployed beside this script. */
let session,chain=Promise.resolve();
function asset(name) {const url=new URL(name,self.location.href);url.search=self.location.search;return url.href;}
function errorValue(error) {return {name:error?.name||"Error",message:error?.message||String(error)};}
self.onmessage=({data})=>{
  chain=chain.then(async()=>{
    if(data?.type==="init") {
      if(session)throw new Error("Worker already initialized");
      importScripts(asset("api.js"),asset("halma.js"));
      const engine=await createHalma({locateFile:name=>asset(name),print:()=>{},printErr:message=>console.error(message)});
      session=new HalmaAPI.Session(engine);
      const options=data.options??{};
      if(options.configure)session.dispatch("configure",options.configure);
      if(options.experiment!==undefined)session.dispatch("experiment",{mask:options.experiment});
      if(options.performance!==undefined)session.dispatch("performance",{mask:options.performance});
      postMessage({type:"ready",info:session.dispatch("hello"),memory_bytes:engine.HEAPU8.buffer.byteLength});return;
    }
    if(!session)throw new Error("Initialize the worker first");
    if(!Number.isSafeInteger(data?.id)||data.id<1)throw new Error("Invalid request id");
    const result=session.dispatch(data.method,data.params);
    postMessage({id:data.id,result,memory_bytes:session.engine.HEAPU8.buffer.byteLength});
  }).catch(error=>{
    if(data?.type==="init")postMessage({type:"fatal",error:errorValue(error)});
    else postMessage({id:data?.id,error:errorValue(error)});
  });
};
