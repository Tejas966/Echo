// One-shot sound effect recipes. Each recipe schedules nodes from time r.t into r.out (dry+send)
// and r.wet (reverb only) and returns its length in seconds.
import type { SfxCue } from '../types';
import { Eng, gain, filt, osc, noise, panner, perc, ahr, rand, metal, thump, burst, shaper } from './core';
import { drip } from './beds';

export interface R { e: Eng; c: AudioContext; t: number; out: GainNode; wet: GainNode; reduceScares: boolean }

/** Priority (0 = most important). */
export const PRIO: Record<SfxCue, number> = {
  scare: 0, setpiece_slam: 0,
  door_open: 1, door_lock: 1, shutter: 1, blackout: 1, manifold_wrong: 1, manifold_right: 1, lift: 1,
  success: 2, fail: 2, flicker: 2, lights_on: 2, steam: 2, sparks: 2, hint: 2, fuse_out: 2, fuse_in: 2,
  burn: 2, projector: 2, intercom: 2,
  pickup: 3, scrape: 3, footsteps_far: 3,
  click: 4, valve_click: 4, keypad_beep: 4,
  hover: 5, step: 5, drip: 5, typewriter: 5,
};

export const VOICE_BUS: Partial<Record<SfxCue, true>> = { hint: true, intercom: true };

/** Minimum retrigger gap in ms (default 80). */
export const MIN_GAP: Partial<Record<SfxCue, number>> = { typewriter: 25, hover: 60, keypad_beep: 40 };

const ctxOf = (r: R) => r.c;

function relay(r: R, t: number, size = 1, dest: AudioNode = r.out): void {
  const e = r.e;
  burst(e, t, 'bandpass', 2400, 2, 0.6 * size, 0.025, dest);
  burst(e, t, 'lowpass', 900, 1, 0.5 * size, 0.06, dest);
  thump(e, t, 160, 70, 0.5 * size, 0.09, dest);
  metal(e, t, 900, 0.03 * size, 0.12, dest);
}

function sparkGrains(r: R, t: number, n: number, span: number, level = 1): void {
  const c = ctxOf(r), e = r.e;
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(Math.random(), 1.6) * span;
    const p = panner(c, rand(-0.5, 0.5), r.out);
    burst(e, tt, 'bandpass', rand(3000, 8000), 2, rand(0.2, 0.6) * level, rand(0.008, 0.035), p);
  }
}

function footstep(r: R, t: number, surface: string, level: number, dest: AudioNode, wetDest: AudioNode): void {
  const c = ctxOf(r), e = r.e;
  const j = rand(0.9, 1.1);
  const p = panner(c, rand(-0.15, 0.15), dest);
  const pw = gain(c, 1, wetDest);
  p.connect(pw);
  if (surface === 'hall') {
    thump(e, t, 120 * j, 70, 0.45 * level, 0.08, p);
    burst(e, t, 'bandpass', 2400 * j, 3, 0.18 * level, 0.03, p);
    metal(e, t, rand(360, 430), 0.035 * level, 0.35, p);
  } else if (surface === 'archive') {
    burst(e, t, 'lowpass', 380 * j, 1, 0.55 * level, 0.07, p, 'pink', 0.004);
    thump(e, t, 95 * j, 60, 0.25 * level, 0.06, p);
    burst(e, t + 0.012, 'highpass', 3500, 0.7, 0.03 * level, 0.03, p);
    if (Math.random() < 0.15) {
      const g = gain(c, 0, p); const bp = filt(c, 'bandpass', rand(500, 800), 18, g);
      ahr(g.gain, t + 0.03, 0.05, 0.5 * level, 0.04, 0.12);
      const bf = bp.frequency.value; bp.frequency.setValueAtTime(bf, t + 0.03); bp.frequency.linearRampToValueAtTime(bf * 1.3, t + 0.25);
      noise(e, 'pink', t + 0.03, t + 0.3, bp);
    }
  } else {
    burst(e, t, 'lowpass', 520 * j, 1, 0.5 * level, 0.07, p, 'white', 0.003);
    thump(e, t, 90 * j, 55, 0.28 * level, 0.06, p);
    burst(e, t + 0.008, 'highpass', 3000, 0.7, 0.05 * level, 0.025, p);
  }
}

const recipes: Record<SfxCue, (r: R) => number> = {
  hover(r) {
    const c = r.c, g = gain(c, 0, filt(c, 'lowpass', 3000, 0.7, r.out));
    perc(g.gain, r.t, 0.002, 0.07, 0.03);
    osc(c, 'sine', rand(1160, 1240), r.t, r.t + 0.06, g);
    return 0.06;
  },
  click(r) {
    burst(r.e, r.t, 'lowpass', 2000, 0.8, 0.45, 0.025, r.out);
    thump(r.e, r.t, 180, 110, 0.2, 0.04, r.out);
    return 0.08;
  },
  pickup(r) {
    const c = r.c;
    [[600, 0], [900, 0.08]].forEach(([f, dt]) => {
      const g = gain(c, 0, r.out); g.connect(gain(c, 0.4, r.wet));
      perc(g.gain, r.t + dt, 0.006, 0.24, 0.35);
      osc(c, 'triangle', f, r.t + dt, r.t + dt + 0.45, g);
      osc(c, 'sine', f * 2, r.t + dt, r.t + dt + 0.3, gain(c, 0.2, g));
    });
    burst(r.e, r.t, 'bandpass', 1500, 1, 0.1, 0.04, r.out);
    return 0.6;
  },
  success(r) {
    const c = r.c;
    // minor-sixth dyad (E4 + C5), soft and slightly eerie
    [[329.63, 0], [523.25, 0.05]].forEach(([f, dt]) => {
      const g = gain(c, 0, r.out); g.connect(gain(c, 0.8, r.wet));
      perc(g.gain, r.t + dt, 0.015, 0.13, 2.2);
      osc(c, 'sine', f, r.t + dt, r.t + 2.4, g);
      osc(c, 'triangle', f * 1.003, r.t + dt, r.t + 2.4, gain(c, 0.35, g));
      osc(c, 'sine', f * 2, r.t + dt, r.t + 1.4, gain(c, 0.08, g));
    });
    return 2.5;
  },
  fail(r) {
    const c = r.c;
    const g = gain(c, 0, filt(c, 'lowpass', 650, 1, r.out));
    ahr(g.gain, r.t, 0.006, 0.22, 0.17, 0.08);
    osc(c, 'sawtooth', 120, r.t, r.t + 0.3, g);
    osc(c, 'sawtooth', 123.5, r.t, r.t + 0.3, g);
    osc(c, 'square', 60, r.t, r.t + 0.3, gain(c, 0.3, g));
    return 0.32;
  },
  step(r) {
    footstep(r, r.t, r.e.screen, 0.6, r.out, gain(r.c, r.e.screen === 'hall' ? 0.5 : 0.2, r.wet));
    return 0.4;
  },
  door_open(r) {
    const e = r.e, c = r.c, t = r.t;
    [0, 0.08, 0.17].forEach((dt, i) => {
      burst(e, t + dt, 'bandpass', 2600 - i * 300, 5, 0.5, 0.03, r.out);
      metal(e, t + dt, 1400 + i * 120, 0.03, 0.1, r.out);
    });
    // bolt slide
    const g = gain(c, 0, r.out); const bp = filt(c, 'bandpass', 800, 3, g);
    ahr(g.gain, t + 0.25, 0.08, 0.5, 0.45, 0.15);
    bp.frequency.setValueAtTime(900, t + 0.25); bp.frequency.exponentialRampToValueAtTime(380, t + 0.95);
    noise(e, 'pink', t + 0.25, t + 1.0, bp);
    // thunk
    thump(e, t + 0.95, 75, 40, 0.8, 0.35, r.out);
    burst(e, t + 0.95, 'lowpass', 400, 1, 0.5, 0.15, r.out);
    metal(e, t + 0.95, 160, 0.06, 0.6, r.wet);
    return 1.7;
  },
  door_lock(r) {
    const e = r.e, t = r.t;
    burst(e, t, 'bandpass', 2000, 4, 0.35, 0.03, r.out);
    const t2 = t + 0.06;
    thump(e, t2, 90, 38, 1.0, 0.45, r.out);
    burst(e, t2, 'lowpass', 450, 1, 0.9, 0.16, r.out);
    metal(e, t2, 178, 0.22, 1.6, r.out);
    metal(e, t2, 178, 0.3, 2.0, r.wet);
    return 2.2;
  },
  shutter(r) {
    const e = r.e, c = r.c, t = r.t;
    const g = gain(c, 0, filt(c, 'lowpass', 700, 4, r.out));
    ahr(g.gain, t, 0.25, 0.22, 1.5, 0.25);
    const o = osc(c, 'sawtooth', 80, t, t + 2.1, g);
    o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(140, t + 1.9);
    const wob = gain(c, 4); wob.connect(o.frequency); osc(c, 'sine', 9, t, t + 2.1, wob);
    // rattle of slats
    const rg = gain(c, 0, r.out); const am = gain(c, 0, rg);
    ahr(rg.gain, t, 0.2, 0.25, 1.5, 0.3);
    am.gain.value = 0.5; const amLfo = gain(c, 0.5); amLfo.connect(am.gain); osc(c, 'square', 14, t, t + 2.1, amLfo);
    noise(e, 'white', t, t + 2.1, filt(c, 'bandpass', 900, 2, am));
    // clunk
    thump(e, t + 2.0, 70, 35, 0.9, 0.4, r.out);
    burst(e, t + 2.0, 'lowpass', 600, 1, 0.6, 0.12, r.out);
    metal(e, t + 2.0, 150, 0.12, 1.2, r.wet);
    return 3.2;
  },
  flicker(r) {
    const e = r.e, c = r.c, t = r.t;
    const g = gain(c, 0, r.out);
    const crack = filt(c, 'bandpass', 3500, 1, g);
    noise(e, 'white', t, t + 0.9, crack);
    const buzz = gain(c, 0.25, filt(c, 'bandpass', 1000, 2, g));
    osc(c, 'square', 100, t, t + 0.9, buzz);
    let tt = t;
    g.gain.setValueAtTime(0, t);
    while (tt < t + 0.8) {
      const on = rand(0.02, 0.07), off = rand(0.03, 0.12);
      g.gain.setValueAtTime(rand(0.08, 0.2), tt);
      g.gain.setValueAtTime(0, tt + on);
      tt += on + off;
    }
    return 0.9;
  },
  blackout(r) {
    const e = r.e, c = r.c, t = r.t;
    relay(r, t, 0.7);
    const lp = filt(c, 'lowpass', 800, 2, r.out);
    const g = gain(c, 0, lp);
    g.gain.setValueAtTime(0.3, t); g.gain.linearRampToValueAtTime(0.25, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 0.9);
    const o = osc(c, 'sawtooth', 100, t, t + 1, g);
    o.frequency.setValueAtTime(100, t); o.frequency.exponentialRampToValueAtTime(18, t + 0.8);
    lp.frequency.setValueAtTime(800, t); lp.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    thump(e, t + 0.6, 50, 30, 0.4, 0.8, r.wet);
    return 1.6;
  },
  lights_on(r) {
    const c = r.c, t = r.t;
    relay(r, t, 1);
    [0.1, 0.24, 0.31].forEach((dt) => {
      const g = gain(c, 0, r.out); perc(g.gain, t + dt, 0.002, 0.05, 0.05);
      osc(c, 'sine', rand(3000, 3400), t + dt, t + dt + 0.08, g);
    });
    return 0.6;
  },
  steam(r) {
    const e = r.e, c = r.c, t = r.t;
    const g = gain(c, 0, r.out); g.connect(gain(c, 0.3, r.wet));
    ahr(g.gain, t, 0.05, 0.4, 2.8, 0.9);
    const lfoG = gain(c, 0.09); lfoG.connect(g.gain); osc(c, 'sine', 6.5, t, t + 3.9, lfoG);
    const hp = filt(c, 'highpass', 3000, 0.7, g);
    noise(e, 'white', t, t + 3.9, filt(c, 'peaking', 6000, 1, hp));
    burst(e, t, 'lowpass', 1500, 0.7, 0.5, 0.6, r.out, 'pink', 0.02);
    return 4;
  },
  sparks(r) {
    const c = r.c, t = r.t;
    const zg = gain(c, 0, filt(c, 'bandpass', 2000, 1.5, r.out));
    perc(zg.gain, t, 0.003, 0.2, 0.18);
    osc(c, 'sawtooth', 120, t, t + 0.25, zg);
    sparkGrains(r, t, 24, 1.4);
    for (let i = 0; i < 3; i++) {
      const tt = t + rand(0, 1.0); const g = gain(c, 0, r.out);
      perc(g.gain, tt, 0.001, 0.12, 0.04);
      const o = osc(c, 'sine', 1800, tt, tt + 0.06, g);
      o.frequency.setValueAtTime(1800, tt); o.frequency.exponentialRampToValueAtTime(400, tt + 0.04);
    }
    return 1.6;
  },
  scrape(r) {
    const e = r.e, c = r.c, t = r.t;
    const g = gain(c, 0, r.out); g.connect(gain(c, 0.3, r.wet));
    ahr(g.gain, t, 0.08, 0.9, 0.6, 0.25);
    const stick = gain(c, 0.7, g); const slip = gain(c, 0.3); slip.connect(stick.gain);
    osc(c, 'triangle', rand(18, 26), t, t + 1, slip);
    const bp = filt(c, 'bandpass', 250, 10, stick);
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(800, t + 0.5);
    bp.frequency.exponentialRampToValueAtTime(450, t + 0.95);
    noise(e, 'pink', t, t + 1, bp);
    burst(e, t, 'lowpass', 200, 1, 0.6, 0.8, r.out, 'brown', 0.05);
    return 1.1;
  },
  manifold_wrong(r) {
    const e = r.e, c = r.c, t = r.t;
    burst(e, t, 'highpass', 2500, 0.7, 0.45, 0.7, r.out, 'white', 0.01);
    [0.05, 0.38].forEach((dt, i) => {
      thump(e, t + dt, 90, 45, 0.8 - i * 0.2, 0.3, r.out);
      metal(e, t + dt, 210 + i * 30, 0.08, 0.5, r.out);
    });
    const g = gain(c, 0, filt(c, 'lowpass', 500, 1, r.out));
    ahr(g.gain, t + 0.15, 0.05, 0.18, 0.25, 0.25);
    const o = osc(c, 'sawtooth', 110, t + 0.15, t + 0.75, g);
    o.frequency.setValueAtTime(110, t + 0.15); o.frequency.exponentialRampToValueAtTime(68, t + 0.7);
    return 1.2;
  },
  manifold_right(r) {
    const e = r.e, c = r.c, t = r.t;
    // pressure rising
    const lp = filt(c, 'lowpass', 200, 3, r.out); const g = gain(c, 0, lp);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 1.25); g.gain.linearRampToValueAtTime(0, t + 1.35);
    const o = osc(c, 'sawtooth', 55, t, t + 1.4, g);
    o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(220, t + 1.3);
    lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(1500, t + 1.3);
    const hg = gain(c, 0, r.out); hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(0.12, t + 1.3); hg.gain.linearRampToValueAtTime(0, t + 1.36);
    noise(e, 'white', t, t + 1.4, filt(c, 'highpass', 4000, 0.7, hg));
    // FM gong
    const tg = t + 1.3;
    const gg = gain(c, 0, r.out); gg.connect(gain(c, 0.8, r.wet));
    perc(gg.gain, tg, 0.004, 0.35, 5);
    const car = osc(c, 'sine', 98, tg, tg + 5.2, gg);
    const mi = gain(c, 0); mi.connect(car.frequency);
    mi.gain.setValueAtTime(300, tg); mi.gain.setTargetAtTime(15, tg, 0.8);
    osc(c, 'sine', 98 * 1.4, tg, tg + 5.2, mi);
    metal(e, tg, 196, 0.08, 3.5, gg);
    thump(e, tg, 70, 40, 0.6, 0.6, r.out);
    return 6.6;
  },
  valve_click(r) {
    [0, 0.035, 0.07].forEach((dt, i) => burst(r.e, r.t + dt, 'bandpass', 3200 - i * 200, 4, 0.35, 0.02, r.out));
    metal(r.e, r.t + 0.07, 1150, 0.03, 0.15, r.out);
    thump(r.e, r.t + 0.07, 200, 120, 0.15, 0.05, r.out);
    return 0.3;
  },
  hint(r) {
    const c = r.c, t = r.t;
    const g = gain(c, 0, r.out); g.connect(gain(c, 1.2, r.wet));
    perc(g.gain, t, 0.003, 0.16, 2.6);
    const car = osc(c, 'sine', 880, t, t + 2.8, g);
    const mi = gain(c, 0); mi.connect(car.frequency);
    mi.gain.setValueAtTime(900, t); mi.gain.setTargetAtTime(40, t, 0.3);
    osc(c, 'sine', 1760, t, t + 2.8, mi);
    osc(c, 'sine', 880 * 2.76, t, t + 1.2, gain(c, 0.12, g));
    return 2.9;
  },
  scare(r) {
    const e = r.e, c = r.c;
    if (r.reduceScares) {
      const t = r.t;
      const g = gain(c, 1, r.out); g.connect(gain(c, 0.6, r.wet));
      const s = gain(c, 0, g); ahr(s.gain, t, 0.04, 0.9, 0.05, 1.3);
      const o = osc(c, 'sine', 48, t, t + 1.5, s); o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
      burst(e, t, 'lowpass', 220, 1, 0.5, 0.7, g, 'brown', 0.03);
      return 1.6;
    }
    const t = r.t + 0.3; // after the silence
    const out = gain(c, 1.3, r.out); out.connect(gain(c, 0.7, r.wet));
    // clustered saw chord
    const lp = filt(c, 'lowpass', 6000, 1.5, out);
    lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 1.4);
    [185, 196, 207.65, 277.18, 293.66, 415.3].forEach((f) => {
      const g = gain(c, 0, lp); perc(g.gain, t, 0.004, 0.16, 1.9);
      osc(c, 'sawtooth', f * rand(0.995, 1.005), t, t + 2, g);
    });
    // noise hit
    burst(e, t, 'bandpass', 1500, 0.5, 0.8, 0.5, out);
    // FM screech rising
    const sg = gain(c, 0, filt(c, 'highpass', 600, 0.7, out));
    ahr(sg.gain, t, 0.04, 0.16, 0.35, 0.6);
    const car = osc(c, 'sine', 700, t, t + 1.1, sg);
    car.frequency.setValueAtTime(700, t); car.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
    const mi = gain(c, 600); mi.connect(car.frequency);
    const mo = osc(c, 'sine', 1050, t, t + 1.1, mi);
    mo.frequency.setValueAtTime(1050, t); mo.frequency.exponentialRampToValueAtTime(3600, t + 0.7);
    // body hit
    thump(e, t, 55, 30, 1.0, 1.1, out);
    return 2.4;
  },
  setpiece_slam(r) {
    const e = r.e, c = r.c, t = r.t;
    const out = gain(c, 1.2, r.out);
    // the main relay bank slams
    burst(e, t, 'lowpass', 3000, 0.7, 1.0, 0.3, out);
    thump(e, t, 70, 28, 1.0, 1.5, out);
    metal(e, t, 138, 0.35, 2.2, out);
    metal(e, t, 138, 0.5, 2.8, r.wet);
    [0.09, 0.17, 0.31, 0.46].forEach((dt, i) => relay(r, t + dt, 0.8 - i * 0.15, out));
    // hum overdrive
    const hg = gain(c, 0, filt(c, 'lowpass', 2500, 1, out)); hg.connect(gain(c, 0.5, r.wet));
    ahr(hg.gain, t + 0.05, 0.25, 0.22, 1.6, 1.6);
    const sh = shaper(c, e.curves.hard, hg);
    const pre = gain(c, 0.8, sh);
    const o1 = osc(c, 'sawtooth', 50, t, t + 3.6, pre);
    const o2 = osc(c, 'sawtooth', 100.6, t, t + 3.6, gain(c, 0.6, pre));
    [o1, o2].forEach((o) => { o.detune.setValueAtTime(0, t); o.detune.linearRampToValueAtTime(150, t + 1.8); o.detune.linearRampToValueAtTime(-300, t + 3.5); });
    return 4;
  },
  lift(r) {
    const e = r.e, c = r.c, t = r.t;
    relay(r, t, 0.8);
    thump(e, t + 0.1, 60, 35, 0.8, 0.6, r.out);
    // cable groan
    const g = gain(c, 0, r.out); g.connect(gain(c, 0.6, r.wet));
    ahr(g.gain, t + 0.3, 1.2, 0.5, 3.5, 2.0);
    const bp = filt(c, 'bandpass', 300, 8, g);
    bp.frequency.setValueAtTime(260, t); bp.frequency.linearRampToValueAtTime(420, t + 3); bp.frequency.linearRampToValueAtTime(220, t + 7);
    const o = osc(c, 'sawtooth', 52, t, t + 7.2, bp);
    const vib = gain(c, 3); vib.connect(o.frequency); osc(c, 'sine', 0.7, t, t + 7.2, vib);
    noise(e, 'pink', t, t + 7.2, gain(c, 0.3, bp));
    // creaks
    for (let i = 0; i < 3; i++) {
      const tt = t + rand(1, 5.5); const cg = gain(c, 0, r.out); const cb = filt(c, 'bandpass', rand(500, 900), 20, cg);
      ahr(cg.gain, tt, 0.05, 0.6, 0.15, 0.2); const cf = cb.frequency.value; cb.frequency.setValueAtTime(cf, tt); cb.frequency.linearRampToValueAtTime(cf * 1.4, tt + 0.4);
      noise(e, 'white', tt, tt + 0.45, cb);
    }
    // descending drone
    const dg = gain(c, 0, r.out); dg.connect(gain(c, 0.8, r.wet));
    ahr(dg.gain, t + 0.5, 2.0, 0.18, 3.0, 2.0);
    const d1 = osc(c, 'sine', 110, t, t + 7.6, dg); d1.frequency.setValueAtTime(110, t + 0.5); d1.frequency.exponentialRampToValueAtTime(55, t + 7);
    const d2 = osc(c, 'triangle', 165, t, t + 7.6, gain(c, 0.3, dg)); d2.frequency.setValueAtTime(165, t + 0.5); d2.frequency.exponentialRampToValueAtTime(82, t + 7);
    return 7.8;
  },
  keypad_beep(r) {
    const c = r.c, t = r.t;
    const g = gain(c, 0, filt(c, 'lowpass', 2500, 0.7, r.out));
    ahr(g.gain, t, 0.003, 0.12, 0.05, 0.02);
    osc(c, 'sine', 1320, t, t + 0.09, g);
    osc(c, 'square', 1320, t, t + 0.09, gain(c, 0.15, g));
    burst(r.e, t, 'bandpass', 2500, 2, 0.15, 0.01, r.out);
    return 0.1;
  },
  fuse_out(r) {
    const e = r.e, c = r.c, t = r.t;
    burst(e, t, 'bandpass', 2000, 1, 0.7, 0.05, r.out);
    const g = gain(c, 0, filt(c, 'lowpass', 3000, 1, r.out));
    perc(g.gain, t, 0.002, 0.12, 0.3);
    const o = osc(c, 'sawtooth', 2000, t, t + 0.35, g); o.frequency.setValueAtTime(2000, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.28);
    sparkGrains(r, t, 6, 0.4, 0.7);
    burst(e, t + 0.12, 'bandpass', 3000, 3, 0.3, 0.02, r.out);
    return 0.6;
  },
  fuse_in(r) {
    const e = r.e, c = r.c, t = r.t;
    burst(e, t, 'bandpass', 2800, 4, 0.4, 0.02, r.out);
    burst(e, t + 0.06, 'bandpass', 2200, 4, 0.5, 0.03, r.out);
    thump(e, t + 0.06, 150, 90, 0.25, 0.06, r.out);
    sparkGrains(r, t + 0.06, 3, 0.1, 0.5);
    const g = gain(c, 0, filt(c, 'lowpass', 900, 1, r.out));
    ahr(g.gain, t + 0.1, 0.3, 0.12, 0.1, 0.3);
    const o = osc(c, 'sawtooth', 60, t + 0.1, t + 0.85, g); o.frequency.setValueAtTime(60, t + 0.1); o.frequency.exponentialRampToValueAtTime(100, t + 0.45);
    return 0.9;
  },
  burn(r) {
    const e = r.e, c = r.c, t = r.t;
    const g = gain(c, 0, r.out); g.connect(gain(c, 0.3, r.wet));
    ahr(g.gain, t, 0.5, 0.45, 0.8, 1.2);
    const lp = filt(c, 'lowpass', 300, 1.2, g);
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(2500, t + 0.6); lp.frequency.exponentialRampToValueAtTime(700, t + 2.5);
    noise(e, 'pink', t, t + 2.6, lp);
    burst(e, t, 'lowpass', 400, 1, 0.5, 2.0, r.out, 'brown', 0.3);
    for (let i = 0; i < 30; i++) {
      const tt = t + 0.2 + Math.random() * 2.3;
      burst(e, tt, 'bandpass', rand(2000, 5000), 2, rand(0.1, 0.4), rand(0.005, 0.02), panner(c, rand(-0.3, 0.3), r.out));
    }
    return 2.8;
  },
  projector(r) {
    const e = r.e, c = r.c, t = r.t;
    burst(e, t, 'bandpass', 1800, 3, 0.5, 0.03, r.out);
    thump(e, t, 150, 80, 0.4, 0.07, r.out);
    burst(e, t + 0.22, 'bandpass', 1400, 3, 0.4, 0.04, r.out);
    thump(e, t + 0.22, 120, 70, 0.35, 0.08, r.out);
    const g = gain(c, 0, r.out); ahr(g.gain, t + 0.05, 0.2, 0.12, 1.0, 0.6);
    const am = gain(c, 0.5, g); const lf = gain(c, 0.5); lf.connect(am.gain); osc(c, 'square', 24, t, t + 2, lf);
    noise(e, 'white', t, t + 2, filt(c, 'bandpass', 1200, 1.5, am));
    osc(c, 'sine', 120, t, t + 2, gain(c, 0.3, g));
    return 2;
  },
  intercom(r) {
    const e = r.e, c = r.c, t = r.t;
    burst(e, t, 'bandpass', 2000, 3, 0.4, 0.02, r.out);
    const g = gain(c, 0, filt(c, 'bandpass', 1200, 0.8, r.out));
    ahr(g.gain, t + 0.02, 0.05, 0.25, 0.3, 0.3);
    noise(e, 'white', t, t + 0.7, gain(c, 0.6, g));
    osc(c, 'sawtooth', 60, t, t + 0.7, gain(c, 0.4, g));
    const fb = gain(c, 0, r.out); ahr(fb.gain, t + 0.1, 0.25, 0.035, 0.05, 0.4);
    osc(c, 'sine', 1650, t, t + 0.85, fb);
    burst(e, t + 0.7, 'bandpass', 1800, 3, 0.25, 0.02, r.out);
    return 0.9;
  },
  drip(r) {
    drip(r.e, r.t, r.out, r.wet, 1.2);
    return 0.4;
  },
  footsteps_far(r) {
    const c = r.c, t = r.t;
    const lp = filt(c, 'lowpass', 300, 0.7);
    const p = panner(c, -0.7, lp);
    const dry = gain(c, 0.25, r.out); const wet = gain(c, 1.2, r.wet);
    lp.connect(dry); lp.connect(wet);
    p.pan.linearRampToValueAtTime(0.6, t + 3.2);
    const sink = gain(c, 0);
    for (let i = 0; i < 6; i++) footstep(r, t + i * rand(0.52, 0.6), 'hall', 1.4, p, sink);
    return 4;
  },
  typewriter(r) {
    const e = r.e, t = r.t;
    burst(e, t, 'highpass', 2000, 0.7, 0.18 * rand(0.7, 1), 0.012, r.out);
    burst(e, t, 'bandpass', rand(800, 1000), 2, 0.15, 0.03, r.out);
    thump(e, t + 0.005, 220, 140, 0.05, 0.03, r.out);
    return 0.08;
  },
};

export function playRecipe(cue: SfxCue, r: R): number {
  const fn = recipes[cue];
  return fn ? fn(r) : 0;
}
