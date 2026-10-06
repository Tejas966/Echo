// "Game Master's mind" panel: what the model saw, what it proposed, what the rules did. Lead-owned.
import type { MindRecord, Mode } from '../director/scheduler';

const CSS = `
#mind-root { font: 12px/1.35 ui-monospace, 'Courier New', monospace; color: #c8d3de; }
.mp { width: 380px; height: 100%; display: flex; flex-direction: column; }
.mp-head { padding: 10px 12px; border-bottom: 1px solid #1f2733; }
.mp-title { font-weight: bold; letter-spacing: 2px; color: #e8eef5; font-size: 12px; }
.mp-mode { display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 3px; background: #123; color: #9effc2; font-size: 11px; }
.mp-mode.deg { background: #3a1010; color: #ff8080; } .mp-mode.mock { background: #2a2410; color: #ffc14d; }
.mp-stats { margin-top: 6px; color: #8a97a5; font-size: 11px; }
.mp-btns { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
.mp-btns button { background: #18202b; color: #c8d3de; border: 1px solid #2c3a4f; padding: 3px 7px; font: inherit; font-size: 11px; cursor: pointer; border-radius: 3px; }
.mp-btns button:hover { background: #22303f; } .mp-btns button.danger { border-color: #7a2a2a; color: #ff9d9d; }
.mp-spark { margin-top: 6px; height: 26px; width: 100%; }
.mp-list { flex: 1; overflow-y: auto; padding: 8px 10px; }
.mp-card { border: 1px solid #1f2733; border-radius: 4px; padding: 8px; margin-bottom: 8px; background: #0e131a; }
.mp-card.new { animation: mpIn .4s ease-out; } @keyframes mpIn { from { background: #1d2a38; } to { background: #0e131a; } }
.mp-row { display: flex; gap: 8px; align-items: flex-start; }
.mp-thumb { width: 128px; height: 72px; border: 1px solid #2c3a4f; object-fit: cover; flex: none; background: #000; }
.mp-chip { display: inline-block; padding: 1px 6px; border-radius: 3px; font-weight: bold; font-size: 10px; letter-spacing: 1px; }
.c-accepted { background: #12351f; color: #8df0a9; } .c-amended { background: #3a3010; color: #ffd36b; }
.c-vetoed { background: #3d1212; color: #ff8a8a; } .c-fallback { background: #262b33; color: #aab4c0; }
.mp-act { color: #e8eef5; font-weight: bold; } .mp-dim { color: #6f7c8a; } .mp-line { color: #9effc2; font-style: italic; }
.mp-detail { color: #ffb0b0; margin-top: 4px; } .mp-det-amend { color: #ffd36b; }
.mp-card details { margin-top: 4px; } .mp-card summary { cursor: pointer; color: #6f7c8a; }
.mp-card pre { white-space: pre-wrap; word-break: break-word; margin: 4px 0 0; color: #93a1b0; font-size: 10.5px; max-height: 220px; overflow: auto; }
`;

export interface MindPanelHandlers {
  onMode(m: Mode): void;
  onBadBrain(): void;
  onToggleImage(): boolean;
}

export class MindPanel {
  private root: HTMLElement;
  private list!: HTMLElement;
  private modeEl!: HTMLElement;
  private statsEl!: HTMLElement;
  private spark!: HTMLCanvasElement;
  private cards = new Map<number, HTMLElement>();
  private lat: number[] = [];

  constructor(root: HTMLElement, private h: MindPanelHandlers) {
    this.root = root;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root.innerHTML = `<div class="mp">
      <div class="mp-head">
        <div class="mp-title">GAME MASTER'S MIND</div>
        <div class="mp-mode">—</div>
        <div class="mp-stats"></div>
        <canvas class="mp-spark" width="356" height="26"></canvas>
        <div class="mp-btns">
          <button data-m="ollama">Live Gemma</button><button data-m="scripted">Scripted</button><button data-m="mock">Mock</button>
          <button data-a="img">Image: on</button><button data-a="bad" class="danger">Inject bad brain (F9)</button>
        </div>
      </div>
      <div class="mp-list"></div></div>`;
    this.list = root.querySelector('.mp-list')!;
    this.modeEl = root.querySelector('.mp-mode')!;
    this.statsEl = root.querySelector('.mp-stats')!;
    this.spark = root.querySelector('.mp-spark')!;
    root.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => b.onclick = () => h.onMode(b.dataset.m as Mode));
    root.querySelector<HTMLButtonElement>('[data-a=bad]')!.onclick = () => h.onBadBrain();
    const img = root.querySelector<HTMLButtonElement>('[data-a=img]')!;
    img.onclick = () => { img.textContent = `Image: ${h.onToggleImage() ? 'on' : 'off'}`; };
  }

  toggle(force?: boolean) { this.root.classList.toggle('open', force); }
  get open() { return this.root.classList.contains('open'); }

  setMode(label: string) {
    this.modeEl.textContent = label;
    this.modeEl.className = 'mp-mode' + (label.startsWith('DEGRADED') ? ' deg' : label.startsWith('MOCK') ? ' mock' : '');
  }

  setStats(c: { made: number; accepted: number; amended: number; vetoed: number; fallback: number }, meanMs: number, extra: string) {
    this.statsEl.textContent = `decisions ${c.made} · ✓${c.accepted} ~${c.amended} ✗${c.vetoed} ↺${c.fallback} · mean ${meanMs} ms · ${extra}`;
  }

  record(r: MindRecord) {
    const lastLat = r.attempts.at(-1)?.latencyMs;
    if (lastLat !== undefined && !this.cards.has(r.id)) { this.lat.push(lastLat); this.lat = this.lat.slice(-40); this.drawSpark(); }
    let card = this.cards.get(r.id);
    const fresh = !card;
    if (!card) { card = document.createElement('div'); this.cards.set(r.id, card); this.list.prepend(card); }
    card.className = 'mp-card' + (fresh ? ' new' : '');
    const v = r.verdict;
    const d = v.final ?? v.proposed;
    const prop = v.proposed;
    const t = `${Math.floor(r.at / 60000)}:${String(Math.floor(r.at / 1000) % 60).padStart(2, '0')}`;
    const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    const attempts = r.attempts.map((a, i) => `#${i + 1} ${a.latencyMs}ms ${a.error ? '[' + a.error + '] ' : ''}${esc(a.raw ?? '')}`).join('\n');
    const changed = prop && v.final && (prop.action !== v.final.action || prop.line !== v.final.line || prop.intensity !== v.final.intensity);
    card.innerHTML = `
      <div class="mp-row">
        ${r.snapshot.image ? `<img class="mp-thumb" src="data:image/jpeg;base64,${r.snapshot.image}">` : `<div class="mp-thumb" style="display:flex;align-items:center;justify-content:center;color:#456">no image</div>`}
        <div style="flex:1;min-width:0">
          <div><span class="mp-chip c-${v.status}">${v.status.toUpperCase()}${v.stage ? ' · ' + v.stage : ''}</span> <span class="mp-dim">${t} · ${r.degraded ? 'scripted' : r.mode} · ${lastLat ?? '-'}ms${r.attempts.length > 1 ? ' · RETRIED' : ''}</span></div>
          ${prop?.saw ? `<div class="mp-dim">saw: ${esc(prop.saw)}</div>` : ''}
          <div class="mp-act">${d ? `${d.action} → ${esc(d.target)} (${d.intensity})` : 'unparseable output'}</div>
          ${changed && prop ? `<div class="mp-dim">proposed: ${prop.action} → ${esc(prop.target)} (${prop.intensity})${prop.line ? ` "${esc(prop.line)}"` : ''}</div>` : ''}
          ${d?.line ? `<div class="mp-line">"${esc(d.line)}"</div>` : ''}
          ${prop?.reason ? `<div class="mp-dim">why: ${esc(prop.reason)}</div>` : ''}
        </div>
      </div>
      ${v.detail ? `<div class="mp-detail ${v.status === 'amended' ? 'mp-det-amend' : ''}">${esc(v.detail)}</div>` : ''}
      ${r.executed ? `<div class="mp-dim">→ ${r.executed}</div>` : ''}
      <details><summary>what it saw (prompt) / raw output</summary><pre>${esc(r.snapshot.text)}\n\n--- raw ---\n${attempts}</pre></details>`;
    while (this.list.children.length > 40) { const last = this.list.lastElementChild as HTMLElement; last.remove(); }
  }

  private drawSpark() {
    const c = this.spark.getContext('2d')!; const w = this.spark.width, h = this.spark.height;
    c.clearRect(0, 0, w, h);
    const max = Math.max(3000, ...this.lat);
    c.strokeStyle = '#2c3a4f'; c.beginPath(); c.moveTo(0, h - (2500 / max) * h); c.lineTo(w, h - (2500 / max) * h); c.stroke();
    c.strokeStyle = '#9effc2'; c.beginPath();
    this.lat.forEach((v, i) => { const x = (i / 39) * w, y = h - (v / max) * (h - 2) - 1; i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
  }
}
