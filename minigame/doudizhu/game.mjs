export const ranks = '3456789TJQKA2BR';
const tags = ['L','P1','P2'];
const sorted = cards => [...cards].sort((a,b)=>ranks.indexOf(a)-ranks.indexOf(b)).join('');
const randomInt = n => {
  const word = new Uint32Array(1);
  do crypto.getRandomValues(word); while (word[0] >= 2**32 - (2**32%n));
  return word[0]%n;
};
export function shuffle() {
  const deck = [...ranks].flatMap(r=>Array(r==='B'||r==='R'?1:4).fill(r));
  for (let i=deck.length-1;i>0;i--) {
    const j=randomInt(i+1); [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  return [deck.slice(0,17),deck.slice(17,34),deck.slice(34,51),deck.slice(51)].map(sorted);
}
export function legalBids(history) {
  const high=Math.max(0,...history);
  return [0,1,2,3].filter(n=>!n||n>high);
}
export function bidFeatures(hand,history,actions) {
  const count = Object.fromEntries([...ranks].map(r=>[r,[...hand].filter(c=>c===r).length]));
  const row=[...ranks].flatMap((r,i)=>Array.from({length:i<13?4:1},(_,j)=>+(j<count[r])));
  return Float32Array.from(actions.flatMap(a=>[...Array(54).fill(a),...row,...history.flatMap(v=>Array(54).fill(v))]));
}
export class Round {
  constructor(rules, deck=shuffle(), first=randomInt(3)) {
    this.rules=rules; this.initial=deck.slice(0,3); this.bottom=deck[3];
    this.hands=[...this.initial]; this.first=first; this.landlord=null;
    this.history=[-1,-1,-1]; this.moves=[]; this.phase='bid';
    this.turn=first; this.result=null; this.plays=[null,null,null];
    const suits=Object.fromEntries([...ranks].map(rank=>{
      const values=[0,1,2,3];
      for(let i=3;i>0;i--) {
        const j=randomInt(i+1); [values[i],values[j]]=[values[j],values[i]];
      }
      return [rank,values];
    }));
    const faces=deck.map(hand=>[...hand].map(rank=>{
      const suit=suits[rank].pop();
      return {rank,suit,id:rank+suit};
    }));
    this.faces=faces.slice(0,3); this.bottomFaces=faces[3];
  }
  get bidSeat() { return this.history.indexOf(-1); }
  get bid() { return Math.max(0,...this.history); }
  get multiplier() {
    const plays=this.moves.filter(([,a])=>a!=='PASS');
    const bombs=plays.filter(([,a])=>a==='BR'||(a.length===4&&new Set(a).size===1)).length;
    const winner=this.result?.winner;
    const spring=winner!=null && !(plays.some(([p])=>p!==this.landlord)&&plays.filter(([p])=>p===this.landlord).length>1);
    return Math.max(1,2*(bombs+Number(spring)));
  }
  bidAt(seat) { return this.history[(seat-this.first+3)%3]; }
  call(n) {
    if(this.phase!=='bid'||!legalBids(this.history).includes(n)) return false;
    this.history[this.bidSeat]=n;
    if(n!==3&&this.bidSeat!==-1) {
      this.turn=(this.turn+1)%3;
    } else if(!this.bid) {
      this.phase='done'; this.turn=null; this.result={winner:null,score:0};
    } else {
      this.landlord=(this.first+this.history.indexOf(this.bid))%3;
      this.turn=this.landlord; this.phase='play';
      this.hands[this.landlord]=sorted(this.hands[this.landlord]+this.bottom);
      this.faces[this.landlord].push(...this.bottomFaces);
    }
    return true;
  }
  tag(seat) { return tags[(seat-this.landlord+3)%3]; }
  historyString(full=false,action=null) {
    const parts = full
      ? tags.map((tag,i)=>tag+'+'+this.initial[(this.landlord+i)%3])
      : [this.tag(this.turn)+'+'+this.initial[this.turn]];
    parts.push('L+'+this.bottom);
    for (const [seat,move] of this.moves) parts.push(this.tag(seat)+'-'+move);
    if(action!==null) parts.push(this.tag(this.turn)+'-'+action);
    return parts.join('|');
  }
  get canPass() {
    return this.phase==='play'&&this.moves.length>0&&
      !(this.moves.at(-1)[1]==='PASS'&&this.moves.at(-2)?.[1]==='PASS');
  }
  get cannotBeat() {
    return this.canPass && this.rules.actions(this.historyString()).every(([move])=>move==='PASS');
  }
  play(cards, selectedIds=null) {
    if (this.phase!=='play'||!cards) return false;
    const action=cards==='PASS'?cards:sorted(cards), seat=this.turn;
    let hand=this.hands[seat];
    if(action!=='PASS') for(const r of action) {
      const i=hand.indexOf(r);
      if(i<0) return false;
      hand=hand.slice(0,i)+hand.slice(i+1);
    }
    const remaining=[...this.faces[seat]], played=[];
    if(action!=='PASS') for(const rank of action) {
      const i=remaining.findIndex(face=>face.rank===rank&&(!selectedIds||selectedIds.has(face.id)));
      if(i<0) return false;
      played.push(...remaining.splice(i,1));
    }
    if(!this.rules.valid(this.historyString(true,action))) return false;
    this.faces[seat]=remaining;
    this.hands[seat]=hand; this.moves.push([seat,action]); this.plays[seat]=action==='PASS'?action:played;
    if(!hand) {
      this.phase='done'; this.turn=null; this.result={winner:seat};
      const won=(seat===this.landlord)===(this.landlord===0);
      this.result.score=(won?1:-1)*this.bid*this.multiplier*(this.landlord===0?2:1);
    } else {
      this.turn=(seat+1)%3; this.plays[this.turn]=null;
    }
    return true;
  }
}

export function scoreStore(storage,scope) {
  const prefix='alphadou:score:v1:'+scope+':';
  return {
    add(id,points) {
      if(Number.isSafeInteger(points)&&points!==0&&storage.getItem(prefix+id)===null)
        storage.setItem(prefix+id,String(points));
    },
    total() {
      let points=0;
      for(let i=0;i<storage.length;i++) {
        const key=storage.key(i);
        if(key?.startsWith(prefix)) {
          const value=Number(storage.getItem(key));
          if(Number.isSafeInteger(value)) points+=value;
        }
      }
      return points;
    }
  };
}
