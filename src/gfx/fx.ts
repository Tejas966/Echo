// Particles (pooled), transient FX state and post-processing helpers.
import type { HazardSlot, ScreenId } from '../types';
import { HAZARD_POS } from '../world/screens';
import type { Ctx } from './util';
import { clamp, hash, makeCanvas } from './util';

// ---------------- soft sprite ----------------
let soft: HTMLCanvasElement | null = null;
export function softSprite(): HTMLCanvasElement {
  if (soft) return soft;
  soft = makeCanvas(64, 64);
  const c = soft.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return soft;
}

// ---------------- particles ----------------
interface Pt { alive: boolean; kind: 0 | 1; x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; screen: ScreenId }
const MAX = 150;

export class Particles {
  pool: Pt[] = Array.from({ length: MAX }, () => ({ alive: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 1, screen: 'hall' }));
  private acc: Record<string, number> = {};

  private spawn(kind: 0 | 1, screen: ScreenId, x: number, y: number) {
    const p = this.pool.find((q) => !q.alive);
    if (!p) return;
    p.alive = true; p.kind = kind; p.screen = screen;
    p.x = x + (Math.random() - 0.5) * 10; p.y = y + (Math.random() - 0.5) * 6;
    if (kind === 0) {
      p.vx = (Math.random() - 0.5) * 160; p.vy = 60 + Math.random() * 80;
      p.max = 1.4 + Math.random() * 1.2; p.r = 8 + Math.random() * 10;
    } else {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 260;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 120;
      p.max = 0.25 + Math.random() * 0.45; p.r = 2;
    }
    p.life = 0;
  }

  /** Continuous emission for a slot (rate per second). */
  emit(slot: HazardSlot, kind: 0 | 1, dt: number, scale = 1) {
    const pos = HAZARD_POS[slot];
    if (!pos) return;
    if (kind === 0) {
      this.acc[slot] = (this.acc[slot] ?? 0) + dt * 34 * scale;
      while (this.acc[slot] >= 1) { this.acc[slot] -= 1; this.spawn(0, pos.screen, pos.x, pos.y); }
    } else {
      // crackle: random bursts
      if (Math.random() < dt * 3.5 * scale) {
        const n = 6 + Math.floor(Math.random() * 10);
        for (let i = 0; i < n; i++) this.spawn(1, pos.screen, pos.x, pos.y);
      }
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; continue; }
      if (p.kind === 0) {
        p.vy -= 160 * dt; // jets down, then billows up
        p.vx *= 1 - dt * 0.6;
        p.r += dt * 40;
      } else {
        p.vy += 700 * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 1 && p.y > 600) { p.y = 600; p.vy *= -0.35; p.vx *= 0.6; }
    }
  }

  draw(ctx: Ctx, screen: ScreenId) {
    const spr = softSprite();
    ctx.save();
    for (const p of this.pool) {
      if (!p.alive || p.screen !== screen || p.kind !== 0) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = 0.5 * (1 - k) * Math.min(1, k * 6);
      ctx.drawImage(spr, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of this.pool) {
      if (!p.alive || p.screen !== screen || p.kind !== 1) continue;
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = k > 0.5 ? '#ffe3a0' : '#ff8a2a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke();
    }
    ctx.restore();
  }

  /** Light contributed by sparks near a slot (0..1), for punching darkness. */
  sparkGlow(screen: ScreenId): number {
    let n = 0;
    for (const p of this.pool) if (p.alive && p.kind === 1 && p.screen === screen) n++;
    return clamp(n / 10, 0, 1);
  }
}

// ---------------- grain / vignette ----------------
let grain: HTMLCanvasElement | null = null;
export function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  grain = makeCanvas(256, 256);
  const c = grain.getContext('2d')!;
  const img = c.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return grain;
}

const vigCache = new Map<string, HTMLCanvasElement>();
export function vignette(w: number, h: number, color: string): HTMLCanvasElement {
  const key = `${w}x${h}${color}`;
  let v = vigCache.get(key);
  if (v) return v;
  v = makeCanvas(w, h);
  const c = v.getContext('2d')!;
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},1)`);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  vigCache.set(key, v);
  return v;
}

/** Seeded flicker factor, ≤3 Hz transitions. */
export function flickerFactor(t: number, reduce: boolean): number {
  if (reduce) return 0.72 + 0.28 * Math.sin((t / 1600) * Math.PI * 2);
  const seg = Math.floor(t / 170);
  const h = hash(seg * 31 + 7);
  if (h < 0.5) return 1;
  if (h < 0.78) return 0.4;
  return 0.06;
}

export function heartbeat(t: number): number {
  const m = t % 1000;
  return Math.exp(-((m / 70) ** 2)) + 0.6 * Math.exp(-(((m - 240) / 70) ** 2));
}
