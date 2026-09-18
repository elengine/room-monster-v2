// おへやモンスター v2 — Web Audio 完全合成（BGM/効果音・音量・トグル）

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let bgmGain: GainNode | null = null;
let bgmTimer: number | null = null;
let sfxMuted = false;
let bgmMuted = false;
let sfxVol = 0.9;
let bgmVol = 0.5;

export function unlockAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  const AC = window.AudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.connect(master);
  bgmGain = ctx.createGain(); bgmGain.connect(master);
  sfxMuted = localStorage.getItem('oheya2:sfxMuted') === '1';
  bgmMuted = localStorage.getItem('oheya2:bgmMuted') === '1';
  sfxVol = parseFloat(localStorage.getItem('oheya2:sfxVol') || '0.9');
  bgmVol = parseFloat(localStorage.getItem('oheya2:bgmVol') || '0.6');
  syncGain();
}

function syncGain(): void {
  if (sfxGain && ctx) sfxGain.gain.setTargetAtTime(sfxMuted ? 0 : sfxVol, ctx.currentTime, 0.02);
  if (bgmGain && ctx) bgmGain.gain.setTargetAtTime(bgmMuted ? 0 : bgmVol * 0.4, ctx.currentTime, 0.02);
}

export function setSfxMuted(m: boolean): void { sfxMuted = m; localStorage.setItem('oheya2:sfxMuted', m ? '1' : '0'); syncGain(); }
export function isSfxMuted(): boolean { return sfxMuted; }
export function setBgmMuted(m: boolean): void { bgmMuted = m; localStorage.setItem('oheya2:bgmMuted', m ? '1' : '0'); syncGain(); }
export function isBgmMuted(): boolean { return bgmMuted; }
export function setSfxVol(v: number): void { sfxVol = v; localStorage.setItem('oheya2:sfxVol', String(v)); syncGain(); }
export function setBgmVol(v: number): void { bgmVol = v; localStorage.setItem('oheya2:bgmVol', String(v)); syncGain(); }

type ToneOpts = { type?: OscillatorType; vol?: number; delay?: number; glide?: number };
function toneTo(dest: GainNode | null, freq: number, dur: number, o: ToneOpts = {}): void {
  if (!ctx || !dest) return;
  const t0 = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.glide) osc.frequency.linearRampToValueAtTime(o.glide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.35, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseTo(dest: GainNode | null, dur: number, freq: number, vol: number, delay = 0): void {
  if (!ctx || !dest) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0);
}

export type Sfx =
  | 'tap' | 'start' | 'spawn' | 'throw' | 'hit' | 'catch' | 'flee' | 'dex';

export function sfx(name: Sfx): void {
  unlockAudio();
  switch (name) {
    case 'tap': toneTo(sfxGain, 520, 0.09, { type: 'sine', vol: 0.25 }); break;
    case 'start': toneTo(sfxGain, 440, 0.12); toneTo(sfxGain, 660, 0.14, { delay: 0.09 }); break;
    case 'spawn': toneTo(sfxGain, 392, 0.16, { glide: 660, vol: 0.3 }); toneTo(sfxGain, 523, 0.2, { delay: 0.05, vol: 0.2 }); break;
    case 'throw': noiseTo(sfxGain, 0.16, 2400, 0.25); break;
    case 'hit': toneTo(sfxGain, 880, 0.1, { type: 'square', vol: 0.3 }); noiseTo(sfxGain, 0.08, 4000, 0.2); break;
    case 'catch': // 成功=明るい上昇アルペジオ+キラッ
      toneTo(sfxGain, 523, 0.1); toneTo(sfxGain, 659, 0.1, { delay: 0.07 });
      toneTo(sfxGain, 784, 0.16, { delay: 0.14 }); toneTo(sfxGain, 1046, 0.34, { delay: 0.2, glide: 1318, vol: 0.34 });
      noiseTo(sfxGain, 0.2, 6500, 0.12, 0.22); break;
    case 'flee': // 失敗=低音ブブー
      toneTo(sfxGain, 196, 0.16, { type: 'sawtooth', vol: 0.38 });
      toneTo(sfxGain, 147, 0.3, { delay: 0.12, type: 'sawtooth', vol: 0.38, glide: 92 }); break;
    case 'dex': toneTo(sfxGain, 660, 0.1, { type: 'sine' }); toneTo(sfxGain, 880, 0.1, { delay: 0.07, type: 'sine' }); break;
  }
}

/** 静かなアンビエントBGM */
export function startBGM(): void {
  if (!ctx || bgmTimer) return;
  unlockAudio();
  const base = [220, 277.18, 329.63, 369.99];
  let i = 0;
  const step = (): void => {
    toneTo(bgmGain, base[i % base.length] ?? 220, 1.9, { type: 'sine', vol: 0.07, glide: base[(i + 1) % base.length] ?? 220 });
    i++;
  };
  step();
  bgmTimer = window.setInterval(step, 1900);
}

export function stopBGM(): void {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
}
