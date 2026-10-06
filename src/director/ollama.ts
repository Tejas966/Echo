// Real model: Gemma 4 via local Ollama. Works in the browser (via Vite proxy '/ollama') and in Node (direct URL).
import type { Director, DirectorResult, Snapshot } from '../types';
import { FEW_SHOTS, OBSERVE_PROMPT, RETRY_NOTE, SYSTEM_PROMPT, buildSchema } from './prompt';

export interface OllamaOptions { base?: string; model?: string; temperature?: number }

export class OllamaDirector implements Director {
  readonly kind = 'ollama' as const;
  base: string;
  model: string;
  temperature: number;
  constructor(o: OllamaOptions = {}) {
    this.base = o.base ?? '/ollama';
    this.model = o.model ?? 'gemma4:e2b';
    this.temperature = o.temperature ?? 0.7;
  }

  private async chat(messages: object[], format: object, signal: AbortSignal, numPredict = 160) {
    const res = await fetch(`${this.base}/api/chat`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model, stream: false, think: false, format, keep_alive: '30m',
        options: { temperature: this.temperature, num_predict: numPredict, num_ctx: 4096 },
        messages,
      }),
    });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { kind: 'http' });
    const j = await res.json();
    if (j.error) throw Object.assign(new Error(j.error), { kind: 'http' });
    return String(j.message?.content ?? '');
  }

  /** One decision. `retryWhy` = reason the previous reply was rejected (one retry policy lives in the scheduler). */
  async decide(snap: Snapshot, signal: AbortSignal, retryWhy?: string): Promise<DirectorResult> {
    const t0 = performance.now();
    const user: Record<string, unknown> = { role: 'user', content: retryWhy ? `${snap.text}\n${RETRY_NOTE(retryWhy)}` : snap.text };
    if (snap.image) user.images = [snap.image];
    try {
      const raw = await this.chat([{ role: 'system', content: SYSTEM_PROMPT }, ...FEW_SHOTS, user], buildSchema(snap.validTargets), signal);
      const latencyMs = Math.round(performance.now() - t0);
      try { return { ok: true, raw, decision: JSON.parse(raw), latencyMs }; }
      catch { return { ok: false, raw, error: 'parse', latencyMs }; }
    } catch (e: any) {
      const latencyMs = Math.round(performance.now() - t0);
      if (e?.name === 'AbortError') return { ok: false, error: signal.reason === 'timeout' ? 'timeout' : 'aborted', latencyMs };
      return { ok: false, error: e?.kind === 'http' ? 'http' : 'unreachable', raw: String(e?.message ?? e), latencyMs };
    }
  }

  /** Loads the model into VRAM (first load can take a while). */
  async warmup(): Promise<number> {
    const t0 = performance.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 180000);
    try { await this.chat([{ role: 'user', content: 'Reply with {"ok":true}' }], { type: 'object', properties: { ok: { type: 'boolean' } } }, ctl.signal, 10); }
    finally { clearTimeout(timer); }
    return Math.round(performance.now() - t0);
  }

  async ping(): Promise<boolean> {
    try { const r = await fetch(`${this.base}/api/version`, { signal: AbortSignal.timeout(2000) }); return r.ok; } catch { return false; }
  }

  /** End-screen observations. Returns null on any failure (caller uses templates). */
  async observe(profile: object, timeoutMs = 10000): Promise<string[] | null> {
    try {
      const raw = await this.chat(
        [{ role: 'system', content: OBSERVE_PROMPT }, { role: 'user', content: JSON.stringify(profile) }],
        { type: 'object', properties: { observations: { type: 'array', items: { type: 'string', maxLength: 90 }, minItems: 3, maxItems: 3 } }, required: ['observations'] },
        AbortSignal.timeout(timeoutMs), 200,
      );
      const obs = JSON.parse(raw).observations;
      return Array.isArray(obs) && obs.length === 3 ? obs.map(String) : null;
    } catch { return null; }
  }
}
