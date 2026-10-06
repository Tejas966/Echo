// Projector beam + slide images (archive). Drawn after the darkness mask (emissive).
import { P3_SLIDES } from '../world/screens';
import type { Ctx } from './util';
import { drawGauge, drawValveWheel, hash, VALVE_COLOR } from './util';
import { drawFigure, drawItemIcon } from './figure';

const R = { x: 424, y: 132, w: 332, h: 204 };
const LENS = { x: 499, y: 488 };

export function drawBeam(ctx: Ctx, t: number, flick: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(LENS.x, LENS.y, R.x + R.w / 2, R.y + R.h / 2);
  g.addColorStop(0, `rgba(255,190,110,${0.32 * flick})`);
  g.addColorStop(1, `rgba(255,180,90,${0.05 * flick})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(LENS.x - 5, LENS.y);
  ctx.lineTo(R.x, R.y + R.h);
  ctx.lineTo(R.x, R.y);
  ctx.lineTo(R.x + R.w, R.y);
  ctx.lineTo(R.x + R.w, R.y + R.h);
  ctx.lineTo(LENS.x + 5, LENS.y);
  ctx.closePath();
  ctx.fill();
  // dust motes in the beam
  for (let i = 0; i < 26; i++) {
    const u = (hash(i * 7 + 1) + t / (9000 + hash(i) * 6000)) % 1;
    const v = hash(i * 13 + 5);
    const bx = R.x + v * R.w, by = R.y + R.h;
    const x = LENS.x + (bx - LENS.x) * u + Math.sin(t / 1300 + i) * 4;
    const y = LENS.y + (by - LENS.y) * u - (hash(i * 3) * 120) * u;
    ctx.fillStyle = `rgba(255,220,170,${0.35 * (1 - Math.abs(u - 0.5) * 2) * flick})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

export function drawSlide(ctx: Ctx, slide: number, t: number, flick: number) {
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  // warm projected field
  const g = ctx.createRadialGradient(R.x + R.w / 2, R.y + R.h / 2, 20, R.x + R.w / 2, R.y + R.h / 2, R.w * 0.7);
  g.addColorStop(0, '#f2dcae'); g.addColorStop(1, '#a8834e');
  ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
  const ink = '#2a1d10';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  if (slide >= 1 && slide <= 4) {
    const d = P3_SLIDES[slide - 1];
    // floor line
    ctx.fillStyle = 'rgba(60,40,20,0.35)'; ctx.fillRect(R.x, R.y + 176, R.w, 2);
    // subject silhouette
    if (d.forged) {
      const hand = drawFigure(ctx, R.x + 95, R.y + 178, 0.7, { facing: 1, phase: 0, walk: 0, breath: 0, reach: 0.9, color: ink });
      drawItemIcon(ctx, 'cloth', hand.hx + 2, hand.hy + 4, 1.3);
    } else {
      const builds = [{ tall: 1.06, thin: 0.85 }, { tall: 0.95, thin: 1.15, hunch: 0.6 }, {}, { tall: 1.1, thin: 0.95, hunch: 0.3 }];
      drawFigure(ctx, R.x + 95, R.y + 178, 0.7, { facing: 1, phase: 0, walk: 0, breath: 0, reach: 0.5, color: ink, build: builds[slide - 1] });
    }
    // valve + gauge
    drawGauge(ctx, R.x + 230, R.y + 70, 26, d.shows, '#efe2c2', ink);
    ctx.strokeStyle = ink; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(R.x + 230, R.y + 98); ctx.lineTo(R.x + 230, R.y + 122); ctx.stroke();
    drawValveWheel(ctx, R.x + 230, R.y + 140, 30, VALVE_COLOR[d.color], 0.3);
    // captions
    ctx.fillStyle = ink;
    ctx.fillText(d.subject, R.x + 12, R.y + 22);
    ctx.font = '11px monospace';
    ctx.fillText(`VALVE: ${d.color.toUpperCase()}`, R.x + 12, R.y + 38);
    if (d.forged) {
      ctx.save();
      ctx.translate(R.x + 262, R.y + 190); ctx.rotate(-0.12);
      ctx.strokeStyle = '#b3241c'; ctx.lineWidth = 3; ctx.strokeRect(-60, -16, 120, 26);
      ctx.fillStyle = '#b3241c'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
      ctx.fillText(d.stamp, 0, 4);
      ctx.restore();
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(d.stamp, R.x + R.w - 10, R.y + R.h - 10);
    }
  } else if (slide === 5) {
    // Subject 13 from behind, finger on the observation window
    ctx.fillStyle = 'rgba(40,30,20,0.85)'; ctx.fillRect(R.x + 120, R.y + 20, 150, 120);
    ctx.fillStyle = 'rgba(240,225,190,0.35)'; ctx.fillRect(R.x + 128, R.y + 28, 134, 104);
    ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R.x + 180, R.y + 70); ctx.lineTo(R.x + 196, R.y + 62); ctx.lineTo(R.x + 190, R.y + 78);
    ctx.stroke();
    // figure seen from behind (no face side), arm raised to the glass
    drawFigure(ctx, R.x + 150, R.y + 200, 0.78, { facing: 1, phase: 0, walk: 0, breath: 0, reach: 2.55, color: ink, build: { thin: 1.1 } });
    ctx.fillStyle = ink;
    ctx.fillText('SUBJECT 13', R.x + 12, R.y + 22);
    ctx.font = '11px monospace';
    ctx.fillText('OBS. WINDOW / ARCHIVE SIDE', R.x + 12, R.y + 38);
    ctx.textAlign = 'right';
    ctx.fillText('RECORDS UPDATED', R.x + R.w - 10, R.y + R.h - 10);
  }
  // film scratches + flicker + vignette
  for (let i = 0; i < 3; i++) {
    const hx = hash(Math.floor(t / 90) * 3 + i);
    if (hx > 0.6) { ctx.fillStyle = 'rgba(40,25,10,0.25)'; ctx.fillRect(R.x + hx * R.w, R.y, 1, R.h); }
  }
  const v = ctx.createRadialGradient(R.x + R.w / 2, R.y + R.h / 2, R.w * 0.3, R.x + R.w / 2, R.y + R.h / 2, R.w * 0.65);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(30,15,0,0.55)');
  ctx.fillStyle = v; ctx.fillRect(R.x, R.y, R.w, R.h);
  if (flick < 1) { ctx.fillStyle = `rgba(0,0,0,${(1 - flick) * 0.8})`; ctx.fillRect(R.x, R.y, R.w, R.h); }
  ctx.restore();
}
