let context, music, effects, source, requested, musicVersion=0;
let muted = localStorage.getItem('alphadou:muted') === '1';
const buffers = new Map();
const cacheName = 'alphadou-bgm-v1';

function tone(bus, note, at, duration, volume, type='triangle') {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = 440 * 2**((note-69)/12);
  envelope.gain.setValueAtTime(.001, at);
  envelope.gain.exponentialRampToValueAtTime(volume, at+.012);
  envelope.gain.exponentialRampToValueAtTime(.001, at+duration);
  oscillator.connect(envelope).connect(bus);
  oscillator.start(at);
  oscillator.stop(at+duration);
}

async function readTrack(name) {
  const url = new URL(`./audio/${name}.mp3`, import.meta.url);
  const cache = await globalThis.caches?.open(cacheName).catch(()=>null);
  let response = await cache?.match(url).catch(()=>null);
  if (!response) {
    response = await fetch(url,{signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error(`BGM: ${response.status}`);
    if(cache) void cache.put(url,response.clone()).catch(()=>{});
  }
  return context.decodeAudioData(await response.arrayBuffer());
}

export function preloadMusic(name) {
  if(!context||muted) return Promise.resolve(null);
  if(!buffers.has(name)) {
    // Keep decoded audio bounded. Encoded files remain in the browser cache.
    if(buffers.size>=3) buffers.delete(buffers.keys().next().value);
    const promise=readTrack(name).catch(error=>{
      if(buffers.get(name)===promise) buffers.delete(name);
      throw error;
    });
    buffers.set(name,promise);
  }
  return buffers.get(name);
}

export function playMusic(name) {
  if (requested===name) return;
  requested=name;
  const version=++musicVersion;
  source?.stop();
  source=null;
  if(!name||muted) return;
  void preloadMusic(name).then(buffer=>{
    if(!buffer||muted||version!==musicVersion) return;
    source=context.createBufferSource();
    source.buffer=buffer;
    source.loop=name.startsWith('game-')||name.startsWith('intense-');
    source.connect(music);
    source.start();
  }).catch(()=>{if(version===musicVersion) requested=null;});
}

export function startSound() {
  try {
    if (!context) {
      context = new AudioContext();
      music = context.createGain();
      effects = context.createGain();
      music.connect(context.destination);
      effects.connect(context.destination);
      applyVolume();
    }
    void context.resume().catch(()=>{});
  } catch { /* Audio availability must not interrupt play. */ }
}

function applyVolume() {
  if (!context) return;
  music.gain.value = muted ? 0 : .24;
  effects.gain.value = muted ? 0 : .4;
}
export function isMuted() { return muted; }
export function toggleSound() {
  muted = !muted;
  localStorage.setItem('alphadou:muted', muted?'1':'0');
  applyVolume();
  if (!muted) {
    startSound();
    const name=requested;
    requested=null;
    playMusic(name);
  } else {
    musicVersion++;
    source?.stop();
    source=null;
  }
}
export function cue(name) {
  if (!context || muted || context.state!=='running') return;
  const notes = {deal:[67,71,74,76],bid:[67,72],reveal:[60,67,72,76],
    play:[53,48],pass:[50],win:[67,72,76,79],lose:[64,60,55]}[name];
  notes.forEach((note,i)=>tone(effects,note,context.currentTime+.01+i*.065,.14,.16));
}
