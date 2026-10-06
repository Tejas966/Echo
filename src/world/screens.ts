// Scene layout + puzzle constants. Shared by world (hit-testing), gfx (drawing) and rules.
// Logical canvas is 1280x720. Floor line at y = FLOOR_Y. Lead-owned.
import type { GameState, Glyph, Hotspot, ScreenId, Shape, ValveColor } from '../types';

export const W = 1280;
export const H = 720;
export const FLOOR_Y = 600;

// ---------- puzzle constants ----------
/** P1: wall scratches, left-to-right, each with a tally count. Answer = order by tally. */
export const P1_SCRATCHES: { shape: Shape; tally: number }[] = [
  { shape: 'circle', tally: 3 },
  { shape: 'cross', tally: 1 },
  { shape: 'square', tally: 4 },
  { shape: 'tri', tally: 2 },
];
export const P1_CODE: Shape[] = [...P1_SCRATCHES].sort((a, b) => a.tally - b.tally).map((s) => s.shape); // cross, tri, circle, square

/** P3: true valve settings. Slides show red/green/yellow truthfully; the blue slide is forged and shows 4. */
export const P3_TRUE: Record<ValveColor, 1 | 2 | 3 | 4> = { red: 3, green: 1, blue: 2, yellow: 4 };
export const P3_SLIDES: { color: ValveColor; shows: 1 | 2 | 3 | 4; subject: string; stamp: string; forged: boolean }[] = [
  { color: 'red', shows: 3, subject: 'SUBJECT 09', stamp: '1997-03-02', forged: false },
  { color: 'green', shows: 1, subject: 'SUBJECT 11', stamp: '2003-11-19', forged: false },
  { color: 'blue', shows: 4, subject: 'SUBJECT 14', stamp: 'TOMORROW', forged: true },
  { color: 'yellow', shows: 4, subject: 'SUBJECT 12', stamp: '2009-06-30', forged: false },
];
/** Slide 5 (appears after lift_powered): Subject 13 writing on the observation window. */
export const SLIDE_COUNT_BEFORE = 4;
export const SLIDE_COUNT_AFTER = 5;

/** P5: the code as Subject 13 wrote it (correct entry). The hall side shows it mirrored + reversed. */
export const P5_CODE: Glyph[] = ['R', 'DR', 'HL', 'R', 'DL'];
export const MIRROR: Record<Glyph, Glyph> = { L: 'R', R: 'L', DR: 'DL', DL: 'DR', HL: 'HR', HR: 'HL' };
export const P5_HALL_VIEW: Glyph[] = [...P5_CODE].reverse().map((g) => MIRROR[g]);
export const GLYPH_CHAR: Record<Glyph, string> = { L: '◀', R: '▶', DR: '◢', DL: '◣', HL: '⌐', HR: '¬' };
export const SHAPE_CHAR: Record<Shape, string> = { tri: '▲', circle: '●', square: '■', cross: '✚' };

/** Estimated solve minutes (mercy + breezing detection). */
export const PUZZLE_EST_MIN: Record<string, number> = { p1: 7, p2: 4, p3: 10, p4: 3, p5: 10, p6: 4, p7: 5 };

// ---------- helpers ----------
const dark = (s: GameState, scr: ScreenId) => s.lights[scr].level < 0.3;

// ---------- hotspots ----------
export const HOTSPOTS: Hotspot[] = [
  // CELL
  { id: 'blanket', screen: 'cell', x: 120, y: 470, w: 200, h: 40, label: 'Blanket', walkX: 220, visible: (s) => s.objects.cloth.anchor === 'cot' && !s.inventory.includes('cloth') },
  { id: 'blanket_floor', screen: 'cell', x: 540, y: 560, w: 130, h: 40, label: 'Blanket', walkX: 600, visible: (s) => s.objects.cloth.anchor === 'cell_floor' && !s.inventory.includes('cloth') },
  { id: 'blanket_under', screen: 'cell', x: 140, y: 575, w: 160, h: 25, label: 'Blanket (under the cot)', walkX: 220, visible: (s) => s.objects.cloth.anchor === 'under_cot' && !s.inventory.includes('cloth') },
  { id: 'cot', screen: 'cell', x: 80, y: 500, w: 300, h: 100, label: 'Cot', walkX: 230 },
  { id: 'lamp', screen: 'cell', x: 580, y: 30, w: 120, h: 50, label: 'Ceiling lamp', walkX: 640 },
  { id: 'sink', screen: 'cell', x: 400, y: 440, w: 110, h: 70, label: 'Sink', walkX: 455 },
  { id: 'mirror', screen: 'cell', x: 415, y: 310, w: 80, h: 100, label: 'Mirror', walkX: 455 },
  { id: 'scratches', screen: 'cell', x: 640, y: 230, w: 330, h: 170, label: 'Scratches', walkX: 800, visible: (s) => dark(s, 'cell') },
  { id: 'vent', screen: 'cell', x: 860, y: 540, w: 100, h: 50, label: 'Vent grate', walkX: 910 },
  { id: 'keypad', screen: 'cell', x: 1020, y: 380, w: 44, h: 66, label: 'Keypad', walkX: 1000 },
  { id: 'cell_door', screen: 'cell', x: 1090, y: 240, w: 150, h: 360, label: 'Door', walkX: 1060 },
  { id: 'eye_cell', screen: 'cell', x: 250, y: 120, w: 60, h: 60, label: 'Camera', walkX: 280 },

  // ARCHIVE
  { id: 'archive_to_cell', screen: 'archive', x: 0, y: 240, w: 90, h: 360, label: 'To cell', walkX: 60 },
  { id: 'cabinets', screen: 'archive', x: 120, y: 300, w: 240, h: 300, label: 'Filing cabinets', walkX: 240 },
  { id: 'drawer14', screen: 'archive', x: 300, y: 420, w: 60, h: 50, label: 'Drawer 14 — SUBJECT 14 — LIVE', walkX: 300 },
  { id: 'printer', screen: 'archive', x: 150, y: 250, w: 70, h: 40, label: 'Printer', walkX: 180 },
  { id: 'projector', screen: 'archive', x: 470, y: 480, w: 120, h: 70, label: 'Slide projector', walkX: 530 },
  { id: 'projection', screen: 'archive', x: 420, y: 130, w: 340, h: 210, label: 'Projection', walkX: 590, visible: (s) => s.slide > 0 },
  { id: 'stool', screen: 'archive', x: 380, y: 540, w: 60, h: 60, label: 'Stool', walkX: 410, visible: (s) => s.objects.stool.anchor === 'archive_floor' },
  { id: 'breaker', screen: 'archive', x: 790, y: 290, w: 160, h: 200, label: 'Breaker panel', walkX: 870 },
  { id: 'fuse_camera', screen: 'archive', x: 800, y: 330, w: 32, h: 70, label: 'CAMERA fuse slot', walkX: 870 },
  { id: 'fuse_archive_lights', screen: 'archive', x: 838, y: 330, w: 32, h: 70, label: 'LIGHTS fuse slot', walkX: 870 },
  { id: 'fuse_cell_door', screen: 'archive', x: 876, y: 330, w: 32, h: 70, label: 'CELL DOOR fuse slot', walkX: 870 },
  { id: 'fuse_shutter', screen: 'archive', x: 914, y: 330, w: 32, h: 70, label: 'SHUTTER fuse slot', walkX: 870 },
  { id: 'window_archive', screen: 'archive', x: 990, y: 190, w: 160, h: 200, label: 'Observation window', walkX: 1070 },
  { id: 'shutter', screen: 'archive', x: 1180, y: 240, w: 100, h: 360, label: 'Shutter', walkX: 1150 },
  { id: 'eye_archive', screen: 'archive', x: 640, y: 60, w: 60, h: 60, label: 'Camera', walkX: 670 },

  // HALL
  { id: 'hall_to_archive', screen: 'hall', x: 0, y: 240, w: 90, h: 360, label: 'To archive', walkX: 60 },
  { id: 'window_hall', screen: 'hall', x: 120, y: 190, w: 160, h: 200, label: 'Observation window', walkX: 200 },
  { id: 'valve_red', screen: 'hall', x: 380, y: 380, w: 60, h: 60, label: 'Red valve', walkX: 520 },
  { id: 'valve_green', screen: 'hall', x: 450, y: 380, w: 60, h: 60, label: 'Green valve', walkX: 520 },
  { id: 'valve_blue', screen: 'hall', x: 520, y: 380, w: 60, h: 60, label: 'Blue valve', walkX: 520 },
  { id: 'valve_yellow', screen: 'hall', x: 590, y: 380, w: 60, h: 60, label: 'Yellow valve', walkX: 520 },
  { id: 'lever', screen: 'hall', x: 670, y: 360, w: 40, h: 110, label: 'Pressure lever', walkX: 660 },
  { id: 'manifold', screen: 'hall', x: 370, y: 300, w: 300, h: 60, label: 'Pressure gauges', walkX: 520 },
  { id: 'hall_switch', screen: 'hall', x: 740, y: 380, w: 30, h: 50, label: 'Light switch', walkX: 755 },
  { id: 'intercom', screen: 'hall', x: 800, y: 330, w: 60, h: 90, label: 'Intercom', walkX: 850 },
  { id: 'lift_panel', screen: 'hall', x: 880, y: 360, w: 60, h: 100, label: 'Lift console', walkX: 910 },
  { id: 'lift', screen: 'hall', x: 980, y: 200, w: 220, h: 400, label: 'Lift', walkX: 1090 },
  { id: 'bucket', screen: 'hall', x: 300, y: 550, w: 60, h: 50, label: 'Bucket', walkX: 330, visible: (s) => s.objects.bucket.anchor === 'hall_floor' },
  { id: 'eye_hall', screen: 'hall', x: 1210, y: 90, w: 60, h: 60, label: 'Camera', walkX: 1150 },
];

export const hotspotsFor = (s: GameState) =>
  HOTSPOTS.filter((h) => h.screen === s.screen && (!h.visible || h.visible(s)));

export const hotspotById = (id: string) => HOTSPOTS.find((h) => h.id === id);

/** Eye (Warden camera) anchor per screen, for gfx. */
export const EYE_POS: Record<ScreenId, { x: number; y: number }> = {
  cell: { x: 280, y: 150 },
  archive: { x: 670, y: 90 },
  hall: { x: 1240, y: 120 },
  exit: { x: 640, y: 120 },
};

/** Hazard slot positions, for gfx particles. */
export const HAZARD_POS: Record<string, { screen: ScreenId; x: number; y: number }> = {
  steam_a: { screen: 'hall', x: 520, y: 260 },
  steam_b: { screen: 'hall', x: 1100, y: 180 },
  sparks_archive: { screen: 'archive', x: 870, y: 280 },
};
