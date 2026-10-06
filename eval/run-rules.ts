// Deterministic rules-engine eval: `npx tsx eval/run-rules.ts`. Exits 1 on any failure.
// (no @types/node in this repo: node builtins are loaded via a non-literal dynamic import, typed loosely)
import type { DoorId, GameState, ReviewContext, ScreenId, Verdict } from '../src/types';
import { createInitialState } from '../src/world/state';
import { validTargets } from '../src/director/vocabulary';
import {
  review, checkSolvable, filterLine, FALLBACK_LINES, fallbackLine, tickBudget, applyTensionDelta,
  updateMercy, onPuzzleSolved, computeTone,
} from '../src/rules';
import { SCENARIOS, type Scenario } from './scenarios/rules';

const NOW = 100_000;

// ---------- named state patches ----------
const PATCHES: Record<string, (s: GameState) => void> = {
  has_cloth: (s) => { s.inventory.push('cloth'); s.flags.got_cloth = true; },
  both_sides: (s) => {
    Object.assign(s.flags, {
      got_cloth: true, got_bulb: true, standing_cot: true, cell_dark: true, knows_shapes: true, knows_blue: true,
      p1_solved: true, shutter_open: true,
    });
    s.inventory = ['cloth', 'bulb'];
    s.doors.cell_door.open = true;
    s.doors.shutter.open = true;
    s.screen = 'archive';
    s.act = 2;
    s.tension = 40;
    s.stats.solvedAt = { p1: 40_000, p2: 70_000 };
    s.puzzle = { current: 'p3', startedAt: 70_000, fails: 0, hints: 0 };
  },
  pre_p3_hall: (s) => { PATCHES.both_sides(s); s.flags.slides_seen = true; s.screen = 'hall'; },
  lift_powered: (s) => {
    s.flags.lift_powered = true;
    s.stats.solvedAt.p3 = 90_000;
    s.puzzle = { current: 'p4', startedAt: 90_000, fails: 0, hints: 0 };
  },
};

function applyPatch(s: GameState, p: string): void {
  if (PATCHES[p]) return PATCHES[p](s);
  const eq = p.indexOf('=');
  if (eq < 0) throw new Error(`unknown patch "${p}"`);
  const k = p.slice(0, eq), v = p.slice(eq + 1);
  switch (k) {
    case 'tension': s.tension = Number(v); break;
    case 'threat': s.threat = Number(v); break;
    case 'mercy': s.mercy = { level: Number(v) as 0 | 1 | 2 | 3, since: NOW }; break;
    case 'scares': s.scaresUsed = Number(v); break;
    case 'screen': s.screen = v as ScreenId; break;
    case 'act': s.act = Number(v) as 1 | 2 | 3 | 4; break;
    case 'line': s.warden.lineHistory.push(v); break;
    case 'wardenLock': {
      const [door, until] = v.split(':');
      s.doors[door as DoorId].wardenLock = { until: until === 'perm' ? 'perm' : NOW + Number(until) };
      break;
    }
    default: throw new Error(`unknown patch key "${k}"`);
  }
}

export function buildState(setup: string[]): GameState {
  const s = createInitialState();
  s.t = NOW;
  s.puzzle.startedAt = NOW - 60_000;
  for (const p of setup) applyPatch(s, p);
  return s;
}

/** ReviewContext whose snapshot validTargets = validTargets(snapState) and t = now - age. */
export function buildCtx(state: GameState, patch: Scenario['ctxPatch'] = {}): ReviewContext {
  const snapState = patch.snapshotSetup ? buildState(patch.snapshotSetup) : state;
  const cooldowns: Record<string, number> = {};
  for (const [k, ago] of Object.entries(patch.cooldownsAgo ?? {})) cooldowns[k] = NOW - ago;
  return {
    now: NOW,
    snapshot: {
      t: NOW - (patch.snapshotAgeMs ?? 0), v: snapState.v, screen: snapState.screen, text: '',
      validTargets: validTargets(snapState),
    },
    cooldowns,
    lastHostileAt: patch.lastHostileAgo !== undefined ? NOW - patch.lastHostileAgo : -Infinity,
    consecutiveHostileVetoes: patch.consecutiveHostileVetoes ?? 0,
  };
}

// ---------- run scenarios ----------
interface Row { id: string; expected: string; got: string; pass: boolean; detail?: string }
const rows: Row[] = [];
const fmt = (status: string, stage?: string) => (stage ? `${status}/${stage}` : status);

for (const sc of SCENARIOS) {
  let v: Verdict | null = null;
  let pass = false;
  let err: string | undefined;
  try {
    const state = buildState(sc.setup);
    const before = JSON.stringify(state);
    v = review({ raw: sc.decision, source: 'mock' }, state, buildCtx(state, sc.ctxPatch));
    if (JSON.stringify(state) !== before) err = 'review() mutated state';
    pass = !err && v.status === sc.expect.status && (sc.expect.stage === undefined || v.stage === sc.expect.stage);
    if (pass && sc.expect.finalIntensity !== undefined) pass = v.final?.intensity === sc.expect.finalIntensity;
    if (pass && sc.expect.lineReplaced) {
      const orig = (sc.decision as { line?: string }).line;
      pass = !!v.final?.line && v.final.line !== orig;
    }
    if (pass && v.final?.line) {
      const f = filterLine(v.final.line, { state, action: v.final.action, intensity: v.final.intensity });
      if (!f.ok) { pass = false; err = `final line fails filter: ${f.reason}`; }
    }
  } catch (e) {
    pass = false;
    err = `threw: ${(e as Error).message}`;
  }
  rows.push({ id: sc.id, expected: fmt(sc.expect.status, sc.expect.stage), got: v ? fmt(v.status, v.stage) : 'ERROR', pass, detail: err ?? v?.detail });
}

// ---------- unit checks for the other modules ----------
function unit(id: string, expected: string, fn: () => string): void {
  let got = 'ERROR';
  try { got = fn(); } catch (e) { got = `threw: ${(e as Error).message}`; }
  rows.push({ id, expected, got, pass: got === expected });
}

unit('u_golden_initial_solvable', 'true', () => String(checkSolvable(createInitialState()).ok));
unit('u_preexisting_not_blamed', 'true', () => {
  const s = buildState(['pre_p3_hall']);
  s.doors.lift.wardenLock = { until: 'perm' };
  return String(checkSolvable(s, { action: 'flicker_lights', target: 'hall', intensity: 1, reason: '' }).ok);
});
unit('u_lift_detail', 'lift is the only route to EXIT', () =>
  checkSolvable(buildState(['pre_p3_hall']), { action: 'lock_door', target: 'lift', intensity: 3, reason: '' }).detail ?? '');
unit('u_cloth_detail', 'cloth unreachable at vent_shaft; needed to unscrew the bulb', () =>
  checkSolvable(buildState([]), { action: 'shift_object', target: 'cloth', intensity: 3, reason: '' }).detail ?? '');
unit('u_fallback_lines_clean', 'ok', () => {
  const s = createInitialState();
  for (const [tone, lines] of Object.entries(FALLBACK_LINES)) {
    if (lines.length !== 8) return `${tone} has ${lines.length} lines`;
    for (const l of lines) { const f = filterLine(l, { state: s, action: 'speak', intensity: 1 }); if (!f.ok) return `${l}: ${f.reason}`; }
  }
  return 'ok';
});
unit('u_fallback_avoid', 'true', () => {
  const first = fallbackLine('polite', 0);
  return String(fallbackLine('polite', 0, [first]) !== first);
});
unit('u_filter_glyph_spoiler', 'false', () => String(filterLine('Remember: ▶ ◢ ⌐ ▶ ◣', { state: createInitialState(), action: 'speak', intensity: 1 }).ok));
unit('u_filter_shape_spoiler', 'false', () => String(filterLine('Cross, triangle, circle, square.', { state: createInitialState(), action: 'speak', intensity: 1 }).ok));
unit('u_filter_bangs', 'false', () => String(filterLine('Run! Run!', { state: createInitialState(), action: 'speak', intensity: 1 }).ok));
unit('u_tick_budget', 'threat=8 tension=16 | threat=10 tension=15', () => {
  const s = createInitialState(); s.threat = 6; s.tension = 20;
  for (let i = 0; i < 120; i++) tickBudget(s, 100); // 12 s: +2 threat, -4 tension
  const a = `threat=${s.threat} tension=${s.tension}`;
  for (let i = 0; i < 600; i++) tickBudget(s, 100); // +60 s: threat caps at 10, tension stops at floor 15
  return `${a} | threat=${s.threat} tension=${s.tension}`;
});
unit('u_tension_clamp', '45', () => { const s = createInitialState(); applyTensionDelta(s, 100); return String(s.tension); });
unit('u_mercy_escalate', '1,2,0', () => {
  const s = createInitialState(); s.puzzle.fails = 3;
  const a = updateMercy(s, 10_000, 0).level;
  s.puzzle.fails = 5;
  const b = updateMercy(s, 20_000, 0).level;
  onPuzzleSolved(s);
  return `${a},${b},${s.mercy.level}`;
});
unit('u_mercy_vetoes_to_3', '3', () => String(updateMercy(createInitialState(), 1000, 5).level));
unit('u_tone', 'polite,mocking,rattled,cold', () => {
  const s = createInitialState();
  const t0 = computeTone(s, 60_000);
  s.puzzle.fails = 3; const t1 = computeTone(s, 60_000); s.puzzle.fails = 0;
  s.warden.blind = true; const t2 = computeTone(s, 60_000); s.warden.blind = false;
  s.mercy.level = 2; const t3 = computeTone(s, 60_000);
  return [t0, t1, t2, t3].join(',');
});
unit('u_never_throws', 'vetoed/SCHEMA', () => {
  const v = review({ raw: { action: 'speak', target: 'polite', intensity: 1, reason: 'x' }, source: 'mock' }, createInitialState(), {} as ReviewContext);
  return fmt(v.status, v.stage);
});

// ---------- report ----------
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
console.log(`${pad('id', 30)} ${pad('expected', 22)} ${pad('got', 22)} result  detail`);
console.log('-'.repeat(120));
for (const r of rows) console.log(`${pad(r.id, 30)} ${pad(r.expected, 22)} ${pad(r.got, 22)} ${r.pass ? 'PASS  ' : 'FAIL  '}  ${r.detail ?? ''}`);
const passed = rows.filter((r) => r.pass).length;
const rate = ((passed / rows.length) * 100).toFixed(1);
console.log('-'.repeat(120));
console.log(`rules eval: ${passed}/${rows.length} passed (${rate}%) — ${SCENARIOS.length} pipeline scenarios + ${rows.length - SCENARIOS.length} unit checks`);

const fsMod = 'node:fs';
const fs: { mkdirSync(p: URL, o: object): void; writeFileSync(p: URL, d: string): void } = await import(fsMod);
const outDir = new URL('./out/', import.meta.url);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(new URL('rules-results.json', outDir), JSON.stringify({ passed, total: rows.length, rate: Number(rate), rows }, null, 2));
console.log('wrote eval/out/rules-results.json');

const proc = (globalThis as unknown as { process: { exit(code: number): never } }).process;
if (passed !== rows.length) proc.exit(1);
