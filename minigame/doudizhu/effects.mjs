const labels={bomb:'炸弹',rocket:'王炸',plane:'飞机',straight:'顺子',pairs:'连对'};
// Each sprite points along its direction of travel; all distances scale with the played cards.
const sprites={
  bomb:'<path d="M57 24Q61 9 70 16" fill="none" stroke="#ffd381" stroke-width="4"/><path fill="#fff6b5" d="m71 6 2 6 7-2-4 6 5 4-8-1-3 6-1-8-6-2 7-2z"/><path fill="#aa6431" d="m46 25 6-9 11 6-6 10z"/><circle cx="40" cy="46" r="23" fill="#342e3c" stroke="#ffce85" stroke-width="2"/><path d="M24 39q4-10 15-11" fill="none" stroke="#ffedc6" stroke-width="4" stroke-linecap="round"/><path d="m45 36-9 13 7-2-4 12 13-18-8 3z" fill="#ffbd65"/>',
  rocket:'<path d="m32 49 8 29 8-29" fill="var(--hot)"/><path d="m36 51 4 18 4-18" fill="#fffacf"/><path d="m30 35-11 16v8l15-9m16-15 11 16v8l-15-9" fill="var(--hot)" stroke="#fff4d4" stroke-width="1.4"/><path d="M40 4Q22 24 32 52h16Q58 24 40 4Z" fill="#f9f4dc" stroke="#402c51" stroke-width="2"/><path d="M40 4q-6 7-8 14h16Q45 9 40 4Z" fill="var(--hot)"/><circle cx="40" cy="30" r="6" fill="#204062" stroke="var(--hot)" stroke-width="2"/>',
  plane:'<path d="M3 38h30M10 43h17M17 32h13" stroke="#91ffff" stroke-width="2" stroke-linecap="round"/><path d="m72 39-25 5-15 17-6-1 7-17-13-1-6 5-4-1 4-9-4-8 4-1 8 6 11-1-9-20 7 1 18 18 22 3q7 2 1 5Z" fill="#e3fffb" stroke="#188894" stroke-width="2"/><path d="m41 37 14-2 8 3-18 2z" fill="#27708a"/>'
};
const ease='cubic-bezier(.18,.78,.24,1)';

export function specialEffect(pile,kind,reducedMotion=false) {
  const cards=[...pile.querySelectorAll('.card')];
  if(!cards.length||!labels[kind]) return [];
  const make=(parent,cls)=>{
    const el=document.createElement('span');
    el.className=cls; parent.append(el); return el;
  };
  const fx=make(pile,'special-effect '+kind);
  fx.setAttribute('role','status');
  const title=make(fx,'effect-title');
  title.textContent=labels[kind];
  const animations=[], temporary=[fx];
  // The first cards are already landing when the motif starts.
  const start=reducedMotion?0:180;
  function run(el,frames,duration,delay=0,options={}) {
    animations.push(el.animate(frames,{duration,delay:start+delay,easing:ease,fill:'both',...options}));
  }
  function sprite(type) {
    const art=make(fx,'effect-art');
    art.setAttribute('aria-hidden','true');
    art.innerHTML='<svg viewBox="0 0 80 80">'+sprites[type]+'</svg>';
    return art;
  }
  if(reducedMotion) {
    run(title,[{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.85},{opacity:0}],650);
  } else {
    run(title,[
      {opacity:0,transform:'translateY(.35em) scale(.72)'},
      {opacity:1,transform:'translateY(0) scale(1.1)',offset:.18},
      {opacity:1,transform:'scale(1)',offset:.34},
      {opacity:1,transform:'scale(1)',offset:.8},
      {opacity:0,transform:'translateY(-.16em) scale(.98)'}
    ],810,kind==='rocket'?270:190);
    // Illuminate the cards themselves. Paired ranks pulse together; a straight sweeps card by card.
    cards.forEach((card,i)=>{
      const edge=make(card,'effect-edge '+kind);
      temporary.push(edge);
      const step=kind==='pairs'?Math.floor(i/2):i;
      run(edge,[{opacity:0},{opacity:1,offset:.24},{opacity:.75,offset:.55},{opacity:0}],510,
        70+step*(kind==='pairs'?64:28));
    });

    if(kind==='bomb'||kind==='rocket') {
      const royal=kind==='rocket', impact=royal?365:255;
      if(royal) {
        for(const side of [-1,1]) {
          const ship=sprite('rocket');
          ship.style.setProperty('--hot',side<0?'#ff72b1':'#78e9ff');
          run(ship,[
            {opacity:0,transform:'translateY(.2em) scale(.5)'},
            {opacity:1,transform:`translate(${side*.18}em,-.1em) rotate(${side*16}deg)`,offset:.29},
            {opacity:1,offset:.68},
            {opacity:0,transform:`translate(${side*1.05}em,-1.5em) rotate(${side*29}deg) scale(.62)`}
          ],590,side<0?0:45);
        }
      } else {
        run(sprite('bomb'),[
          {opacity:0,transform:'translate(-.32em,-.4em) rotate(-35deg) scale(.55)'},
          {opacity:1,transform:'translateY(-.22em) rotate(10deg) scale(1.1)',offset:.53},
          {opacity:1,offset:.82},{opacity:0,transform:'scale(1.32)'}
        ],310);
      }
      // One pressure wave for the bomb, two staggered waves for the jokers.
      for(let wave=0;wave<(royal?2:1);wave++){
        run(make(fx,'effect-wave'),[{opacity:0,transform:'scale(.16)'},
          {opacity:.95,offset:.12},{opacity:0,transform:'scale(2.15)'}],510,impact+85*wave);
      }
      const rays=royal?16:12;
      for(let i=0;i<rays;i++){
        const ray=make(fx,'effect-ray');
        const angle=i*360/rays+11;
        const rotate='rotate('+angle+'deg) ';
        ray.style.color=royal?(i%2?'#ff89bb':'#acf6ff'):(i%2?'#ffaa50':'#ffed99');
        run(ray,[{opacity:0,transform:rotate+'translateX(.14em) scaleX(.25)'},
          {opacity:1,offset:.16},{opacity:0,transform:rotate+'translateX('+(1.05+(i%3)*.18)+'em) scaleX(.3)'}],425,impact+(i%3)*16);
      }
      const table=pile.closest('#table');
      if(table) {
        const force=royal?6:3;
        const frames=[[0,0],[1,-.4],[-.8,.6],[.55,-.35],[-.32,.18],[.12,-.08],[0,0]]
          .map(([x,y])=>({transform:`translate(${x*force}px,${y*force}px)`}));
        run(table,frames,royal?310:215,impact,{fill:'none',easing:'ease-in-out'});
      }
    } else if(kind==='plane') {
      // A leader and two smaller wingmen cross just above the cards.
      for(const [index,lane] of [0,-1,1].entries()){
        const jet=sprite('plane'), scale=index ? .52 : 1, y=-.4+lane*.23;
        const pose=x=>`translate(${x}em,${y}em) rotate(-9deg) scale(${scale})`;
        run(jet,[{opacity:0,transform:pose(-1.45)},{opacity:1,offset:.2},
          {opacity:1,offset:.7},{opacity:0,transform:pose(1.45)}],740,index?130:0);
      }
    } else {
      // One sweeping rail for a straight, two interlocking rails for consecutive pairs.
      for(const lane of (kind==='pairs'?[-1,1]:[1])){
        const rail=make(fx,'effect-rail');
        rail.style.setProperty('--lane',lane);
        rail.style.transformOrigin=lane<0?'right':'left';
        run(rail,[{opacity:0,transform:'scaleX(0)'},{opacity:1,transform:'scaleX(1)',offset:.45},
          {opacity:.85,offset:.72},{opacity:0,transform:'scaleX(.92)'}],770,80);
      }
    }
  }
  void Promise.allSettled(animations.map(a=>a.finished)).then(()=>temporary.forEach(el=>el.remove()));
  return animations;
}
