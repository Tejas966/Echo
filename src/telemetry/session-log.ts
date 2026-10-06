// Per-game session log for judges: logs/<YYYY-MM-DD_HH-MM-SS>.log (readable) + .jsonl (full detail).
// Buffered and flushed to the Vite dev-server endpoint every 2 s; never blocks or breaks the game.
import type { LogEvent } from '../types';
import type { MindRecord } from '../director/scheduler';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const clock = (ms: number) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${Math.floor((ms % 1000) / 100)}`;

export class SessionLog {
  readonly name: string;
  private text: string[] = [];
  private json: string[] = [];
  private all: string[] = [];            // full readable log kept in memory (download fallback)
  private timer: ReturnType<typeof setInterval>;
  private seen = new Set<number>();

  constructor(meta: Record<string, unknown>) {
    const d = new Date();
    this.name = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    this.line(`THE ROOM THAT FIGHTS BACK — session log ${this.name}`);
    for (const [k, v] of Object.entries(meta)) this.line(`${k}: ${v}`);
    this.line('Legend: PLAYER = what the user did · WORLD = what happened · GEMMA = what the model saw/decided/why · RULES = safety verdict · WARDEN = what was said aloud');
    this.line('-'.repeat(100));
    this.jsonl({ type: 'session', name: this.name, ...meta });
    this.timer = setInterval(() => this.flush(), 2000);
    window.addEventListener('beforeunload', () => this.flush(true));
  }

  private line(s: string) { this.text.push(s + '\n'); this.all.push(s); }
  private jsonl(o: object) { this.json.push(JSON.stringify(o) + '\n'); }

  player(e: LogEvent) {
    const who = ['click', 'use', 'take', 'walk', 'look'].includes(e.kind) ? 'PLAYER' : 'WORLD ';
    this.line(`[${clock(e.t)}] ${who}  ${e.kind.toUpperCase().padEnd(6)} ${e.a}${e.b ? ` (${e.b})` : ''}`);
    this.jsonl({ type: 'event', ...e });
  }

  said(t: number, speaker: string, text: string, tone?: string) {
    this.line(`[${clock(t)}] ${speaker === 'warden' ? 'WARDEN' : speaker === 'subject13' ? 'SUBJ13' : 'NARRAT'}  ${tone ? `(${tone}) ` : ''}"${text}"`);
    this.jsonl({ type: 'line', t, speaker, tone, text });
  }

  decision(r: MindRecord) {
    const v = r.verdict; const p = v.proposed; const f = v.final;
    if (!this.seen.has(r.id)) {
      this.seen.add(r.id);
      const lat = r.attempts.map((a) => `${a.latencyMs}ms${a.error ? ' ' + a.error : ''}`).join(' → ') || 'n/a';
      const src = r.degraded ? 'scripted (degraded)' : r.mode;
      this.line(`[${clock(r.at)}] GEMMA   #${r.id} via ${src} · ${lat}${r.attempts.length > 1 ? ' (retried)' : ''}`);
      if (p?.saw) this.line(`            saw:      "${p.saw}"`);
      if (p) this.line(`            proposed: ${p.action} → ${p.target} (intensity ${p.intensity})${p.line ? ` · line "${p.line}"` : ''}`);
      else this.line(`            proposed: <unparseable output>`);
      if (p?.reason) this.line(`            thinks:   ${p.reason}${p.confidence !== undefined ? ` (confidence ${p.confidence})` : ''}`);
      this.line(`            RULES     ${v.status.toUpperCase()}${v.stage ? ' @ ' + v.stage : ''}${v.detail ? ' — ' + v.detail : ''}`);
      if (f && p && (f.action !== p.action || f.line !== p.line || f.intensity !== p.intensity)) this.line(`            applied:  ${f.action} → ${f.target} (${f.intensity})${f.line ? ` · "${f.line}"` : ''}`);
      this.jsonl({ type: 'decision', id: r.id, t: r.at, mode: r.mode, degraded: r.degraded, verdict: v, attempts: r.attempts, snapshot: r.snapshot.text, imageSent: !!r.snapshot.image });
    } else if (r.executed) {
      this.line(`[${clock(r.at)}] RULES   #${r.id} → ${r.executed}`);
      this.jsonl({ type: 'executed', id: r.id, executed: r.executed });
    }
  }

  note(t: number, text: string) { this.line(`[${clock(t)}] ----   ${text}`); this.jsonl({ type: 'note', t, text }); }

  end(summary: Record<string, unknown>) {
    this.line('-'.repeat(100));
    this.line('END OF SESSION');
    for (const [k, v] of Object.entries(summary)) this.line(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    this.jsonl({ type: 'end', ...summary });
    this.flush();
  }

  flush(beacon = false) {
    if (!this.text.length && !this.json.length) return;
    const body = JSON.stringify({ name: this.name, text: this.text.join(''), jsonl: this.json.join('') });
    this.text = []; this.json = [];
    try {
      if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/log', new Blob([body], { type: 'application/json' }));
      else void fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch { /* logging must never break the game */ }
  }

  /** Browser fallback: save the readable log as a file. */
  download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([this.all.join('\n')], { type: 'text/plain' }));
    a.download = `${this.name}.log`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
