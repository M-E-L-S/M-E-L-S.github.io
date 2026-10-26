// Owner-side client: synchronous Wasm runs only in its dedicated Worker.
export class HalmaClient {
  constructor(workerURL=new URL("./worker.js",import.meta.url)) {
    this.workerURL=workerURL;this.pending=new Map();this.sequence=0;this.generation=0;
    this.options={configure:{}};this.closed=false;this.memoryBytes=0;this._spawn();
  }
  _spawn() {
    const generation=++this.generation;
    this.worker=new Worker(this.workerURL,{name:"halma-engine"});
    this.ready=new Promise((resolve,reject)=>{this._readyResolve=resolve;this._readyReject=reject;});
    // Prevent an unhandled rejection when a caller cancels before awaiting ready.
    this.ready.catch(()=>{});
    this.worker.onmessage=({data})=>{
      if(generation!==this.generation||this.closed)return;
      if(data.memory_bytes)this.memoryBytes=data.memory_bytes;
      if(data.type==="ready") {this._readyResolve(data.info);return;}
      if(data.type==="fatal") {this._fail(Object.assign(new Error(data.error.message),{name:data.error.name}));return;}
      const request=this.pending.get(data.id);if(!request)return;this.pending.delete(data.id);
      if(data.error)request.reject(Object.assign(new Error(data.error.message),{name:data.error.name}));
      else request.resolve(data.result);
    };
    this.worker.onerror=event=>{if(generation===this.generation)this._fail(new Error(event.message||"Engine worker failed"));};
    this.worker.onmessageerror=()=>{if(generation===this.generation)this._fail(new Error("Engine response could not be decoded"));};
    this.worker.postMessage({type:"init",options:structuredClone(this.options)});
  }
  _fail(error) {
    ++this.generation;this.worker.terminate();this._readyReject(error);
    for(const p of this.pending.values())p.reject(error);this.pending.clear();
    this.failure=error;
  }
  async _call(method,params={}) {
    if(this.closed)throw new Error("Client is closed");if(this.failure)throw this.failure;
    const generation=this.generation,payload=structuredClone(params);await this.ready;
    if(generation!==this.generation)throw new DOMException("Engine request cancelled","AbortError");
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject});
      try {this.worker.postMessage({id,method,params:payload});}
      catch(error) {this.pending.delete(id);reject(error);}
    });
  }
  hello(players) {return this._call("hello",players===undefined?{}:{players});}
  inspect(position) {return this._call("inspect",position);}
  evaluate(position) {return this._call("evaluate",position);}
  search(options) {return this._call("search",options);}
  clear() {return this._call("clear");}
  request(line) {return this._call("request",{line});}
  async configure(options) {const snapshot=structuredClone(options);const r=await this._call("configure",snapshot);Object.assign(this.options.configure,snapshot);return r;}
  async experiment(mask="auto") {const r=await this._call("experiment",{mask});this.options.experiment=mask;return r;}
  async performance(mask=15) {const r=await this._call("performance",{mask});this.options.performance=mask;return r;}
  cancel() {
    if(this.closed)throw new Error("Client is closed");
    this._fail(new DOMException("Engine request cancelled","AbortError"));this.failure=null;this._spawn();return this.ready;
  }
  close() {if(this.closed)return;this.closed=true;this._fail(new DOMException("Client closed","AbortError"));}
}
