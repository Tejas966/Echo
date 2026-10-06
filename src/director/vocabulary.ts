// Single source of truth for every Warden-facing id and per-action rule numbers (docs/01 §4, docs/03 §4).
import type { ActionName, GameState, ValidTargets } from '../types';
import { ACTIONS } from '../types';
import { MOVABLE_ANCHORS } from '../world/graph';

export const SOUND_CUES = ['drip', 'footsteps_far', 'intercom', 'scrape', 'door_lock'] as const;
export const SCARES = ['face_window', 'slam', 'lights_face'] as const;
export const HAZARDS_BY_SCREEN: Record<string, string[]> = { cell: [], archive: ['sparks_archive'], hall: ['steam_a', 'steam_b'], exit: [] };
export const DOORS_BY_SCREEN: Record<string, string[]> = { cell: ['cell_door'], archive: ['cell_door', 'shutter'], hall: ['shutter', 'lift'], exit: [] };
export const MOVABLES_BY_SCREEN: Record<string, string[]> = { cell: ['cloth'], archive: ['stool'], hall: ['bucket'], exit: [] };

export interface ActionMeta {
  hostile: boolean;
  cooldownS: number;
  /** threat-point cost per intensity [1,2,3] */
  cost: [number, number, number];
  /** tension delta when applied, per intensity */
  tension: [number, number, number];
}

export const META: Record<ActionName, ActionMeta> = {
  do_nothing:     { hostile: false, cooldownS: 0,   cost: [0, 0, 0], tension: [0, 0, 0] },
  flicker_lights: { hostile: true,  cooldownS: 8,   cost: [1, 1, 1], tension: [3, 5, 8] },
  blackout:       { hostile: true,  cooldownS: 25,  cost: [3, 3, 3], tension: [5, 10, 15] },
  lock_door:      { hostile: true,  cooldownS: 30,  cost: [2, 3, 5], tension: [5, 10, 15] },
  unlock_door:    { hostile: false, cooldownS: 5,   cost: [0, 0, 0], tension: [-5, -5, -5] },
  shift_object:   { hostile: true,  cooldownS: 20,  cost: [2, 2, 2], tension: [5, 5, 5] },
  spawn_hazard:   { hostile: true,  cooldownS: 20,  cost: [2, 3, 4], tension: [5, 10, 15] },
  play_sound:     { hostile: false, cooldownS: 4,   cost: [1, 1, 1], tension: [1, 2, 3] },
  reveal_hint:    { hostile: false, cooldownS: 45,  cost: [0, 0, 0], tension: [-5, -5, -5] },
  speak:          { hostile: false, cooldownS: 6,   cost: [0, 0, 0], tension: [0, 0, 0] },
  adjust_tension: { hostile: false, cooldownS: 10,  cost: [0, 0, 0], tension: [0, 0, 0] }, // handled specially: up/down by 5/10/15
  jump_scare:     { hostile: true,  cooldownS: 180, cost: [6, 6, 6], tension: [15, 15, 15] },
};

/** Durations (ms) by intensity. 'perm' = permanent. */
export const DURATION = {
  flicker_lights: [1000, 2000, 4000],
  blackout: [3000, 6000, 10000],
  lock_door: [10000, 25000, 'perm'] as (number | 'perm')[],
  spawn_hazard: [5000, 10000, 20000],
};

export const TONES = ['polite', 'mocking', 'rattled', 'cold'] as const;
export const MAX_SCARES = 3;
export const SCARE_MIN_TENSION = 60;

/** Targets that are valid right now for each action (sent to the model and checked by rules TARGET stage). */
export function validTargets(s: GameState): ValidTargets {
  const scr = s.screen;
  const unsolvedPuzzles = (['p1', 'p2', 'p3', 'p4', 'p5'] as const).filter((p) => !s.stats.solvedAt[p]);
  const wardenLocked = (Object.keys(s.doors) as (keyof typeof s.doors)[]).filter((d) => s.doors[d].wardenLock);
  const t: Partial<ValidTargets> = {
    do_nothing: ['-'],
    flicker_lights: [scr],
    blackout: [scr],
    lock_door: DOORS_BY_SCREEN[scr] ?? [],
    unlock_door: wardenLocked,
    shift_object: (MOVABLES_BY_SCREEN[scr] ?? []).filter((m) => !(m === 'cloth' && s.inventory.includes('cloth'))),
    spawn_hazard: HAZARDS_BY_SCREEN[scr] ?? [],
    play_sound: [...SOUND_CUES],
    reveal_hint: unsolvedPuzzles.length ? [s.puzzle.current] : [],
    speak: [...TONES],
    adjust_tension: ['up', 'down'],
    jump_scare: [...SCARES],
  };
  for (const a of ACTIONS) t[a] ??= [];
  return t as ValidTargets;
}

/** For shift_object: anchors the movable can be sent to. Intensity 1..3 picks index (wrapping) among non-current anchors. */
export function shiftDestination(s: GameState, movable: keyof typeof MOVABLE_ANCHORS, intensity: 1 | 2 | 3): string {
  const options = MOVABLE_ANCHORS[movable].filter((a) => a !== s.objects[movable].anchor);
  return options[(intensity - 1) % options.length];
}
