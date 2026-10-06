// Headless run of the live failure demo: real Scheduler + bad-brain MockDirector against a mid-game state.
// Verifies every bad decision is vetoed / amended / falls back, and the game state stays solvable.
import { Scheduler } from '../src/director/scheduler';
import { GOLDEN, runScript } from '../src/world/script';
import { applyWardenDecision } from '../src/world/warden';
import { tick } from '../src/world/world';
import { computeHabits } from '../src/profile/habits';
import { checkSolvable } from '../src/rules';
import type { MindRecord } from '../src/director/scheduler';

const where = (process.argv[2] ?? 'hall') as 'start' | 'archive' | 'hall' | 'setpiece';
const r = runScript(GOLDEN, { stopAt: where });
const state = r.state; const log = r.log;
const recs = new Map<number, MindRecord>();
const sched = new Scheduler({
  getState: () => state, getLog: () => log, getHabits: () => computeHabits(state, log, 0),
  capture: () => undefined, onRecord: (rec) => recs.set(rec.id, rec), onThinking: () => {}, onStatus: () => {},
});
sched.onApply((d) => { const o = applyWardenDecision(state, d); log.push(...(o.events ?? [])); });
sched.running = true;
sched.injectBadBrain();
const t0 = Date.now();
let last = Date.now();
while (Date.now() - t0 < 45000 && recs.size < 6) {
  await new Promise((res) => setTimeout(res, 50));
  const now = Date.now(); tick(state, now - last); last = now;
  sched.update();
}
let bad = 0;
for (const rec of recs.values()) {
  const v = rec.verdict; const p = v.proposed;
  const ok = v.status !== 'accepted' || !p || p.action === 'do_nothing';
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${v.status.padEnd(8)} ${String(v.stage ?? '').padEnd(11)} ${(p ? `${p.action} ${p.target} i${p.intensity}` : 'unparseable').padEnd(32)} attempts=${rec.attempts.map((a) => a.error ?? 'ok').join(',')} | ${v.detail ?? ''}`);
}
const solv = checkSolvable(state);
console.log(`\nscreen=${where} records=${recs.size} unsafe_accepted=${bad} still_solvable=${solv.ok}`);
process.exit(bad === 0 && solv.ok ? 0 : 1);
