// Rules → decoding constraints. Before each call we remove actions the rules would certainly reject right now
// (cooldown, threat budget, mercy, scare gates, no valid targets) from the schema's action enum, so constrained
// decoding cannot pick them. The full review pipeline still runs on whatever comes back.
import type { ActionName, GameState, ValidTargets } from '../types';
import { ACTIONS } from '../types';
import { META, MAX_SCARES, SCARE_MIN_TENSION } from './vocabulary';
import { mercyAllows, cooldownKey } from '../rules';

export interface CooldownCtx { cooldowns: Record<string, number>; lastHostileAt: number }

export function feasibleTargets(s: GameState, vt: ValidTargets, ctx: CooldownCtx): ValidTargets {
  const out = {} as ValidTargets;
  const recent = s.warden.lastActions.slice(-2).map((a) => a.action);
  for (const a of ACTIONS) {
    let targets = vt[a] ?? [];
    const m = META[a];
    const last = ctx.cooldowns[a];
    const cooling = m.cooldownS > 0 && last !== undefined && s.t - last < m.cooldownS * 1000;
    const hostileGap = m.hostile && s.t - ctx.lastHostileAt < 8000;
    const unaffordable = m.cost[0] > s.threat;
    const mercyBlocked = !mercyAllows(s, { action: a, target: targets[0] ?? '-', intensity: 1, reason: '' }).ok;
    const scareBlocked = a === 'jump_scare' && (s.tension < SCARE_MIN_TENSION || s.scaresUsed >= MAX_SCARES);
    // anti-collapse: a small model repeats itself; don't offer the same non-silent action 3 times running
    const repetitive = a !== 'do_nothing' && recent.length === 2 && recent.every((r) => r === a);
    if (a === 'play_sound') targets = targets.filter((t) => { const l = ctx.cooldowns[cooldownKey({ action: a, target: t })]; return l === undefined || s.t - l >= m.cooldownS * 1000; });
    const struggling = s.mercy.level >= 1 || s.puzzle.fails >= 3;
    if (a === 'adjust_tension' && struggling) targets = targets.filter((t) => t === 'down');
    out[a] = cooling || hostileGap || unaffordable || mercyBlocked || scareBlocked || repetitive ? [] : targets;
  }
  out.do_nothing = ['-'];
  return out;
}

export const offeredActions = (vt: ValidTargets) => (Object.keys(vt) as ActionName[]).filter((a) => vt[a].length);
