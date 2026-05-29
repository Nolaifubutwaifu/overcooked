// Tiny procedural sound bus using the WebAudio API.
// No sample files — every sound is synthesized.

export type SoundName =
  | 'chop'
  | 'sizzle'
  | 'ding'
  | 'fail'
  | 'click'
  | 'tick'
  | 'whoosh';

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  // Lazy-init: WebAudio needs a user gesture in many browsers.
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = (window as unknown as { AudioContext: typeof AudioContext })
      .AudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    switch (name) {
      case 'chop':    synthChop(ctx, this.master); return;
      case 'sizzle':  synthSizzle(ctx, this.master); return;
      case 'ding':    synthDing(ctx, this.master); return;
      case 'fail':    synthFail(ctx, this.master); return;
      case 'click':   synthClick(ctx, this.master); return;
      case 'tick':    synthTick(ctx, this.master); return;
      case 'whoosh':  synthWhoosh(ctx, this.master); return;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }
}

// === Synth recipes ===

function synthChop(ctx: AudioContext, dest: AudioNode): void {
  const t = ctx.currentTime;
  // short noise burst → lowpass
  const buf = whiteNoiseBuffer(ctx, 0.08);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.06);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  src.connect(lp).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.1);
}

function synthSizzle(ctx: AudioContext, dest: AudioNode): void {
  const t = ctx.currentTime;
  const buf = whiteNoiseBuffer(ctx, 0.35);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0, t);
  gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
  gain.gain.linearRampToValueAtTime(0.0, t + 0.35);
  src.connect(hp).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.36);
}

function synthDing(ctx: AudioContext, dest: AudioNode): void {
  const t = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = i === 0 ? 1175 : 1568; // D6, G6
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.07);
    g.gain.linearRampToValueAtTime(0.45, t + i * 0.07 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.4);
    osc.connect(g).connect(dest);
    osc.start(t + i * 0.07);
    osc.stop(t + i * 0.07 + 0.45);
  }
}

function synthFail(ctx: AudioContext, dest: AudioNode): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.25, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.4);
}

function synthClick(ctx: AudioContext, dest: AudioNode): void {
  const t = ctx.currentTime;
  const buf = whiteNoiseBuffer(ctx, 0.03);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  src.connect(g).connect(dest);
  src.start(t);
  src.stop(t + 0.05);
}

function synthTick(ctx: AudioContext, dest: AudioNode): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 880;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.15);
}

function synthWhoosh(ctx: AudioContext, dest: AudioNode): void {
  const t = ctx.currentTime;
  const buf = whiteNoiseBuffer(ctx, 0.25);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(2200, t + 0.22);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  src.connect(bp).connect(g).connect(dest);
  src.start(t);
  src.stop(t + 0.3);
}

function whiteNoiseBuffer(ctx: AudioContext, durSec: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
