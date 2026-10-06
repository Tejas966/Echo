// Tension budget + threat points (docs/03 §4.2). Pure, DOM-free; mutates the given state.
import type { GameState } from '../types';

export const ACT_BANDS: Record<1 | 2 | 3 | 4, [number, number]> = { 1: [15, 45], 2: [30, 70], 4: [10, 35], 3: [45, 90] };

export const THREAT_MAX = 10;
export const THREAT_REGEN_MS = 6000;
export const TENSION_DECAY_MS = 3000;

export const bandOf = (s: GameState): [number, number] => ACT_BANDS[s.act] ?? ACT_BANDS[1];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Sub-unit accumulators, kept off the (JSON) state. */
const acc = new WeakMap<GameState, { threat: number; tension: number }>();

export function tickBudget(state: GameState, dtMs: number): void {
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) return;
  const a = acc.get(state) ?? { threat: 0, tension: 0 };
  acc.set(state, a);
  // threat: +1 per 6 s, max 10
  if (state.threat >= THREAT_MAX) { a.threat = 0; state.threat = THREAT_MAX; }
  else {
    a.threat += dtMs;
    while (a.threat >= THREAT_REGEN_MS && state.threat < THREAT_MAX) { a.threat -= THREAT_REGEN_MS; state.threat += 1; }
    if (state.threat >= THREAT_MAX) a.threat = 0;
  }
  // tension: decays 1 pt / 3 s toward band floor, always clamped into band
  const [lo, hi] = bandOf(state);
  a.tension += dtMs;
  while (a.tension >= TENSION_DECAY_MS) {
    a.tension -= TENSION_DECAY_MS;
    if (state.tension > lo) state.tension -= 1;
  }
  state.tension = clamp(state.tension, lo, hi);
}

export function applyTensionDelta(state: GameState, delta: number): void {
  const [lo, hi] = bandOf(state);
  state.tension = clamp(state.tension + (Number.isFinite(delta) ? delta : 0), lo, hi);
}
