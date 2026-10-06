// Golden-path walkthrough as data. Used by eval/golden.ts (headless test) and by debug save points (F1–F4).
import type { GameState, Glyph, LogEvent, Outcome, Shape } from '../types';
import { answer, interact, pressPad, tick } from './world';
import { createInitialState } from './state';
import { P1_CODE, P3_TRUE, P5_CODE } from './screens';

export type Op =
  | { op: 'click'; id: string; holding?: 'bulb' | 'token' }
  | { op: 'pad'; kind: 'keypad' | 'console'; syms: (Shape | Glyph)[] }
  | { op: 'answerCorrect'; times: number }
  | { op: 'tick'; ms: number }
  | { op: 'mark'; name: string };

const valveClicks = (c: 'red' | 'green' | 'blue' | 'yellow'): Op[] =>
  Array.from({ length: (P3_TRUE[c] - 1 + 4) % 4 }, () => ({ op: 'click', id: `valve_${c}` }) as Op);

export const GOLDEN: Op[] = [
  { op: 'mark', name: 'start' },
  { op: 'click', id: 'blanket' },
  { op: 'click', id: 'sink' },
  { op: 'click', id: 'mirror' },
  { op: 'click', id: 'cot' },
  { op: 'click', id: 'lamp' },
  { op: 'tick', ms: 100 },
  { op: 'click', id: 'scratches' },
  { op: 'pad', kind: 'keypad', syms: P1_CODE },
  { op: 'click', id: 'cell_door' },
  { op: 'mark', name: 'archive' },
  { op: 'click', id: 'fuse_cell_door' },
  { op: 'click', id: 'fuse_shutter' },
  { op: 'click', id: 'projector', holding: 'bulb' },
  { op: 'click', id: 'cabinets' },
  { op: 'click', id: 'projector' }, { op: 'click', id: 'projector' }, { op: 'click', id: 'projector' },
  { op: 'click', id: 'shutter' },
  { op: 'mark', name: 'hall' },
  ...valveClicks('red'), ...valveClicks('green'), ...valveClicks('blue'), ...valveClicks('yellow'),
  { op: 'click', id: 'lever' },
  { op: 'click', id: 'intercom' },
  { op: 'answerCorrect', times: 3 },
  { op: 'click', id: 'hall_to_archive' },
  { op: 'click', id: 'projector' }, { op: 'click', id: 'projector' }, { op: 'click', id: 'projector' }, { op: 'click', id: 'projector' },
  { op: 'click', id: 'shutter' },
  { op: 'mark', name: 'setpiece' },
  { op: 'click', id: 'hall_switch' },
  { op: 'click', id: 'hall_to_archive' },
  { op: 'click', id: 'fuse_camera' },
  { op: 'tick', ms: 100 },
  { op: 'click', id: 'shutter' },
  { op: 'click', id: 'hall_switch' },
  { op: 'click', id: 'window_hall' },
  { op: 'mark', name: 'console' },
  { op: 'click', id: 'lift_panel' },
  { op: 'pad', kind: 'console', syms: P5_CODE },
  { op: 'click', id: 'lift' },
  { op: 'mark', name: 'end' },
];

export interface RunResult { state: GameState; log: LogEvent[]; trace: string[]; marks: Record<string, GameState> }

/** Run ops headlessly. `onStep` gets the state after each op (for prefix solvability checks). */
export function runScript(ops: Op[], opts: { stopAt?: string; onStep?: (s: GameState, i: number, op: Op) => void } = {}): RunResult {
  const s = createInitialState();
  const log: LogEvent[] = [];
  const trace: string[] = [];
  const marks: Record<string, GameState> = {};
  const take = (o: Outcome) => { log.push(...(o.events ?? [])); for (const l of o.lines ?? []) trace.push(`${l.speaker}: ${l.text}`); };
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    take(tick(s, 1500)); // time passes between actions
    switch (op.op) {
      case 'mark': marks[op.name] = structuredClone(s); if (op.name === opts.stopAt) return { state: s, log, trace, marks }; break;
      case 'click': take(interact(s, op.id, op.holding ?? null)); break;
      case 'pad': for (const sym of op.syms) take(pressPad(s, op.kind, sym)); break;
      case 'answerCorrect': for (let k = 0; k < op.times; k++) { const q = s.interview.q; if (q) take(answer(s, q.correct)); } break;
      case 'tick': take(tick(s, op.ms)); break;
    }
    opts.onStep?.(s, i, op);
  }
  return { state: s, log, trace, marks };
}
