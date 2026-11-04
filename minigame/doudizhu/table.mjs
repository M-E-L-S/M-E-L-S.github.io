import {Round,ranks,legalBids,scoreStore} from './game.mjs';
import {loadRules} from './rules.mjs';
import {longestLegal} from './selection.mjs';
import {cue,isMuted,playMusic,preloadMusic,startSound,toggleSound} from './sound.mjs';

const $=s=>document.querySelector(s);
const orientation=matchMedia('(orientation: landscape)');
const controls=$('#controls'), hand=$('#hand'), overlay=$('#overlay'), start=$('#start');
const score=scoreStore(localStorage,new URL('.',location.href).pathname);
const rankLabel=r=>({T:'10',B:'小王',R:'大王'})[r]??r;
const signed=n=>n>0?'+'+n:String(n);
let game, rules, worker, uid, loaded=false, busy=false, failed=false, selected=new Set();
const calls=new Map();
let request=0;
let gesture, animating=false;
let announcedBid, roundNumber=0, intense=false;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const sound=$('#sound');
function updateSound() {
  sound.textContent=isMuted()?'♪̸':'♪';
  sound.setAttribute('aria-label',isMuted()?'开启声音':'静音');
  sound.setAttribute('aria-pressed',String(isMuted()));
}
sound.onclick=()=>{toggleSound();updateSound();};
updateSound();
function rpc(kind,...args) {
  return new Promise((resolve,reject)=>{
    const id=++request;
    calls.set(id,{resolve,reject});
    worker.postMessage({id,kind,args});
  });
}
async function init() {
  rules=await loadRules();
  worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=({data:{id,error,result}})=>{
    const job=calls.get(id);
    calls.delete(id);
    if(job) error?job.reject(Error('AI')):job.resolve(result);
  };
  worker.onerror=()=>{
    for(const job of calls.values()) job.reject(Error('AI worker'));
    calls.clear();
  };
  await rpc('ready'); loaded=true;
}
function card(rank, suit, interactive=false) {
  const el=document.createElement(interactive?'button':'span');
  el.className='card';
  if(!rank) {el.classList.add('back'); el.setAttribute('aria-hidden','true');return el;}
  if(interactive) {
    el.type='button'; el.setAttribute('aria-label',rankLabel(rank));
  } else el.setAttribute('aria-hidden','true');
  const joker=rank==='R'||rank==='B';
  if(joker) el.classList.add('joker');
  if(rank==='R'||(!joker&&suit%2===1)) el.classList.add('red');
  const value=document.createElement('span'), mark=document.createElement('span');
  value.className='rank'; value.textContent=joker?(rank==='R'?'大':'小'):rankLabel(rank);
  mark.className='mark'; mark.textContent=joker?'★':['♠','♥','♣','♦'][suit%4];
  el.append(value,mark);
  return el;
}
function showCards(container, cards, interactive=false) {
  container.style.setProperty('--count',cards.length);
  container.replaceChildren(...cards.map(({rank,suit,id})=>{
    const el=card(rank,suit,interactive);
    if(interactive) {
      el.dataset.card=id;
      el.disabled=!human();
      el.setAttribute('aria-pressed',String(selected.has(id)));
      el.onclick=event=>{
        if(event.detail!==0) return;
        selected.has(id)?selected.delete(id):selected.add(id);
        paintSelection();
      };
    }
    return el;
  }));
}
function button(label,action,{disabled=false,secondary=false,id=''}={}) {
  const el=document.createElement('button');
  el.type='button'; el.textContent=label; el.disabled=disabled; el.id=id;
  if(secondary)el.className='secondary';
  el.onclick=action;
  return el;
}
function human() {return game?.phase==='play'&&game.turn===0&&!failed&&!animating;}
function paintSelection() {
  for(const el of hand.children) el.setAttribute('aria-pressed',String(selected.has(el.dataset.card)));
  const submit=$('#submit');
  if(submit) submit.disabled=!selected.size;
  $('#notice').textContent='';
}
hand.addEventListener('pointerdown',event=>{
  const card=event.target.closest('button[data-card]');
  if(!human()||!card||!event.isPrimary||event.button!==0) return;
  const cards=[...hand.children];
  gesture={pointer:event.pointerId,cards,rects:cards.map(el=>el.getBoundingClientRect()),
    start:cards.indexOf(card),last:cards.indexOf(card),x:event.clientX,y:event.clientY,
    before:new Set(selected),visited:new Set([card.dataset.card]),drag:false,
    add:!selected.has(card.dataset.card)};
  hand.setPointerCapture(event.pointerId);
});
hand.addEventListener('pointermove',event=>{
  if(gesture?.pointer!==event.pointerId) return;
  const g=gesture;
  if(!g.drag&&Math.hypot(event.clientX-g.x,event.clientY-g.y)<7) return;
  g.drag=true;
  let index=g.rects.findLastIndex(rect=>event.clientX>=rect.left);
  index=Math.max(0,index);
  for(let i=Math.min(g.last,index);i<=Math.max(g.last,index);i++) g.visited.add(g.cards[i].dataset.card);
  g.last=index;
  for(const id of g.visited) g.add?selected.add(id):selected.delete(id);
  paintSelection();
});
function finishGesture(event,cancel) {
  if(gesture?.pointer!==event.pointerId) return;
  const g=gesture;
  gesture=null;
  if(cancel) selected=g.before;
  else if(!g.drag) {
    const id=g.cards[g.start].dataset.card;
    g.add?selected.add(id):selected.delete(id);
  } else if(g.add) {
    const faces=game.faces[0].filter(face=>selected.has(face.id));
    selected=new Set(longestLegal(rules,game.historyString(),faces));
  }
  paintSelection();
}
hand.addEventListener('pointerup',event=>finishGesture(event,false));
hand.addEventListener('pointercancel',event=>finishGesture(event,true));
hand.addEventListener('lostpointercapture',event=>finishGesture(event,true));
function sizeHand() {
  const first=hand.firstElementChild;
  if(!first) return;
  const n=hand.childElementCount, w=first.offsetWidth;
  hand.style.setProperty('--gap',Math.min(5,(hand.clientWidth-w)/Math.max(1,n-1)-w)+'px');
}
function render() {
  $('#total').value=score.total();
  if(!game) return;
  $('.seats').hidden=false;
  const inBid=game.phase==='bid'||game.landlord===null;
  const kitty=$('#kitty');
  if(inBid) kitty.replaceChildren(card(),card(),card()); else showCards(kitty,game.bottomFaces);
  const stake=$('#stake');
  stake.hidden=inBid;
  stake.textContent=game.bid+' 分 · ×'+game.multiplier;
  for(const el of document.querySelectorAll('.seat')) {
    const i=+el.dataset.seat;
    el.classList.toggle('active',game.turn===i);
    const role=el.querySelector('.role');
    role.textContent=inBid?'':i===game.landlord?'地主':'农民';
    role.classList.toggle('farmer',i!==game.landlord);
    if(i!==0) el.setAttribute('aria-label',`${i===1?'右家':'左家'}，剩余 ${game.hands[i].length} 张`);
  }
  for(const [side,seat] of [['left',2],['right',1]]) {
    const row=$('.opponent.'+side);
    const count=game.hands[seat].length;
    row.style.setProperty('--count',count);
    row.replaceChildren(...Array.from({length:count},()=>card()));
    const lastCard=row.lastElementChild;
    if(lastCard) {
      lastCard.classList.add('remaining');
      lastCard.textContent=count;
    }
  }
  $('#played').replaceChildren(...[0,1,2].map(i=>{
    const el=document.createElement('div');
    el.className='pile';
    const bid=announcedBid?.seat===i?announcedBid.value:game.bidAt(i), move=game.plays[i];
    if((inBid&&bid>=0)||move==='PASS') {
      const label=document.createElement('span'); label.className='action-label';
      label.textContent=inBid?(bid?bid+' 分':'不叫'):'不出'; el.append(label);
    } else if(move) showCards(el,move);
    return el;
  }));
  const cards=[...game.faces[0]].sort((a,b)=>ranks.indexOf(b.rank)-ranks.indexOf(a.rank)||a.suit-b.suit);
  showCards(hand,cards,true); sizeHand();
  controls.replaceChildren();
  if(game.phase==='bid'&&game.turn===0&&!animating) {
    const legal=legalBids(game.history);
    for(const n of [0,1,2,3]) controls.append(button(n?n+' 分':'不叫',()=>act(n),{disabled:!legal.includes(n),secondary:!n}));
  } else if(human()) {
    controls.append(button('不出',()=>act('PASS'),{disabled:!game.canPass,secondary:true}),
      button('出牌',()=>act(cards.filter(c=>selected.has(c.id)).map(c=>c.rank).join('')),{disabled:!selected.size,id:'submit'}));
  }
}
function fly(cards,origin,{duration=300,step=0,offset=0,flip=false}={}) {
  return [...cards].map((el,i)=>{
    const rect=el.getBoundingClientRect();
    const dx=origin?origin.x-rect.x-rect.width/2:0;
    const dy=origin?origin.y-rect.y-rect.height/2:0;
    return el.animate([{transform:`translate(${dx}px,${dy}px) ${flip?'rotateY(95deg)':'scale(.56)'}`,opacity:0},
      {transform:'none',opacity:1}],{duration,delay:offset+i*step,fill:'backwards',easing:'cubic-bezier(.2,.75,.3,1)'});
  });
}
function center(el) {
  const r=el.getBoundingClientRect();
  return {x:r.x+r.width/2,y:r.y+r.height/2};
}
async function present(kind,seat) {
  animating=true;
  render();
  const animations=[];
  if(!reduced.matches&&orientation.matches) {
    const kitty=$('#kitty');
    const pile=$('#played').children[seat];
    if(kind==='deal') {
      for(const [row,offset] of [[hand,0],[$('.opponent.left'),16],[$('.opponent.right'),32]])
        animations.push(...fly(row.children,center(kitty),{step:27,offset}));
    } else if(kind==='reveal') {
      animations.push(...fly(kitty.children,null,{flip:true,step:55}));
      const row=game.landlord===0?hand:$('.opponent.'+(game.landlord===1?'right':'left'));
      const added=game.landlord===0?[...row.children].filter(el=>game.bottomFaces.some(face=>face.id===el.dataset.card)):
        [...row.children].slice(-3);
      animations.push(...fly(added,center(kitty),{offset:320,step:40}));
    } else if(pile) {
      const source=seat===0?hand:$('.opponent.'+(seat===1?'right':'left'));
      animations.push(...fly(pile.children,kind==='play'?center(source):null,{duration:260,step:18}));
    }
  }
  cue(kind);
  await Promise.allSettled(animations.map(animation=>animation.finished));
  animating=false;
  render();
  if(game.phase==='done') {
    playMusic(game.result.winner===null?null:game.result.score>0?'win':'lose');
    settle();
  } else if(game.phase==='play'&&!intense&&game.hands.some(cards=>cards.length<=5)) {
    intense=true;
    playMusic(`intense-${roundNumber}`);
  }
}
function settle() {
  const {winner,score:points}=game.result;
  score.add(uid,points);
  $('#total').value=score.total();
  $('#result').textContent=winner===null?'流局':points>0?'胜利':'落败';
  const detail=$('#result-detail');
  detail.hidden=winner===null;
  detail.textContent=(winner===game.landlord?'地主':'农民')+'胜 · '+signed(points)+' 分';
  start.textContent=winner===null?'重新发牌':'再来一局';
  start.disabled=false;
  overlay.hidden=false;
  if(orientation.matches) start.focus({preventScroll:true});
}
async function drive() {
  if(busy||animating||failed||!game||!orientation.matches||game.phase==='done'||game.turn===0) return;
  busy=true;
  try {
    const delay=pause(1000);
    const bidding=game.phase==='bid';
    const seat=game.turn;
    const [action]=await Promise.all([bidding?rpc('bid',game.hands[seat],game.history):rpc('play',game.historyString()),delay]);
    if(bidding) {
      announcedBid={seat,value:action};
      render();
      cue('bid');
      await pause(1000);
      announcedBid=null;
    }
    if(!(bidding?game.call(action):game.play(action))) throw Error('Illegal AI action');
    if(bidding&&game.phase==='bid') render();
    else await present(bidding?(game.phase==='play'?'reveal':'bid'):(action==='PASS'?'pass':'play'),seat);
  } catch(error) {
    console.error(error);
    failed=true;
    $('#notice').textContent='本局中断';
    controls.replaceChildren(button('重新发牌',newRound));
  } finally {
    busy=false;
    void drive();
  }
}
async function act(value) {
  if(!orientation.matches||game.turn!==0||failed||animating) return;
  const bid=game.phase==='bid';
  if(!(bid?game.call(value):game.play(value,value==='PASS'?null:selected))) {
    $('#notice').textContent='这手牌不能出';
    return;
  }
  selected.clear(); $('#notice').textContent='';
  await present(bid?(game.phase==='play'?'reveal':'bid'):(value==='PASS'?'pass':'play'),0);
  void drive();
}
async function newRound() {
  if(!orientation.matches||start.disabled) return;
  startSound();
  start.disabled=true;
  const track=`game-${roundNumber%2+1}`;
  const loader=$('#loading'), panel=loader.parentElement;
  const loadingTimer=setTimeout(()=>{
    overlay.hidden=false;
    panel.classList.add('is-loading');
    loader.hidden=false;
    $('#result').textContent='载入中';
  },150);
  try {
    await Promise.all([loaded?null:init(),preloadMusic(track).catch(console.warn)]);
  } catch(error) {
    console.error(error);
    worker?.terminate();
    start.textContent='重试'; $('#result').textContent='未能加载'; start.disabled=false;
    return;
  } finally {
    clearTimeout(loadingTimer);
    panel.classList.remove('is-loading');
    loader.hidden=true;
  }
  roundNumber=roundNumber%2+1;
  intense=false;
  playMusic(track);
  start.disabled=false; failed=false;
  uid=crypto.randomUUID();
  game=new Round(rules); selected.clear();
  $('#notice').textContent='';
  overlay.hidden=true;
  await present('deal');
  void drive();
}
start.onclick=newRound;
orientation.addEventListener('change',()=>{sizeHand();void drive();});
window.addEventListener('resize',sizeHand);
window.addEventListener('storage',()=>{$('#total').value=score.total();});
render();
