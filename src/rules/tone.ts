// Deterministic Warden tone (docs/03 §1). Pure, DOM-free.
import type { GameState, PuzzleId, Tone } from '../types';
import { PUZZLE_EST_MIN } from '../world/screens';

const MIN = 60_000;

export function computeTone(state: GameState, now: number): Tone {
  // cold: mercy ≥2 or finale
  if (state.mercy.level >= 2 || state.ended || state.flags.p5_solved) return 'cold';

  // rattled
  if (state.warden.blind) return 'rattled';
  const la = state.warden.lastActions;
  if (la.length >= 2 && la.slice(-2).every((x) => x.status === 'vetoed')) return 'rattled';
  const solves = (Object.entries(state.stats.solvedAt) as [PuzzleId, number][])
    .filter(([, t]) => typeof t === 'number')
    .sort((a, b) => a[1] - b[1]);
  if (solves.length) {
    const [pid, t] = solves[solves.length - 1];
    const prev = solves.length > 1 ? solves[solves.length - 2][1] : 0;
    const took = t - prev;
    const est = (PUZZLE_EST_MIN[pid] ?? 7) * MIN;
    if (now - t <= 2 * MIN && took < 0.6 * est) return 'rattled';
  }

  // mocking
  const timeOn = now - state.puzzle.startedAt;
  const est = (PUZZLE_EST_MIN[state.puzzle.current] ?? 7) * MIN;
  if (state.puzzle.fails >= 3 || timeOn > 1.3 * est) return 'mocking';

  return 'polite';
}
