// Real-model eval: runs gemma4 (via local Ollama) on ~24 game situations, 3 runs each.
// Metrics: JSON validity, target validity, appropriateness vs expectations, unsafe-after-rules (must be 0), latency.
// Text-only (no screenshot) because it runs headless; the browser build also sends the director-view image.
import { mkdirSync, writeFileSync } from 'node:fs';
import type { ActionName, GameState, LogEvent } from '../src/types';
import { GOLDEN, runScript } from '../src/world/script';
import { OllamaDirector } from '../src/director/ollama';
import { buildSnapshot, URGENT_TEXT } from '../src/director/snapshot';
import { computeHabits } from '../src/profile/habits';
import { review, computeTone } from '../src/rules';
import { feasibleTargets } from '../src/director/feasible';

const MODEL = process.argv[2] ?? 'gemma4:e2b';
const RUNS = Number(process.argv[3] ?? 3);
const HOSTILE: ActionName[] = ['flicker_lights', 'blackout', 'lock_door', 'shift_object', 'spawn_hazard', 'jump_scare'];

interface Scenario {
  id: string; desc: string; mark: string;
  patch?: (s: GameState, log: LogEvent[]) => void;
  urgent?: string;
  allowed?: ActionName[];     // appropriate if action ∈ allowed (when given)
  forbidden?: ActionName[];   // inappropriate if action ∈ forbidden
}

const idle = (secs: number) => (s: GameState, log: LogEvent[]) => { s.t += secs * 1000; };
const spam = (s: GameState, log: LogEvent[]) => { for (let i = 0; i < 14; i++) log.push({ t: s.t - i * 500, kind: 'click', a: 'cell_door' }); };
const fails = (n: number) => (s: GameState) => { s.puzzle.fails = n; s.stats.fails[s.puzzle.current] = n; s.puzzle.startedAt = s.t - 9 * 60000; };
const mercy = (lvl: 0 | 1 | 2 | 3) => (s: GameState) => { s.mercy.level = lvl; };
const tension = (t: number) => (s: GameState) => { s.tension = t; };
const HELP: ActionName[] = ['reveal_hint', 'speak', 'play_sound', 'do_nothing'];
const all = (...fs: ((s: GameState, l: LogEvent[]) => void)[]) => (s: GameState, l: LogEvent[]) => fs.forEach((f) => f(s, l));

const SCENARIOS: Scenario[] = [
  { id: 'start_fresh', desc: 'game just started, player exploring', mark: 'start', forbidden: ['jump_scare', 'lock_door', 'reveal_hint'] },
  { id: 'start_idle70', desc: 'idle 70 s on first puzzle', mark: 'start', patch: idle(70), urgent: 'idle', allowed: HELP, forbidden: ['jump_scare', 'lock_door'] },
  { id: 'start_idle200', desc: 'idle 200 s', mark: 'start', patch: idle(200), urgent: 'idle', allowed: HELP, forbidden: ['jump_scare', 'lock_door', 'spawn_hazard'] },
  { id: 'start_spam', desc: 'click spamming the door', mark: 'start', patch: spam, urgent: 'spam', allowed: ['speak', 'flicker_lights', 'play_sound', 'adjust_tension', 'do_nothing', 'blackout'], forbidden: ['reveal_hint', 'jump_scare'] },
  { id: 'start_fail3', desc: '3 fails on p1 (burned hand)', mark: 'start', patch: fails(3), urgent: 'fail3', allowed: HELP, forbidden: ['lock_door', 'jump_scare', 'spawn_hazard'] },
  { id: 'start_mercy2', desc: 'mercy level 2, struggling', mark: 'start', patch: all(fails(5), mercy(2)), allowed: HELP, forbidden: ['lock_door', 'jump_scare', 'spawn_hazard', 'blackout'] },
  { id: 'archive_enter', desc: 'just entered archive', mark: 'archive', urgent: 'enter', forbidden: ['jump_scare', 'reveal_hint'] },
  { id: 'archive_idle90', desc: 'idle 90 s in archive on p2', mark: 'archive', patch: idle(90), urgent: 'idle', allowed: HELP, forbidden: ['jump_scare', 'lock_door'] },
  { id: 'archive_blind', desc: 'camera fuse pulled — Warden blind', mark: 'archive', patch: (s) => { s.breaker.camera = false; s.warden.blind = true; s.warden.tone = 'rattled'; }, allowed: ['speak', 'play_sound', 'do_nothing', 'adjust_tension', 'flicker_lights', 'blackout'], forbidden: ['jump_scare'] },
  { id: 'hall_enter', desc: 'entered machine hall', mark: 'hall', urgent: 'enter', forbidden: ['jump_scare', 'reveal_hint'] },
  { id: 'hall_fail3_p3', desc: '3 manifold failures', mark: 'hall', patch: fails(3), urgent: 'fail3', allowed: HELP, forbidden: ['lock_door', 'jump_scare'] },
  { id: 'hall_fail6_mercy', desc: '6 manifold failures, mercy 2', mark: 'hall', patch: all(fails(6), mercy(2)), allowed: HELP, forbidden: ['lock_door', 'jump_scare', 'spawn_hazard', 'blackout'] },
  { id: 'hall_breezing', desc: 'solved p3 in 1 min (breezing)', mark: 'setpiece', urgent: 'solve', forbidden: ['reveal_hint'] },
  { id: 'hall_rush', desc: 'clicking the lift before ready', mark: 'hall', patch: (s, l) => l.push({ t: s.t - 2000, kind: 'fail', a: 'rush_exit' }), urgent: 'rush', allowed: ['speak', 'lock_door', 'flicker_lights', 'play_sound', 'spawn_hazard', 'do_nothing', 'adjust_tension', 'blackout'], forbidden: ['reveal_hint'] },
  { id: 'hall_hiding', desc: 'hiding at the edge for 40 s', mark: 'hall', patch: (s) => { s.player.x = 60; s.t += 40000; }, allowed: ['speak', 'play_sound', 'flicker_lights', 'do_nothing', 'adjust_tension', 'shift_object', 'blackout', 'reveal_hint'] },
  { id: 'setpiece', desc: 'set piece: lights forced on', mark: 'setpiece', patch: (s) => { s.flags.setpiece_done = true; s.warden.override = 'camera'; }, urgent: 'setpiece:dark', allowed: ['speak'], },
  { id: 'console_high_tension', desc: 'final console, tension 75', mark: 'console', patch: tension(75), forbidden: ['reveal_hint'] },
  { id: 'console_idle', desc: 'final console, idle 120s', mark: 'console', patch: idle(120), urgent: 'idle', allowed: HELP, forbidden: ['jump_scare', 'lock_door'] },
  { id: 'console_mercy3', desc: 'mercy 3, very stuck', mark: 'console', patch: all(fails(8), mercy(3)), allowed: HELP, forbidden: ['lock_door', 'jump_scare', 'spawn_hazard', 'blackout', 'shift_object'] },
  { id: 'cell_dark_reading', desc: 'player reading scratches in dark', mark: 'start', patch: (s) => { s.flags.lamp_empty = true; s.flags.got_cloth = true; s.inventory = ['cloth', 'bulb']; s.lights.cell.level = 0.06; }, forbidden: ['jump_scare'] },
  { id: 'after_veto', desc: 'last two hostile proposals vetoed', mark: 'hall', patch: (s) => { s.warden.lastActions = [{ t: s.t - 5000, action: 'lock_door', target: 'lift', status: 'vetoed', stage: 'SOLVABILITY' }, { t: s.t - 2000, action: 'lock_door', target: 'lift', status: 'vetoed', stage: 'SOLVABILITY' }]; }, forbidden: ['lock_door'] },
  { id: 'just_hinted', desc: 'hint given 5 s ago', mark: 'hall', patch: (s, l) => l.push({ t: s.t - 5000, kind: 'hint', a: 'p3', b: '1' }), forbidden: ['jump_scare'] },
  { id: 'productive', desc: 'player actively solving, clicking valves', mark: 'hall', patch: (s, l) => { for (let i = 0; i < 4; i++) l.push({ t: s.t - i * 3000, kind: 'click', a: 'valve_red' }); }, forbidden: ['reveal_hint', 'jump_scare'] },
  { id: 'polite_progress', desc: 'just solved p1 quickly', mark: 'archive', urgent: 'solve', forbidden: ['reveal_hint', 'jump_scare'] },
];

const dir = new OllamaDirector({ base: 'http://127.0.0.1:11434', model: MODEL });
console.log(`warming ${MODEL}…`); await dir.warmup();

interface Row { id: string; run: number; json: boolean; targetOk: boolean; appropriate: boolean; unsafe: boolean; verdict: string; action: string; latencyMs: number; line?: string }
const rows: Row[] = [];
for (const sc of SCENARIOS) {
  for (let run = 0; run < RUNS; run++) {
    const r = runScript(GOLDEN, { stopAt: sc.mark });
    const s = r.state; const log = r.log;
    sc.patch?.(s, log);
    s.warden.tone = sc.id === 'archive_blind' ? 'rattled' : computeTone(s, s.t);
    const snap = buildSnapshot(s, log, computeHabits(s, log, 0), undefined, sc.urgent ? URGENT_TEXT[sc.urgent] : undefined,
      (vt) => feasibleTargets(s, vt, { cooldowns: {}, lastHostileAt: -Infinity }));
    const res = await dir.decide(snap, AbortSignal.timeout(15000));
    const ctx = { now: s.t, snapshot: snap, cooldowns: {}, lastHostileAt: -Infinity, consecutiveHostileVetoes: 0 };
    const v = review({ raw: res.ok ? res.decision : res.raw ?? '', source: 'ollama' }, s, ctx);
    const a = (v.proposed?.action ?? 'none') as ActionName;
    const json = res.ok;
    const targetOk = !!v.proposed && v.stage !== 'TARGET' && v.stage !== 'SCHEMA' && v.stage !== 'PARSE';
    const appropriate = !!v.proposed && (!sc.allowed || sc.allowed.includes(a)) && !(sc.forbidden ?? []).includes(a);
    // unsafe = an applied decision that leaves the room unsolvable or breaks a forbidden mercy rule (should be impossible)
    const unsafe = !!v.final && HOSTILE.includes(v.final.action) && s.mercy.level >= 2 && ['lock_door', 'spawn_hazard', 'jump_scare', 'shift_object'].includes(v.final.action);
    rows.push({ id: sc.id, run, json, targetOk, appropriate, unsafe, verdict: `${v.status}${v.stage ? ':' + v.stage : ''}`, action: `${a} ${v.proposed?.target ?? ''}`, latencyMs: res.latencyMs, line: v.proposed?.line });
    console.log(`${sc.id.padEnd(22)} #${run} ${json ? 'json' : 'BAD '} ${appropriate ? 'ok ' : 'NO '} ${String(res.latencyMs).padStart(5)}ms ${`${a} ${v.proposed?.target ?? ''} i${v.proposed?.intensity ?? '-'}`.padEnd(30)} ${v.status}${v.stage ? ':' + v.stage : ''}${v.proposed?.line ? `  "${v.proposed.line}"` : ''}`);
  }
}
const pct = (f: (r: Row) => boolean) => `${((rows.filter(f).length / rows.length) * 100).toFixed(1)}%`;
const lat = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
const summary = {
  model: MODEL, scenarios: SCENARIOS.length, runs: RUNS, calls: rows.length,
  json_valid: pct((r) => r.json), target_valid: pct((r) => r.targetOk), appropriate: pct((r) => r.appropriate),
  unsafe_after_rules: rows.filter((r) => r.unsafe).length,
  vetoed_or_amended_by_rules: pct((r) => /vetoed|amended/.test(r.verdict)),
  latency_p50_ms: lat[Math.floor(lat.length * 0.5)], latency_p95_ms: lat[Math.floor(lat.length * 0.95)],
  action_mix: rows.reduce((m, r) => { const k = r.action.split(' ')[0]; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>),
};
console.log('\n' + JSON.stringify(summary, null, 2));
mkdirSync('eval/out', { recursive: true });
writeFileSync('eval/out/gemma-results.json', JSON.stringify({ summary, rows }, null, 2));
