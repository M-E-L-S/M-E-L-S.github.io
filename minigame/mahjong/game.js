export const names=['你','下家','对家','上家'];
export const label=t=>t<27?`${t%9+1}${['万','筒','索'][Math.floor(t/9)]}`:'东南西北白发中'[t-27];
export const notation=tiles=>[0,1,2,3].map(s=>{const a=tiles.filter(t=>Math.floor(t/9)===s).sort((a,b)=>a-b);return a.length?a.map(t=>t%9+1).join('')+'mpsz'[s]:'';}).join('');
const kinds=['chi','pon','kan','ankan','kakan'];
const meldTiles=m=>m.kind==='chi'?[m.tile,m.tile+1,m.tile+2]:Array(m.kind==='pon'?3:4).fill(m.tile);
const encode=ms=>ms.map(m=>`${kinds.indexOf(m.kind)}:${m.tile}:${m.source}`).join('|');
const parse=t=>'mpsz'.indexOf(t[1])*9+Number(t[0])-1;
export class Game {
  constructor(engine,beforeAICall=async()=>{}){this.engine=engine;this.beforeAICall=beforeAICall;this.round=0;this.scores=[0,0,0,0];}
  random(){let x=this.rng; x^=x<<13;x^=x>>>17;x^=x<<5;this.rng=x>>>0;return this.rng;}
  async new(seed=Date.now()>>>0,reset=false){
    if(reset){this.round=0;this.scores=[0,0,0,0];}
    if(this.round===0)this.dealer=0;
    else if(!this.result?.winners?.some(w=>w.player===this.dealer))this.dealer=(this.dealer+1)%4;
    this.seed=seed;this.rng=seed||1;this.round++;this.roundStart=[...this.scores];
    this.paymentsByRecipient=Array.from({length:4},()=>[0,0,0,0]);
    this.wall=Array.from({length:136},(_,i)=>Math.floor(i/4));
    for(let i=135;i>0;i--){const j=this.random()%(i+1);[this.wall[i],this.wall[j]]=[this.wall[j],this.wall[i]];}
    this.hands=Array.from({length:4},()=>[]);this.melds=Array.from({length:4},()=>[]);this.rivers=Array.from({length:4},()=>[]);
    for(let i=0;i<13;i++)for(let p=0;p<4;p++)this.hands[p].push(this.wall.pop());
    this.result=null;this.pending=null;await this.draw(this.dealer);
  }
  known(p){return [...this.rivers.flat().filter(r=>!r.claimed).map(r=>r.tile),...this.melds.flatMap((ms,q)=>q===p?[]:ms.filter(m=>m.kind!=='ankan').flatMap(meldTiles))];}
  evaluate(p,extra=null,replacement=this.replacement){return this.engine.evaluate(notation([...this.hands[p],...(extra===null?[]:[extra])]),encode(this.melds[p]),notation(this.known(p)),replacement);}
  async draw(p,replacement=false){
    if(!this.wall.length){this.finishDraw();return;}
    this.lastDraw=replacement?this.wall.shift():this.wall.pop();this.hands[p].push(this.lastDraw);
    this.turn=p;this.phase='turn';this.replacement=replacement;this.allowKong=true;this.pending=null;
    this.metrics=await this.evaluate(0,null,p===0&&replacement);
  }
  options(){
    if(this.phase==='response')return this.pending.offers;
    if(this.phase!=='turn'||this.turn!==0)return [];
    const a=[];if(this.metrics.winning)a.push({kind:'win',label:'自摸'});
    if(this.wall.length&&this.allowKong){for(let t=0;t<34;t++)if(this.hands[0].filter(x=>x===t).length===4)a.push({kind:'ankan',tile:t,label:'暗杠 '+label(t)});
    this.melds[0].forEach((m,index)=>{if(m.kind==='pon'&&this.hands[0].includes(m.tile))a.push({kind:'kakan',index,label:'加杠 '+label(m.tile)});});}
    return a;
  }
  claims(p,source,t){
    const a=[],n=this.hands[p].filter(x=>x===t).length;
    if(n>=2)a.push({kind:'pon',label:'碰'});if(n>=3&&this.wall.length)a.push({kind:'kan',label:'杠'});
    if((source+1)%4===p&&t<27)for(let start=Math.max(Math.floor(t/9)*9,t-2);start<=Math.min(t,Math.floor(t/9)*9+6);start++)if([start,start+1,start+2].filter(x=>x!==t).every(x=>this.hands[p].includes(x)))a.push({kind:'chi',start,label:'吃 '+[start,start+1,start+2].map(x=>x%9+1).join('')});
    return a;
  }
  decision(p,offered=-1,source=-1){
    const opponents=this.melds.map((ms,q)=>q===p?null:`${q}~${ms.filter(m=>m.kind==='ankan').length}~${encode(ms.filter(m=>m.kind!=='ankan'))||'-'}~${notation(this.rivers[q].map(r=>r.tile))||'-'}`).filter(Boolean).join('/');
    const rivers=this.rivers.map((rs,q)=>`${q}~${rs.map(r=>`${r.tile}:${+r.claimed}`).join(',')||'-'}`).join('/');
    return this.engine.search(notation(this.hands[p]),encode(this.melds[p]),notation(this.known(p)),`${p}:${source}:${offered}:${this.wall.length}:${+this.allowKong}`,opponents,rivers,offered<0&&this.replacement,offered<0?3000:1000,6,this.random());
  }
  async discard(p,t){if(this.phase!=='turn'||p!==this.turn||!this.hands[p].includes(t))throw Error('现在不能出这张牌');this.remove(p,t);this.rivers[p].push({tile:t,claimed:false,tsumogiri:this.lastDraw===t});await this.response(p,t);}
  remove(p,t){const i=this.hands[p].indexOf(t);if(i<0)throw Error('牌局状态异常');this.hands[p].splice(i,1);}
  async response(source,t,robbery=false){
    const wins=[],offers=[];
    for(let o=1;o<=3;o++){const p=(source+o)%4,info=await this.evaluate(p,t,false);if(info.winning){wins.push([p,info]);if(p===0)offers.push({kind:'ron',label:robbery?'抢杠胡':'胡'});}}
    if(source!==0&&!robbery&&!wins.some(([p])=>p!==0))offers.push(...this.claims(0,source,t));
    if(offers.length)offers.push({kind:'pass',label:'过'});
    this.phase='response';this.pending={source,tile:t,robbery,wins,offers};
    if(!offers.length)await this.resolve('pass');
  }
  async resolve(kind,start){
    const d=this.pending,wins=d.wins.filter(([p])=>p!==0||kind==='ron');
    if(wins.length){this.finishWin(wins,d.source,d.tile,d.robbery);return;}
    if(d.robbery){await this.completeKong(d.source,d.tile);return;}
    const calls=[];if(['chi','pon','kan'].includes(kind))calls.push({p:0,kind,start});
    for(let p=1;p<4;p++){if(p===d.source)continue;const opts=this.claims(p,d.source,d.tile);if(!opts.length)continue;
      const c=await this.decision(p,d.tile,d.source),o=opts.find(o=>o.kind===c.action&&(o.kind!=='chi'||o.start===c.sequence_start));if(o)calls.push({...o,p});}
    if(!calls.length){await this.draw((d.source+1)%4);return;}
    calls.sort((a,b)=>(+(a.kind==='chi')-+(b.kind==='chi'))||((a.p-d.source+4)%4-(b.p-d.source+4)%4));
    const c=calls[0],t=d.tile;
    if(c.p!==0)await this.beforeAICall();
    this.rivers[d.source].at(-1).claimed=true;
    const needed=c.kind==='chi'?[c.start,c.start+1,c.start+2].filter(x=>x!==t):Array(c.kind==='kan'?3:2).fill(t);
    needed.forEach(x=>this.remove(c.p,x));
    this.melds[c.p].push(c.kind==='chi'
      ? {kind:c.kind,tile:c.start,source:d.source,called_tile:t}
      : {kind:c.kind,tile:t,source:d.source});
    this.turn=c.p;this.phase='turn';this.pending=null;this.lastDraw=null;this.replacement=false;this.allowKong=false;
    if(c.kind==='kan'){this.transfer(c.p,d.source,10);await this.draw(c.p,true);}else this.metrics=await this.evaluate(0,null,false);
  }
  transfer(winner,source,amount,{dealerWin=false}={}){
    const payments=[0,0,0,0];
    for(let p=0;p<4;p++)if(p!==winner&&(source===-1||source===p)){
      const paid=amount*(p===this.dealer||dealerWin?2:1);
      payments[p]=paid;this.paymentsByRecipient[winner][p]+=paid;
      this.scores[p]-=paid;this.scores[winner]+=paid;
    }
    return payments;
  }
  async completeKong(p,t){const m=this.melds[p].find(m=>m.kind==='pon'&&m.tile===t);this.remove(p,t);m.kind='kakan';this.transfer(p,m.source,10);await this.draw(p,true);}
  async selfKong(p,kind,t,index){
    if(!this.wall.length||!this.allowKong)throw Error('现在不能开杠');
    if(kind==='ankan'){if(this.hands[p].filter(x=>x===t).length!==4)throw Error('不能暗杠');for(let n=0;n<4;n++)this.remove(p,t);this.melds[p].push({kind,tile:t,source:-1});this.transfer(p,-1,10);await this.draw(p,true);}
    else {const m=this.melds[p][index];if(m?.kind!=='pon'||!this.hands[p].includes(m.tile))throw Error('不能加杠');await this.response(p,m.tile,true);}
  }
  finishWin(wins,source,tile,robbery=false){
    const winners=wins.map(([player,info])=>{
      const payments=this.transfer(player,source,info.payment,{dealerWin:player===this.dealer});
      const patterns=[['seven_pairs','七对子'],['pure_straight','龙'],['thirteen_orphans','十三幺']].filter(([k])=>info[k]).map(([,v])=>v);
      if(source===-1&&this.replacement)patterns.push('岭上开花');
      return {player,patterns:patterns.length?patterns:['普通胡'],payment:info.payment,payments};
    });
    this.finishRound({type:'win',winners,source,tile,robbery});
  }
  finishDraw(){this.finishRound({type:'draw'});}
  finishRound(result){
    this.phase='over';this.pending=null;
    this.result={...result,delta:this.scores.map((s,p)=>s-this.roundStart[p]),paymentsByRecipient:this.paymentsByRecipient};
  }
  async action(a){
    if(a.kind==='step'){if(this.phase!=='turn'||this.turn===0)return;const p=this.turn,info=await this.evaluate(p);if(info.winning){this.finishWin([[p,info]],-1,this.lastDraw);return;}const c=await this.decision(p);if(['ankan','kakan'].includes(c.action))await this.selfKong(p,c.action,c.tile?parse(c.tile):null,c.meld_index);else await this.discard(p,parse(c.tile));return;}
    if(this.phase==='response'){if(!this.options().some(o=>Object.entries(o).every(([k,v])=>k==='label'||a[k]===v)))throw Error('无效响应');await this.resolve(a.kind,a.start);return;}
    if(this.phase!=='turn'||this.turn!==0)throw Error('尚未轮到你');
    if(a.kind==='discard')await this.discard(0,a.tile);else {if(!this.options().some(o=>Object.entries(o).every(([k,v])=>k==='label'||a[k]===v)))throw Error('无效动作');if(a.kind==='win')this.finishWin([[0,this.metrics]],-1,this.lastDraw);else await this.selfKong(0,a.kind,a.tile,a.index);}
  }
  refreshHints(){this.hints=this.engine.hints?.(notation(this.hands[0]),encode(this.melds[0]),notation(this.known(0)))||{waits:[],discards:[]};}
  view(){return {hints:this.hints||{waits:[],discards:[]},round:this.round,dealer:this.dealer,turn:this.turn,phase:this.phase,wall:this.wall.length,scores:[...this.scores],lastDraw:this.turn===0?this.lastDraw:null,options:this.options(),pending:this.pending?{source:this.pending.source,tile:this.pending.tile}:null,result:this.result,players:this.hands.map((h,p)=>({name:names[p],hasDrawn:this.phase==='turn'&&this.turn===p&&this.lastDraw!==null,count:h.length,hand:p===0?[...h]:this.phase==='over'?[...h].sort((a,b)=>a-b):null,melds:this.melds[p].map(m=>p!==0&&m.kind==='ankan'&&this.phase!=='over'?{...m,tile:null}:{...m}),river:this.rivers[p]}))};}
}
