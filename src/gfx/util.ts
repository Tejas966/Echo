// Small drawing helpers shared by the gfx module. Canvas 2D only.
import type { Glyph, Shape, Tone, ValveColor } from '../types';

export type Ctx = CanvasRenderingContext2D;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

/** Deterministic hash -> [0,1). */
export function hash(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Small seeded RNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function fillRR(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string | CanvasGradient) {
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

export function vgrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0.003) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(color, a));
  g.addColorStop(0.4, hexA(color, a * 0.35));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export const TONE_COLOR: Record<Tone, string> = {
  polite: '#9effc2',
  mocking: '#ffc14d',
  rattled: '#ff3df0',
  cold: '#8fd3ff',
};

export const VALVE_COLOR: Record<ValveColor, string> = {
  red: '#d9443a',
  green: '#4fbf6a',
  blue: '#3d7be0',
  yellow: '#e8c547',
};

/** Gauge needle angle (radians, 0 = straight up) for a 1..4 setting. */
export const needleAngle = (v: number) => ((-120 + (v - 1) * 80) * Math.PI) / 180;

export function drawGauge(ctx: Ctx, x: number, y: number, r: number, v: number, face = '#d8d2bf', needle = '#1a1a1a') {
  ctx.fillStyle = '#11161f';
  ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  for (let i = 1; i <= 4; i++) {
    const a = needleAngle(i);
    const sx = Math.sin(a), sy = -Math.cos(a);
    ctx.beginPath();
    ctx.moveTo(x + sx * r * 0.72, y + sy * r * 0.72);
    ctx.lineTo(x + sx * r * 0.92, y + sy * r * 0.92);
    ctx.stroke();
  }
  const a = needleAngle(v);
  ctx.strokeStyle = needle;
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.sin(a) * r * 0.8, y - Math.cos(a) * r * 0.8);
  ctx.stroke();
  ctx.fillStyle = needle;
  ctx.beginPath(); ctx.arc(x, y, r * 0.12, 0, Math.PI * 2); ctx.fill();
}

export function drawValveWheel(ctx: Ctx, x: number, y: number, r: number, color: string, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.22;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = r * 0.14;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); ctx.stroke();
  }
  ctx.fillStyle = '#20252e';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Path for one of the four keypad/scratch shapes, centred at (x,y), size s (half-extent). */
export function shapePath(ctx: Ctx, shape: Shape, x: number, y: number, s: number) {
  ctx.beginPath();
  switch (shape) {
    case 'tri':
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.85); ctx.lineTo(x - s, y + s * 0.85); ctx.closePath(); break;
    case 'circle':
      ctx.arc(x, y, s, 0, Math.PI * 2); break;
    case 'square':
      ctx.rect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7); break;
    case 'cross': {
      const t = s * 0.34;
      ctx.moveTo(x - t, y - s); ctx.lineTo(x + t, y - s); ctx.lineTo(x + t, y - t); ctx.lineTo(x + s, y - t);
      ctx.lineTo(x + s, y + t); ctx.lineTo(x + t, y + t); ctx.lineTo(x + t, y + s); ctx.lineTo(x - t, y + s);
      ctx.lineTo(x - t, y + t); ctx.lineTo(x - s, y + t); ctx.lineTo(x - s, y - t); ctx.lineTo(x - t, y - t); ctx.closePath();
      break;
    }
  }
}

/** Path for a P5 glyph centred at (x,y), half-size s. ◀ ▶ ◢ ◣ ⌐ ¬ */
export function glyphPath(ctx: Ctx, g: Glyph, x: number, y: number, s: number) {
  ctx.beginPath();
  switch (g) {
    case 'L': ctx.moveTo(x - s, y); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y + s); ctx.closePath(); break;
    case 'R': ctx.moveTo(x + s, y); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s, y + s); ctx.closePath(); break;
    case 'DR': ctx.moveTo(x + s, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath(); break;
    case 'DL': ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s); ctx.closePath(); break;
    case 'HL': // ⌐ : bar with tick down on the left
      ctx.moveTo(x + s, y - s * 0.3); ctx.lineTo(x - s, y - s * 0.3); ctx.lineTo(x - s, y + s * 0.7); break;
    case 'HR': // ¬ : bar with tick down on the right
      ctx.moveTo(x - s, y - s * 0.3); ctx.lineTo(x + s, y - s * 0.3); ctx.lineTo(x + s, y + s * 0.7); break;
  }
}

export const glyphIsStroke = (g: Glyph) => g === 'HL' || g === 'HR';
