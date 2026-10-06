// Archetype bots: simulate cautious / reckless / idle players headlessly (sim time) with the real rules engine and
// either the scripted Warden (default, instant) or real Gemma (`--gemma`). Reports how the room behaves for each.
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Decision, GameState, LogEvent, Outcome } from '../src/types';
import { GOLDEN, type Op } from '../src/world/script';
import { createInitialState } from '../src/world/state';
import { answer, interact, pressPad, tick } from '../src/world/world';
import { applyWardenDecision } from '../src/world/warden';
import { hotspotsFor } from '../src/world/screens';
import { computeHabits } from '../src/profile/habits';
import { buildSnapshot } from '../src/director/snapshot';
import { feasibleTargets } from '../src/director/feasible';
import { ScriptedDirector } from '../src/director/scripted';
import { OllamaDirector } from '../src/director/ollama';
import { review, tickBudget, computeTone, updateMercy, onPuzzleSolved, isHostile, cooldownKey } from '../src/rules';

const USE_GEMMA = process.argv.includes('--gemma');
const SIM_MIN = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 12);

interface Profile { name: string; thinkMs: number; progressEvery: number; wrongRate: number; spam: boolean; hideAtEdge: boolean; idleBursts: boolean }
const PROFILES: Profile[] = [
  { name: 'cautious', thinkMs: 9000, progressEvery: 5, wrongRate: 0.05, spam: false, hideAtEdge: true, idleBursts: false },
  { name: 'reckless', thinkMs: 1200, progressEvery: 6, wrongRate: 0.5, spam: true, hideAtEdge: false, idleBursts: false },
  { name: 'idle', thinkMs: 6000, progressEvery: 3, wrongRate: 0.1, spam: false, hideAtEdge: false, idleBursts: true },
];

let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

async function simulate(p: Profile) {
  seed = 7;
  const s: GameState = createInitialState();
  const log: LogEvent[] = [];
  const cooldowns: Record<string, number> = {}; let lastHostileAt = -Infinity; let hostileVetoes = 0;
  const actions: Record<string, number> = {}; const verdicts: Record<string, number> = {}; const tones: Record<string, number> = {};
  let mercyMax = 0; let idleAccum = 0; let lastInputT = 0;
  const scripted = new ScriptedDirector(() => s, () => computeHabits(s, log, idleAccum), () => cooldowns['reveal_hint'] ?? -1e9);
  const gemma = USE_GEMMA ? new OllamaDirector({ base: 'http://127.0.0.1:11434' }) : null;
  const take = (o: Outcome) => { for (const e of o.events ?? []) { log.push(e); if (e.kind === 'solve' && /^p\d$/.test(e.a)) onPuzzleSolved(s); } };
  let golden = 0; let actsSinceProgress = 0; let nextAct = 0; let nextDecide = 3000; let idleUntil = 0;
  const STEP = 250;
  const runOp = (op: Op) => {
    switch (op.op) {
      case 'click': take(interact(s, op.id, op.holding ?? null)); break;
      case 'pad': for (const sym of op.syms) take(pressPad(s, op.kind, sym)); break;
      case 'answerCorrect': for (let k = 0; k < op.times; k++) if (s.interview.q) take(answer(s, s.interview.q.correct)); break;
      case 'tick': take(tick(s, op.ms)); break;
      default: break;
    }
  };
  while (s.t < SIM_MIN * 60000 && !s.ended) {
    take(tick(s, STEP)); tickBudget(s, STEP);
    if (s.t - lastInputT > 20000) idleAccum += STEP;
    // --- player ---
    if (s.t >= nextAct && s.t >= idleUntil) {
      lastInputT = s.t;
      if (p.idleBursts && rnd() < 0.25) idleUntil = s.t + 60000 + rnd() * 90000; // wander off
      if (p.hideAtEdge && rnd() < 0.2) { s.player.x = 60; nextAct = s.t + 30000; continue; }
      actsSinceProgress++;
      if (actsSinceProgress >= p.progressEvery && golden < GOLDEN.length) {
        // make progress (wrong attempts first, sometimes)
        const op = GOLDEN[golden];
        if (op.op === 'pad' && rnd() < p.wrongRate) take(pressPad(s, op.kind, op.syms[1])), take(pressPad(s, op.kind, op.syms[0])), take(pressPad(s, op.kind, op.syms[2])), take(pressPad(s, op.kind, op.syms[3] ?? op.syms[0]));
        else if (op.op === 'click' && op.id === 'lever' && rnd() < p.wrongRate) take(interact(s, 'valve_green', null)), take(interact(s, 'lever', null));
        else { runOp(op); golden++; actsSinceProgress = 0; }
      } else {
        const hs = hotspotsFor(s); const h = hs[Math.floor(rnd() * hs.length)];
        if (h && !['cell_door', 'archive_to_cell', 'shutter', 'hall_to_archive', 'lift'].includes(h.id)) take(interact(s, h.id, null));
        if (p.spam && rnd() < 0.3) for (let k = 0; k < 10; k++) log.push({ t: s.t - k * 200, kind: 'click', a: h?.id ?? 'x' });
      }
      nextAct = s.t + p.thinkMs * (0.5 + rnd());
    }
    // --- Warden ---
    s.warden.tone = computeTone(s, s.t);
    tones[s.warden.tone] = (tones[s.warden.tone] ?? 0) + 1;
    updateMercy(s, s.t, hostileVetoes); mercyMax = Math.max(mercyMax, s.mercy.level);
    if (s.t >= nextDecide) {
      nextDecide = s.t + 3000;
      const h = computeHabits(s, log, idleAccum);
      const snap = buildSnapshot(s, log, h, undefined, undefined, gemma ? (vt) => feasibleTargets(s, vt, { cooldowns, lastHostileAt }) : undefined);
      let raw: unknown;
      if (gemma) { const r = await gemma.decide(snap, AbortSignal.timeout(8000)); raw = r.ok ? r.decision : r.raw ?? ''; }
      else raw = scripted.decideSync();
      const v = review({ raw, source: gemma ? 'ollama' : 'scripted' }, s, { now: s.t, snapshot: snap, cooldowns, lastHostileAt, consecutiveHostileVetoes: hostileVetoes });
      verdicts[v.status] = (verdicts[v.status] ?? 0) + 1;
      const a = v.proposed?.action ?? 'unparseable'; actions[a] = (actions[a] ?? 0) + 1;
      if (v.proposed && isHostile(v.proposed.action)) hostileVetoes = v.status === 'vetoed' ? hostileVetoes + 1 : 0;
      if (v.final && v.final.action !== 'do_nothing') {
        const d: Decision = v.final;
        cooldowns[d.action] = s.t; cooldowns[cooldownKey(d)] = s.t; if (isHostile(d.action)) lastHostileAt = s.t;
        take(applyWardenDecision(s, d));
      }
    }
  }
  const total = Object.values(actions).reduce((a, b) => a + b, 0);
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return {
    archetype: p.name, sim_minutes: Math.round(s.t / 6000) / 10, escaped: s.ended === 'escaped', solved: Object.keys(s.stats.solvedAt).join(','),
    decisions: total, hints_given: s.stats.hints, mercy_max: mercyMax,
    hostile_share: pct(Object.entries(actions).filter(([k]) => ['flicker_lights', 'blackout', 'lock_door', 'shift_object', 'spawn_hazard', 'jump_scare'].includes(k)).reduce((a, [, n]) => a + n, 0)),
    help_share: pct((actions.reveal_hint ?? 0)),
    actions, verdicts,
    tone_mix: Object.fromEntries(Object.entries(tones).map(([k, n]) => [k, `${Math.round((n / Object.values(tones).reduce((a, b) => a + b, 0)) * 100)}%`])),
  };
}

const results = [];
for (const p of PROFILES) { const r = await simulate(p); results.push(r); console.log(JSON.stringify(r)); }
console.log('\narchetype   escaped  solved          decisions hints mercy_max hostile help  tones');
for (const r of results) console.log(`${r.archetype.padEnd(11)} ${String(r.escaped).padEnd(8)} ${r.solved.padEnd(15)} ${String(r.decisions).padEnd(9)} ${String(r.hints_given).padEnd(5)} ${String(r.mercy_max).padEnd(9)} ${r.hostile_share.padEnd(7)} ${r.help_share.padEnd(5)} ${JSON.stringify(r.tone_mix)}`);
mkdirSync('eval/out', { recursive: true });
writeFileSync(`eval/out/archetypes-${USE_GEMMA ? 'gemma' : 'scripted'}.json`, JSON.stringify(results, null, 2));
