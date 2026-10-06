// Story layer: cinematic prologue, wake-up, chapter cards, objective line, Subject 13 fragments.
// Owns its own DOM (classes prefixed `st-`). Overlays align to the #game canvas rect.
import type { AudioAPI, SfxCue, Tone } from '../types';

export interface ChapterCard { numeral: string; title: string; subtitle: string; color: string; difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'HARDEST' | 'BREATHER' }
export interface StoryAPI {
  /** Full-screen cinematic prologue, ~80 s. Resolves when finished or skipped. */
  playPrologue(): Promise<void>;
  /** Wake-up: eyes opening/closing disorientation over the (already rendering) game canvas, ~7 s. */
  playWakeUp(): Promise<void>;
  /** Chapter title card, ~4.5 s, non-blocking for the game but resolves when gone. */
  showChapter(c: ChapterCard): Promise<void>;
  /** Persistent small objective line (top-centre-ish, below any top UI). null hides. Colour = chapter accent. */
  setObjective(text: string | null, color?: string): void;
  /** A story fragment popup: "SUBJECT 13 — FRAGMENT 2/5" + text, typed, ~6 s, accent colour violet #b48cff. */
  showFragment(index: number, total: number, text: string): Promise<void>;
  readonly busy: boolean;
}

const CSS = `
.st-layer { position: absolute; pointer-events: none; z-index: 30; --u: 12.8px; overflow: hidden;
  font-family: 'Courier New', ui-monospace, Consolas, monospace; color: #d8e0e8; }
.st-layer * { box-sizing: border-box; }

/* objective */
.st-obj { position: absolute; left: 50%; top: calc(var(--u) * 1.4); transform: translateX(-50%);
  max-width: 70%; padding: calc(var(--u)*0.35) calc(var(--u)*1.1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: clamp(10px, calc(var(--u) * 1.0), 19px); letter-spacing: .08em; color: var(--st-c, #9effc2);
  background: rgba(4,6,9,0.62); border: 1px solid color-mix(in srgb, var(--st-c, #9effc2) 35%, transparent);
  border-radius: 999px; opacity: 0; transition: opacity .4s; }
.st-obj.st-on { opacity: .92; }
.st-obj b { font-weight: bold; opacity: .65; letter-spacing: .22em; margin-right: .5em; }
.st-obj.st-pulse { animation: st-pulse .9s ease-out; }
@keyframes st-pulse { 0% { box-shadow: 0 0 0 0 var(--st-c); background: color-mix(in srgb, var(--st-c) 25%, rgba(4,6,9,.62)); }
  100% { box-shadow: 0 0 0 calc(var(--u)*1.2) transparent; background: rgba(4,6,9,0.62); } }

/* chapter card */
.st-ch { position: absolute; left: 0; right: 0; top: 30%; display: flex; flex-direction: column; align-items: center;
  text-align: center; opacity: 0; transform: translateY(calc(var(--u) * 1.2)); transition: opacity .6s ease-out, transform .6s ease-out; }
.st-ch.st-on { opacity: 1; transform: none; }
.st-ch.st-off { opacity: 0; transform: translateY(calc(var(--u) * -0.6)); transition: opacity .8s ease-in, transform .8s ease-in; }
.st-ch-band { position: absolute; left: 0; right: 0; top: -40%; bottom: -40%;
  background: linear-gradient(90deg, transparent, rgba(0,0,0,.62) 22%, rgba(0,0,0,.62) 78%, transparent); }
.st-ch > :not(.st-ch-band) { position: relative; }
.st-ch-line { width: calc(var(--u) * 18); height: 2px; background: var(--st-c); box-shadow: 0 0 calc(var(--u)*0.8) var(--st-c);
  transform: scaleX(0); transition: transform .9s cubic-bezier(.2,.8,.2,1) .15s; }
.st-ch.st-on .st-ch-line { transform: scaleX(1); }
.st-ch-num { margin-top: calc(var(--u)*1.0); font-size: calc(var(--u) * 1.15); letter-spacing: .6em; padding-left: .6em; color: #c9d2da; opacity: .85; }
.st-ch-title { margin-top: calc(var(--u)*0.3); font-size: calc(var(--u) * 4.6); font-weight: bold; letter-spacing: .12em; padding-left: .12em;
  color: var(--st-c); text-shadow: 0 0 calc(var(--u)*1.4) color-mix(in srgb, var(--st-c) 45%, transparent); line-height: 1.1; }
.st-ch-sub { margin-top: calc(var(--u)*0.6); font-size: calc(var(--u) * 1.25); color: #8f99a3; letter-spacing: .06em; }
.st-ch-tag { margin-top: calc(var(--u)*1.1); font-size: calc(var(--u) * 0.85); letter-spacing: .3em; padding: calc(var(--u)*0.25) calc(var(--u)*0.6) calc(var(--u)*0.25) calc(var(--u)*0.9);
  border-radius: 999px; color: var(--st-t); border: 1px solid var(--st-t); background: color-mix(in srgb, var(--st-t) 14%, transparent); font-weight: bold; }

/* fragment */
.st-frag { position: absolute; right: 2.4%; bottom: 19%; width: calc(var(--u) * 34); padding: calc(var(--u)*1.1) calc(var(--u)*1.4);
  background: linear-gradient(180deg, rgba(14,8,24,.9), rgba(7,4,12,.95)); border: 1px solid rgba(180,140,255,.35);
  border-left: calc(var(--u)*0.3) solid #b48cff; box-shadow: 0 0 calc(var(--u)*2.2) rgba(120,70,220,.25);
  transform: rotate(-0.8deg) translateY(calc(var(--u)*1)); opacity: 0; transition: opacity .45s, transform .45s; }
.st-frag.st-on { opacity: 1; transform: rotate(-0.8deg); }
.st-frag.st-off { opacity: 0; transition: opacity .8s; }
.st-frag-h { font-size: calc(var(--u) * 0.9); letter-spacing: .25em; color: #b48cff; font-weight: bold; text-shadow: 0 0 calc(var(--u)*.6) rgba(180,140,255,.6); margin-bottom: calc(var(--u)*0.6); }
.st-frag-t { font-family: 'Segoe Print', 'Bradley Hand', 'Ink Free', 'Comic Sans MS', cursive; font-size: calc(var(--u) * 1.3); line-height: 1.5;
  color: #e2d4ff; transform: skewX(-4deg); text-shadow: 1px 1px 0 rgba(0,0,0,.7); min-height: 3em; white-space: pre-wrap; }
.st-frag-t .st-ghost { visibility: hidden; }

/* wake-up */
.st-wake { position: absolute; inset: 0; z-index: 5; }
.st-wake canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

/* prologue */
.st-pro { position: absolute; inset: 0; z-index: 60; background: #000; cursor: pointer; overflow: hidden; --pu: 12px;
  font-family: 'Courier New', ui-monospace, Consolas, monospace; transition: opacity .9s; }
.st-pro canvas { position: absolute; left: 0; top: 0; display: block; }
.st-pro-text { position: absolute; left: 8%; right: 8%; bottom: 11%; text-align: center; color: #eef2f6;
  font-size: calc(var(--pu) * 2.35); line-height: 1.45; letter-spacing: .02em; font-weight: bold;
  text-shadow: 0 2px 0 #000, 0 0 calc(var(--pu)*2) rgba(0,0,0,.9); transition: opacity .5s; min-height: 3em; }
.st-pro-text .st-ghost { visibility: hidden; }
.st-pro-text .st-cur { display: inline-block; width: .55em; height: 1em; vertical-align: -0.12em; background: currentColor; margin-left: .08em; animation: st-blink 1s steps(2) infinite; }
.st-pro-text.st-final { bottom: auto; top: 50%; transform: translateY(-50%); font-size: calc(var(--pu) * 5.2); letter-spacing: .08em; }
.st-pro-text.st-final em { font-style: normal; color: #ff3d3d; text-shadow: 0 0 calc(var(--pu)*2.4) rgba(255,61,61,.55), 0 2px 0 #000; }
.st-pro-skip { position: absolute; right: calc(var(--pu)*2); bottom: calc(var(--pu)*1.6); font-size: max(11px, calc(var(--pu) * 1.0));
  color: #8a949e; letter-spacing: .14em; opacity: .7; pointer-events: none; }
.st-pro-tag { position: absolute; left: calc(var(--pu)*2); top: calc(var(--pu)*1.6); font-size: max(10px, calc(var(--pu) * 0.95)); color: #6c7680; letter-spacing: .3em; pointer-events: none; }
@keyframes st-blink { 50% { opacity: 0; } }
`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

/** Size a canvas to cssW x cssH with a DPR backing store; returns ctx with transform set (draw in CSS px). */
function fitCanvas(cv: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const bw = Math.max(1, Math.round(cssW * dpr)), bh = Math.max(1, Math.round(cssH * dpr));
  if (cv.width !== bw) cv.width = bw;
  if (cv.height !== bh) cv.height = bh;
  cv.style.width = cssW + 'px';
  cv.style.height = cssH + 'px';
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ---------------------------------------------------------------- prologue beats
interface Beat { text: string; draw: (c: CanvasRenderingContext2D, w: number, h: number, t: number, p: number) => void }

const BEAT_MS = 9000;
const FINAL_MS = 7000;

function drawEye(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, open: number, iris: string, look: number, t: number) {
  // wall mount + housing
  c.fillStyle = '#0d0f12';
  c.fillRect(cx - r * 0.25, cy - r * 2.2, r * 0.5, r * 1.3);
  c.beginPath(); c.ellipse(cx, cy, r * 1.35, r * 1.12, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 2; c.stroke();
  // aperture
  const ah = r * 0.95 * open;
  c.save();
  c.beginPath();
  c.moveTo(cx - r, cy);
  c.quadraticCurveTo(cx, cy - ah * 1.6, cx + r, cy);
  c.quadraticCurveTo(cx, cy + ah * 1.6, cx - r, cy);
  c.closePath();
  c.clip();
  c.fillStyle = '#020303'; c.fillRect(cx - r, cy - r, r * 2, r * 2);
  const ix = cx + look * r * 0.35;
  c.shadowColor = iris; c.shadowBlur = r * 0.8;
  c.fillStyle = iris;
  c.beginPath(); c.arc(ix, cy, r * 0.55, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0;
  // iris rings
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = Math.max(1, r * 0.03);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + t * 0.1;
    c.beginPath(); c.moveTo(ix + Math.cos(a) * r * 0.24, cy + Math.sin(a) * r * 0.24); c.lineTo(ix + Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.52); c.stroke();
  }
  c.fillStyle = '#000';
  c.beginPath(); c.arc(ix, cy, r * (0.2 + 0.03 * Math.sin(t * 2)), 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.beginPath(); c.arc(ix - r * 0.18, cy - r * 0.18, r * 0.07, 0, Math.PI * 2); c.fill();
  c.restore();
  // lid edge glow
  if (open > 0.02) {
    c.strokeStyle = iris; c.globalAlpha = 0.25 * open; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx - r, cy); c.quadraticCurveTo(cx, cy - ah * 1.6, cx + r, cy); c.quadraticCurveTo(cx, cy + ah * 1.6, cx - r, cy); c.stroke();
    c.globalAlpha = 1;
  }
}

function drawBuilding(c: CanvasRenderingContext2D, w: number, h: number, sky: string, glow: string, windowOn: number) {
  const base = h * 0.78;
  // hill
  c.fillStyle = '#020607';
  c.beginPath(); c.moveTo(0, h); c.lineTo(0, base + h * 0.08);
  c.bezierCurveTo(w * 0.25, base - h * 0.02, w * 0.4, base - h * 0.1, w * 0.5, base - h * 0.1);
  c.bezierCurveTo(w * 0.62, base - h * 0.1, w * 0.78, base, w, base + h * 0.1);
  c.lineTo(w, h); c.closePath(); c.fill();
  // brutalist blocks
  const bx = w * 0.36, by = base - h * 0.1, u = w * 0.01;
  c.fillRect(bx, by - u * 14, u * 28, u * 14 + 2);
  c.fillRect(bx + u * 4, by - u * 22, u * 14, u * 9);
  c.fillRect(bx + u * 20, by - u * 19, u * 5, u * 6);
  c.fillRect(bx + u * 9, by - u * 30, u * 2, u * 9); // mast
  c.fillRect(bx - u * 3, by - u * 6, u * 34, u * 2);
  // window
  if (windowOn > 0) {
    const wx = bx + u * 16, wy = by - u * 10, ww = u * 2.2, wh = u * 1.6;
    c.save();
    c.globalAlpha = windowOn;
    const g = c.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, u * 14);
    g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = windowOn * 0.35; c.fillStyle = g; c.fillRect(wx - u * 14, wy - u * 14, u * 30, u * 30);
    c.globalAlpha = windowOn; c.fillStyle = '#fff6d8'; c.shadowColor = glow; c.shadowBlur = u * 2;
    c.fillRect(wx, wy, ww, wh);
    c.restore();
  }
  void sky;
}

function person(c: CanvasRenderingContext2D, x: number, foot: number, s: number) {
  c.beginPath(); c.arc(x, foot - s * 1.72, s * 0.17, 0, Math.PI * 2); c.fill();
  c.beginPath();
  c.moveTo(x - s * 0.2, foot - s * 1.5);
  c.quadraticCurveTo(x - s * 0.3, foot - s * 1.45, x - s * 0.28, foot - s * 0.9);
  c.lineTo(x - s * 0.18, foot); c.lineTo(x + s * 0.18, foot); c.lineTo(x + s * 0.28, foot - s * 0.9);
  c.quadraticCurveTo(x + s * 0.3, foot - s * 1.45, x + s * 0.2, foot - s * 1.5);
  c.closePath(); c.fill();
}

function symbolPath(c: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number) {
  c.beginPath();
  if (kind === 0) c.arc(x, y, s, -Math.PI / 2, Math.PI * 1.5);
  else if (kind === 1) { c.moveTo(x, y - s); c.lineTo(x, y + s); c.moveTo(x - s, y); c.lineTo(x + s, y); }
  else if (kind === 2) { c.moveTo(x - s, y - s); c.lineTo(x + s, y - s); c.lineTo(x + s, y + s); c.lineTo(x - s, y + s); c.closePath(); }
  else { c.moveTo(x, y - s); c.lineTo(x + s * 1.1, y + s * 0.85); c.lineTo(x - s * 1.1, y + s * 0.85); c.closePath(); }
}
const SYMBOL_LEN = [2 * Math.PI, 4, 8, 6.8];

const BEATS: Beat[] = [
  { // 1 rain / static
    text: 'In 1994, the Halvorsen Institute built a facility that appeared on no map.',
    draw(c, w, h, t) {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#060b16'); g.addColorStop(1, '#0d1a33');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4a78c2'; c.lineWidth = 1.2;
      for (let i = 0; i < 160; i++) {
        const sp = 0.6 + hash(i) * 0.9, len = h * (0.03 + hash(i + 9) * 0.06);
        const x = hash(i + 3) * w * 1.1 - (t * 40 * sp) % (w * 0.1);
        const y = ((hash(i + 7) * h + t * h * 0.9 * sp) % (h + len)) - len;
        c.globalAlpha = 0.15 + hash(i + 1) * 0.5;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - len * 0.12, y + len); c.stroke();
      }
      c.globalAlpha = 1;
      // static rows
      for (let i = 0; i < 6; i++) {
        const y = hash(Math.floor(t * 12) + i * 31) * h;
        c.fillStyle = `rgba(120,160,230,${0.04 + hash(i + Math.floor(t * 9)) * 0.08})`;
        c.fillRect(0, y, w, 1 + hash(i) * 3);
      }
    },
  },
  { // 2 building on hill, teal
    text: 'Facility W-14. Its purpose: to study how people escape.',
    draw(c, w, h, t, p) {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#031416'); g.addColorStop(0.75, '#0f4a50'); g.addColorStop(1, '#0a3236');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // fog bands
      for (let i = 0; i < 4; i++) {
        c.fillStyle = `rgba(90,190,190,${0.035})`;
        c.fillRect(((t * 8 * (i + 1)) % (w * 1.5)) - w * 0.5, h * (0.55 + i * 0.06), w * 0.9, h * 0.03);
      }
      c.save(); c.translate(w * 0.5, h * 0.5); const s = 1 + p * 0.06; c.scale(s, s); c.translate(-w * 0.5, -h * 0.5);
      drawBuilding(c, w, h, '#0f4a50', 'rgba(255,230,160,1)', 1);
      c.restore();
    },
  },
  { // 3 the Eye opens
    text: 'Its custodian was not a person. The staff called it the WARDEN.',
    draw(c, w, h, t, p) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      const open = ease((p - 0.15) / 0.55);
      const g = c.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, w * 0.35);
      g.addColorStop(0, `rgba(158,255,194,${0.12 * open})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      drawEye(c, w / 2, h * 0.42, Math.min(w, h) * 0.13, open, '#9effc2', Math.sin(t * 0.7) * 0.6 * open, t);
    },
  },
  { // 4 five volunteers dimming
    text: 'Volunteers entered one at a time. Each was given a number. None were given a reason.',
    draw(c, w, h, _t, p) {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a0e02'); g.addColorStop(0.7, '#5c3407'); g.addColorStop(1, '#2a1703');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const floor = h * 0.74, s = h * 0.24;
      c.fillStyle = '#ffb347'; c.globalAlpha = 0.15; c.fillRect(0, floor, w, 2); c.globalAlpha = 1;
      for (let i = 0; i < 5; i++) {
        const x = w * (0.22 + i * 0.14);
        const dim = ease((p - (0.12 + i * 0.13)) / 0.08);
        // backlight
        const bg = c.createRadialGradient(x, floor - s, 0, x, floor - s, s * 1.2);
        bg.addColorStop(0, `rgba(255,179,71,${0.4 * (1 - dim * 0.85)})`); bg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = bg; c.fillRect(x - s * 1.3, floor - s * 2.4, s * 2.6, s * 2.6);
        c.fillStyle = '#050302'; c.globalAlpha = 1 - dim * 0.75;
        person(c, x, floor, s);
        c.globalAlpha = 1 - dim * 0.8;
        c.fillStyle = '#ffb347';
        c.font = `bold ${Math.round(h * 0.045)}px 'Courier New', monospace`; c.textAlign = 'center';
        c.fillText(String(9 + i).padStart(2, '0'), x, floor - s * 2.1);
        c.globalAlpha = 1;
      }
    },
  },
  { // 5 red data / scanlines
    text: 'The Warden watched. It recorded every choice. Every hesitation. Every mistake.',
    draw(c, w, h, t) {
      c.fillStyle = '#140203'; c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.45);
      g.addColorStop(0, 'rgba(255,77,77,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#000'; person(c, w / 2, h * 0.86, h * 0.42);
      // data streaks
      c.font = `${Math.round(h * 0.018)}px 'Courier New', monospace`; c.textAlign = 'left';
      for (let i = 0; i < 40; i++) {
        const y = hash(i * 3) * h, sp = 0.3 + hash(i) * 1.2;
        const x = ((hash(i + 5) * w + t * w * 0.25 * sp) % (w * 1.4)) - w * 0.2;
        const len = w * (0.04 + hash(i + 2) * 0.18);
        c.globalAlpha = 0.25 + hash(i + 4) * 0.5;
        c.fillStyle = '#ff4d4d'; c.fillRect(x, y, len, 1 + Math.floor(hash(i + 8) * 2));
        if (i % 4 === 0) c.fillText(`${(Math.floor(hash(i + Math.floor(t * 3)) * 0xffffff)).toString(16).toUpperCase()} ${['CHOICE', 'HESITATE', 'ERROR', 'RETRY', 'LOOK'][i % 5]}`, x, y - 3);
      }
      c.globalAlpha = 1;
      // scanlines
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
      const sy = ((t * 0.35) % 1) * h;
      c.fillStyle = 'rgba(255,77,77,0.25)'; c.fillRect(0, sy, w, 2);
    },
  },
  { // 6 glowing scratched symbols
    text: 'Subject 13 came closest. They left messages for whoever came next.',
    draw(c, w, h, _t, p) {
      c.fillStyle = '#030805'; c.fillRect(0, 0, w, h);
      // wall texture: faint panel seams
      c.strokeStyle = 'rgba(89,255,156,0.04)'; c.lineWidth = 1;
      for (let x = 0; x < w; x += w / 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(150,170,160,${hash(i) * 0.05})`; c.fillRect(hash(i + 1) * w, hash(i + 2) * h, 2, 2); }
      const s = h * 0.075, y = h * 0.4;
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (let k = 0; k < 4; k++) {
        const x = w * (0.26 + k * 0.16);
        const prog = ease((p - (0.08 + k * 0.17)) / 0.15);
        if (prog <= 0) continue;
        const L = SYMBOL_LEN[k] * s;
        c.setLineDash([L, L]); c.lineDashOffset = L * (1 - prog);
        c.strokeStyle = '#59ff9c'; c.lineWidth = Math.max(2, s * 0.12);
        c.shadowColor = '#59ff9c'; c.shadowBlur = s * 0.5;
        symbolPath(c, k, x, y, s); c.stroke();
        c.shadowBlur = 0; c.setLineDash([]);
        // tallies
        c.lineWidth = Math.max(1.5, s * 0.06); c.globalAlpha = 0.7 * prog;
        for (let j = 0; j <= k; j++) { c.beginPath(); c.moveTo(x - s * 0.5 + j * s * 0.3, y + s * 1.6); c.lineTo(x - s * 0.55 + j * s * 0.3, y + s * 2.2); c.stroke(); }
        c.globalAlpha = 1;
      }
      const g = c.createRadialGradient(w / 2, y, 0, w / 2, y, w * 0.5);
      g.addColorStop(0, 'rgba(89,255,156,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    },
  },
  { // 7 eye turns red, window goes dark
    text: 'Then the Institute went silent. The Warden did not.',
    draw(c, w, h, t, p) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      const red = ease((p - 0.3) / 0.12);
      const win = 1 - ease((p - 0.55) / 0.04);
      c.save(); c.globalAlpha = 0.9;
      const sky = c.createLinearGradient(0, h * 0.4, 0, h); sky.addColorStop(0, '#000'); sky.addColorStop(1, '#06090c');
      c.fillStyle = sky; c.fillRect(0, 0, w, h);
      drawBuilding(c, w, h, '#000', 'rgba(255,230,160,1)', win);
      c.restore();
      const col = red > 0.5 ? '#ff3d3d' : '#9effc2';
      const glitch = red > 0 && red < 1 ? (hash(Math.floor(t * 30)) - 0.5) * w * 0.02 : 0;
      const g = c.createRadialGradient(w / 2, h * 0.28, 0, w / 2, h * 0.28, w * 0.3);
      g.addColorStop(0, red > 0.5 ? 'rgba(255,61,61,0.2)' : 'rgba(158,255,194,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      drawEye(c, w / 2 + glitch, h * 0.28, Math.min(w, h) * 0.09, 1, col, Math.sin(t * 0.5) * 0.3, t);
    },
  },
  { // 8 white room, figure on cot
    text: "Years later, you wake in a white room. You don't remember volunteering.",
    draw(c, w, h, _t, p) {
      const k = ease(p / 0.7);
      const v = Math.round(lerp(255, 138, k));
      c.fillStyle = `rgb(${v},${v + 2},${v + 4})`; c.fillRect(0, 0, w, h);
      const ink = `rgba(20,24,28,${lerp(0.25, 0.95, k)})`;
      const floor = h * 0.74;
      c.fillStyle = `rgba(0,0,0,${0.08 * k})`; c.fillRect(0, floor, w, h - floor);
      c.fillStyle = ink;
      const cx = w * 0.5, cw = w * 0.3, ct = floor - h * 0.12;
      c.fillRect(cx - cw / 2, ct, cw, h * 0.025);              // cot frame
      c.fillRect(cx - cw / 2 + 4, ct, 5, floor - ct);           // legs
      c.fillRect(cx + cw / 2 - 9, ct, 5, floor - ct);
      // lying figure
      c.beginPath(); c.arc(cx - cw * 0.38, ct - h * 0.03, h * 0.032, 0, Math.PI * 2); c.fill();
      c.beginPath();
      c.moveTo(cx - cw * 0.32, ct - h * 0.05);
      c.quadraticCurveTo(cx, ct - h * 0.075, cx + cw * 0.42, ct - h * 0.035);
      c.lineTo(cx + cw * 0.44, ct); c.lineTo(cx - cw * 0.34, ct); c.closePath(); c.fill();
      // harsh light from above
      const g = c.createRadialGradient(cx, 0, 0, cx, 0, h * 0.9);
      g.addColorStop(0, `rgba(255,255,255,${0.6 * (1 - k * 0.6)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = `rgba(255,255,255,${1 - ease(p / 0.25)})`; c.fillRect(0, 0, w, h); // blinding open
    },
  },
  { // 9 title
    text: 'You are SUBJECT 14.',
    draw(c, w, h, t) {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      const ph = t % 1.1;
      const beat = Math.exp(-ph * 9) + 0.6 * Math.exp(-Math.max(0, ph - 0.22) * 10) * (ph > 0.22 ? 1 : 0);
      const g = c.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(140,0,0,${0.12 + 0.35 * beat})`);
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    },
  },
];

// ---------------------------------------------------------------- factory
export function createStory(root: HTMLElement, audio: AudioAPI): StoryAPI {
  const A = {
    sfx(c: SfxCue, v?: number) { try { audio.sfx(c, v != null ? { volume: v } : undefined); } catch { /* ignore */ } },
    blip(t: Tone) { try { audio.blip(t); } catch { /* ignore */ } },
    tension(n: number) { try { audio.setTension(n); } catch { /* ignore */ } },
    screen() { try { audio.setScreen('exit'); } catch { /* ignore */ } },
  };

  if (!document.getElementById('st-style')) {
    const st = document.createElement('style'); st.id = 'st-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';

  const layer = el('div', 'st-layer', root);
  let canvasW = 1280, canvasH = 720;
  const measure = () => {
    try {
      const game = root.querySelector('#game') as HTMLElement | null;
      const rr = root.getBoundingClientRect();
      const gr = game ? game.getBoundingClientRect() : rr;
      canvasW = gr.width || rr.width; canvasH = gr.height || rr.height;
      layer.style.left = (gr.left - rr.left) + 'px';
      layer.style.top = (gr.top - rr.top) + 'px';
      layer.style.width = canvasW + 'px';
      layer.style.height = canvasH + 'px';
      layer.style.setProperty('--u', (canvasW / 100) + 'px');
    } catch { /* ignore */ }
  };
  measure();
  window.addEventListener('resize', measure);
  try { new ResizeObserver(measure).observe(root); } catch { /* ignore */ }
  requestAnimationFrame(measure);

  let busyCount = 0;

  // ---------- objective
  const obj = el('div', 'st-obj', layer);
  let objText: string | null = null;
  function setObjective(text: string | null, color?: string) {
    if (color) obj.style.setProperty('--st-c', color);
    if (text == null || text === '') { objText = null; obj.classList.remove('st-on'); return; }
    if (text === objText) return;
    objText = text;
    obj.innerHTML = '';
    el('b', '', obj).textContent = 'OBJECTIVE ▸';
    obj.appendChild(document.createTextNode(text));
    obj.classList.add('st-on');
    obj.classList.remove('st-pulse'); void obj.offsetWidth; obj.classList.add('st-pulse');
  }

  // ---------- chapter card (queued)
  const TAG: Record<string, string> = { EASY: '#59ff9c', MEDIUM: '#ffb347', HARD: '#ff8a3d', HARDEST: '#ff4d4d', BREATHER: '#6fb6ff' };
  let chQueue: Promise<void> = Promise.resolve();
  function showChapter(c: ChapterCard): Promise<void> {
    const run = async () => {
      try {
        measure();
        const card = el('div', 'st-ch', layer);
        card.style.setProperty('--st-c', c.color || '#9effc2');
        el('div', 'st-ch-band', card);
        el('div', 'st-ch-line', card);
        el('div', 'st-ch-num', card).textContent = `CHAPTER ${c.numeral}`;
        el('div', 'st-ch-title', card).textContent = c.title;
        el('div', 'st-ch-sub', card).textContent = c.subtitle;
        if (c.difficulty) {
          const tag = el('div', 'st-ch-tag', card);
          tag.style.setProperty('--st-t', TAG[c.difficulty] || '#aaa');
          tag.textContent = c.difficulty;
        }
        void card.offsetWidth;
        card.classList.add('st-on');
        A.sfx('door_lock');
        await sleep(600 + 3000);
        card.classList.add('st-off');
        await sleep(820);
        card.remove();
      } catch { /* never throw */ }
    };
    const p = chQueue.then(run);
    chQueue = p;
    return p;
  }

  // ---------- fragment (queued)
  let frQueue: Promise<void> = Promise.resolve();
  function showFragment(index: number, total: number, text: string): Promise<void> {
    const run = async () => {
      try {
        measure();
        const card = el('div', 'st-frag', layer);
        el('div', 'st-frag-h', card).textContent = `SUBJECT 13 — FRAGMENT ${index}/${total}`;
        const body = el('div', 'st-frag-t', card);
        const shown = el('span', '', body), ghost = el('span', 'st-ghost', body);
        ghost.textContent = text;
        void card.offsetWidth;
        card.classList.add('st-on');
        A.sfx('pickup');
        await sleep(350);
        const per = Math.max(14, Math.min(38, 2200 / Math.max(1, text.length)));
        for (let i = 1; i <= text.length; i++) {
          shown.textContent = text.slice(0, i); ghost.textContent = text.slice(i);
          await sleep(per);
        }
        await sleep(Math.max(2600, 6000 - 350 - per * text.length));
        card.classList.add('st-off');
        await sleep(820);
        card.remove();
      } catch { /* never throw */ }
    };
    const p = frQueue.then(run);
    frQueue = p;
    return p;
  }

  // ---------- prologue
  function playPrologue(): Promise<void> {
    return new Promise<void>((resolve) => {
      busyCount++;
      const wrap = el('div', 'st-pro', root);
      const cv = el('canvas', '', wrap);
      el('div', 'st-pro-tag', wrap).textContent = 'HALVORSEN INSTITUTE · ARCHIVE W-14';
      const txt = el('div', 'st-pro-text', wrap);
      el('div', 'st-pro-skip', wrap).textContent = 'CLICK / SPACE TO SKIP';
      let W = 0, H = 0, ctx: CanvasRenderingContext2D;
      const size = () => {
        W = wrap.clientWidth || root.clientWidth || window.innerWidth;
        H = wrap.clientHeight || root.clientHeight || window.innerHeight;
        ctx = fitCanvas(cv, W, H);
        wrap.style.setProperty('--pu', Math.min(W / 100, H / 56.25) + 'px');
      };
      size();
      window.addEventListener('resize', size);

      A.screen(); A.tension(10);
      let beat = -1, beatStart = 0, done = false, raf = 0, typed = -1;
      const start = performance.now();
      const totalBeats = BEATS.length;

      const setBeat = (i: number, now: number) => {
        beat = i; beatStart = now; typed = -1;
        txt.classList.toggle('st-final', i === totalBeats - 1);
        A.tension(10 + (50 * i) / (totalBeats - 1));
        if (i === totalBeats - 1) A.sfx('setpiece_slam');
      };
      const renderText = (n: number) => {
        const s = BEATS[beat].text;
        const shown = s.slice(0, n), rest = s.slice(n);
        const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        let html = esc(shown);
        if (beat === totalBeats - 1) html = html.replace('SUBJECT 14', '<em>SUBJECT 14</em>').replace(/(SUBJECT 1?4?)$/, '<em>$1</em>');
        else html = html.replace('WARDEN', '<em style="font-style:normal;color:#9effc2">WARDEN</em>');
        txt.innerHTML = html + (n < s.length ? '<span class="st-cur"></span>' : '') + `<span class="st-ghost">${esc(rest)}</span>`;
      };
      const finish = () => {
        if (done) return; done = true;
        cancelAnimationFrame(raf);
        cleanupInput();
        wrap.style.opacity = '0';
        setTimeout(() => { window.removeEventListener('resize', size); wrap.remove(); busyCount--; resolve(); }, 900);
      };
      const skip = () => {
        if (done) return;
        if (beat < totalBeats - 1) setBeat(totalBeats - 1, performance.now());
        else if (performance.now() - beatStart > 1200) finish();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) skip(); }
      };
      const onClick = (e: MouseEvent) => { e.stopPropagation(); skip(); };
      window.addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', onClick);
      const cleanupInput = () => { window.removeEventListener('keydown', onKey, true); wrap.removeEventListener('click', onClick); };

      setBeat(0, start);
      const frame = (now: number) => {
        if (done) return;
        const isFinal = beat === totalBeats - 1;
        const dur = isFinal ? FINAL_MS : BEAT_MS;
        let lt = now - beatStart;
        if (lt >= dur) {
          if (isFinal) { finish(); return; }
          setBeat(beat + 1, now); lt = 0;
        }
        const p = lt / dur, tsec = (now - start) / 1000;
        try {
          ctx.save();
          BEATS[beat].draw(ctx, W, H, tsec, p);
          ctx.restore();
          // beat envelope (fade from/to black); final beat is a hard cut in
          const fin = isFinal ? 1 : clamp(lt / 800), fout = clamp((dur - lt) / 800);
          const a = 1 - Math.min(fin, fout);
          if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); }
          // vignette
          const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
          v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
          ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        } catch { /* ignore draw errors */ }
        // narration typing
        const s = BEATS[beat].text;
        const typeStart = isFinal ? 500 : 900, per = isFinal ? 90 : 42;
        const n = clamp(Math.floor((lt - typeStart) / per), 0, s.length);
        if (n !== typed) {
          for (let i = Math.max(0, typed); i < n; i++) if (i % 2 === 0 && s[i] !== ' ') A.blip('cold');
          typed = n; renderText(n);
        }
        txt.style.opacity = isFinal ? '1' : String(clamp((dur - lt) / 600));
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  // ---------- wake-up
  function playWakeUp(): Promise<void> {
    return new Promise<void>((resolve) => {
      busyCount++;
      measure();
      const wrap = el('div', 'st-wake', layer);
      const cv = el('canvas', '', wrap);
      const game = root.querySelector('#game') as HTMLCanvasElement | null;
      const DUR = 7200;
      // [time ms, eyelid openness]
      const K: [number, number][] = [[0, 0], [700, 0], [1500, 0.28], [2200, 0.32], [2600, 0], [3200, 0], [4000, 0.6], [4600, 0.55], [4850, 0.04], [5200, 0.04], [6000, 1], [DUR, 1]];
      const openAt = (t: number) => {
        for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [t0, a] = K[i - 1], [t1, b] = K[i]; return lerp(a, b, ease((t - t0) / (t1 - t0))); }
        return 1;
      };
      let hinted = false, lit = false;
      const start = performance.now();
      A.tension(60);
      const frame = (now: number) => {
        const t = now - start;
        const w = canvasW, h = canvasH;
        const ctx = fitCanvas(cv, w, h);
        const k = clamp(t / 6400);                       // overall clarity 0..1
        const blur = lerp(16, 0, ease(k));
        const dbl = lerp(w * 0.035, 0, ease(clamp(t / 6000))) * (0.7 + 0.3 * Math.sin(t / 260));
        const sat = lerp(0.15, 1, ease(k));
        const fadeOut = clamp((t - 6300) / 800);
        A.tension(lerp(60, 15, clamp(t / DUR)));
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.globalAlpha = 1 - fadeOut;
        if (game) {
          try {
            const jx = Math.sin(t / 90) * (1 - k) * 3, jy = Math.cos(t / 120) * (1 - k) * 2;
            ctx.filter = `blur(${blur.toFixed(1)}px) saturate(${sat.toFixed(2)}) brightness(${lerp(0.7, 1, k).toFixed(2)})`;
            ctx.drawImage(game, jx, jy, w, h);
            ctx.globalAlpha = (1 - fadeOut) * 0.45 * (1 - k * 0.6);
            ctx.drawImage(game, jx + dbl, jy - dbl * 0.25, w, h);
            ctx.filter = 'none';
          } catch { /* ignore */ }
        }
        ctx.restore();
        // eyelids
        const o = openAt(t);
        const gap = o * h * 0.62, cy = h * 0.5, sag = h * 0.22 * (1 - o * 0.6);
        ctx.fillStyle = '#000';
        ctx.globalAlpha = o >= 0.999 ? 1 - fadeOut : 1;
        ctx.beginPath();
        ctx.moveTo(-2, -2); ctx.lineTo(w + 2, -2); ctx.lineTo(w + 2, cy - gap + sag);
        ctx.quadraticCurveTo(w / 2, cy - gap * 1.9 - sag * 0.2, -2, cy - gap + sag); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-2, h + 2); ctx.lineTo(w + 2, h + 2); ctx.lineTo(w + 2, cy + gap - sag);
        ctx.quadraticCurveTo(w / 2, cy + gap * 1.9 + sag * 0.2, -2, cy + gap - sag); ctx.closePath(); ctx.fill();
        // vignette pulse
        const pulse = 0.5 + 0.5 * Math.sin(t / 420);
        const vg = ctx.createRadialGradient(w / 2, h / 2, h * lerp(0.15, 0.55, k), w / 2, h / 2, w * 0.7);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${(0.55 + 0.3 * pulse) * (1 - k * 0.7)})`);
        ctx.globalAlpha = 1 - fadeOut; ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
        // pale wash
        ctx.fillStyle = `rgba(200,210,220,${0.18 * (1 - k)})`; ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        if (!hinted && t > 1300) { hinted = true; A.sfx('hint'); }
        if (!lit && t > 5700) { lit = true; A.sfx('lights_on'); }
        if (t < DUR) requestAnimationFrame(frame);
        else { wrap.remove(); busyCount--; A.tension(15); resolve(); }
      };
      requestAnimationFrame(frame);
    });
  }

  return {
    playPrologue, playWakeUp, showChapter, setObjective, showFragment,
    get busy() { return busyCount > 0; },
  };
}
