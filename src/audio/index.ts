// Web Audio engine for The Room That Fights Back (docs/04). Pure synthesis, no asset files.
import type { AudioAPI, ScreenId, SfxCue, Tone } from '../types';
import {
  Eng, Bus, db, rand, pick, clamp, smooth, gain, filt, osc, noise, panner, perc, shaper, retarget,
  makeNoise, makeImpulse, makeCurves,
} from './core';
import { Bed, makeBed } from './beds';
import { PRIO, VOICE_BUS, MIN_GAP, playRecipe } from './sfx';

/** Debug handle for the test page (not part of AudioAPI). */
export const audioDebug: { ctx: AudioContext | null; tap: AnalyserNode | null } = { ctx: null, tap: null };

// reverb mix per screen: [small room, large hall]
const REVERB_MIX: Record<ScreenId, [number, number]> = {
  cell: [1, 0.1], archive: [0.6, 0.4], hall: [0.15, 1], exit: [0, 1.15],
};

// Warden voice formants (vowel-ish pairs)
const VOWELS: [number, number][] = [[800, 1200], [400, 2000], [300, 2300], [480, 850], [350, 700], [600, 1700], [520, 1450]];
const DARK_VOWELS: [number, number][] = [[480, 850], [350, 700], [400, 1000], [600, 1050]];

interface Active { cue: SfxCue; prio: number; end: number; slot: GainNode }

export function createAudio(): AudioAPI {
  let E: Eng | null = null;
  let initing: Promise<void> | null = null;

  // settings held before/after init
  let screen: ScreenId | null = null;
  let tensionTarget = 0;
  let tensionNow = 0;
  let thinking = false;
  let blind = false;
  let master = 0.8;
  let muted = false;
  let reduceScares = false;

  // engine internals
  let masterGain: GainNode;
  let scareGate: GainNode;
  let revSmall: GainNode, revLarge: GainNode;
  let bed: Bed | null = null;
  let blackedOut = false;
  const active: Active[] = [];
  const lastCueAt: Partial<Record<SfxCue, number>> = {};
  const hoverTimes: number[] = [];

  // tension layer params
  let tSub: GainNode, tPad: GainNode, tPadLp: BiquadFilterNode, tWhine: GainNode, tBeat: GainNode;
  let nextBeat = 0;
  // voice
  let presence: GainNode;
  let lastBlipAt = -1;
  let phrasePitch = 1;
  let staticGain: GainNode;
  let nextChatter = 0;
  let timer: number | undefined;

  const now = () => (E ? E.ctx.currentTime : 0);

  function applyMaster(): void {
    if (!E) return;
    retarget(masterGain.gain, muted ? 0 : db(-3) * clamp(master), 0.05, now());
  }

  function applyReverb(s: ScreenId): void {
    if (!E) return;
    const [a, b] = REVERB_MIX[s];
    retarget(revSmall.gain, a, 0.6, now());
    retarget(revLarge.gain, b, 0.6, now());
  }

  function applyTension(): void {
    if (!E) return;
    const t = now(), x = tensionTarget;
    const tc = 0.33; // ~1 s to settle
    retarget(tSub.gain, smooth((x - 20) / 60) * 1.0, tc, t);
    retarget(tPad.gain, smooth((x - 40) / 50) * 0.9, tc, t);
    retarget(tPadLp.frequency, 300 + 1500 * clamp((x - 40) / 60), tc, t);
    retarget(tWhine.gain, smooth((x - 75) / 25) * 0.02, tc * 1.5, t);
  }

  function startBed(s: ScreenId, fade: number): void {
    if (!E) return;
    const t = now();
    if (bed) bed.stop(t, fade);
    bed = makeBed(E, s, fade);
    if (blackedOut) bed.detunes.forEach((p) => p.setValueAtTime(-2400, t));
  }

  function duckBed(stage: number, v: number, at: number, hold: number, attack = 0.04, release = 0.35): void {
    if (!E) return;
    for (const p of E.bed.duckParams(stage)) {
      retarget(p, v, attack, at);
      if (hold >= 0) p.setTargetAtTime(1, at + hold, release);
    }
  }

  // ---------- scheduler (random bed events, heartbeat, chatter) ----------
  function tick(): void {
    if (!E) return;
    const t = now(), horizon = t + 0.15;
    // smoothed tension for discrete layers
    tensionNow += (tensionTarget - tensionNow) * 0.06;
    bed?.tick(t, horizon);
    // heartbeat
    if (tensionNow >= 55) {
      const bpm = 60 + 50 * clamp((tensionNow - 55) / 45);
      const lvl = 0.35 + 0.65 * smooth((tensionNow - 55) / 30);
      if (nextBeat < t - 0.3) nextBeat = t + 0.05;
      while (nextBeat < horizon) {
        heartbeat(Math.max(nextBeat, t), lvl, bpm);
        nextBeat += 60 / bpm;
      }
    } else nextBeat = 0;
    // thinking chatter
    if (thinking) {
      if (nextChatter < t - 0.3) nextChatter = t + 0.02;
      while (nextChatter < horizon) {
        chatter(Math.max(nextChatter, t));
        nextChatter += Math.random() < 0.25 ? rand(0.25, 0.5) : rand(0.05, 0.14);
      }
    }
    // prune finished sfx
    for (let i = active.length - 1; i >= 0; i--) if (active[i].end < t) active.splice(i, 1);
  }

  function heartbeat(t: number, lvl: number, bpm: number): void {
    if (!E) return;
    const c = E.ctx;
    const gap = Math.max(0.17, 0.3 * (60 / bpm));
    [[0, 1], [gap, 0.7]].forEach(([dt, a]) => {
      const tt = t + dt;
      const g = gain(c, 0, tBeat);
      perc(g.gain, tt, 0.008, lvl * a, 0.22);
      const o = osc(c, 'sine', 62, tt, tt + 0.3, g);
      o.frequency.setValueAtTime(62, tt); o.frequency.exponentialRampToValueAtTime(38, tt + 0.15);
      // harmonic so small speakers hear it
      const h = gain(c, 0, filt(c, 'lowpass', 300, 0.7, tBeat));
      perc(h.gain, tt, 0.006, lvl * a * 0.3, 0.12);
      const o2 = osc(c, 'triangle', 115, tt, tt + 0.2, h);
      o2.frequency.setValueAtTime(115, tt); o2.frequency.exponentialRampToValueAtTime(70, tt + 0.1);
    });
  }

  function chatter(t: number): void {
    if (!E) return;
    const c = E.ctx;
    const lvl = tensionNow < 15 ? 0.02 : 0.035;
    const p = panner(c, rand(-0.6, 0.6), E.voice.in);
    const g = gain(c, 0, p);
    perc(g.gain, t, 0.002, lvl, rand(0.012, 0.03));
    osc(c, 'sine', pick([2000, 2400, 2667, 3000, 3200, 3600, 4000]) * rand(0.99, 1.01), t, t + 0.05, g);
  }

  // ---------- init ----------
  async function doInit(): Promise<void> {
    const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 2; limiter.ratio.value = 20;
    limiter.attack.value = 0.002; limiter.release.value = 0.18;
    const ceiling = gain(ctx, db(-3)); // compressor adds ~+4.5 dB makeup → ≈ -6 dBFS ceiling
    limiter.connect(ceiling);
    const tap = ctx.createAnalyser(); tap.fftSize = 2048;
    ceiling.connect(tap);
    ceiling.connect(ctx.destination);

    scareGate = gain(ctx, 1, limiter);
    masterGain = gain(ctx, 0, scareGate);

    const reverbIn = gain(ctx, 1);
    const curves = makeCurves();
    const smallConv = ctx.createConvolver(); smallConv.buffer = makeImpulse(ctx, 2.2, 0.75);
    const largeConv = ctx.createConvolver(); largeConv.buffer = makeImpulse(ctx, 4.2, 0.6);
    revSmall = gain(ctx, 0); revLarge = gain(ctx, 0);
    const revOut = gain(ctx, 0.55, masterGain);
    reverbIn.connect(revSmall); revSmall.connect(smallConv); smallConv.connect(revOut);
    reverbIn.connect(revLarge); revLarge.connect(largeConv); largeConv.connect(revOut);
    // keep low mud out of the reverb
    const e: Eng = {
      ctx,
      noise: { white: makeNoise(ctx, 'white'), pink: makeNoise(ctx, 'pink'), brown: makeNoise(ctx, 'brown', 5) },
      curves,
      reverbIn,
      bed: new Bus(ctx, db(-10), 0.35, masterGain, reverbIn, 3),
      tension: new Bus(ctx, db(-20), 0.25, masterGain, reverbIn, 0),
      sfx: new Bus(ctx, db(-10), 0.22, masterGain, reverbIn, 0),
      voice: new Bus(ctx, db(-8), 0.18, masterGain, reverbIn, 0),
      screen: screen ?? 'cell',
    };
    E = e;
    audioDebug.ctx = ctx; audioDebug.tap = tap;
    const t = ctx.currentTime;

    // tension layers (always running, gain-controlled)
    tSub = gain(ctx, 0, e.tension.in);
    osc(ctx, 'sine', 32, t, null, tSub);
    osc(ctx, 'sine', 64.3, t, null, gain(ctx, 0.25, tSub));
    tPad = gain(ctx, 0, e.tension.in);
    const padTremNode = gain(ctx, 0.8, tPad);
    const padTrem = gain(ctx, 0.2); padTrem.connect(padTremNode.gain);
    osc(ctx, 'sine', 0.11, t, null, padTrem);
    tPadLp = filt(ctx, 'lowpass', 300, 2.5, padTremNode);
    [110, 116.54, 123.47].forEach((f, i) => {
      osc(ctx, 'sawtooth', f, t, null, gain(ctx, 0.22, tPadLp)).detune.value = (i - 1) * 6;
      osc(ctx, 'sawtooth', f * 0.5, t, null, gain(ctx, 0.12, tPadLp)).detune.value = (1 - i) * 5;
    });
    tWhine = gain(ctx, 0, e.tension.in);
    const wo = osc(ctx, 'sine', 7800, t, null, tWhine);
    const wv = gain(ctx, 60); wv.connect(wo.frequency); osc(ctx, 'sine', 0.3, t, null, wv);
    tBeat = gain(ctx, 1.6, e.tension.in);

    // Warden presence hum (swells with speech)
    presence = gain(ctx, 0, e.voice.in);
    const pLp = filt(ctx, 'lowpass', 280, 0.8, presence);
    osc(ctx, 'sine', 55, t, null, pLp);
    osc(ctx, 'triangle', 82.4, t, null, gain(ctx, 0.35, pLp));
    osc(ctx, 'sawtooth', 110.2, t, null, gain(ctx, 0.12, pLp));

    // blind: detuned radio static
    staticGain = gain(ctx, 0, e.voice.in);
    const st = gain(ctx, 0.6, filt(ctx, 'bandpass', 1800, 0.6, staticGain));
    const crackle = gain(ctx, 0.5); crackle.connect(st.gain);
    noise(e, 'brown', t, null, crackle, 3);
    noise(e, 'white', t, null, filt(ctx, 'highpass', 300, 0.7, st));
    const wh = gain(ctx, 0.05, staticGain);
    const w1 = osc(ctx, 'sine', 1200, t, null, wh); osc(ctx, 'sine', 1207, t, null, wh);
    const wvib = gain(ctx, 25); wvib.connect(w1.frequency); osc(ctx, 'sine', 0.4, t, null, wvib);

    applyMaster();
    applyReverb(e.screen);
    applyTension();
    tensionNow = tensionTarget;
    if (blind) retarget(staticGain.gain, 0.22, 0.2, t);
    startBed(e.screen, 2.5);
    screen = e.screen;
    timer = window.setInterval(tick, 50);
    // browsers may suspend the context; recover on next interaction
    const wake = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => undefined); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    void timer;
  }

  // ---------- sfx dispatch ----------
  function sfx(cue: SfxCue, opts?: { volume?: number }): void {
    if (!E) return;
    const e = E, c = e.ctx, t = c.currentTime;
    const ms = performance.now();
    const gap = MIN_GAP[cue] ?? 80;
    const last = lastCueAt[cue];
    if (last !== undefined && ms - last < gap) return;
    if (cue === 'hover') {
      while (hoverTimes.length && ms - hoverTimes[0] > 1000) hoverTimes.shift();
      if (hoverTimes.length >= 4) return;
      hoverTimes.push(ms);
    }
    const prio = PRIO[cue] ?? 3;
    // voice limiting
    for (let i = active.length - 1; i >= 0; i--) if (active[i].end < t) active.splice(i, 1);
    if (active.length >= 10) {
      let worst = -1;
      for (let i = 0; i < active.length; i++) if (worst < 0 || active[i].prio > active[worst].prio) worst = i;
      if (worst < 0 || active[worst].prio < prio || (active[worst].prio === prio && prio >= 4)) return;
      const victim = active.splice(worst, 1)[0];
      retarget(victim.slot.gain, 0, 0.02, t);
      setTimeout(() => victim.slot.disconnect(), 300);
    }
    lastCueAt[cue] = ms;

    const bus = VOICE_BUS[cue] ? e.voice : e.sfx;
    const vol = clamp(opts?.volume ?? 1, 0, 2);
    const slot = gain(c, vol, bus.in);
    const wet = gain(c, vol, bus.wet);
    const start = t + 0.005;
    let dur = playRecipe(cue, { e, c, t: start, out: slot, wet, reduceScares });

    // side effects on the mix
    if (cue === 'scare') {
      if (!reduceScares) {
        // 300 ms of near silence, then everything returns under the stinger
        retarget(scareGate.gain, 0.03, 0.025, t);
        scareGate.gain.setValueAtTime(0.03, start + 0.29);
        scareGate.gain.linearRampToValueAtTime(1, start + 0.3);
        duckBed(1, db(-9), start + 0.3, 2.0, 0.01, 0.6);
      } else duckBed(1, db(-6), t, 1.2);
    } else if (cue === 'setpiece_slam') {
      duckBed(1, db(-9), t, 2.5, 0.01, 0.6);
    } else if (cue === 'blackout') {
      blackedOut = true;
      bed?.detunes.forEach((p) => retarget(p, -2400, 0.2, t));
      duckBed(2, db(-12), t, -1, 0.25);
    } else if (cue === 'lights_on') {
      blackedOut = false;
      bed?.detunes.forEach((p) => retarget(p, 0, 0.12, t + 0.08));
      duckBed(2, 1, t + 0.08, -1, 0.3);
    } else if (cue === 'flicker' && !blackedOut) {
      // the bed hum stutters with the crackle
      const ps = e.bed.duckParams(2);
      let tt = start;
      while (tt < start + 0.75) {
        const on = rand(0.03, 0.09), off = rand(0.02, 0.08);
        ps.forEach((p) => p.setValueAtTime(0.3, tt));
        ps.forEach((p) => p.setValueAtTime(1, tt + off));
        tt += on + off;
      }
    } else if (prio <= 1) {
      duckBed(1, db(-6), t, 1.0);
    }

    dur = Math.max(dur, 0.05);
    active.push({ cue, prio, end: start + dur, slot });
    setTimeout(() => { slot.disconnect(); wet.disconnect(); }, (dur + 3) * 1000);
  }

  // ---------- Warden voice ----------
  function blip(tone: Tone): void {
    if (!E) return;
    const e = E, c = e.ctx, t = c.currentTime + 0.003;
    if (t - lastBlipAt < 0.018) return;
    const sinceLast = t - lastBlipAt;
    lastBlipAt = t;
    // phrase intonation: random walk, reset after a pause
    if (sinceLast > 0.45) phrasePitch = rand(1.02, 1.08);
    else phrasePitch = clamp(phrasePitch * rand(0.97, 1.025), 0.88, 1.12);

    // presence hum + bed duck while speaking (fade ~400 ms after last blip)
    const pres = tone === 'cold' ? 0.22 : tone === 'rattled' ? 0.12 : 0.16;
    retarget(presence.gain, pres, 0.08, t);
    presence.gain.setTargetAtTime(0, t + 0.4, 0.15);
    duckBed(0, db(-8), t, 0.4, 0.06, 0.25);

    // ~12% of characters are near-silent (word gaps / breath)
    const quiet = Math.random() < 0.12 ? 0.25 : 1;
    let f: number, type: OscillatorType = 'sawtooth', dur = rand(0.025, 0.04), bend = 1, vowel = pick(VOWELS), lvl = 0.6;
    switch (tone) {
      case 'polite': f = 180 * phrasePitch; bend = rand(1.0, 1.06); break;
      case 'mocking': f = 150 * phrasePitch; bend = rand(0.82, 0.92); dur = rand(0.03, 0.045); break;
      case 'rattled': f = rand(140, 260); type = 'square'; bend = rand(0.8, 1.25); lvl = 0.5; break;
      case 'cold': default: f = 110 * phrasePitch; type = 'triangle'; vowel = pick(DARK_VOWELS); dur = rand(0.035, 0.05); lvl = 0.75; break;
    }
    f *= rand(0.97, 1.03);
    const p = panner(c, rand(-0.08, 0.08), e.voice.in);
    const wetSend = gain(c, 0.25, e.voice.wet);
    p.connect(wetSend);
    let dest: AudioNode = p;
    if (tone === 'rattled') {
      const sh = shaper(c, e.curves.crush, filt(c, 'lowpass', 3500, 0.7, p));
      dest = gain(c, 1.3, sh);
    }
    const env = gain(c, 0, dest);
    const a = 0.004;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(lvl * quiet, t + a);
    env.gain.setValueAtTime(lvl * quiet, t + dur * 0.6);
    env.gain.linearRampToValueAtTime(0, t + dur);
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * bend, t + dur);
    const fm = vowel.map((v) => v * rand(0.94, 1.06) * (tone === 'cold' ? 0.85 : 1));
    const f1 = filt(c, 'bandpass', fm[0], 7, gain(c, 2.6, env));
    const f2 = filt(c, 'bandpass', fm[1], 9, gain(c, 1.8, env));
    const body = filt(c, 'lowpass', 700, 0.7, gain(c, 0.02, env));
    o.connect(f1); o.connect(f2); o.connect(body);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => o.disconnect();
    // consonant tick on some characters
    if (Math.random() < 0.22) {
      const ng = gain(c, 0, dest);
      perc(ng.gain, t, 0.001, 0.12 * quiet, 0.012);
      noise(e, 'white', t, t + 0.03, filt(c, 'highpass', tone === 'cold' ? 2500 : 4000, 0.7, ng));
    }
    // rattled: occasional glitch stutter
    if (tone === 'rattled' && Math.random() < 0.12) {
      const g2 = gain(c, 0, dest);
      const t2 = t + dur + 0.012;
      perc(g2.gain, t2, 0.002, 0.25, 0.03);
      osc(c, 'square', rand(300, 700), t2, t2 + 0.04, filt(c, 'bandpass', rand(900, 2000), 5, g2));
    }
    // cold: faint breathy shadow an octave down
    if (tone === 'cold') {
      const sg = gain(c, 0, filt(c, 'lowpass', 400, 0.7, p));
      ahr(sg, t, dur);
      osc(c, 'sine', f * 0.5, t, t + dur + 0.03, sg);
    }
  }

  function ahr(g: GainNode, t: number, dur: number): void {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.008);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
  }

  return {
    init() {
      if (E) { if (E.ctx.state === 'suspended') return E.ctx.resume().catch(() => undefined); return Promise.resolve(); }
      if (!initing) initing = doInit().catch((err) => { console.warn('[audio] init failed', err); initing = null; });
      return initing;
    },
    setScreen(s) {
      if (s === screen && E) return;
      screen = s;
      if (!E) return;
      E.screen = s;
      startBed(s, 2);
      applyReverb(s);
    },
    setTension(t) {
      tensionTarget = clamp(Number.isFinite(t) ? t : 0, 0, 100);
      applyTension();
    },
    sfx(cue, opts) {
      try { sfx(cue, opts); } catch (err) { console.warn('[audio] sfx failed', cue, err); }
    },
    blip(tone) {
      try { blip(tone); } catch (err) { console.warn('[audio] blip failed', err); }
    },
    setThinking(on) {
      thinking = on;
      if (!on) nextChatter = 0;
    },
    setBlind(on) {
      blind = on;
      if (E) retarget(staticGain.gain, on ? 0.22 : 0, on ? 0.2 : 0.4, now());
    },
    setMaster(v) { master = clamp(v); applyMaster(); },
    setMuted(m) { muted = m; applyMaster(); },
    setReduceScares(on) { reduceScares = on; },
  };
}
