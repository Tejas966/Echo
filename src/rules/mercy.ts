// Mercy rule (docs/03 §4.5). Pure, DOM-free.
import type { ActionName, Decision, GameState, Intensity } from '../types';
import { META } from '../director/vocabulary';
import { PUZZLE_EST_MIN } from '../world/screens';

const MIN = 60_000;

export function puzzleEstMs(state: GameState): number {
  return (PUZZLE_EST_MIN[state.puzzle.current] ?? 7) * MIN;
}

/**
 * Escalates mercy (never lowers it; onPuzzleSolved lowers). Mutates state.mercy when the level changes.
 *  0→1: ≥3 fails on the current puzzle, or time on puzzle > 1.5× estimate
 *  1→2: ≥5 fails, or 3 min spent at level 1
 *  2→3: 3 min spent at level 2
 *  any→3: ≥5 consecutive vetoes of hostile actions
 */
export function updateMercy(state: GameState, now: number, consecutiveHostileVetoes: number): { changed: boolean; level: number } {
  const before = state.mercy.level;
  let level = before as number;
  const timeOn = now - state.puzzle.startedAt;
  const fails = state.puzzle.fails;
  const atLevelFor = now - state.mercy.since;
  if (level === 0 && (fails >= 3 || timeOn > 1.5 * puzzleEstMs(state))) level = 1;
  else if (level === 1 && (fails >= 5 || atLevelFor >= 3 * MIN)) level = 2;
  else if (level === 2 && atLevelFor >= 3 * MIN) level = 3;
  if (consecutiveHostileVetoes >= 5) level = 3;
  if (level !== before) {
    state.mercy = { level: level as 0 | 1 | 2 | 3, since: now };
    return { changed: true, level };
  }
  return { changed: false, level };
}

export function onPuzzleSolved(state: GameState): void {
  state.mercy = { level: Math.max(0, state.mercy.level - 2) as 0 | 1 | 2 | 3, since: state.t };
}

const L2_FORBIDDEN: ActionName[] = ['lock_door', 'spawn_hazard', 'jump_scare', 'shift_object'];
const L3_ALLOWED: ActionName[] = ['speak', 'play_sound', 'flicker_lights', 'reveal_hint', 'do_nothing', 'adjust_tension'];

export function mercyAllows(
  state: GameState,
  decision: Decision,
): { ok: true; amended?: Decision } | { ok: false; reason: string } {
  const lvl = state.mercy?.level ?? 0;
  const a = decision.action;
  const hostile = META[a]?.hostile ?? false;
  const cap = (max: Intensity) =>
    decision.intensity > max ? { ok: true as const, amended: { ...decision, intensity: max } } : { ok: true as const };

  if (lvl <= 0) return { ok: true };
  if (lvl === 1) return hostile ? cap(2) : { ok: true };
  if (lvl === 2) {
    if (L2_FORBIDDEN.includes(a)) return { ok: false, reason: `mercy 2: no ${a} while Subject 14 is struggling` };
    return hostile ? cap(1) : { ok: true };
  }
  // level 3
  if (!L3_ALLOWED.includes(a)) return { ok: false, reason: `mercy 3: ${a} not allowed (easing off)` };
  if (a === 'adjust_tension' && decision.target !== 'down') return { ok: false, reason: 'mercy 3: tension may only go down' };
  if (a === 'flicker_lights') return cap(1);
  return { ok: true };
}
