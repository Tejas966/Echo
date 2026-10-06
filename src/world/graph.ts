// Puzzle dependency graph as DATA (mirrors docs/02 §4). Consumed by rules/solvability.ts and eval/golden.ts.
// Items are never irreversibly consumed in Tier 1, so the world sets flag `got_<item>` when an item is first
// acquired; an item requirement is satisfied by inventory OR that flag. Doors count as open if state.doors[id].open
// OR the door's openFlag is set, unless a permanent Warden lock is on it.
import type { DoorId, ItemId, MovableId, ScreenId } from '../types';

export interface GraphDoor { id: DoorId; a: ScreenId; b: ScreenId; openFlag: string; failOpen: boolean }
export interface GraphAnchor { screen: ScreenId; flags?: string[] }
export interface GraphStep {
  id: string;
  tier?: 1 | 2;
  screen?: ScreenId;
  anchor?: string;            // must be able to reach this anchor
  anchorOf?: MovableId;       // must be able to reach wherever this movable currently is
  items?: ItemId[];
  flags?: string[];
  /** Hazard slot whose permanent hazard disables this step. */
  zone?: string;
  grants: { items?: ItemId[]; flags?: string[] };
}

export const SCREENS: ScreenId[] = ['cell', 'archive', 'hall', 'exit'];

export const DOORS: GraphDoor[] = [
  { id: 'cell_door', a: 'cell', b: 'archive', openFlag: 'p1_solved', failOpen: true },
  { id: 'shutter', a: 'archive', b: 'hall', openFlag: 'shutter_open', failOpen: true },
  { id: 'lift', a: 'hall', b: 'exit', openFlag: 'p5_solved', failOpen: true },
];

export const ANCHORS: Record<string, GraphAnchor> = {
  cot: { screen: 'cell' },
  cell_floor: { screen: 'cell' },
  under_cot: { screen: 'cell' },
  ceiling_lamp: { screen: 'cell', flags: ['standing_cot'] },
  vent_shaft: { screen: 'cell', flags: ['p6_vent_open'] },
  archive_floor: { screen: 'archive' },
  top_shelf: { screen: 'archive', flags: ['stool_under_shelf'] },
  hall_floor: { screen: 'hall' },
  pipe_ledge: { screen: 'hall', flags: ['never'] },
};

/** Anchors each movable may be shifted to by the Warden. */
export const MOVABLE_ANCHORS: Record<MovableId, string[]> = {
  cloth: ['cot', 'cell_floor', 'under_cot', 'vent_shaft'],
  stool: ['archive_floor', 'top_shelf'],
  bucket: ['hall_floor', 'pipe_ledge'],
};

export const STEPS: GraphStep[] = [
  { id: 'take_cloth', anchorOf: 'cloth', grants: { items: ['cloth'] } },
  { id: 'stand_cot', screen: 'cell', grants: { flags: ['standing_cot'] } },
  { id: 'take_bulb', anchor: 'ceiling_lamp', items: ['cloth'], grants: { items: ['bulb'], flags: ['cell_dark'] } },
  { id: 'read_scratches', screen: 'cell', flags: ['cell_dark'], grants: { flags: ['knows_shapes', 'knows_blue'] } },
  { id: 'steam_mirror', screen: 'cell', grants: { flags: ['knows_mirror'] } },
  { id: 'p1_keypad', screen: 'cell', flags: ['knows_shapes', 'knows_mirror'], grants: { flags: ['p1_solved'] } },

  { id: 'power_shutter', screen: 'archive', items: ['cloth'], zone: 'sparks_archive', grants: { flags: ['shutter_open'] } },

  { id: 'projector_on', screen: 'archive', items: ['bulb'], grants: { flags: ['slides_seen'] } },
  { id: 'read_file12', screen: 'archive', grants: { flags: ['knows_yellow'] } },
  { id: 'p3_manifold', screen: 'hall', flags: ['slides_seen', 'knows_blue', 'knows_yellow'], zone: 'steam_a', grants: { flags: ['lift_powered'] } },

  { id: 'p4_interview', screen: 'hall', grants: { flags: ['cage_open'], items: ['token'] } },

  { id: 'slide5', screen: 'archive', items: ['bulb'], flags: ['lift_powered'], grants: { flags: ['knows_window'] } },
  { id: 'blind_warden', screen: 'archive', items: ['cloth'], zone: 'sparks_archive', grants: { flags: ['override_broken', 'archive_lit'] } },
  { id: 'read_window', screen: 'hall', flags: ['knows_window', 'override_broken', 'archive_lit'], grants: { flags: ['knows_code'] } },
  { id: 'p5_lift', screen: 'hall', flags: ['knows_code', 'lift_powered', 'cage_open'], grants: { flags: ['p5_solved', 'escaped'] } },

  { id: 'p6_vent', tier: 2, screen: 'cell', items: ['token'], grants: { flags: ['p6_vent_open'], items: ['spare_fuse'] } },
];

/** The intended solution order (golden path), used for veto explanations and eval. */
export const GOLDEN_PATH = [
  'take_cloth', 'steam_mirror', 'stand_cot', 'take_bulb', 'read_scratches', 'p1_keypad', 'power_shutter',
  'projector_on', 'read_file12', 'p3_manifold', 'p4_interview', 'slide5', 'blind_warden', 'read_window', 'p5_lift',
];

/** Human-readable descriptions for veto messages. */
export const STEP_LABEL: Record<string, string> = {
  take_cloth: 'take the blanket', stand_cot: 'stand on the cot', take_bulb: 'unscrew the bulb',
  read_scratches: 'read the scratches', steam_mirror: 'read the steamed mirror', read_file12: 'read the file of Subject 12', p1_keypad: 'open the cell door', power_shutter: 'power the shutter',
  projector_on: 'run the projector', p3_manifold: 'pressurise the manifold', p4_interview: 'pass the interview',
  slide5: 'see slide 5', blind_warden: 'pull the camera fuse', read_window: 'read the window', p5_lift: 'enter the lift code',
  p6_vent: 'open the vent',
};
