/* Shared by the real Worker and Node equivalence tests. No game rules in JS. */
(function (root) {
  const defaults = {solo_mib:32,root_states:0,root_expansions:200000,leaf_states:80000,
    leaf_total_states:800000,leaf_ms:300,race_scale:4000,root_planner:true,leaf_race:true,
    leaf_weight:1,leaf_bidirectional:true,race_gap:3,race_pruning:true};
  const budgets = {simple:[300,1000],fast:[300,1000],light:[1000,3000],standard:[3000,12000],deep:[5000,20000]};
  function integer(x,min,max,name) {
    if(!Number.isSafeInteger(x)||x<min||x>max)throw new TypeError(`Invalid ${name}`);return x;
  }
  function boolean(x,name) {if(typeof x!=="boolean")throw new TypeError(`Invalid ${name}`);return x;}
  function playerCount(p) {const n=p.players??2;if(![2,3,4,6].includes(n))throw new TypeError("Invalid players");return n;}
  function board(x,n) {if(typeof x!=="string"||!new RegExp(`^[0-${n}]{121}$`).test(x))throw new TypeError("Invalid board");return x;}
  function position(p) {
    if(!p||typeof p!=="object")throw new TypeError("Position required");
    const n=playerCount(p),text=board(p.board,n),turn=p.turn;
    if(![1,-1,2,3,4,5].slice(0,n).includes(turn))throw new TypeError("Invalid turn");
    const mirror=boolean(p.mirror??false,"mirror");const history=p.history??[];
    if(!Array.isArray(history)||history.length>10000||history.some(f=>typeof f!=="string"||!new RegExp(`^[1-${n}][0-${n}]{121}$`).test(f)))throw new TypeError("Invalid history");
    return `${Number(mirror)} ${turn} ${text}${history.length?" "+history.join(" "):""}`;
  }
  class Session {
    constructor(engine) {this.engine=engine;this.options={...defaults};this.beginner=false;this.seed=0;this.players=2;}
    selectPlayers(n) {if(n!==this.players)this.request(`players ${n}`);}
    request(line) {
      if(typeof line!=="string"||line.length>1500000||! /^[\x20-\x7e]*$/.test(line))throw new TypeError("Invalid command text");
      const bytes=new TextEncoder().encode(line),m=this.engine,ptr=m._malloc(bytes.length+1);
      if(!ptr)throw new Error("Engine request allocation failed");
      try {
        m.HEAPU8.set(bytes,ptr);m.HEAPU8[ptr+bytes.length]=0;
        const result=JSON.parse(m.UTF8ToString(m._halma_request(ptr,bytes.length)));
        if(!result.ok)throw new Error(result.error||"Engine request failed");
        if(/^players /.test(line))this.players=result.players;
        return result;
      } finally {m._free(ptr);}
    }
    dispatch(method,p={}) {
      if(method==="hello") {if(p.players!==undefined)this.selectPlayers(playerCount(p));return this.request(method);}
      if(method==="clear")return this.request(method);
      if(method==="inspect"||method==="evaluate") {const pos=position(p);this.selectPlayers(playerCount(p));return this.request(`${method==="evaluate"?"eval":"inspect"} ${pos}`);}
      if(method==="request")return this.request(p.line);
      if(method==="experiment") {
        if(p.mask!=="auto")integer(p.mask,0,131071,"experiment mask");return this.request(`experiment ${p.mask}`);
      }
      if(method==="performance")return this.request(`performance ${integer(p.mask,0,15,"performance mask")}`);
      if(method==="configure") {
        for(const key of Object.keys(p))if(!(key in defaults))throw new TypeError(`Unknown configuration: ${key}`);
        const c={...this.options,...p};
        for(const [key,min,max] of [["solo_mib",4,32],["root_states",0,1000000],["root_expansions",0,1000000],
          ["leaf_states",0,1000000],["leaf_total_states",0,10000000],["leaf_ms",0,10000],["race_scale",0,100000],
          ["leaf_weight",1,8],["race_gap",0,1000]])integer(c[key],min,max,key);
        for(const key of ["root_planner","leaf_race","leaf_bidirectional","race_pruning"])boolean(c[key],key);
        const result=this.request(`configure ${c.solo_mib} ${c.root_states} ${c.root_expansions} ${c.leaf_states} ${c.leaf_total_states} ${c.leaf_ms} ${c.race_scale} ${+c.root_planner} ${+c.leaf_race} ${c.leaf_weight} ${+c.leaf_bidirectional} ${c.race_gap} ${+c.race_pruning}`);
        this.options=c;return result;
      }
      if(method==="search") {
        // Validate all input before mutating session options or entering C++.
        const pos=position(p),parts=pos.split(" "),mirror=parts.shift(),turn=parts.shift(),text=parts.shift();
        const difficulty=p.difficulty??"standard";if(!(difficulty in budgets))throw new TypeError("Invalid difficulty");
        const beginner=difficulty==="simple"||boolean(p.beginner??false,"beginner"),seed=integer(p.seed??0,0,0xffffffff,"seed");
        const preset=budgets[difficulty];const soft=integer(difficulty==="simple"?300:p.soft_ms??preset[0],0,60000,"soft_ms");
        const hard=integer(difficulty==="simple"?1000:p.hard_ms??preset[1],0,60000,"hard_ms");
        const nodes=integer(p.nodes??0,0,Number.MAX_SAFE_INTEGER,"nodes"),depth=integer(p.depth??64,1,94,"depth");
        const evaluator=integer(p.evaluator??0,0,5,"evaluator");if(evaluator===2)throw new TypeError("Unsupported evaluator");
        if((hard>0&&soft>hard)||(hard===0&&(soft!==0||nodes===0)))throw new TypeError("A hard deadline or finite node budget is required");
        const endgame=boolean(p.endgame??true,"endgame"),reference=boolean(p.reference??false,"reference");
        this.selectPlayers(playerCount(p));
        if(beginner!==this.beginner||seed!==this.seed) {this.request(`beginner ${+beginner} ${seed}`);this.beginner=beginner;this.seed=seed;}
        return this.request(`search ${mirror} ${turn} ${soft} ${hard} ${nodes} ${depth} ${evaluator} ${+endgame} ${+reference} ${text}${parts.length?" "+parts.join(" "):""}`);
      }
      throw new TypeError(`Unknown method: ${method}`);
    }
  }
  const api={Session,budgets,defaults};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.HalmaAPI=api;
})(globalThis);
