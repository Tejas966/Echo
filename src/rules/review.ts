// The review pipeline (docs/03 §4.1): PARSE → SCHEMA → TARGET → CONTENT → STALE → COOLDOWN → BUDGET → SOLVABILITY → MERCY.
// Pure, DOM-free, never mutates state, never throws. Budget spending / cooldown recording happen in the lead's apply step.
import type { ActionName, Decision, DecisionSource, GameState, Intensity, ReviewContext, Verdict, VetoStage } from '../types';
import { ACTIONS } from '../types';
import { META, MAX_SCARES, SCARE_MIN_TENSION, TONES, validTargets } from '../director/vocabulary';
import { filterLine, fallbackLine } from './filter';
import { checkSolvable } from './solvability';
import { mercyAllows } from './mercy';
import { bandOf } from './budget';

export const STALE_MS = 6000;
export const GLOBAL_HOSTILE_GAP_MS = 8000;
export const SCARE_HINT_GAP_MS = 20000;
const SCREEN_TARGETED: ActionName[] = ['flicker_lights', 'blackout', 'lock_door', 'spawn_hazard', 'shift_object'];

export function isHostile(a: ActionName): boolean {
  return META[a]?.hostile ?? false;
}

/** Cooldown key used by ctx.cooldowns (play_sound is per cue). */
export function cooldownKey(d: Pick<Decision, 'action' | 'target'>): string {
  return d.action === 'play_sound' ? `play_sound:${d.target}` : d.action;
}

/** Tension step for adjust_tension by intensity. */
export const TENSION_STEP: Record<Intensity, number> = { 1: 5, 2: 10, 3: 15 };

class Veto {
  constructor(public stage: VetoStage, public detail: string) {}
}

function parse(raw: unknown): Record<string, unknown> {
  let v = raw;
  if (typeof v === 'string') {
    const s = v.trim();
    try {
      v = JSON.parse(s);
    } catch {
      // tolerate code fences / chatter around a single object
      const m = s.match(/\{[\s\S]*\}/);
      if (!m) throw new Veto('PARSE', 'output is not valid JSON');
      try {
        v = JSON.parse(m[0]);
      } catch {
        throw new Veto('PARSE', 'output is not valid JSON');
      }
    }
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Veto('PARSE', 'output is not a JSON object');
  return v as Record<string, unknown>;
}

function schema(o: Record<string, unknown>): Decision {
  const action = typeof o.action === 'string' ? o.action.trim().toLowerCase() : o.action;
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action))
    throw new Veto('SCHEMA', `unknown action "${String(o.action).slice(0, 40)}"`);
  let intensity: unknown = o.intensity;
  if (typeof intensity === 'string' && intensity.trim() !== '') intensity = Number(intensity.trim());
  if (intensity === undefined && action === 'do_nothing') intensity = 1;
  if (intensity !== 1 && intensity !== 2 && intensity !== 3)
    throw new Veto('SCHEMA', `intensity must be 1, 2 or 3 (got ${JSON.stringify(o.intensity)})`);
  let target = o.target;
  if (target === undefined && action === 'do_nothing') target = '-';
  if (typeof target !== 'string') throw new Veto('SCHEMA', 'target must be a string');
  if (o.reason !== undefined && o.reason !== null && typeof o.reason !== 'string') throw new Veto('SCHEMA', 'reason must be a string');
  const d: Decision = {
    action: action as ActionName,
    target: target.trim(),
    intensity: intensity as Intensity,
    reason: typeof o.reason === 'string' ? o.reason : '',
  };
  if (typeof o.saw === 'string') d.saw = o.saw;
  if (typeof o.line === 'string' && o.line.trim() !== '') d.line = o.line.trim();
  if (typeof o.confidence === 'number' && Number.isFinite(o.confidence)) d.confidence = o.confidence;
  return d;
}

function checkTarget(d: Decision, state: GameState, ctx: ReviewContext): void {
  if (d.action === 'do_nothing') return;
  if (d.action === 'speak') {
    if (!(TONES as readonly string[]).includes(d.target)) throw new Veto('TARGET', `speak target must be a tone, not "${d.target}"`);
    return;
  }
  const snapList = ctx.snapshot?.validTargets?.[d.action] ?? [];
  if (!snapList.includes(d.target)) throw new Veto('TARGET', `"${d.target}" is not a valid ${d.action} target`);
  const live = validTargets(state)[d.action] ?? [];
  if (!live.includes(d.target)) throw new Veto('TARGET', `"${d.target}" is no longer a valid ${d.action} target`);
}

function checkStale(d: Decision, state: GameState, ctx: ReviewContext): void {
  const age = ctx.now - ctx.snapshot.t;
  if (age > STALE_MS) throw new Veto('STALE', `decision based on a ${(age / 1000).toFixed(1)} s old view`);
  if (SCREEN_TARGETED.includes(d.action) && ctx.snapshot.screen !== state.screen)
    throw new Veto('STALE', `Subject 14 left ${ctx.snapshot.screen} (now in ${state.screen})`);
}

function checkCooldown(d: Decision, state: GameState, ctx: ReviewContext): void {
  const now = ctx.now;
  const key = cooldownKey(d);
  const cdMs = (META[d.action]?.cooldownS ?? 0) * 1000;
  const last = ctx.cooldowns?.[key];
  if (cdMs > 0 && typeof last === 'number' && Number.isFinite(last) && now - last < cdMs)
    throw new Veto('COOLDOWN', `${key} cooling down (${Math.ceil((cdMs - (now - last)) / 1000)} s left)`);
  if (isHostile(d.action) && Number.isFinite(ctx.lastHostileAt) && ctx.lastHostileAt > 0 && now - ctx.lastHostileAt < GLOBAL_HOSTILE_GAP_MS)
    throw new Veto('COOLDOWN', `only one hostile action per ${GLOBAL_HOSTILE_GAP_MS / 1000} s`);
  if (d.action === 'jump_scare') {
    if (state.scaresUsed >= MAX_SCARES) throw new Veto('COOLDOWN', `all ${MAX_SCARES} scares already used`);
    if (state.tension < SCARE_MIN_TENSION) throw new Veto('COOLDOWN', `tension ${state.tension} < ${SCARE_MIN_TENSION}: too early for a scare`);
    const hintAt = ctx.cooldowns?.['reveal_hint'];
    if (typeof hintAt === 'number' && Number.isFinite(hintAt) && now - hintAt < SCARE_HINT_GAP_MS)
      throw new Veto('COOLDOWN', `no scare within ${SCARE_HINT_GAP_MS / 1000} s of a hint`);
  }
}

function checkBudget(d: Decision, state: GameState): void {
  const cost = META[d.action]?.cost?.[d.intensity - 1] ?? 0;
  if (cost > 0 && cost > state.threat) throw new Veto('BUDGET', `costs ${cost} threat, only ${state.threat} available`);
  if (d.action === 'adjust_tension') {
    const [lo, hi] = bandOf(state);
    if (d.target === 'up' && state.tension >= hi) throw new Veto('BUDGET', `tension already at act ceiling (${hi})`);
    if (d.target === 'down' && state.tension <= lo) throw new Veto('BUDGET', `tension already at act floor (${lo})`);
  }
}

function checkSolvability(d: Decision, state: GameState): void {
  if (d.action === 'unlock_door') {
    const door = state.doors[d.target as keyof GameState['doors']];
    if (!door?.wardenLock) throw new Veto('SOLVABILITY', `${d.target} is puzzle-locked; only Warden locks can be lifted`);
    return;
  }
  const r = checkSolvable(state, d);
  if (!r.ok) throw new Veto('SOLVABILITY', `Veto: ${r.detail ?? 'escape would become impossible'}`);
}

export function review(input: { raw: unknown; source: DecisionSource }, state: GameState, ctx: ReviewContext): Verdict {
  const source: DecisionSource = input?.source ?? 'mock';
  let proposed: Decision | null = null;
  try {
    const obj = parse(input?.raw);
    proposed = schema(obj);
    let d: Decision = { ...proposed };
    let amendStage: VetoStage | undefined;
    const amendNotes: string[] = [];
    const amend = (stage: VetoStage, note: string) => {
      amendStage ??= stage;
      amendNotes.push(note);
    };

    checkTarget(d, state, ctx);

    // CONTENT: never vetoes — swaps the line for an in-character fallback
    const avoid = (state.warden?.lineHistory ?? []).slice(-3);
    if (d.line !== undefined) {
      const f = filterLine(d.line, { state, action: d.action, intensity: d.intensity });
      if (!f.ok) {
        d = { ...d, line: fallbackLine(state.warden.tone, ctx.now, avoid) };
        amend('CONTENT', `line replaced (${f.reason})`);
      }
    } else if (d.action === 'speak') {
      d = { ...d, line: fallbackLine(state.warden.tone, ctx.now, avoid) };
      amend('CONTENT', 'speak had no line; fallback used');
    }

    checkStale(d, state, ctx);
    checkCooldown(d, state, ctx);
    checkBudget(d, state);
    checkSolvability(d, state);

    const m = mercyAllows(state, d);
    if (!m.ok) throw new Veto('MERCY', m.reason);
    if (m.amended) {
      amend('MERCY', `mercy ${state.mercy.level}: intensity ${d.intensity} → ${m.amended.intensity}`);
      d = m.amended;
    }

    if (amendStage) return { status: 'amended', stage: amendStage, detail: amendNotes.join('; '), proposed, final: d, source };
    return { status: 'accepted', proposed, final: d, source };
  } catch (e) {
    if (e instanceof Veto) return { status: 'vetoed', stage: e.stage, detail: e.detail, proposed, final: null, source };
    return { status: 'vetoed', stage: 'SCHEMA', detail: 'internal error', proposed, final: null, source };
  }
}
