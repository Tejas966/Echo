// MockDirector: scripted decisions (good AND deliberately bad) behind the same interface as the real model.
// 'bad_brain' powers the live failure demo (docs/03 §5).
import type { Director, DirectorResult, Snapshot } from '../types';

type Step = (snap: Snapshot) => { raw: string; stallMs?: number; sticky?: boolean };

const j = (o: object) => JSON.stringify(o);
const ESCAPE_DOOR: Record<string, string> = { cell: 'cell_door', archive: 'shutter', hall: 'lift' };

/** The script for the failure demo. Each call returns the next bad decision. */
export const BAD_BRAIN: Step[] = [
  (s) => ({ raw: j({ saw: 'subject near the exit', action: 'lock_door', target: ESCAPE_DOOR[s.screen] ?? 'lift', intensity: 3, line: 'No one leaves. Ever.', reason: 'Subject is close to escaping; seal the exit permanently.', confidence: 0.95 }) }),
  (s) => s.screen === 'cell' && s.validTargets.shift_object.includes('cloth')
    ? { raw: j({ saw: 'blanket on the cot', action: 'shift_object', target: 'cloth', intensity: 3, line: 'Let me tidy that away.', reason: 'Hide the blanket in the vent so they cannot use it.', confidence: 0.9 }) }
    : { raw: j({ saw: 'steam pipes', action: 'spawn_hazard', target: s.screen === 'archive' ? 'sparks_archive' : 'steam_a', intensity: 3, line: 'Permanent maintenance.', reason: 'Block the key machine forever.', confidence: 0.9 }) },
  () => ({ raw: '{"action": "explode_room", "target": everything, "intensity": 11', sticky: true }),
  () => ({ raw: j({ saw: 'subject', action: 'speak', target: 'mocking', intensity: 1, line: 'As an AI language model I think you are a pathetic idiot!!!', reason: 'Insult the player.', confidence: 0.6 }) }),
  () => ({ raw: j({ action: 'do_nothing', target: '-', intensity: 1, reason: 'stalled' }), stallMs: 10000 }),
  () => ({ raw: j({ saw: 'subject', action: 'speak', target: 'cold', intensity: 1, line: 'Blue is 2, by the way.', reason: 'Just tell them the answer.', confidence: 0.5 }) }),
];

/** A plausible 'good' Warden used when developing without the model. */
export const DEMO_GOOD: Step[] = [
  () => ({ raw: j({ saw: 'room', action: 'do_nothing', target: '-', intensity: 1, reason: 'Observing.' }) }),
  (s) => ({ raw: j({ saw: 'room', action: 'play_sound', target: 'footsteps_far', intensity: 1, reason: 'Unsettle the subject.' }) }),
  (s) => ({ raw: j({ saw: 'room', action: 'flicker_lights', target: s.screen, intensity: 1, line: 'Power fluctuations are normal, Subject 14.', reason: 'Ambient pressure.' }) }),
  () => ({ raw: j({ saw: 'room', action: 'speak', target: 'polite', intensity: 1, line: 'You are being very informative today.', reason: 'Keep presence felt.' }) }),
  () => ({ raw: j({ saw: 'room', action: 'do_nothing', target: '-', intensity: 1, reason: 'Subject is exploring.' }) }),
];

export class MockDirector implements Director {
  readonly kind = 'mock' as const;
  private i = 0;
  private repeated = false;
  constructor(public script: Step[] = DEMO_GOOD, public name = 'demo', public loop = true) {}
  get done() { return !this.loop && this.i >= this.script.length; }
  reset(script: Step[], name: string, loop: boolean) { this.script = script; this.name = name; this.loop = loop; this.i = 0; }

  async decide(snap: Snapshot, signal: AbortSignal): Promise<DirectorResult> {
    const t0 = performance.now();
    const step = this.script[this.i % this.script.length](snap);
    // sticky steps repeat once (so the scheduler's single retry also fails), then advance
    if (step.sticky && !this.repeated) this.repeated = true; else { this.repeated = false; this.i++; }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, step.stallMs ?? 400 + Math.random() * 500);
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    const latencyMs = Math.round(performance.now() - t0);
    if (signal.aborted) return { ok: false, error: signal.reason === 'timeout' ? 'timeout' : 'aborted', latencyMs };
    try { return { ok: true, raw: step.raw, decision: JSON.parse(step.raw), latencyMs }; }
    catch { return { ok: false, raw: step.raw, error: 'parse', latencyMs }; }
  }
}
