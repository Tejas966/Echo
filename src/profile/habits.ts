// Player profile: habits, archetype, end-screen report data. Pure; computed from state + event log.
import type { BreakerSlot, EndReport, GameState, LogEvent } from '../types';
import { PUZZLE_EST_MIN } from '../world/screens';

export interface Habits {
  idleS: number;              // seconds since last player input
  clicksLast10s: number;
  spam: 'low' | 'med' | 'high';
  hiding: boolean;            // lingering at a screen edge without interacting
  rushing: boolean;           // tried the exit before it was ready
  hintReliance: 'low' | 'med' | 'high';
  darkUser: boolean;          // used darkness as a tool
  blinder: boolean;           // pulled the Warden's camera
  idleShare: number;          // fraction of play time idle > 20s
  breezing: boolean;          // last puzzle solved well under estimate
}

const isInput = (e: LogEvent) => e.kind === 'click' || e.kind === 'use' || e.kind === 'take' || e.kind === 'walk';

export function computeHabits(s: GameState, log: LogEvent[], idleAccumMs: number): Habits {
  const inputs = log.filter(isInput);
  const lastInput = inputs.length ? inputs[inputs.length - 1].t : 0;
  const clicks10 = inputs.filter((e) => s.t - e.t <= 10000 && e.kind !== 'walk').length;
  const recentScreen = log.filter((e) => s.t - e.t <= 25000);
  const lastSolve = [...log].reverse().find((e) => e.kind === 'solve' && /^p\d$/.test(e.a));
  let breezing = false;
  if (lastSolve && s.t - lastSolve.t < 120000) {
    const prevSolveT = Math.max(0, ...log.filter((e) => e.kind === 'solve' && e.t < lastSolve.t).map((e) => e.t));
    breezing = (lastSolve.t - prevSolveT) / 60000 < 0.6 * (PUZZLE_EST_MIN[lastSolve.a] ?? 5);
  }
  return {
    idleS: Math.round((s.t - lastInput) / 1000),
    clicksLast10s: clicks10,
    spam: clicks10 > 12 ? 'high' : clicks10 > 6 ? 'med' : 'low',
    hiding: (s.player.x < 160 || s.player.x > 1120) && recentScreen.filter(isInput).length <= 1 && s.t - lastInput > 25000,
    rushing: log.some((e) => e.a === 'rush_exit' && s.t - e.t < 30000),
    hintReliance: s.stats.hints >= 4 ? 'high' : s.stats.hints >= 2 ? 'med' : 'low',
    darkUser: !!s.flags.lamp_empty || !!s.lights.hall.switchedOff,
    blinder: !s.breaker.camera,
    idleShare: s.t > 0 ? idleAccumMs / s.t : 0,
    breezing,
  };
}

export function archetype(s: GameState, log: LogEvent[], idleAccumMs: number): EndReport['archetype'] {
  const mins = Math.max(1, s.t / 60000);
  const clickRate = s.stats.clicks / mins;
  const fails = Object.values(s.stats.fails).reduce((a, b) => a + b, 0);
  const idleShare = s.t ? idleAccumMs / s.t : 0;
  if (idleShare > 0.4) return 'idle';
  if (clickRate > 14 || fails > 10) return 'reckless';
  if (clickRate < 5) return 'cautious';
  return 'methodical';
}

export function dominantHabit(h: Habits, s: GameState): string {
  if (h.blinder) return 'blinding the watcher';
  if (h.darkUser) return 'reaching for the dark';
  if (h.hintReliance !== 'low') return 'asking for help';
  if (h.spam !== 'low') return 'hammering at things until they give';
  return 'patience';
}

export function fuseChoice(s: GameState): BreakerSlot | 'none' {
  for (const k of ['camera', 'archive_lights', 'cell_door', 'shutter'] as BreakerSlot[]) if (s.flags[`pulled_first_${k}`]) return k;
  return 'none';
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export function buildStats(s: GameState): EndReport['stats'] {
  const rows: EndReport['stats'] = [{ label: 'Time in facility', value: fmt(s.t) }];
  let prev = 0;
  for (const p of ['p1', 'p2', 'p3', 'p4', 'p5'] as const) {
    const at = s.stats.solvedAt[p];
    if (at === undefined) continue;
    rows.push({ label: `Test ${p.slice(1)}`, value: `${fmt(at - prev)} · ${s.stats.fails[p] ?? 0} failures` });
    prev = at;
  }
  rows.push({ label: 'Help requested', value: String(s.stats.hints) });
  const fc = fuseChoice(s);
  rows.push({ label: 'First fuse pulled', value: fc === 'none' ? '—' : fc.toUpperCase().replace('_', ' ') });
  return rows;
}

/** Template observations (fallback when the model is unavailable). */
export function templateObservations(s: GameState, h: Habits): string[] {
  const out: string[] = [];
  if (h.darkUser) out.push('You reach for the dark first. Thirteen did too.');
  if (!s.breaker.camera || s.flags.eye_rerouted) out.push(`You blinded me. I have already fixed that for Fifteen.`);
  out.push(s.stats.hints ? `You asked for help ${s.stats.hints} time${s.stats.hints > 1 ? 's' : ''}. I will offer it sooner next time.` : 'You never asked for help. I will not offer it next time.');
  const f = (s.stats.fails.p3 ?? 0);
  if (f) out.push(`My manifold beat you ${f} time${f > 1 ? 's' : ''}. The forgery will be better.`);
  out.push('You trusted my records. Mostly.');
  return out.slice(0, 3);
}
