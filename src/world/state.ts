import type { GameState } from '../types';

export function createInitialState(): GameState {
  return {
    v: 0,
    t: 0,
    screen: 'cell',
    act: 1,
    player: { x: 640, targetX: null, facing: 1, standingOn: null, holding: null },
    inventory: [],
    flags: {},
    doors: {
      cell_door: { open: false },
      shutter: { open: false },
      lift: { open: false },
    },
    objects: { cloth: { anchor: 'cot' }, stool: { anchor: 'archive_floor' }, bucket: { anchor: 'hall_floor' } },
    lights: {
      cell: { level: 1, mode: 'on' },
      archive: { level: 0.75, mode: 'on' },
      hall: { level: 0.8, mode: 'on' },
      exit: { level: 0.5, mode: 'on' },
    },
    hazards: [],
    breaker: { camera: true, archive_lights: true, cell_door: true, shutter: false },
    valves: { red: 1, green: 1, blue: 1, yellow: 1 },
    slide: 0,
    keypadEntry: [],
    consoleEntry: [],
    journal: [],
    tension: 15,
    threat: 6,
    mercy: { level: 0, since: 0 },
    warden: { tone: 'polite', blind: false, lineHistory: [], lastActions: [], override: null },
    puzzle: { current: 'p1', startedAt: 0, fails: 0, hints: 0 },
    stats: { fails: {}, hints: 0, clicks: 0, solvedAt: {} },
    scaresUsed: 0,
    interview: { asked: 0, correct: 0, q: null },
    ended: null,
  };
}

/** Deep clone (state is plain JSON). */
export const cloneState = (s: GameState): GameState => structuredClone(s);
