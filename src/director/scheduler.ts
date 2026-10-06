// Single-flight async decision loop (docs/01 §9): snapshot → director → retry/fallback → rules review → queue.
// The game loop never awaits this. Works with any Director; circuit breaker falls back to ScriptedDirector.
import type { Decision, DecisionSource, Director, DirectorResult, GameState, LogEvent, ReviewContext, Snapshot, Verdict } from '../types';
import { review, isHostile, cooldownKey } from '../rules';
import type { Habits } from '../profile/habits';
import { buildSnapshot, URGENT_TEXT } from './snapshot';
import { OllamaDirector } from './ollama';
import { MockDirector, BAD_BRAIN, DEMO_GOOD } from './mock';
import { ScriptedDirector } from './scripted';

export const MIN_GAP_MS = 2500;
export const TIMEOUT_MS = 6000;
export const QUEUE_TTL_MS = 6000;
export const EXEC_GAP_MS = 1500;
const BREAKER_FAILS = 3;
const PROBE_MS = 20000;

export type Mode = 'ollama' | 'mock' | 'scripted';

export interface MindRecord {
  id: number;
  at: number;                    // game ms
  mode: Mode;
  degraded: boolean;
  snapshot: Snapshot;
  attempts: { raw?: string; error?: string; latencyMs: number }[];
  verdict: Verdict;
  executed?: 'applied' | 'dropped-stale' | 'dropped-ttl';
}

interface Queued { decision: Decision; source: DecisionSource; snapT: number; screen: string; rec: MindRecord }

export interface SchedulerDeps {
  getState(): GameState;
  getLog(): LogEvent[];
  getHabits(): Habits;
  capture(): string | undefined;          // base64 JPEG director view
  onRecord(r: MindRecord): void;          // Mind Panel feed (called on verdict and on execution)
  onThinking(on: boolean): void;
  onStatus(text: string): void;
}

export class Scheduler {
  ollama: OllamaDirector;
  mock = new MockDirector(DEMO_GOOD, 'demo', true);
  scripted: ScriptedDirector;
  mode: Mode = 'ollama';
  degraded = false;          // breaker tripped (ollama mode only)
  running = false;
  sendImage = true;
  private inFlight = false;
  private lastReturn = -1e9;
  private urgent: string | null = null;
  private fails = 0;
  private lastProbe = 0;
  private recId = 0;
  private queue: Queued[] = [];
  private lastExec = 0;
  private savedMode: Mode = 'ollama';
  latencies: number[] = [];
  counts = { made: 0, accepted: 0, amended: 0, vetoed: 0, fallback: 0 };
  actionCounts: Record<string, number> = {};
  ctx: Omit<ReviewContext, 'snapshot' | 'now'> = { cooldowns: {}, lastHostileAt: -1e9, consecutiveHostileVetoes: 0 };

  constructor(private d: SchedulerDeps, opts: { model?: string; base?: string } = {}) {
    this.ollama = new OllamaDirector({ model: opts.model, base: opts.base });
    this.scripted = new ScriptedDirector(d.getState, d.getHabits, () => this.ctx.cooldowns['reveal_hint'] ?? -1e9);
  }

  get director(): Director {
    if (this.mode === 'mock') return this.mock;
    if (this.mode === 'scripted' || this.degraded) return this.scripted;
    return this.ollama;
  }

  label(): string {
    if (this.mode === 'mock') return `MOCK (${this.mock.name})`;
    if (this.mode === 'scripted') return 'SCRIPTED WARDEN';
    return this.degraded ? 'DEGRADED: SCRIPTED WARDEN' : `LIVE: ${this.ollama.model}`;
  }

  setMode(m: Mode) { this.mode = m; this.degraded = false; this.fails = 0; this.d.onStatus(this.label()); }

  /** Failure demo: switch to the bad-brain mock for one pass, then restore. */
  injectBadBrain() {
    if (this.mode !== 'mock' || this.mock.name !== 'bad_brain') this.savedMode = this.mode;
    this.mock.reset(BAD_BRAIN, 'bad_brain', false);
    this.mode = 'mock';
    this.lastReturn = -1e9;
    this.d.onStatus(this.label());
  }

  requestUrgent(reason: string) { if (!this.urgent || reason.startsWith('setpiece')) this.urgent = reason; }

  /** Called every frame by the game loop. Never blocks. */
  update() {
    if (!this.running) return;
    const s = this.d.getState();
    if (s.ended) return;
    const now = performance.now();
    if (this.mode === 'ollama' && this.degraded && now - this.lastProbe > PROBE_MS) {
      this.lastProbe = now;
      this.ollama.ping().then((ok) => { if (ok) { this.degraded = false; this.fails = 0; this.d.onStatus(this.label()); } });
    }
    if (!this.inFlight && (now - this.lastReturn >= MIN_GAP_MS || (this.urgent && now - this.lastReturn >= 800))) {
      void this.cycle();
    }
    this.execute(now);
  }

  private async callDirector(dir: Director, snap: Snapshot, retryWhy?: string): Promise<DirectorResult> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort('timeout'), TIMEOUT_MS);
    try {
      return dir instanceof OllamaDirector ? await dir.decide(snap, ctl.signal, retryWhy) : await dir.decide(snap, ctl.signal);
    } finally { clearTimeout(timer); }
  }

  private async cycle() {
    this.inFlight = true;
    this.d.onThinking(true);
    const urgent = this.urgent; this.urgent = null;
    const dir = this.director;
    const mode = this.mode;
    const s0 = this.d.getState();
    const image = this.sendImage && dir.kind !== 'scripted' ? this.d.capture() : undefined;
    const snap = buildSnapshot(s0, this.d.getLog(), this.d.getHabits(), image, urgent ? URGENT_TEXT[urgent] ?? urgent : undefined);
    const attempts: MindRecord['attempts'] = [];
    let verdict: Verdict | null = null;
    let source: DecisionSource = dir.kind;
    try {
      let res = await this.callDirector(dir, snap);
      attempts.push(this.att(res));
      verdict = this.reviewResult(res, source, snap);
      // One retry for malformed / schema-invalid output
      if (res.ok === false && res.error === 'parse' || verdict && verdict.status === 'vetoed' && (verdict.stage === 'PARSE' || verdict.stage === 'SCHEMA')) {
        const why = res.ok ? verdict?.detail ?? 'schema' : 'not valid JSON';
        res = await this.callDirector(dir, snap, why);
        attempts.push(this.att(res));
        verdict = this.reviewResult(res, source, snap);
      }
      const hardFail = !res.ok && res.error !== 'parse';
      if (dir.kind === 'ollama') {
        if (hardFail) { if (++this.fails >= BREAKER_FAILS && !this.degraded) { this.degraded = true; this.lastProbe = performance.now(); this.d.onStatus(this.label()); } }
        else this.fails = 0;
      }
      if (!verdict || verdict.status === 'vetoed' && (verdict.stage === 'PARSE' || verdict.stage === 'SCHEMA') || hardFail) {
        // Safe fallback: a scripted decision, still reviewed by the rules
        const fb = this.scripted.decideSync();
        source = 'fallback';
        const fv = review({ raw: fb, source: 'fallback' }, this.d.getState(), this.reviewCtx(snap));
        verdict = { ...fv, status: fv.status === 'vetoed' ? 'vetoed' : 'fallback', proposed: verdict?.proposed ?? null, detail: `${hardFail ? (res as any).error : 'invalid output'} → fallback: ${fb.action}${fv.status === 'vetoed' ? ` (vetoed: ${fv.detail})` : ''}` };
      }
      if (res.ok) this.latencies.push(res.latencyMs);
    } catch (e) {
      const fb = this.scripted.decideSync();
      verdict = { status: 'fallback', proposed: null, final: fb, source: 'fallback', detail: `internal error → fallback (${String(e)})` };
    }
    const rec: MindRecord = { id: ++this.recId, at: this.d.getState().t, mode, degraded: this.degraded, snapshot: snap, attempts, verdict: verdict! };
    this.tally(verdict!);
    if (this.mock.done && this.mode === 'mock' && this.mock.name === 'bad_brain') { this.mode = this.savedMode; this.mock.reset(DEMO_GOOD, 'demo', true); this.d.onStatus(this.label()); }
    if (verdict!.final && verdict!.final.action !== 'do_nothing') {
      this.queue.push({ decision: verdict!.final, source: verdict!.source, snapT: snap.t, screen: snap.screen, rec });
      if (this.queue.length > 3) this.queue.shift();
    }
    this.d.onRecord(rec);
    this.lastReturn = performance.now();
    this.inFlight = false;
    this.d.onThinking(false);
  }

  private att(res: DirectorResult) { return res.ok ? { raw: res.raw, latencyMs: res.latencyMs } : { raw: res.raw, error: res.error, latencyMs: res.latencyMs }; }

  private reviewCtx(snap: Snapshot): ReviewContext {
    return { ...this.ctx, now: this.d.getState().t, snapshot: snap };
  }

  private reviewResult(res: DirectorResult, source: DecisionSource, snap: Snapshot): Verdict | null {
    if (!res.ok) return res.error === 'parse' ? review({ raw: res.raw ?? '', source }, this.d.getState(), this.reviewCtx(snap)) : null;
    const v = review({ raw: res.decision, source }, this.d.getState(), this.reviewCtx(snap));
    if (v.proposed && isHostile(v.proposed.action)) {
      this.ctx.consecutiveHostileVetoes = v.status === 'vetoed' ? this.ctx.consecutiveHostileVetoes + 1 : 0;
    }
    return v;
  }

  private tally(v: Verdict) {
    this.counts.made++;
    this.counts[v.status === 'accepted' ? 'accepted' : v.status === 'amended' ? 'amended' : v.status === 'vetoed' ? 'vetoed' : 'fallback']++;
    const a = v.proposed?.action ?? v.final?.action;
    if (a) this.actionCounts[a] = (this.actionCounts[a] ?? 0) + 1;
    const s = this.d.getState();
    if (v.proposed || v.final) {
      const d = (v.final ?? v.proposed)!;
      s.warden.lastActions = [...s.warden.lastActions, { t: s.t, action: d.action, target: d.target, status: v.status, stage: v.stage }].slice(-5);
    }
  }

  /** Pop at most one queued decision every EXEC_GAP_MS; the caller applies it. */
  private pendingApply: ((q: Queued) => void) | null = null;
  onApply(fn: (d: Decision, source: DecisionSource, rec: MindRecord) => void) {
    this.pendingApply = (q) => fn(q.decision, q.source, q.rec);
  }

  private execute(now: number) {
    if (!this.queue.length || now - this.lastExec < EXEC_GAP_MS) return;
    const s = this.d.getState();
    const q = this.queue.shift()!;
    const screenBound = ['flicker_lights', 'blackout', 'lock_door', 'spawn_hazard', 'shift_object'].includes(q.decision.action);
    if (s.t - q.snapT > QUEUE_TTL_MS) { q.rec.executed = 'dropped-ttl'; this.d.onRecord(q.rec); return; }
    if (screenBound && q.screen !== s.screen) { q.rec.executed = 'dropped-stale'; this.d.onRecord(q.rec); return; }
    this.lastExec = now;
    const d = q.decision;
    this.ctx.cooldowns[d.action] = s.t;
    this.ctx.cooldowns[cooldownKey(d)] = s.t;
    if (isHostile(d.action)) this.ctx.lastHostileAt = s.t;
    q.rec.executed = 'applied';
    this.pendingApply?.(q);
    this.d.onRecord(q.rec);
  }

  meanLatency() { return this.latencies.length ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length) : 0; }
}
