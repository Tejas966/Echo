// Shared Web Audio plumbing: buses, noise/impulse generation, small DSP helpers.
import type { ScreenId } from '../types';

export type NoiseKind = 'white' | 'pink' | 'brown';

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const db = (d: number) => Math.pow(10, d / 20);
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smooth = (v: number) => { const x = clamp(v); return x * x * (3 - 2 * x); };

/** A mixer bus with a dry path, a reverb-send path, a direct "wet" input, and N duck stages applied to both. */
export class Bus {
  readonly in: GainNode;      // sources connect here (dry + bus send)
  readonly wet: GainNode;     // sources connect here for extra reverb-only signal
  readonly level: GainNode;
  private ducksDry: GainNode[] = [];
  private ducksWet: GainNode[] = [];

  constructor(ctx: AudioContext, level: number, send: number, master: AudioNode, reverbIn: AudioNode, duckStages = 0) {
    this.in = ctx.createGain();
    this.wet = ctx.createGain();
    this.level = ctx.createGain();
    this.level.gain.value = level;
    const wetLevel = ctx.createGain();
    wetLevel.gain.value = level;
    let d: AudioNode = this.in;
    let w: AudioNode = this.wet;
    for (let i = 0; i < duckStages; i++) {
      const dd = ctx.createGain(); const ww = ctx.createGain();
      d.connect(dd); w.connect(ww); d = dd; w = ww;
      this.ducksDry.push(dd); this.ducksWet.push(ww);
    }
    d.connect(this.level);
    this.level.connect(master);
    const sendG = ctx.createGain();
    sendG.gain.value = send;
    this.level.connect(sendG);
    sendG.connect(reverbIn);
    w.connect(wetLevel);
    wetLevel.connect(reverbIn);
  }

  /** Params of duck stage i (dry and wet) — schedule both identically. */
  duckParams(i: number): AudioParam[] {
    return [this.ducksDry[i].gain, this.ducksWet[i].gain];
  }
}

export interface Eng {
  ctx: AudioContext;
  noise: Record<NoiseKind, AudioBuffer>;
  curves: { soft: Float32Array; hard: Float32Array; crush: Float32Array };
  reverbIn: GainNode;
  bed: Bus; tension: Bus; sfx: Bus; voice: Bus;
  screen: ScreenId;
}

// ---------- param helpers ----------
export function retarget(p: AudioParam, v: number, tc: number, at: number): void {
  const ap = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof ap.cancelAndHoldAtTime === 'function') ap.cancelAndHoldAtTime(at);
  else { p.cancelScheduledValues(at); p.setValueAtTime(p.value, at); }
  p.setTargetAtTime(v, at, Math.max(0.001, tc));
}

/** Percussive envelope: 0 → peak over `a`, then exponential-ish decay reaching ~silence after `d`. */
export function perc(p: AudioParam, t: number, a: number, peak: number, d: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(0, t + a, d / 5);
}

/** Attack / hold / release envelope (linear). */
export function ahr(p: AudioParam, t: number, a: number, peak: number, h: number, r: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setValueAtTime(peak, t + a + h);
  p.linearRampToValueAtTime(0, t + a + h + r);
}

// ---------- node helpers ----------
export function gain(ctx: BaseAudioContext, v: number, dest?: AudioNode): GainNode {
  const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g;
}
export function filt(ctx: BaseAudioContext, type: BiquadFilterType, f: number, Q = 0.707, dest?: AudioNode): BiquadFilterNode {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; if (dest) b.connect(dest); return b;
}
export function panner(ctx: BaseAudioContext, p: number, dest?: AudioNode): StereoPannerNode {
  const s = ctx.createStereoPanner(); s.pan.value = clamp(p, -1, 1); if (dest) s.connect(dest); return s;
}
export function shaper(ctx: BaseAudioContext, curve: Float32Array, dest?: AudioNode): WaveShaperNode {
  const w = ctx.createWaveShaper(); w.curve = curve as Float32Array<ArrayBuffer>; w.oversample = 'none'; if (dest) w.connect(dest); return w;
}
export function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, t0: number, t1: number | null, dest: AudioNode): OscillatorNode {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest);
  o.start(t0); if (t1 !== null) o.stop(t1);
  o.onended = () => o.disconnect();
  return o;
}
export function noise(e: Eng, kind: NoiseKind, t0: number, t1: number | null, dest: AudioNode, rate = 1): AudioBufferSourceNode {
  const s = e.ctx.createBufferSource(); s.buffer = e.noise[kind]; s.loop = true; s.playbackRate.value = rate; s.connect(dest);
  s.start(t0, Math.random() * (s.buffer.duration - 0.05)); if (t1 !== null) s.stop(t1);
  s.onended = () => s.disconnect();
  return s;
}

// ---------- generation ----------
export function makeNoise(ctx: BaseAudioContext, kind: NoiseKind, seconds = 4): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last; }
  }
  // normalise + crossfade the loop seam (avoid clicks)
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = 0.9 / (peak || 1);
  for (let i = 0; i < len; i++) d[i] *= k;
  const xf = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < xf; i++) { const a = i / xf; d[i] = d[i] * a + d[len - xf + i] * (1 - a); }
  return buf;
}

/** Stereo impulse: exponentially decaying noise that darkens over time + a few early reflections. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, bright = 0.8): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.014);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      const n = Math.random() * 2 - 1;
      const a = bright * Math.pow(1 - t, 1.5) + 0.04;
      lp += a * (n - lp);
      const fadeIn = Math.min(1, (i - pre) / (sr * 0.006));
      d[i] = lp * Math.exp(-6.9 * t) * fadeIn;
    }
    for (let r = 0; r < 7; r++) {
      const idx = pre + Math.floor(sr * rand(0.004, 0.08));
      if (idx < len) d[idx] += (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.55) * (1 - r / 9);
    }
  }
  return buf;
}

export function makeCurves(): Eng['curves'] {
  const n = 2048;
  const soft = new Float32Array(n), hard = new Float32Array(n), crush = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    soft[i] = Math.tanh(x * 2) / Math.tanh(2);
    hard[i] = Math.tanh(x * 7) / Math.tanh(7);
    crush[i] = Math.round(x * 5) / 5; // crude 3-bit-ish staircase
  }
  return { soft, hard, crush };
}

// ---------- reusable sound atoms ----------
/** Inharmonic metallic partials (bar modes). */
export function metal(e: Eng, t: number, f: number, peak: number, decay: number, dest: AudioNode): number {
  const ratios = [1, 2.32, 4.25, 6.63, 9.1];
  const amps = [1, 0.6, 0.35, 0.22, 0.12];
  ratios.forEach((r, i) => {
    const fr = f * r * rand(0.995, 1.005);
    if (fr > 16000) return;
    const g = gain(e.ctx, 0, dest);
    const d = decay * (1 - i * 0.15);
    perc(g.gain, t, 0.001, peak * amps[i], d);
    osc(e.ctx, 'sine', fr, t, t + d + 0.05, g);
  });
  return decay;
}

/** Pitch-dropping sine thump (kicks, heartbeats, impacts). */
export function thump(e: Eng, t: number, f0: number, f1: number, peak: number, decay: number, dest: AudioNode): void {
  const g = gain(e.ctx, 0, dest);
  perc(g.gain, t, 0.004, peak, decay);
  const o = osc(e.ctx, 'sine', f0, t, t + decay + 0.05, g);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + Math.min(decay, 0.25));
}

/** Short filtered noise burst. */
export function burst(e: Eng, t: number, type: BiquadFilterType, f: number, Q: number, peak: number, decay: number, dest: AudioNode, kind: NoiseKind = 'white', attack = 0.001): BiquadFilterNode {
  const g = gain(e.ctx, 0, dest);
  const b = filt(e.ctx, type, f, Q, g);
  perc(g.gain, t, attack, peak, decay);
  noise(e, kind, t, t + attack + decay + 0.05, b);
  return b;
}
