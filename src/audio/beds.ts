// Per-screen ambient beds. Each bed is a self-contained graph with its own random-event scheduler.
import type { ScreenId } from '../types';
import { Eng, gain, filt, osc, noise, panner, perc, ahr, rand, metal, thump, burst } from './core';

export interface Bed {
  screen: ScreenId;
  out: GainNode;
  /** detune params of pitched sources — dropped on blackout */
  detunes: AudioParam[];
  tick(now: number, horizon: number): void;
  stop(at: number, fade: number): void;
}

type Ev = { next: number; min: number; max: number; fire: (t: number) => void };

function makeBase(e: Eng, screen: ScreenId, fadeIn: number) {
  const ctx = e.ctx, now = ctx.currentTime;
  const out = gain(ctx, 0, e.bed.in);
  const wet = gain(ctx, 1, e.bed.wet);       // reverb-only path for distant events
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(1, now + fadeIn);
  const sources: AudioScheduledSourceNode[] = [];
  const detunes: AudioParam[] = [];
  const evs: Ev[] = [];
  let alive = true;
  const loopOsc = (type: OscillatorType, f: number, dest: AudioNode, pitched = true) => {
    const o = osc(ctx, type, f, now, null, dest); sources.push(o); if (pitched) detunes.push(o.detune); return o;
  };
  const loopNoise = (kind: 'white' | 'pink' | 'brown', dest: AudioNode, rate = 1) => {
    const n = noise(e, kind, now, null, dest, rate); sources.push(n); return n;
  };
  const lfo = (f: number, depth: number, param: AudioParam) => {
    const g = gain(ctx, depth); g.connect(param); loopOsc('sine', f, g, false); return g;
  };
  const every = (min: number, max: number, fire: (t: number) => void, first?: number) => {
    evs.push({ next: now + (first ?? rand(min, max)), min, max, fire });
  };
  const bed: Bed = {
    screen, out, detunes,
    tick(t, horizon) {
      if (!alive) return;
      for (const ev of evs) {
        if (ev.next < t - 0.5) ev.next = t + rand(0, 0.3); // throttled tab: don't burst catch-up
        while (ev.next < horizon) {
          ev.fire(Math.max(ev.next, t));
          ev.next += rand(ev.min, ev.max);
        }
      }
    },
    stop(at, fade) {
      alive = false;
      out.gain.cancelScheduledValues(at);
      out.gain.setValueAtTime(out.gain.value, at);
      out.gain.linearRampToValueAtTime(0, at + fade);
      wet.gain.setValueAtTime(1, at);
      wet.gain.linearRampToValueAtTime(0, at + fade);
      for (const s of sources) { try { s.stop(at + fade + 0.05); } catch { /* already stopped */ } }
      setTimeout(() => { out.disconnect(); wet.disconnect(); }, (fade + 4) * 1000);
    },
  };
  return { ctx, now, out, wet, loopOsc, loopNoise, lfo, every, bed };
}

/** Distant water drip: tiny rising "plink", mostly reverb. */
export function drip(e: Eng, t: number, dry: AudioNode, wet: AudioNode, level = 1): void {
  const ctx = e.ctx;
  const p = panner(ctx, rand(-0.7, 0.7));
  const g = gain(ctx, 0);
  g.connect(p);
  const dG = gain(ctx, 0.5 * level, dry); const wG = gain(ctx, 1.4 * level, wet);
  p.connect(dG); p.connect(wG);
  const f = rand(1800, 2400);
  perc(g.gain, t, 0.002, 0.6, 0.09);
  const o = osc(ctx, 'sine', f * 0.75, t, t + 0.16, g);
  o.frequency.setValueAtTime(f * 0.75, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.05);
}

function cellBed(e: Eng, fade: number): Bed {
  const b = makeBase(e, 'cell', fade);
  const { ctx, out, wet, loopOsc, loopNoise, lfo, every } = b;
  // fluorescent hum
  const hum = gain(ctx, 0.55, out);
  lfo(0.13, 0.08, hum.gain); lfo(0.37, 0.05, hum.gain);
  ([[50, 0.3], [100, 0.45], [150, 0.14], [200, 0.1], [300, 0.05], [400, 0.02]] as const).forEach(([f, a]) =>
    loopOsc('sine', f * 1.002, gain(ctx, a, hum)));
  // buzzy ballast texture
  const buzzBp = filt(ctx, 'bandpass', 1700, 5, gain(ctx, 0.7, hum));
  loopOsc('sawtooth', 100, buzzBp);
  loopNoise('white', filt(ctx, 'bandpass', 6000, 3, gain(ctx, 0.035, hum)));
  // room tone
  loopNoise('brown', filt(ctx, 'lowpass', 220, 0.7, gain(ctx, 0.35, out)));
  // the tube stutters now and then
  every(9, 22, (t) => {
    const n = Math.floor(rand(1, 4));
    let tt = t;
    hum.gain.setValueAtTime(0.55, tt);
    for (let i = 0; i < n; i++) {
      hum.gain.setValueAtTime(0.18, tt);
      tt += rand(0.03, 0.09);
      hum.gain.setValueAtTime(0.55, tt);
      tt += rand(0.04, 0.12);
    }
  });
  every(4, 9, (t) => drip(e, t, out, wet), rand(1, 3));
  // very occasional far-off knock somewhere in the building
  every(28, 55, (t) => {
    const lp = filt(ctx, 'lowpass', 260, 1, gain(ctx, 0.5, wet));
    const n = Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) thump(e, t + i * rand(0.35, 0.5), 110, 60, 0.6, 0.25, lp);
  }, rand(18, 30));
  return b.bed;
}

function archiveBed(e: Eng, fade: number): Bed {
  const b = makeBase(e, 'archive', fade);
  const { ctx, out, wet, loopOsc, loopNoise, lfo, every } = b;
  // projector-room air
  const airLp = filt(ctx, 'lowpass', 400, 0.8, gain(ctx, 0.75, out));
  lfo(0.05, 90, airLp.frequency);
  loopNoise('brown', airLp);
  loopNoise('pink', filt(ctx, 'bandpass', 1400, 0.6, gain(ctx, 0.02, out)));
  // faint electrical undertone
  const under = gain(ctx, 0.06, out);
  lfo(0.09, 0.03, under.gain);
  loopOsc('sine', 60, under); loopOsc('sine', 120.4, gain(ctx, 0.5, under));
  // paper rustles
  every(8, 15, (t) => {
    const p = panner(ctx, rand(-0.8, 0.8));
    p.connect(out); p.connect(gain(ctx, 0.5, wet));
    const grains = Math.floor(rand(4, 10));
    let tt = t;
    for (let i = 0; i < grains; i++) {
      const hp = filt(ctx, 'highpass', 2200, 0.7, p);
      const bp = filt(ctx, 'bandpass', rand(2800, 6000), 0.9, hp);
      const g = gain(ctx, 0, bp);
      perc(g.gain, tt, 0.004, rand(0.25, 0.6), rand(0.03, 0.09));
      noise(e, 'white', tt, tt + 0.15, g);
      tt += rand(0.03, 0.13);
    }
  }, rand(3, 6));
  // faint clock: tick-tock 1/s
  let tock = false;
  const clk = panner(ctx, -0.45);
  clk.connect(out); clk.connect(gain(ctx, 0.25, wet));
  every(1, 1, (t) => {
    tock = !tock;
    burst(e, t, 'bandpass', tock ? 2500 : 3300, 6, 0.9, 0.012, clk);
    burst(e, t, 'bandpass', tock ? 900 : 1100, 3, 0.25, 0.02, clk);
  }, 0.5);
  return b.bed;
}

function hallBed(e: Eng, fade: number): Bed {
  const b = makeBase(e, 'hall', fade);
  const { ctx, out, wet, loopOsc, loopNoise, lfo, every } = b;
  // machinery drone: detuned saws beating
  const lp = filt(ctx, 'lowpass', 180, 2, gain(ctx, 0.55, out));
  lfo(0.07, 40, lp.frequency);
  loopOsc('sawtooth', 41, gain(ctx, 0.35, lp));
  loopOsc('sawtooth', 41.7, gain(ctx, 0.35, lp));
  loopOsc('sawtooth', 82.3, gain(ctx, 0.14, lp));
  loopOsc('sine', 41, gain(ctx, 0.25, out));
  // ventilation air
  const air = filt(ctx, 'lowpass', 500, 0.7, gain(ctx, 0.12, out));
  loopNoise('pink', air);
  // pipe groans
  every(10, 20, (t) => {
    const p = panner(ctx, rand(-0.8, 0.8));
    const g = gain(ctx, 0, p);
    p.connect(gain(ctx, 0.5, out)); p.connect(gain(ctx, 1, wet));
    const bp = filt(ctx, 'bandpass', 200, 16, g);
    const a = rand(0.6, 1.2), h = rand(0.4, 1.0), r = rand(1.0, 1.8), end = t + a + h + r;
    ahr(g.gain, t, a, rand(0.6, 1.0), h, r);
    const f0 = rand(180, 240), f1 = rand(450, 650);
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + a + h);
    bp.frequency.exponentialRampToValueAtTime(f1 * 0.7, end);
    noise(e, 'pink', t, end + 0.1, bp);
    const so = osc(ctx, 'sawtooth', rand(55, 75), t, end + 0.1, gain(ctx, 0.35, bp));
    const sf = so.frequency.value; so.frequency.setValueAtTime(sf, t); so.frequency.linearRampToValueAtTime(sf * rand(0.85, 1.15), end);
  }, rand(4, 8));
  // distant metallic clank
  every(15, 35, (t) => {
    const lp2 = filt(ctx, 'lowpass', 1400, 0.7, panner(ctx, rand(-1, 1), gain(ctx, 0.9, wet)));
    metal(e, t, rand(140, 220), 0.25, 1.4, lp2);
    burst(e, t, 'lowpass', 500, 1, 0.5, 0.1, lp2);
  }, rand(8, 14));
  return b.bed;
}

function exitBed(e: Eng, fade: number): Bed {
  const b = makeBase(e, 'exit', fade);
  const { ctx, out, wet, loopOsc, loopNoise, lfo, every } = b;
  const drone = gain(ctx, 0.5, out);
  lfo(0.03, 0.15, drone.gain);
  loopOsc('sine', 55, gain(ctx, 0.5, drone));
  loopOsc('sine', 82.6, gain(ctx, 0.22, drone));
  loopOsc('triangle', 110.3, gain(ctx, 0.07, drone));
  const high = gain(ctx, 0.008, drone);
  lfo(0.21, 0.006, high.gain);
  loopOsc('sine', 1318.5, high);
  // cold wind
  const wg = gain(ctx, 0.22, out);
  lfo(0.04, 0.1, wg.gain);
  const bp = filt(ctx, 'bandpass', 450, 0.9, wg);
  lfo(0.06, 220, bp.frequency);
  loopNoise('pink', bp);
  // sparse cold swells (minor second, far away)
  every(12, 20, (t) => {
    const g = gain(ctx, 0, wet);
    g.connect(gain(ctx, 0.15, out));
    ahr(g.gain, t, 2.5, 0.06, 0.5, 3);
    const base = Math.random() < 0.5 ? 220 : 196;
    osc(ctx, 'sine', base, t, t + 6.2, g);
    osc(ctx, 'sine', base * 1.0595, t + 0.7, t + 6.2, g);
  }, rand(5, 8));
  return b.bed;
}

export function makeBed(e: Eng, screen: ScreenId, fade = 2): Bed {
  switch (screen) {
    case 'cell': return cellBed(e, fade);
    case 'archive': return archiveBed(e, fade);
    case 'hall': return hallBed(e, fade);
    case 'exit': return exitBed(e, fade);
  }
}
