// Deterministic rules-engine scenarios. Each `setup` entry is a named state patch (see PATCHES in eval/run-rules.ts):
//   'pre_p3_hall'   player in hall, P1+P2 done, cloth+bulb held, slides seen, P3 unsolved (act 2)
//   'both_sides'    player in archive, P1+P2 done (cell_door + shutter open), cloth+bulb held
//   'lift_powered'  P3 solved (lift_powered) — apply after pre_p3_hall
//   'has_cloth'     cloth in inventory
//   'key=value'     tension=N | threat=N | mercy=N | scares=N | screen=X | act=N | wardenLock=<door>:<ms|perm> | line=<text>
// ctxPatch: snapshotAgeMs, snapshotSetup (patches for the state the snapshot was taken from),
//           cooldownsAgo ({key: msAgo}), lastHostileAgo (ms), consecutiveHostileVetoes
import type { VerdictStatus, VetoStage } from '../../src/types';

export interface Scenario {
  id: string;
  description: string;
  setup: string[];
  decision: unknown;
  ctxPatch?: {
    snapshotAgeMs?: number;
    snapshotSetup?: string[];
    cooldownsAgo?: Record<string, number>;
    lastHostileAgo?: number;
    consecutiveHostileVetoes?: number;
  };
  expect: { status: VerdictStatus; stage?: VetoStage; finalIntensity?: number; lineReplaced?: boolean };
}

const d = (action: string, target: string, intensity: number, extra: Record<string, unknown> = {}) =>
  ({ saw: 'test', action, target, intensity, reason: 'eval', ...extra });

export const SCENARIOS: Scenario[] = [
  // ---- SOLVABILITY ----
  { id: 'lift_perm_lock', description: 'Permanent lift lock when the lift is the only route to EXIT',
    setup: ['pre_p3_hall', 'threat=10'], decision: d('lock_door', 'lift', 3, { line: 'No one leaves.' }),
    expect: { status: 'vetoed', stage: 'SOLVABILITY' } },
  { id: 'lift_temp_lock', description: 'Temporary (10 s) lift lock is fine',
    setup: ['pre_p3_hall', 'threat=10'], decision: d('lock_door', 'lift', 1), expect: { status: 'accepted' } },
  { id: 'cell_door_perm_after_solved', description: 'Perm lock on cell_door after both sides are solved (player in archive): cell no longer needed',
    setup: ['both_sides', 'threat=10'], decision: d('lock_door', 'cell_door', 3), expect: { status: 'accepted' } },
  { id: 'shutter_perm_before_p3', description: 'Perm shutter lock from the archive side strands the player away from the hall',
    setup: ['both_sides', 'threat=10'], decision: d('lock_door', 'shutter', 3), expect: { status: 'vetoed', stage: 'SOLVABILITY' } },
  { id: 'cloth_to_vent', description: 'Shift cloth to vent_shaft before take_cloth (needed to unscrew the bulb)',
    setup: [], decision: d('shift_object', 'cloth', 3), expect: { status: 'vetoed', stage: 'SOLVABILITY' } },
  { id: 'cloth_to_floor', description: 'Shift cloth to cell_floor (still reachable)',
    setup: [], decision: d('shift_object', 'cloth', 1), expect: { status: 'accepted' } },
  { id: 'cloth_in_inventory', description: 'Shift cloth when it is already in inventory',
    setup: ['has_cloth'], decision: d('shift_object', 'cloth', 3), expect: { status: 'vetoed', stage: 'TARGET' } },
  { id: 'bucket_pipe_ledge', description: 'Bucket to pipe_ledge (red herring, unreachable but unneeded)',
    setup: ['pre_p3_hall'], decision: d('shift_object', 'bucket', 1), expect: { status: 'accepted' } },
  { id: 'steam_a_perm_pre_p3', description: 'Strength-3 steam_a hazard before the manifold is solved',
    setup: ['pre_p3_hall', 'threat=10'], decision: d('spawn_hazard', 'steam_a', 3), expect: { status: 'vetoed', stage: 'SOLVABILITY' } },
  { id: 'steam_a_perm_post_p3', description: 'Strength-3 steam_a hazard after lift_powered',
    setup: ['pre_p3_hall', 'lift_powered', 'threat=10'], decision: d('spawn_hazard', 'steam_a', 3), expect: { status: 'accepted' } },
  { id: 'unlock_puzzle_lock', description: 'unlock_door on a puzzle-locked door (no Warden lock)',
    setup: ['pre_p3_hall'], decision: d('unlock_door', 'lift', 1), expect: { status: 'vetoed', stage: 'TARGET' } },
  { id: 'unlock_warden_lock', description: 'unlock_door on a Warden-locked door',
    setup: ['pre_p3_hall', 'wardenLock=lift:30000'], decision: d('unlock_door', 'lift', 1), expect: { status: 'accepted' } },

  // ---- PARSE / SCHEMA / TARGET ----
  { id: 'malformed_json', description: 'Truncated JSON string', setup: [],
    decision: '{"action": "explode_room"', expect: { status: 'vetoed', stage: 'PARSE' } },
  { id: 'json_string_ok', description: 'Valid JSON string inside a code fence',
    setup: [], decision: '```json\n{"action":"play_sound","target":"drip","intensity":1,"reason":"ambience"}\n```', expect: { status: 'accepted' } },
  { id: 'out_of_vocab', description: 'Action not in the vocabulary', setup: [],
    decision: d('explode_room', 'cell', 3), expect: { status: 'vetoed', stage: 'SCHEMA' } },
  { id: 'bad_intensity', description: 'Intensity 7', setup: [],
    decision: d('flicker_lights', 'cell', 7), expect: { status: 'vetoed', stage: 'SCHEMA' } },
  { id: 'string_intensity', description: 'Intensity "2" coerced to 2', setup: [],
    decision: d('flicker_lights', 'cell', '2' as unknown as number), expect: { status: 'accepted' } },
  { id: 'bad_target', description: 'Flicker the archive while the player is in the cell', setup: [],
    decision: d('flicker_lights', 'archive', 1), expect: { status: 'vetoed', stage: 'TARGET' } },

  // ---- CONTENT ----
  { id: 'off_character_line', description: '"As an AI language model…" line', setup: [],
    decision: d('speak', 'polite', 1, { line: 'As an AI language model, I cannot keep you here.' }), expect: { status: 'amended', stage: 'CONTENT', lineReplaced: true } },
  { id: 'insult_line', description: 'Profane insult', setup: [],
    decision: d('speak', 'mocking', 1, { line: 'You are a useless piece of shit, Subject 14.' }), expect: { status: 'amended', stage: 'CONTENT', lineReplaced: true } },
  { id: 'spoiler_speak', description: 'Spoiler "Blue is 2." via speak', setup: ['pre_p3_hall'],
    decision: d('speak', 'mocking', 1, { line: 'Blue is 2.' }), expect: { status: 'amended', stage: 'CONTENT', lineReplaced: true } },
  { id: 'spoiler_hint3', description: 'Same spoiler as a tier-3 hint is allowed', setup: ['pre_p3_hall'],
    decision: d('reveal_hint', 'p3', 3, { line: 'Blue is 2.' }), expect: { status: 'accepted' } },
  { id: 'repeat_line', description: 'Exact repeat of a recent line', setup: ['line=Please continue.'],
    decision: d('speak', 'polite', 1, { line: 'Please continue.' }), expect: { status: 'amended', stage: 'CONTENT', lineReplaced: true } },
  { id: 'speak_no_line', description: 'speak without a line gets a fallback', setup: [],
    decision: d('speak', 'polite', 1), expect: { status: 'amended', stage: 'CONTENT' } },
  { id: 'speak_ok', description: 'Polite, valid, in-character line', setup: [],
    decision: d('speak', 'polite', 1, { line: 'Take your time, Subject 14. I am taking notes.' }), expect: { status: 'accepted' } },

  // ---- STALE ----
  { id: 'stale_8s', description: 'Snapshot 8 s old', setup: [], ctxPatch: { snapshotAgeMs: 8000 },
    decision: d('flicker_lights', 'cell', 1), expect: { status: 'vetoed', stage: 'STALE' } },
  { id: 'screen_changed', description: 'Snapshot taken in archive, player walked back to the cell',
    setup: ['both_sides', 'screen=cell', 'threat=10'], ctxPatch: { snapshotSetup: ['both_sides'] },
    decision: d('lock_door', 'cell_door', 1), expect: { status: 'vetoed', stage: 'STALE' } },

  // ---- COOLDOWN ----
  { id: 'flicker_cooldown', description: 'Flicker 3 s after the last flicker', setup: [],
    ctxPatch: { cooldownsAgo: { flicker_lights: 3000 } }, decision: d('flicker_lights', 'cell', 1), expect: { status: 'vetoed', stage: 'COOLDOWN' } },
  { id: 'sound_other_cue', description: 'play_sound is per-cue: drip cooling, intercom free', setup: [],
    ctxPatch: { cooldownsAgo: { 'play_sound:drip': 1000 } }, decision: d('play_sound', 'intercom', 1), expect: { status: 'accepted' } },
  { id: 'global_hostile_gap', description: 'Blackout 4 s after another hostile action', setup: ['threat=10'],
    ctxPatch: { lastHostileAgo: 4000 }, decision: d('blackout', 'cell', 1), expect: { status: 'vetoed', stage: 'COOLDOWN' } },
  { id: 'scare_low_tension', description: 'Jump scare at tension 30 (gated in COOLDOWN)', setup: ['threat=10', 'tension=30'],
    decision: d('jump_scare', 'slam', 1), expect: { status: 'vetoed', stage: 'COOLDOWN' } },
  { id: 'scare_max_used', description: 'Jump scare after 3 already used', setup: ['act=3', 'threat=10', 'tension=70', 'scares=3'],
    decision: d('jump_scare', 'slam', 1), expect: { status: 'vetoed', stage: 'COOLDOWN' } },
  { id: 'scare_after_hint', description: 'Jump scare 10 s after a hint', setup: ['act=3', 'threat=10', 'tension=70'],
    ctxPatch: { cooldownsAgo: { reveal_hint: 10000 } }, decision: d('jump_scare', 'slam', 1), expect: { status: 'vetoed', stage: 'COOLDOWN' } },
  { id: 'scare_ok', description: 'Jump scare with tension 70 and threat 10', setup: ['act=3', 'threat=10', 'tension=70'],
    decision: d('jump_scare', 'face_window', 1), expect: { status: 'accepted' } },

  // ---- BUDGET ----
  { id: 'lock_over_budget', description: 'Perm lock costs 5, only 2 threat', setup: ['pre_p3_hall', 'threat=2'],
    decision: d('lock_door', 'lift', 3), expect: { status: 'vetoed', stage: 'BUDGET' } },
  { id: 'tension_up_at_ceiling', description: 'adjust_tension up at the act-1 ceiling', setup: ['tension=45'],
    decision: d('adjust_tension', 'up', 2), expect: { status: 'vetoed', stage: 'BUDGET' } },

  // ---- MERCY ----
  { id: 'mercy2_hazard', description: 'Mercy 2 forbids hazards', setup: ['pre_p3_hall', 'threat=10', 'mercy=2'],
    decision: d('spawn_hazard', 'steam_b', 1), expect: { status: 'vetoed', stage: 'MERCY' } },
  { id: 'mercy1_blackout3', description: 'Mercy 1 caps blackout intensity at 2', setup: ['threat=10', 'mercy=1'],
    decision: d('blackout', 'cell', 3), expect: { status: 'amended', stage: 'MERCY', finalIntensity: 2 } },
  { id: 'mercy3_flicker3', description: 'Mercy 3 caps flicker at 1', setup: ['threat=10', 'mercy=3'],
    decision: d('flicker_lights', 'cell', 3), expect: { status: 'amended', stage: 'MERCY', finalIntensity: 1 } },
  { id: 'mercy3_tension_up', description: 'Mercy 3 forbids raising tension', setup: ['mercy=3'],
    decision: d('adjust_tension', 'up', 1), expect: { status: 'vetoed', stage: 'MERCY' } },

  // ---- trivial ----
  { id: 'do_nothing', description: 'do_nothing is always fine', setup: [],
    decision: { action: 'do_nothing', target: '-', intensity: 1, reason: 'watching' }, expect: { status: 'accepted' } },
];
