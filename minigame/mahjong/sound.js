const bgm = new Audio(new URL('./assets/bgm.mp3', import.meta.url));
bgm.loop = true;
bgm.volume = .18;
let context, output, enabled = true;

export function unlockAudio() {
 if(!enabled)return;
 try {
  if(!context){
   context = new AudioContext();
   output = context.createGain();
   output.connect(context.destination);
  }
  if(context.state!=='running')context.resume().catch(()=>{});
 } catch {}
 if(bgm.paused)bgm.play().catch(()=>{});
}

export function toggleAudio() {
 enabled = !enabled;
 if(output)output.gain.value = enabled ? 1 : 0;
 if(enabled)unlockAudio();
 else bgm.pause();
 return enabled;
}
export function playSound(kind){
 if(!enabled||!context||context.state!=='running')return;
 const now=context.currentTime;
 function tone(frequency,delay=0,length=.07,gain=.055,type='sine'){
  const oscillator=context.createOscillator(),envelope=context.createGain();
  oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,now+delay);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(70,frequency*.65),now+delay+length);
  envelope.gain.setValueAtTime(.001,now+delay);envelope.gain.exponentialRampToValueAtTime(gain,now+delay+.006);envelope.gain.exponentialRampToValueAtTime(.001,now+delay+length);
  oscillator.connect(envelope);envelope.connect(output);oscillator.start(now+delay);oscillator.stop(now+delay+length+.01);
  oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();};
 }
 if(kind==='deal'){for(let i=0;i<4;i++)tone(760,i*.23,.055,.04,'triangle');}
 else if(kind==='discard'){tone(950,0,.045,.07,'triangle');tone(380,.025,.075,.045);}
 else if(kind==='draw')tone(620,0,.045,.03,'triangle');
 else if(kind==='call'){tone(660);tone(880,.09,.12);}
 else if(kind==='win'){[523,659,784,1047].forEach((f,i)=>tone(f,i*.12,.3,.045));}
 else if(kind==='score'){[660,740,830,990].forEach((f,i)=>tone(f,i*.16,.08,.025));}
 else if(kind==='rank'){tone(330,0,.1,.05,'triangle');tone(990,.02,.08,.025);}
 else tone(780,0,.035,.025);
}
