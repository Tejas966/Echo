// ScriptedDirector: deterministic heuristic Warden. Used as (a) the degraded mode when the model is
// unreachable, and (b) the fallback decision source after an invalid/timeout model reply.
import type { Decision, Director, DirectorResult, GameState, Snapshot, Tone } from '../types';
import type { Habits } from '../profile/habits';

export const AMBIENT_LINES: Record<Tone, string[]> = {
  polite: ['Please continue, Subject 14. You are being very informative.', 'Excellent posture. Thirteen slouched.', 'Every step you take is recorded. Thank you.', 'Take your time. Data improves with patience.'],
  mocking: ['Fascinating. You tried that already.', 'Thirteen solved this faster. Thirteen is gone.', 'Are you thinking, or waiting for me to think for you?', 'The room is not going to solve itself, Subject 14.'],
  rattled: ['That— that was not the expected sequence.', 'Recalculating. Do not move.', 'You are ahead of my model. Stop it.', 'Why would you— noted. Noted.'],
  cold: ['Rest, if you need to. The room will wait.', 'We are nearly done, you and I.', 'I will ease off. For now.', 'Breathe, Subject 14. Then try again.'],
};

export class ScriptedDirector implements Director {
  readonly kind = 'scripted' as const;
  private n = 0;
  constructor(private getState: () => GameState, private getHabits: () => Habits, private lastHintAt: () => number) {}

  decideSync(): Decision {
    const s = this.getState(); const h = this.getHabits();
    this.n++;
    const tone = s.warden.tone;
    const pick = (arr: string[]) => {
      const fresh = arr.filter((l) => !s.warden.lineHistory.includes(l));
      return (fresh.length ? fresh : arr)[this.n % (fresh.length || arr.length)];
    };
    const sinceHint = s.t - this.lastHintAt();
    const timeOn = (s.t - s.puzzle.startedAt) / 60000;
    if ((h.idleS > 60 || s.puzzle.fails >= 3 || timeOn > 8) && sinceHint > 60000 && !s.stats.solvedAt[s.puzzle.current]) {
      const tier = Math.min(3, s.puzzle.hints + 1) as 1 | 2 | 3;
      return { action: 'reveal_hint', target: s.puzzle.current, intensity: tier, reason: `Scripted: subject stuck (idle ${h.idleS}s, fails ${s.puzzle.fails}).` };
    }
    if (h.spam === 'high') return { action: 'speak', target: 'mocking', intensity: 1, line: 'Patience, Subject 14. Clicking harder does not help.', reason: 'Scripted: click spam.' };
    if (h.hiding) return { action: 'speak', target: tone, intensity: 1, line: 'I can see you there.', reason: 'Scripted: subject hiding at the edge.' };
    if (h.rushing) return { action: 'speak', target: 'mocking', intensity: 1, line: 'The exit is not ready for you. You are not ready for it.', reason: 'Scripted: rushing the exit.' };
    if (h.breezing && s.threat >= 2 && s.screen === 'hall') return { action: 'spawn_hazard', target: 'steam_b', intensity: 1, line: pick(AMBIENT_LINES.rattled), reason: 'Scripted: subject breezing; mild pressure.' };
    switch (this.n % 6) {
      case 1: return { action: 'play_sound', target: this.n % 2 ? 'footsteps_far' : 'drip', intensity: 1, reason: 'Scripted: ambience.' };
      case 3: return { action: 'speak', target: tone, intensity: 1, line: pick(AMBIENT_LINES[tone]), reason: 'Scripted: presence.' };
      case 5: return s.threat >= 2 ? { action: 'flicker_lights', target: s.screen, intensity: 1, reason: 'Scripted: ambient flicker.' } : { action: 'do_nothing', target: '-', intensity: 1, reason: 'Scripted: conserving threat.' };
      default: return { action: 'do_nothing', target: '-', intensity: 1, reason: 'Scripted: observing.' };
    }
  }

  async decide(_snap: Snapshot): Promise<DirectorResult> {
    const d = this.decideSync();
    return { ok: true, raw: JSON.stringify(d), decision: d, latencyMs: 0 };
  }
}
