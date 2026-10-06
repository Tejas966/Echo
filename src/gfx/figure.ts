// Procedural silhouette figure (player, past subjects, Subject 15 on the cot).
import type { ItemId } from '../types';
import type { Ctx } from './util';

export interface FigureOpts {
  facing: 1 | -1;
  phase: number;        // walk phase (radians)
  walk: number;         // 0..1 walk blend
  breath: number;       // seconds clock for idle breathing
  reach: number | null; // arm angle from straight down (rad, forward positive) or null
  color: string;
  outline?: string;     // draw an outline in this colour first
  outlineW?: number;
  build?: { tall?: number; thin?: number; hunch?: number };
}

const P = (a: number, L: number): [number, number] => [Math.sin(a) * L, Math.cos(a) * L];

/** Draws a ~200px tall figure with feet at (x, footY). Returns world position of the front hand. */
export function drawFigure(ctx: Ctx, x: number, footY: number, scale: number, o: FigureOpts): { hx: number; hy: number } {
  const tall = o.build?.tall ?? 1;
  const thin = o.build?.thin ?? 1;
  const hunch = o.build?.hunch ?? 0;
  const ph = o.phase;
  const w = o.walk;
  const bob = -Math.abs(Math.sin(ph)) * 3 * w;
  const breathe = Math.sin(o.breath * 1.8) * 1.4 * (1 - w);
  const lean = 4 * w + hunch * 10;

  const hipY = -100 * tall + bob;
  const L1 = 50 * tall, L2 = 50 * tall;
  const neckY = -162 * tall + bob - breathe;
  const shoulder: [number, number] = [lean, neckY + 6];

  const legs = (sgn: number) => {
    const p = ph + (sgn > 0 ? 0 : Math.PI);
    const ta = Math.sin(p) * 0.45 * w + sgn * 0.07 * (1 - w);
    const bend = (0.05 + Math.max(0, Math.sin(p + Math.PI / 2)) * 0.75) * w;
    const k = P(ta, L1);
    const s = P(ta - bend, L2);
    return { kx: k[0], ky: hipY + k[1], fx: k[0] + s[0], fy: hipY + k[1] + s[1] };
  };
  const arm = (sgn: number, front: boolean) => {
    let ua = -Math.sin(ph + (sgn > 0 ? 0 : Math.PI)) * 0.5 * w + 0.05;
    let fa = ua + 0.25 + 0.2 * w;
    if (front && o.reach != null) { ua = o.reach; fa = o.reach + 0.08; }
    const e = P(ua, 36 * tall);
    const h = P(fa, 34 * tall);
    return { ex: shoulder[0] + e[0], ey: shoulder[1] + e[1], hx: shoulder[0] + e[0] + h[0], hy: shoulder[1] + e[1] + h[1] };
  };

  const back = legs(-1), front = legs(1);
  const armB = arm(-1, false), armF = arm(1, true);

  const draw = (color: string, extra: number) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const seg = (pts: number[], lw: number) => {
      ctx.lineWidth = lw + extra;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
    };
    // back limbs
    seg([shoulder[0], shoulder[1], armB.ex, armB.ey, armB.hx, armB.hy], 10 * thin);
    seg([0, hipY, back.kx, back.ky, back.fx, back.fy], 14 * thin);
    // feet
    ctx.lineWidth = 8 + extra;
    ctx.beginPath(); ctx.moveTo(back.fx - 2, back.fy - 3); ctx.lineTo(back.fx + 10, back.fy - 3); ctx.stroke();
    // torso
    seg([0, hipY + 4, lean * 0.6, (hipY + neckY) / 2, shoulder[0], neckY + 12], 32 * thin);
    seg([0, hipY + 6, 0, hipY - 6], 30 * thin);
    // front leg
    seg([0, hipY, front.kx, front.ky, front.fx, front.fy], 14 * thin);
    ctx.lineWidth = 8 + extra;
    ctx.beginPath(); ctx.moveTo(front.fx - 2, front.fy - 3); ctx.lineTo(front.fx + 10, front.fy - 3); ctx.stroke();
    // neck + head
    seg([lean, neckY + 6, lean + 2, neckY - 6], 10);
    ctx.beginPath();
    ctx.ellipse(lean * 1.15 + 3 + hunch * 6, neckY - 20 * tall + hunch * 6, 14 + extra / 2, 17 * tall + extra / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // front arm
    seg([shoulder[0], shoulder[1], armF.ex, armF.ey, armF.hx, armF.hy], 10 * thin);
  };

  ctx.save();
  ctx.translate(x, footY);
  ctx.scale(o.facing * scale, scale);
  if (o.outline) draw(o.outline, o.outlineW ?? 5);
  draw(o.color, 0);
  ctx.restore();
  return { hx: x + armF.hx * o.facing * scale, hy: footY + armF.hy * scale };
}

/** Tiny held-item icon, centred at (x,y). */
export function drawItemIcon(ctx: Ctx, item: ItemId, x: number, y: number, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  switch (item) {
    case 'cloth':
      ctx.fillStyle = '#9a9483';
      ctx.beginPath(); ctx.moveTo(-9, -6); ctx.quadraticCurveTo(0, -10, 9, -5); ctx.lineTo(7, 9); ctx.quadraticCurveTo(0, 5, -8, 9); ctx.closePath(); ctx.fill();
      break;
    case 'bulb':
      ctx.fillStyle = '#f4f1d8';
      ctx.beginPath(); ctx.arc(0, -2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8b8f96'; ctx.fillRect(-3.5, 4, 7, 6);
      break;
    case 'fuse':
    case 'spare_fuse':
      ctx.fillStyle = '#b9c2c8'; ctx.fillRect(-4, -10, 8, 4); ctx.fillRect(-4, 6, 8, 4);
      ctx.fillStyle = item === 'fuse' ? 'rgba(220,240,255,0.8)' : 'rgba(255,220,150,0.85)'; ctx.fillRect(-3, -6, 6, 12);
      break;
    case 'token':
      ctx.fillStyle = '#d9b44a'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a5f1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'core_key':
      ctx.strokeStyle = '#d6dde2'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-4, 0, 4, 0, Math.PI * 2); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.moveTo(7, 0); ctx.lineTo(7, 4); ctx.stroke();
      break;
  }
  ctx.restore();
}
