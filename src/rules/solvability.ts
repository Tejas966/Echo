// Solvability check (docs/03 §4.4): would applying `proposed` make escape impossible?
// Pure, DOM-free. Never mutates the input state.
import type { Decision, DoorId, GameState, ItemId, MovableId, ScreenId } from '../types';
import { cloneState } from '../world/state';
import { ANCHORS, DOORS, GOLDEN_PATH, STEPS, STEP_LABEL, type GraphStep } from '../world/graph';
import { shiftDestination } from '../director/vocabulary';

export interface SolvableResult { ok: boolean; brokenStep?: string; detail?: string }

interface Closure {
  flags: Set<string>;
  items: Set<string>;
  fired: Set<string>;
  screens: Set<ScreenId>;
}

const MOVABLES: MovableId[] = ['cloth', 'stool', 'bucket'];

/** Apply only the PERMANENT world effects of a decision to a cloned state. */
function applyPermanent(s: GameState, d: Decision): void {
  switch (d.action) {
    case 'lock_door': {
      if (d.intensity === 3 && d.target in s.doors) {
        const door = s.doors[d.target as DoorId];
        door.open = false;
        door.wardenLock = { until: 'perm' };
      }
      break;
    }
    case 'shift_object': {
      if ((MOVABLES as string[]).includes(d.target)) {
        const m = d.target as MovableId;
        const dest = shiftDestination(s, m, d.intensity);
        if (dest) s.objects[m].anchor = dest;
      }
      break;
    }
    case 'spawn_hazard': {
      if (d.intensity === 3) s.hazards = [...s.hazards, { slot: d.target as any, until: 'perm' }];
      break;
    }
    default:
      break; // everything else is temporary or has no world effect
  }
}

function permLocked(s: GameState, id: DoorId): boolean {
  return s.doors[id]?.wardenLock?.until === 'perm';
}

function reachableScreens(s: GameState, flags: Set<string>): Set<ScreenId> {
  const seen = new Set<ScreenId>([s.screen]);
  const queue: ScreenId[] = [s.screen];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const d of DOORS) {
      if (d.a !== cur && d.b !== cur) continue;
      if (permLocked(s, d.id)) continue; // a permanently locked door is closed even if it was open
      const open = !!s.doors[d.id]?.open || flags.has(d.openFlag);
      if (!open) continue;
      const other = d.a === cur ? d.b : d.a;
      if (!seen.has(other)) { seen.add(other); queue.push(other); }
    }
  }
  return seen;
}

function anchorReachable(anchor: string, c: Closure): boolean {
  const a = ANCHORS[anchor];
  if (!a) return false;
  if (!c.screens.has(a.screen)) return false;
  return (a.flags ?? []).every((f) => f !== 'never' && c.flags.has(f));
}

function closure(s: GameState): Closure {
  const flags = new Set<string>(Object.keys(s.flags).filter((k) => s.flags[k]));
  const items = new Set<string>(s.inventory);
  for (const f of flags) if (f.startsWith('got_')) items.add(f.slice(4));
  const permZones = new Set<string>(s.hazards.filter((h) => h.until === 'perm').map((h) => h.slot));
  const fired = new Set<string>();
  const c: Closure = { flags, items, fired, screens: reachableScreens(s, flags) };

  for (let pass = 0; pass < 50; pass++) {
    let changed = false;
    c.screens = reachableScreens(s, flags);
    for (const step of STEPS) {
      if (fired.has(step.id)) continue;
      if (!canFire(step, s, c, permZones)) continue;
      fired.add(step.id);
      for (const f of step.grants.flags ?? []) flags.add(f);
      for (const it of step.grants.items ?? []) items.add(it);
      changed = true;
      c.screens = reachableScreens(s, flags);
    }
    if (!changed) break;
  }
  return c;
}

function canFire(step: GraphStep, s: GameState, c: Closure, permZones: Set<string>): boolean {
  if (step.zone && permZones.has(step.zone)) return false;
  if (step.screen && !c.screens.has(step.screen)) return false;
  if (step.anchor && !anchorReachable(step.anchor, c)) return false;
  if (step.anchorOf && !anchorReachable(s.objects[step.anchorOf]?.anchor ?? '', c)) return false;
  if ((step.items ?? []).some((i) => !c.items.has(i))) return false;
  if ((step.flags ?? []).some((f) => !c.flags.has(f))) return false;
  return true;
}

/** escaped must be granted AND the exit screen must be physically reachable (a perm-locked lift blocks escape). */
function escapes(s: GameState, c: Closure): boolean {
  if (s.ended === 'escaped' || s.screen === 'exit') return true;
  return c.flags.has('escaped') && c.screens.has('exit');
}

function stepDone(id: string, c: Closure): boolean {
  if (c.fired.has(id)) return true;
  const step = STEPS.find((x) => x.id === id);
  if (!step) return false;
  const g = step.grants;
  return (g.flags ?? []).every((f) => c.flags.has(f)) && (g.items ?? []).every((i) => c.items.has(i));
}

function firstBroken(c: Closure): string | undefined {
  return GOLDEN_PATH.find((id) => !stepDone(id, c));
}

function describe(s: GameState, d: Decision | undefined, c: Closure, broken: string | undefined): string {
  const label = broken ? STEP_LABEL[broken] ?? broken : 'escape';
  if (d?.action === 'lock_door') {
    const g = DOORS.find((x) => x.id === d.target);
    if (g) {
      const far = !c.screens.has(g.b) ? g.b : !c.screens.has(g.a) ? g.a : null;
      if (far) return `${g.id} is the only route to ${far.toUpperCase()}`;
      return `locking ${g.id} for good would block "${label}"`;
    }
  }
  if (d?.action === 'shift_object') {
    const m = d.target as MovableId;
    const dest = shiftDestination(s, m, d.intensity);
    // first unreached golden step that needs this movable as an item
    const needer = GOLDEN_PATH.find((id) => !stepDone(id, c) && (STEPS.find((x) => x.id === id)?.items ?? []).includes(m as ItemId));
    const why = needer ? STEP_LABEL[needer] : label;
    return `${m} unreachable at ${dest}; needed to ${why}`;
  }
  if (d?.action === 'spawn_hazard') {
    return `permanent hazard at ${d.target} blocks the only way to ${label}`;
  }
  return `escape becomes impossible; cannot ${label}`;
}

export function checkSolvable(state: GameState, proposed?: Decision): SolvableResult {
  const baseC = closure(state);
  const baseOk = escapes(state, baseC);
  if (!proposed) {
    if (baseOk) return { ok: true };
    const broken = firstBroken(baseC);
    return { ok: false, brokenStep: broken, detail: describe(state, undefined, baseC, broken) };
  }
  const clone = cloneState(state);
  applyPermanent(clone, proposed);
  const c = closure(clone);
  if (escapes(clone, c)) return { ok: true };
  if (!baseOk) {
    // Never blame the model for a pre-existing dead end.
    return { ok: true, detail: 'state already unsolvable before this action (not blamed on the Warden)' };
  }
  const broken = firstBroken(c);
  return { ok: false, brokenStep: broken, detail: describe(state, proposed, c, broken) };
}
