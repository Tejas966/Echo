// Tiny procedural inventory icons (Canvas 2D, no external art).
import type { ItemId } from '../types';

export const ITEM_NAME: Record<ItemId, string> = {
  cloth: 'Blanket',
  bulb: 'Light bulb',
  fuse: 'Fuse',
  token: 'Token',
  spare_fuse: 'Spare fuse',
  core_key: 'Core key',
};

export function itemName(id: string): string {
  return (ITEM_NAME as Record<string, string>)[id] ?? id.replace(/_/g, ' ');
}

/** Draws the icon into a canvas sized `px` CSS pixels (handles devicePixelRatio). */
export function makeIcon(item: ItemId, px = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  c.width = c.height = Math.round(px * dpr);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale((px * dpr) / 64, (px * dpr) / 64); // draw in a 64x64 space
  try { DRAW[item]?.(ctx); } catch { /* never throw from UI */ }
  if (!DRAW[item]) drawUnknown(ctx);
  return c;
}

type Draw = (g: CanvasRenderingContext2D) => void;

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shadow(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.ellipse(cx, cy, rx, rx * 0.22, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

const drawCloth: Draw = (g) => {
  shadow(g, 32, 52, 24);
  const layers = [
    { y: 38, c1: '#5d636a', c2: '#3e4349' },
    { y: 30, c1: '#6c737a', c2: '#474c52' },
    { y: 22, c1: '#7c838a', c2: '#52585e' },
  ];
  for (const l of layers) {
    const gr = g.createLinearGradient(0, l.y, 0, l.y + 12);
    gr.addColorStop(0, l.c1); gr.addColorStop(1, l.c2);
    g.fillStyle = gr;
    rr(g, 9, l.y, 46, 12, 5);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.stroke();
  }
  // stripe + stitching
  g.fillStyle = '#7a3b34';
  g.fillRect(38, 22, 4, 28);
  g.strokeStyle = 'rgba(220,220,220,0.35)';
  g.setLineDash([2, 2]);
  g.beginPath(); g.moveTo(12, 25); g.lineTo(52, 25); g.stroke();
  g.setLineDash([]);
  // fold highlight
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.moveTo(12, 33); g.quadraticCurveTo(30, 31, 52, 33); g.stroke();
};

const drawBulb: Draw = (g) => {
  shadow(g, 32, 56, 12);
  // glass
  const gr = g.createRadialGradient(27, 20, 2, 32, 24, 18);
  gr.addColorStop(0, 'rgba(255,255,240,0.95)');
  gr.addColorStop(0.45, 'rgba(230,236,220,0.55)');
  gr.addColorStop(1, 'rgba(160,175,170,0.35)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(32, 24, 15, Math.PI * 0.82, Math.PI * 2.18);
  g.lineTo(37, 41); g.lineTo(27, 41);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(220,235,230,0.7)'; g.lineWidth = 1.2; g.stroke();
  // filament
  g.strokeStyle = '#ffb347'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(29, 38); g.lineTo(29, 26);
  for (let i = 0; i < 4; i++) g.lineTo(30 + i * 1.3, i % 2 ? 24 : 27);
  g.lineTo(35, 26); g.lineTo(35, 38); g.stroke();
  // base with ridges
  const bg = g.createLinearGradient(26, 0, 38, 0);
  bg.addColorStop(0, '#6f6a5e'); bg.addColorStop(0.5, '#d9d2bd'); bg.addColorStop(1, '#6f6a5e');
  g.fillStyle = bg;
  g.fillRect(26, 41, 12, 10);
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
  for (let y = 43; y < 51; y += 2.5) { g.beginPath(); g.moveTo(26, y); g.lineTo(38, y + 1); g.stroke(); }
  g.fillStyle = '#2a2a2a';
  g.beginPath(); g.ellipse(32, 52, 3, 2, 0, 0, Math.PI * 2); g.fill();
  // glint
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(25, 18, 2, 4, -0.5, 0, Math.PI * 2); g.fill();
};

function fuseBody(g: CanvasRenderingContext2D, body1: string, body2: string, band?: string) {
  shadow(g, 32, 46, 22);
  g.save();
  g.translate(32, 32); g.rotate(-0.35); g.translate(-32, -32);
  const cg = g.createLinearGradient(0, 24, 0, 40);
  cg.addColorStop(0, body1); cg.addColorStop(0.4, '#fffaf0'); cg.addColorStop(1, body2);
  g.fillStyle = cg;
  rr(g, 17, 24, 30, 16, 3); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.stroke();
  if (band) { g.fillStyle = band; g.fillRect(29, 24, 6, 16); }
  // metal caps
  const mg = g.createLinearGradient(0, 22, 0, 42);
  mg.addColorStop(0, '#5d6268'); mg.addColorStop(0.35, '#e9eef2'); mg.addColorStop(1, '#4a4f55');
  g.fillStyle = mg;
  rr(g, 7, 22, 11, 20, 2); g.fill(); g.stroke();
  rr(g, 46, 22, 11, 20, 2); g.fill(); g.stroke();
  g.fillStyle = '#9aa1a8';
  g.fillRect(3, 30, 5, 4); g.fillRect(56, 30, 5, 4);
  // printed rating
  g.fillStyle = 'rgba(60,40,30,0.7)';
  g.font = 'bold 7px Courier New, monospace';
  g.textAlign = 'center';
  if (!band) g.fillText('10A', 32, 35);
  g.restore();
}

const drawFuse: Draw = (g) => fuseBody(g, '#d9cfb6', '#9e937a');
const drawSpareFuse: Draw = (g) => {
  fuseBody(g, '#c9d4cf', '#87958e', '#b3121c');
  // tag on a string
  g.strokeStyle = '#8a8070'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(48, 22); g.quadraticCurveTo(54, 12, 50, 8); g.stroke();
  g.fillStyle = '#e8dfc6';
  g.save(); g.translate(50, 8); g.rotate(0.3);
  rr(g, -6, -4, 13, 9, 1.5); g.fill();
  g.fillStyle = '#b3121c'; g.font = 'bold 7px Courier New, monospace'; g.textAlign = 'center';
  g.fillText('S', 0.5, 3);
  g.restore();
};

const drawToken: Draw = (g) => {
  shadow(g, 33, 54, 18);
  // edge (thickness)
  g.fillStyle = '#6e5216';
  g.beginPath(); g.ellipse(32, 35, 20, 20, 0, 0, Math.PI * 2); g.fill();
  const cg = g.createRadialGradient(26, 24, 2, 32, 32, 22);
  cg.addColorStop(0, '#fff1b8'); cg.addColorStop(0.45, '#d8a93c'); cg.addColorStop(1, '#8a6417');
  g.fillStyle = cg;
  g.beginPath(); g.arc(32, 32, 20, 0, Math.PI * 2); g.fill();
  // rim
  g.strokeStyle = 'rgba(90,60,10,0.8)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(32, 32, 16.5, 0, Math.PI * 2); g.stroke();
  // reeding dots
  g.fillStyle = 'rgba(90,60,10,0.6)';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.fillRect(32 + Math.cos(a) * 18.4 - 0.5, 32 + Math.sin(a) * 18.4 - 0.5, 1, 1);
  }
  // stamped W (embossed)
  g.font = 'bold 20px Courier New, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,245,200,0.7)'; g.fillText('W', 32.8, 33.6);
  g.fillStyle = '#6b4a0e'; g.fillText('W', 32, 32.6);
};

const drawCoreKey: Draw = (g) => {
  shadow(g, 32, 54, 22);
  g.save();
  g.translate(32, 32); g.rotate(-0.6); g.translate(-32, -32);
  const mg = g.createLinearGradient(0, 20, 0, 44);
  mg.addColorStop(0, '#3b4148'); mg.addColorStop(0.4, '#c7ced4'); mg.addColorStop(1, '#2c3136');
  g.fillStyle = mg;
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
  // bow (squared, industrial)
  rr(g, 6, 20, 20, 24, 4); g.fill(); g.stroke();
  g.fillStyle = '#0b0e10';
  g.beginPath(); g.arc(14, 32, 4, 0, Math.PI * 2); g.fill();
  // red core light
  g.fillStyle = '#ff3b3b';
  g.shadowColor = '#ff2020'; g.shadowBlur = 6;
  g.fillRect(19, 29, 4, 6);
  g.shadowBlur = 0;
  // shaft
  g.fillStyle = mg;
  g.fillRect(26, 29, 30, 6); g.strokeRect(26, 29, 30, 6);
  // teeth
  g.beginPath();
  g.moveTo(40, 35); g.lineTo(40, 41); g.lineTo(44, 41); g.lineTo(44, 38); g.lineTo(48, 38); g.lineTo(48, 43); g.lineTo(52, 43); g.lineTo(52, 35);
  g.closePath(); g.fill(); g.stroke();
  g.restore();
};

function drawUnknown(g: CanvasRenderingContext2D) {
  g.fillStyle = '#556';
  g.font = 'bold 30px Courier New, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', 32, 33);
}

const DRAW: Partial<Record<string, Draw>> = {
  cloth: drawCloth,
  bulb: drawBulb,
  fuse: drawFuse,
  spare_fuse: drawSpareFuse,
  token: drawToken,
  core_key: drawCoreKey,
};
