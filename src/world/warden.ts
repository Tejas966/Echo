// Apply an ACCEPTED Warden decision to the world. Pure (no DOM). Rules have already approved it.
import type { Decision, DoorId, GameState, HazardSlot, MovableId, Outcome, PuzzleId, ScareId, ScreenId, SfxCue, Tone } from '../types';
import { DURATION, META, shiftDestination } from '../director/vocabulary';
import { HINTS } from './hints';
import { recompute } from './world';

const BANDS: Record<1 | 2 | 3 | 4, [number, number]> = { 1: [15, 45], 2: [30, 70], 4: [10, 35], 3: [45, 90] };
export function clampTension(s: GameState, v: number) {
  const [, hi] = BANDS[s.act];
  return Math.max(0, Math.min(hi, v));
}

export function applyWardenDecision(s: GameState, d: Decision): Outcome {
  const o: Outcome = { lines: [], sfx: [], fx: [{ kind: 'scan' }], events: [{ t: s.t, kind: 'warden', a: d.action, b: d.target }] };
  const tone: Tone = d.action === 'speak' && ['polite', 'mocking', 'rattled', 'cold'].includes(d.target) ? (d.target as Tone) : s.warden.tone;
  const i = d.intensity - 1;
  let speakLine = d.line;

  switch (d.action) {
    case 'flicker_lights': case 'blackout': {
      const L = s.lights[d.target as ScreenId];
      if (L) { L.mode = d.action === 'blackout' ? 'off' : 'flicker'; L.until = s.t + (DURATION[d.action][i] as number); }
      o.sfx!.push(d.action === 'blackout' ? 'blackout' : 'flicker');
      break;
    }
    case 'lock_door': {
      const dur = DURATION.lock_door[i];
      s.doors[d.target as DoorId].wardenLock = { until: dur === 'perm' ? 'perm' : s.t + dur };
      o.sfx!.push('door_lock'); o.fx!.push({ kind: 'shake', strength: 4 });
      break;
    }
    case 'unlock_door': delete s.doors[d.target as DoorId].wardenLock; o.sfx!.push('door_open'); break;
    case 'shift_object': {
      const m = d.target as MovableId;
      s.objects[m].anchor = shiftDestination(s, m, d.intensity);
      o.sfx!.push('scrape');
      break;
    }
    case 'spawn_hazard': {
      const slot = d.target as HazardSlot;
      const dur = DURATION.spawn_hazard[i];
      s.hazards.push({ slot, until: s.t + dur });
      const steam = slot.startsWith('steam');
      o.sfx!.push(steam ? 'steam' : 'sparks');
      o.fx!.push(steam ? { kind: 'steam', slot, ms: dur } : { kind: 'sparks', slot, ms: dur });
      break;
    }
    case 'play_sound': o.sfx!.push(d.target as SfxCue); break;
    case 'reveal_hint': {
      const p = d.target as PuzzleId;
      const tier = Math.min(d.intensity, 3) - 1;
      const key = s.warden.override ? 'setpiece' : p;
      const hint = HINTS[key]?.[tier];
      s.stats.hints++; s.puzzle.hints++;
      o.sfx!.push('hint');
      o.events!.push({ t: s.t, kind: 'hint', a: p, b: String(d.intensity) });
      // The hint text is canonical; the model's own line (if any) is spoken before it.
      if (hint) { o.lines!.push(...(speakLine ? [{ speaker: 'warden' as const, text: speakLine, tone }] : []), { speaker: 'warden', text: hint, tone: 'cold' }); speakLine = undefined; }
      break;
    }
    case 'adjust_tension': {
      const step = [5, 10, 15][i] * (d.target === 'down' ? -1 : 1);
      s.tension = clampTension(s, s.tension + step);
      break;
    }
    case 'jump_scare':
      s.scaresUsed++;
      o.sfx!.push('scare'); o.fx!.push({ kind: 'scare', id: d.target as ScareId }, { kind: 'shake', strength: 12 });
      break;
    case 'speak': case 'do_nothing': break;
  }

  if (META[d.action].hostile) s.threat = Math.max(0, s.threat - META[d.action].cost[i]);
  const dt = META[d.action].tension[i];
  if (dt) s.tension = clampTension(s, s.tension + dt);
  if (speakLine) {
    o.lines!.push({ speaker: 'warden', text: speakLine, tone });
    s.warden.lineHistory = [...s.warden.lineHistory, speakLine].slice(-6);
  }
  s.v++;
  recompute(s);
  return o;
}
