// Per-screen scene art: static backgrounds (cached by caller), dynamic props, light sources, emissives.
import type { DoorId, GameState, ScreenId } from '../types';
import { P1_SCRATCHES, P5_HALL_VIEW, hotspotById } from '../world/screens';
import type { Ctx } from './util';
import {
  clamp, drawGauge, drawValveWheel, fillRR, glow, glyphIsStroke, glyphPath, hash, hexA, rng, rrect, shapePath, vgrad,
  VALVE_COLOR,
} from './util';
import { drawFigure } from './figure';

export interface Anim {
  door: Record<DoorId, number>; // 0 closed .. 1 open (eased by caller)
  cage: number;
  lever: number;
}

export interface Light { x: number; y: number; r: number; a: number }

const W = 1280, H = 720, FLOOR = 600;

// =====================================================================================
// STATIC BACKGROUNDS (drawn once per screen into a 1280x720 canvas)
// =====================================================================================

export function drawStatic(ctx: Ctx, screen: ScreenId) {
  if (screen === 'cell' || screen === 'exit') staticCell(ctx);
  else if (screen === 'archive') staticArchive(ctx);
  else staticHall(ctx);
}

function floorLines(ctx: Ctx, color: string, vpX = 640) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (const y of [618, 642, 674, 714]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let x = -600; x <= W + 600; x += 110) {
    ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(vpX + (x - vpX) * 1.7, H); ctx.stroke();
  }
}

function staticCell(ctx: Ctx) {
  // wall
  ctx.fillStyle = vgrad(ctx, 30, FLOOR, [[0, '#e6e2d7'], [0.6, '#d9d4c7'], [1, '#c4beaf']]);
  ctx.fillRect(0, 0, W, FLOOR);
  ctx.fillStyle = '#b9b3a4';
  ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect(0, 26, W, 6);
  // panel seams
  ctx.strokeStyle = 'rgba(80,72,60,0.12)';
  ctx.lineWidth = 2;
  for (let x = 160; x < W; x += 213) { ctx.beginPath(); ctx.moveTo(x, 32); ctx.lineTo(x, FLOOR - 12); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 262); ctx.lineTo(W, 262); ctx.stroke();
  // stains
  const r = rng(11);
  for (let i = 0; i < 14; i++) {
    const x = r() * W, y = 60 + r() * 500;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 30 + r() * 60);
    g.addColorStop(0, 'rgba(120,108,80,0.07)'); g.addColorStop(1, 'rgba(120,108,80,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 100, y - 100, 200, 200);
  }
  // skirting
  ctx.fillStyle = '#aaa391'; ctx.fillRect(0, FLOOR - 12, W, 12);
  // floor
  ctx.fillStyle = vgrad(ctx, FLOOR, H, [[0, '#a49c8a'], [1, '#6e6859']]);
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  floorLines(ctx, 'rgba(50,45,35,0.18)');
  // faint (daylight-invisible) scratch marks
  ctx.strokeStyle = 'rgba(90,80,65,0.07)';
  ctx.lineWidth = 1.5;
  const rr = rng(5);
  for (let i = 0; i < 40; i++) {
    const x = 650 + rr() * 310, y = 240 + rr() * 150;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rr() - 0.5) * 20, y + rr() * 16); ctx.stroke();
  }
  // lamp cord + shade
  ctx.strokeStyle = '#4a463e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(640, 26); ctx.lineTo(640, 44); ctx.stroke();
  ctx.fillStyle = '#5b574f';
  ctx.beginPath(); ctx.moveTo(612, 44); ctx.lineTo(668, 44); ctx.lineTo(694, 66); ctx.lineTo(586, 66); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3d3a34'; ctx.fillRect(586, 64, 108, 3);
  // cot
  ctx.fillStyle = '#5f5c55';
  ctx.fillRect(90, 522, 8, 78); ctx.fillRect(362, 522, 8, 78);
  ctx.fillRect(84, 520, 292, 12);
  ctx.fillStyle = '#4f4c46'; ctx.fillRect(98, 560, 264, 4);
  fillRR(ctx, 88, 502, 286, 22, 6, '#cbc5b7');
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(92, 518, 278, 4);
  fillRR(ctx, 326, 494, 44, 16, 7, '#efebe1');
  // sink
  ctx.fillStyle = '#b5ae9e'; ctx.fillRect(446, 468, 18, FLOOR - 468);
  ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(446, 468, 18, 8);
  ctx.fillStyle = '#efebe2';
  ctx.beginPath(); ctx.moveTo(400, 446); ctx.lineTo(510, 446); ctx.quadraticCurveTo(506, 474, 455, 476); ctx.quadraticCurveTo(404, 474, 400, 446); ctx.fill();
  ctx.fillStyle = '#d2ccbe'; ctx.fillRect(398, 440, 114, 8);
  ctx.fillStyle = '#8f8a80'; ctx.fillRect(451, 424, 8, 18); ctx.fillRect(451, 424, 20, 5);
  // mirror
  ctx.fillStyle = '#8f897c'; ctx.fillRect(413, 308, 84, 104);
  ctx.fillStyle = vgrad(ctx, 314, 406, [[0, '#d8e0e1'], [1, '#a6b2b4']]);
  ctx.fillRect(420, 315, 70, 90);
  ctx.fillStyle = 'rgba(245,247,245,0.45)'; ctx.fillRect(420, 315, 70, 90);
  ctx.save();
  ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(95,108,112,0.55)';
  ctx.shadowColor = 'rgba(95,108,112,0.6)'; ctx.shadowBlur = 3;
  ctx.fillText('LOOK', 455, 352); ctx.fillText('CLOSER', 455, 370);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(428, 395); ctx.lineTo(470, 322); ctx.stroke();
  // door frame
  ctx.fillStyle = '#8d877a'; ctx.fillRect(1082, 232, 166, FLOOR - 232);
  ctx.fillStyle = '#6e695e'; ctx.fillRect(1090, 240, 150, FLOOR - 240);
  // vent frame
  ctx.fillStyle = '#8a8476'; ctx.fillRect(855, 535, 110, 60);
  // eye bracket
  ctx.fillStyle = '#7d786c'; ctx.fillRect(268, 112, 24, 14);
}

function staticArchive(ctx: Ctx) {
  ctx.fillStyle = vgrad(ctx, 0, FLOOR, [[0, '#122e31'], [0.5, '#1a4044'], [1, '#143236']]);
  ctx.fillRect(0, 0, W, FLOOR);
  ctx.fillStyle = '#0b1f22'; ctx.fillRect(0, 0, W, 34);
  // wainscot
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 430, W, FLOOR - 430);
  ctx.fillStyle = '#0f2a2d'; ctx.fillRect(0, 426, W, 5);
  // conduit on ceiling
  ctx.fillStyle = '#0d2326'; ctx.fillRect(0, 44, W, 10);
  ctx.fillRect(864, 54, 10, 236);
  // floor
  ctx.fillStyle = vgrad(ctx, FLOOR, H, [[0, '#13292b'], [1, '#061012']]);
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  floorLines(ctx, 'rgba(0,0,0,0.35)');
  // shelf above cabinets with box files
  ctx.fillStyle = '#0c1f22'; ctx.fillRect(108, 206, 264, 8);
  ctx.fillRect(116, 214, 6, 20); ctx.fillRect(358, 214, 6, 20);
  const r = rng(3);
  let x = 116;
  while (x < 280) {
    const w = 12 + r() * 14, h = 34 + r() * 26;
    ctx.fillStyle = r() > 0.5 ? '#0a1a1c' : '#102b2e';
    ctx.fillRect(x, 206 - h, w, h);
    x += w + 2;
  }
  // cabinets
  for (let i = 0; i < 3; i++) {
    const cx = 120 + i * 80;
    ctx.fillStyle = '#0f2629'; ctx.fillRect(cx, 300, 78, 300);
    ctx.strokeStyle = '#21464a'; ctx.lineWidth = 2; ctx.strokeRect(cx + 1, 301, 76, 298);
    for (let d = 0; d < 4; d++) {
      const dy = 308 + d * 72;
      ctx.strokeStyle = '#1b3b3f'; ctx.strokeRect(cx + 6, dy, 66, 64);
      ctx.fillStyle = '#9fb3a8'; ctx.globalAlpha = 0.35; ctx.fillRect(cx + 28, dy + 12, 22, 10); ctx.globalAlpha = 1;
      ctx.fillStyle = '#2d5156'; ctx.fillRect(cx + 30, dy + 32, 18, 5);
    }
  }
  // projector cart
  ctx.fillStyle = '#0b1b1d';
  ctx.fillRect(462, 548, 136, 7);
  ctx.fillRect(468, 555, 5, 45); ctx.fillRect(588, 555, 5, 45);
  ctx.fillRect(470, 585, 120, 4);
  // breaker panel
  ctx.fillStyle = '#0a1a1c'; ctx.fillRect(786, 286, 168, 208);
  ctx.fillStyle = '#26393c'; ctx.fillRect(790, 290, 160, 200);
  ctx.fillStyle = '#1d2e31'; ctx.fillRect(796, 296, 148, 26);
  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#b8c7bf';
  ctx.fillText('BREAKER', 870, 314);
  const slots = ['fuse_camera', 'fuse_archive_lights', 'fuse_cell_door', 'fuse_shutter'];
  const labels = ['CAMERA', 'LIGHTS', 'CELL', 'SHUTTER'];
  ctx.font = '8px monospace';
  slots.forEach((id, i) => {
    const h = hotspotById(id)!;
    ctx.fillStyle = '#081214'; ctx.fillRect(h.x + 3, h.y + 2, h.w - 6, h.h - 4);
    ctx.fillStyle = '#5c6a68'; ctx.fillRect(h.x + 9, h.y + 4, h.w - 18, 6); ctx.fillRect(h.x + 9, h.y + h.h - 10, h.w - 18, 6);
    ctx.fillStyle = '#c9d4cc'; ctx.fillText(labels[i], h.x + h.w / 2, h.y + h.h + 13);
  });
  ctx.fillStyle = '#d0a63a'; ctx.globalAlpha = 0.6;
  for (let i = 0; i < 6; i++) ctx.fillRect(800 + i * 24, 452, 14, 4);
  ctx.globalAlpha = 1;
  // observation window frame
  ctx.fillStyle = '#081719'; ctx.fillRect(982, 182, 176, 216);
  ctx.fillStyle = '#0c2224'; ctx.fillRect(982, 396, 176, 8);
  // left doorway frame
  ctx.fillStyle = '#081719'; ctx.fillRect(0, 232, 98, FLOOR - 232);
  // shutter housing + rails
  ctx.fillStyle = '#0a1a1c'; ctx.fillRect(1172, 220, 108, 24); ctx.fillRect(1172, 244, 8, 356);
  // hanging lamp + safelight fixtures
  ctx.strokeStyle = '#061214'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(260, 34); ctx.lineTo(260, 70); ctx.stroke();
  ctx.fillStyle = '#081516';
  ctx.beginPath(); ctx.moveTo(240, 70); ctx.lineTo(280, 70); ctx.lineTo(296, 88); ctx.lineTo(224, 88); ctx.closePath(); ctx.fill();
  ctx.fillRect(948, 112, 26, 18);
  // eye bracket
  ctx.fillStyle = '#081719'; ctx.fillRect(658, 34, 24, 34);
}

function staticHall(ctx: Ctx) {
  ctx.fillStyle = vgrad(ctx, 0, FLOOR, [[0, '#141b27'], [0.5, '#1f2a3b'], [1, '#18202e']]);
  ctx.fillRect(0, 0, W, FLOOR);
  ctx.fillStyle = '#0c1018'; ctx.fillRect(0, 0, W, 30);
  // riveted panels
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  for (let x = 90; x < W; x += 180) { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, FLOOR); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 470); ctx.lineTo(W, 470); ctx.stroke();
  ctx.fillStyle = 'rgba(150,170,200,0.12)';
  for (let x = 90; x < W; x += 180) for (let y = 60; y < FLOOR; y += 60) { ctx.fillRect(x - 8, y, 3, 3); ctx.fillRect(x + 6, y, 3, 3); }
  // floor grating
  ctx.fillStyle = vgrad(ctx, FLOOR, H, [[0, '#151c28'], [1, '#07090e']]);
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
  for (let y = FLOOR + 8; y < H; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  floorLines(ctx, 'rgba(70,90,120,0.15)');
  // pipes
  const pipe = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#2c3a4f'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,185,215,0.18)'; ctx.lineWidth = Math.max(2, w * 0.15);
    const horiz = Math.abs(y1 - y0) < Math.abs(x1 - x0);
    ctx.beginPath();
    if (horiz) { ctx.moveTo(x0, y0 - w * 0.25); ctx.lineTo(x1, y1 - w * 0.25); } else { ctx.moveTo(x0 - w * 0.25, y0); ctx.lineTo(x1 - w * 0.25, y1); }
    ctx.stroke();
  };
  pipe(0, 64, W, 64, 34);
  pipe(0, 118, 960, 118, 18);
  pipe(520, 118, 520, 250, 14);
  pipe(1100, 64, 1100, 170, 16);
  pipe(1220, 64, 1220, 600, 22);
  pipe(330, 118, 330, 300, 14);
  pipe(330, 300, 370, 300, 14);
  // flanges
  ctx.fillStyle = '#3a4a62';
  for (const x of [200, 480, 760, 1040]) ctx.fillRect(x, 44, 10, 40);
  ctx.fillRect(510, 244, 20, 10); ctx.fillRect(1090, 166, 20, 10);
  // left doorway frame
  ctx.fillStyle = '#0b0f17'; ctx.fillRect(0, 232, 98, FLOOR - 232);
  // window frame
  ctx.fillStyle = '#0b0f17'; ctx.fillRect(112, 182, 176, 216);
  // manifold backplate
  ctx.fillStyle = '#232f40'; ctx.fillRect(360, 264, 320, 210);
  ctx.strokeStyle = '#11161f'; ctx.lineWidth = 3; ctx.strokeRect(360, 264, 320, 210);
  ctx.fillStyle = '#11161f'; ctx.fillRect(398, 266, 244, 28);
  ctx.strokeStyle = '#3a4a62'; ctx.lineWidth = 16; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(380, 450); ctx.lineTo(660, 450); ctx.stroke();
  for (const x of [410, 480, 550, 620]) { ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, 410); ctx.lineTo(x, 450); ctx.stroke(); }
  // lever base
  ctx.fillStyle = '#11161f'; ctx.fillRect(674, 440, 32, 30);
  // switch plate
  fillRR(ctx, 740, 380, 30, 50, 3, '#4a5568');
  // intercom
  fillRR(ctx, 800, 330, 60, 90, 5, '#2a3342');
  ctx.fillStyle = '#10141c';
  for (let i = 0; i < 6; i++) ctx.fillRect(810, 346 + i * 9, 40, 4);
  ctx.beginPath(); ctx.arc(830, 405, 5, 0, Math.PI * 2); ctx.fill();
  // lift console housing
  fillRR(ctx, 880, 360, 60, 100, 4, '#2b3546');
  // lift frame
  ctx.fillStyle = '#2d3a4e'; ctx.fillRect(968, 188, 244, FLOOR - 188);
  ctx.fillStyle = '#11161f'; ctx.fillRect(980, 200, 220, 400);
  ctx.fillStyle = '#1a2230'; ctx.fillRect(1050, 160, 80, 24);
  // wall lamp cages
  for (const x of [250, 780]) {
    ctx.fillStyle = '#0d121a'; ctx.fillRect(x - 16, 150, 32, 8);
    ctx.strokeStyle = '#0d121a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, 162, 14, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, 162); ctx.lineTo(x, 176); ctx.stroke();
  }
  // eye bracket
  ctx.fillStyle = '#0b0f17'; ctx.fillRect(1228, 64, 24, 34);
}

// =====================================================================================
// DYNAMIC PROPS (before the darkness mask)
// =====================================================================================

export function drawDynamic(ctx: Ctx, s: GameState, a: Anim, t: number) {
  switch (s.screen) {
    case 'cell': dynCell(ctx, s, a); break;
    case 'archive': dynArchive(ctx, s, a, t); break;
    case 'hall': dynHall(ctx, s, a, t); break;
    case 'exit': dynExit(ctx, s, t); break;
  }
}

function blanketOnCot(ctx: Ctx, color = '#6f7d84') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(116, 506);
  ctx.bezierCurveTo(140, 478, 180, 486, 210, 482);
  ctx.bezierCurveTo(250, 476, 290, 490, 322, 500);
  ctx.lineTo(328, 548);
  ctx.bezierCurveTo(300, 556, 280, 542, 250, 552);
  ctx.bezierCurveTo(210, 560, 170, 544, 140, 554);
  ctx.lineTo(112, 548);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 3;
  for (const x of [160, 230, 290]) { ctx.beginPath(); ctx.moveTo(x, 488); ctx.quadraticCurveTo(x + 6, 520, x - 4, 550); ctx.stroke(); }
}

function blanketHeap(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.bezierCurveTo(x + w * 0.05, y + h * 0.2, x + w * 0.3, y, x + w * 0.45, y + h * 0.3);
  ctx.bezierCurveTo(x + w * 0.6, y - h * 0.1, x + w * 0.95, y + h * 0.2, x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + h * 0.5); ctx.quadraticCurveTo(x + w * 0.45, y + h * 0.7, x + w * 0.6, y + h * 0.45); ctx.stroke();
}

function dynCell(ctx: Ctx, s: GameState, a: Anim) {
  const cloth = s.objects.cloth.anchor;
  const held = s.inventory.includes('cloth');
  if (!held) {
    if (cloth === 'cot') blanketOnCot(ctx);
    else if (cloth === 'cell_floor') blanketHeap(ctx, 540, 562, 130, 40, '#6f7d84');
    else if (cloth === 'under_cot') blanketHeap(ctx, 140, 578, 160, 24, '#4d575c');
  }
  // bulb
  if (!s.flags.lamp_empty) {
    ctx.fillStyle = '#f6f2df';
    ctx.beginPath(); ctx.ellipse(640, 74, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#2a2824'; ctx.fillRect(632, 66, 16, 6);
  }
  // vent
  if (s.flags.p6_vent_open) {
    ctx.fillStyle = '#0d0d0c'; ctx.fillRect(861, 541, 98, 48);
    ctx.fillStyle = '#7b7568';
    ctx.beginPath(); ctx.moveTo(968, 600); ctx.lineTo(1000, 560); ctx.lineTo(1010, 566); ctx.lineTo(980, 604); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#2b2925'; ctx.fillRect(861, 541, 98, 48);
    ctx.fillStyle = '#9b9585';
    for (let i = 0; i < 6; i++) ctx.fillRect(863, 544 + i * 8, 94, 4);
  }
  // door
  doorSlide(ctx, s.doors.cell_door.open, a.door.cell_door, '#0e2427', '#b3ad9f');
  // keypad body
  fillRR(ctx, 1020, 380, 44, 66, 4, '#4f4c47');
  ctx.fillStyle = '#121414'; ctx.fillRect(1025, 385, 34, 13);
  ctx.fillStyle = '#2f2d2a';
  for (const [x, y] of [[1031, 412], [1053, 412], [1031, 434], [1053, 434]]) ctx.fillRect(x - 9, y - 8, 18, 16);
}

function doorSlide(ctx: Ctx, _open: boolean, k: number, behind: string, panel: string) {
  const x0 = 1090, y0 = 240, w = 150, h = 360;
  ctx.fillStyle = behind; ctx.fillRect(x0, y0, w, h);
  if (k > 0.01) {
    const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    g.addColorStop(0, 'rgba(60,140,150,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  const px = x0 + k * (w - 8);
  ctx.fillStyle = panel; ctx.fillRect(px, y0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px, y0, 6, h);
  ctx.fillStyle = '#2b3436'; ctx.fillRect(px + 52, y0 + 40, 46, 12);
  ctx.fillStyle = '#8b8578'; ctx.fillRect(px + 14, y0 + 170, 8, 40);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.strokeRect(px + 20, y0 + 80, w - 40, 240);
  ctx.restore();
}

function stoolAt(ctx: Ctx, cx: number, footY: number, sc: number) {
  ctx.fillStyle = '#0a1517';
  ctx.fillRect(cx - 30 * sc, footY - 56 * sc, 60 * sc, 8 * sc);
  ctx.strokeStyle = '#0a1517'; ctx.lineWidth = 5 * sc;
  ctx.beginPath();
  ctx.moveTo(cx - 24 * sc, footY - 50 * sc); ctx.lineTo(cx - 28 * sc, footY);
  ctx.moveTo(cx + 24 * sc, footY - 50 * sc); ctx.lineTo(cx + 28 * sc, footY);
  ctx.moveTo(cx, footY - 50 * sc); ctx.lineTo(cx, footY - 2);
  ctx.moveTo(cx - 26 * sc, footY - 22 * sc); ctx.lineTo(cx + 26 * sc, footY - 22 * sc);
  ctx.stroke();
}

function dynArchive(ctx: Ctx, s: GameState, a: Anim, _t: number) {
  // doorway back to the cell
  const k = a.door.cell_door;
  ctx.fillStyle = '#0a1314'; ctx.fillRect(8, 242, 82, FLOOR - 242);
  if (k > 0.01) {
    ctx.fillStyle = hexA('#d9d4c7', 0.85 * k); ctx.fillRect(8 + 82 * (1 - k) * 0.0, 242, 82 * k, FLOOR - 242);
  }
  ctx.fillStyle = '#566563'; ctx.fillRect(8 + 82 * k, 242, 82 * (1 - k), FLOOR - 242);
  // stool
  const st = s.objects.stool.anchor;
  if (st === 'archive_floor') stoolAt(ctx, 410, 600, 1);
  else if (st === 'top_shelf') stoolAt(ctx, 320, 206, 0.6);
  // projector body
  fillRR(ctx, 472, 498, 116, 48, 5, '#262c30');
  ctx.fillStyle = '#1a1f22';
  ctx.beginPath(); ctx.arc(536, 486, 16, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(570, 488, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#353c41'; ctx.fillRect(488, 486, 22, 16);
  ctx.fillStyle = '#5c666d'; ctx.beginPath(); ctx.arc(499, 488, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0f1214'; ctx.fillRect(560, 520, 20, 3); ctx.fillRect(560, 527, 20, 3);
  // projection screen (unlit)
  if (s.slide <= 0) {
    ctx.fillStyle = '#0b1a1c'; ctx.fillRect(414, 124, 352, 8);
    ctx.fillStyle = 'rgba(160,190,186,0.22)'; ctx.fillRect(424, 132, 332, 204);
  } else {
    ctx.fillStyle = '#0b1a1c'; ctx.fillRect(414, 124, 352, 8);
  }
  // fuses
  const slots: [keyof GameState['breaker'], string][] = [
    ['camera', 'fuse_camera'], ['archive_lights', 'fuse_archive_lights'], ['cell_door', 'fuse_cell_door'], ['shutter', 'fuse_shutter'],
  ];
  for (const [slot, id] of slots) {
    if (!s.breaker[slot]) continue;
    const h = hotspotById(id)!;
    const cx = h.x + h.w / 2;
    ctx.fillStyle = '#b9c2c8'; ctx.fillRect(cx - 7, h.y + 6, 14, 10); ctx.fillRect(cx - 7, h.y + h.h - 16, 14, 10);
    ctx.fillStyle = 'rgba(200,225,235,0.75)'; ctx.fillRect(cx - 5, h.y + 16, 10, h.h - 32);
    ctx.fillStyle = '#4b5559'; ctx.fillRect(cx - 1, h.y + 16, 2, h.h - 32);
  }
  // observation window: hall seen through glass
  const hallL = clamp(s.lights.hall.level, 0, 1);
  ctx.fillStyle = vgrad(ctx, 190, 390, [[0, hexA('#1b2433', 0.5 + hallL * 0.5)], [1, '#06080c']]);
  ctx.fillRect(990, 190, 160, 200);
  ctx.globalAlpha = 0.25 + hallL * 0.5;
  ctx.fillStyle = '#0c1119';
  ctx.fillRect(990, 230, 160, 10); ctx.fillRect(1060, 240, 8, 150); ctx.fillRect(1010, 300, 70, 40);
  ctx.globalAlpha = 1;
  glassReflection(ctx, 990, 190, 160, 200);
  // shutter
  shutterAt(ctx, 1180, 244, 100, 356, a.door.shutter, '#141c28', '#3a4a4c', _t);
}

function glassReflection(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.02)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  g.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}

function shutterAt(ctx: Ctx, x: number, y: number, w: number, h: number, k: number, behind: string, metal: string, t: number) {
  ctx.fillStyle = behind; ctx.fillRect(x, y, w, h);
  const judder = k > 0.02 && k < 0.98 ? (hash(Math.floor(t / 60)) - 0.5) * 6 : 0;
  const bottom = y + h * (1 - k) + judder;
  if (bottom <= y + 2) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = metal; ctx.fillRect(x, y, w, bottom - y);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let yy = bottom - 14; yy > y; yy -= 14) ctx.fillRect(x, yy, w, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let yy = bottom - 10; yy > y; yy -= 14) ctx.fillRect(x, yy, w, 2);
  ctx.fillStyle = '#20292a'; ctx.fillRect(x, bottom - 8, w, 8);
  ctx.restore();
}

function dynHall(ctx: Ctx, s: GameState, a: Anim, t: number) {
  // doorway to archive (the shutter, seen from this side)
  shutterAt(ctx, 8, 242, 82, FLOOR - 242, a.door.shutter, '#16393c', '#34404d', t);
  if (a.door.shutter > 0.05) {
    const g = ctx.createLinearGradient(8, 0, 120, 0);
    g.addColorStop(0, hexA('#2f7d80', 0.35 * a.door.shutter)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(8, 242, 112, FLOOR - 242);
  }
  // window: archive seen through glass
  const archLit = s.breaker.archive_lights ? clamp(s.lights.archive.level, 0, 1) : 0.05;
  ctx.fillStyle = vgrad(ctx, 190, 390, [[0, hexA('#2a6267', 0.25 + archLit * 0.6)], [1, hexA('#0d2326', 1)]]);
  ctx.fillRect(120, 190, 160, 200);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#081719'; ctx.fillRect(150, 300, 30, 90); ctx.fillRect(200, 250, 50, 40);
  ctx.globalAlpha = 1;
  glassReflection(ctx, 120, 190, 160, 200);
  // bucket
  const bk = s.objects.bucket.anchor;
  if (bk === 'hall_floor') bucketAt(ctx, 330, 600, 1);
  else if (bk === 'pipe_ledge') bucketAt(ctx, 760, 48, 0.7);
  // gauges + valves
  const cols = ['red', 'green', 'blue', 'yellow'] as const;
  cols.forEach((c, i) => {
    const x = 410 + i * 70;
    drawGauge(ctx, x, 330, 22, s.valves[c]);
    ctx.fillStyle = VALVE_COLOR[c]; ctx.fillRect(x - 10, 356, 20, 3);
    drawValveWheel(ctx, x, 410, 27, VALVE_COLOR[c], (s.valves[c] * Math.PI) / 4);
  });
  // lever
  const ang = -0.5 + a.lever * 1.0; // up-left .. down-right
  ctx.strokeStyle = '#8a95a6'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  const px = 690, py = 455;
  const hx = px + Math.sin(ang) * 80 * 0.4, hy = py - Math.cos(ang) * 80;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = '#b8352c'; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill();
  // switch toggle
  const off = !!s.lights.hall.switchedOff;
  ctx.fillStyle = '#20262f'; ctx.fillRect(750, 395, 10, 20);
  ctx.fillStyle = '#d9d4c7'; ctx.fillRect(751, off ? 405 : 389, 8, 16);
  // lift console screen bezel
  ctx.fillStyle = '#0a0e14'; ctx.fillRect(886, 368, 48, 22);
  ctx.fillStyle = '#151b25';
  for (let i = 0; i < 6; i++) ctx.fillRect(888 + (i % 3) * 16, 398 + Math.floor(i / 3) * 18, 13, 14);
  // cage
  const ck = a.cage;
  ctx.save();
  ctx.strokeStyle = 'rgba(150,160,175,0.85)'; ctx.lineWidth = 1.5;
  const cw = 72 * (1 - ck * 0.85);
  ctx.strokeRect(874, 352, cw, 116);
  ctx.beginPath();
  for (let xx = 874; xx <= 874 + cw; xx += 9) { ctx.moveTo(xx, 352); ctx.lineTo(xx, 468); }
  for (let yy = 352; yy <= 468; yy += 9) { ctx.moveTo(874, yy); ctx.lineTo(874 + cw, yy); }
  ctx.stroke();
  ctx.fillStyle = '#5a6475'; ctx.fillRect(874 + cw - 3, 404, 6, 12);
  ctx.restore();
  // lift doors
  const k = a.door.lift;
  if (k > 0.01) {
    ctx.fillStyle = vgrad(ctx, 200, 600, [[0, '#b8c8d2'], [1, '#6c7c88']]);
    ctx.fillRect(980, 200, 220, 400);
    ctx.fillStyle = 'rgba(30,40,50,0.4)'; ctx.fillRect(990, 590, 200, 10);
  }
  const half = 110 * (1 - k);
  ctx.fillStyle = '#3a475b';
  ctx.fillRect(980, 200, half, 400);
  ctx.fillRect(1200 - half, 200, half, 400);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(980 + half - 2, 200, 2, 400); ctx.fillRect(1200 - half, 200, 2, 400);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(990, 210, Math.max(0, half - 20), 4); ctx.fillRect(1210 - half, 210, Math.max(0, half - 20), 4);
}

function bucketAt(ctx: Ctx, cx: number, footY: number, sc: number) {
  ctx.fillStyle = '#56606d';
  ctx.beginPath();
  ctx.moveTo(cx - 26 * sc, footY - 46 * sc); ctx.lineTo(cx + 26 * sc, footY - 46 * sc);
  ctx.lineTo(cx + 20 * sc, footY); ctx.lineTo(cx - 20 * sc, footY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b323c'; ctx.beginPath(); ctx.ellipse(cx, footY - 46 * sc, 26 * sc, 6 * sc, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7c8794'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, footY - 46 * sc, 22 * sc, Math.PI, 0); ctx.stroke();
}

function dynExit(ctx: Ctx, _s: GameState, t: number) {
  // cold lamp bulb
  ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.ellipse(640, 74, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  // the new subject lying on the cot
  ctx.save();
  ctx.translate(112, 486);
  ctx.rotate(Math.PI / 2);
  drawFigure(ctx, 0, 0, 1.2, { facing: -1, phase: 0, walk: 0, breath: t / 1000, reach: (t % 9000) > 7600 ? 0.35 : null, color: '#14181c' });
  ctx.restore();
  // blanket over the legs
  ctx.fillStyle = '#56636b';
  ctx.beginPath();
  ctx.moveTo(96, 504); ctx.bezierCurveTo(130, 470, 200, 472, 262, 482); ctx.lineTo(268, 546); ctx.bezierCurveTo(200, 552, 140, 542, 96, 548); ctx.closePath(); ctx.fill();
  // vent grate
  ctx.fillStyle = '#2b2925'; ctx.fillRect(861, 541, 98, 48);
  ctx.fillStyle = '#9b9585';
  for (let i = 0; i < 6; i++) ctx.fillRect(863, 544 + i * 8, 94, 4);
  // closed door
  doorSlide(ctx, false, 0, '#0e2427', '#a9a596');
  fillRR(ctx, 1020, 380, 44, 66, 4, '#4f4c47');
}

/** Foreground framing for the exit scene: we look out of the lift. */
export function drawExitForeground(ctx: Ctx) {
  ctx.fillStyle = 'rgba(20,40,70,0.28)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0b0f16';
  ctx.fillRect(0, 0, 70, H); ctx.fillRect(W - 70, 0, 70, H); ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = '#1f2836'; ctx.fillRect(58, 0, 12, H); ctx.fillRect(W - 70, 0, 12, H);
}

// =====================================================================================
// LIGHTS (punched out of the darkness layer). k = fixture factor 0..1 (on/flicker).
// =====================================================================================

export function lightsFor(s: GameState, k: number, a: Anim): Light[] {
  const L: Light[] = [];
  switch (s.screen) {
    case 'cell':
      if (!s.flags.lamp_empty) L.push({ x: 640, y: 90, r: 720, a: 0.7 * k });
      L.push({ x: 1042, y: 413, r: 60, a: 0.45 });
      if (a.door.cell_door > 0.05) L.push({ x: 1165, y: 420, r: 220, a: 0.4 * a.door.cell_door });
      break;
    case 'archive':
      L.push({ x: 260, y: 110, r: 460, a: 0.6 * k });
      L.push({ x: 960, y: 140, r: 240, a: 0.5 * k });
      if (s.slide > 0) { L.push({ x: 590, y: 235, r: 300, a: 0.85 }); L.push({ x: 500, y: 490, r: 90, a: 0.6 }); }
      if (s.breaker.archive_lights) L.push({ x: 870, y: 360, r: 110, a: 0.25 });
      if (a.door.cell_door > 0.05) L.push({ x: 50, y: 420, r: 200, a: 0.5 * a.door.cell_door });
      break;
    case 'hall':
      L.push({ x: 250, y: 175, r: 420, a: 0.6 * k });
      L.push({ x: 780, y: 175, r: 420, a: 0.6 * k });
      L.push({ x: 520, y: 280, r: 90, a: 0.4 });
      if (a.door.lift > 0.05) L.push({ x: 1090, y: 420, r: 300, a: 0.7 * a.door.lift });
      if (s.breaker.archive_lights) L.push({ x: 200, y: 290, r: 120, a: 0.35 });
      break;
    case 'exit':
      L.push({ x: 640, y: 90, r: 620, a: 0.55 * k });
      break;
  }
  return L;
}

/** Coloured additive tint from fixtures (after mask). */
function cone(ctx: Ctx, x: number, y: number, topHalf: number, botHalf: number, y1: number, color: string, a: number) {
  const g = ctx.createLinearGradient(0, y, 0, y1);
  g.addColorStop(0, hexA(color, a));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - topHalf, y); ctx.lineTo(x + topHalf, y); ctx.lineTo(x + botHalf, y1); ctx.lineTo(x - botHalf, y1); ctx.closePath();
  ctx.fill();
  // softer, wider second pass
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - topHalf * 1.3, y); ctx.lineTo(x + topHalf * 1.3, y); ctx.lineTo(x + botHalf * 1.35, y1); ctx.lineTo(x - botHalf * 1.35, y1); ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function fixtureTint(ctx: Ctx, s: GameState, k: number) {
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  switch (s.screen) {
    case 'cell': if (!s.flags.lamp_empty) cone(ctx, 640, 66, 54, 330, FLOOR + 40, '#e9fbff', 0.06 * k); break;
    case 'archive': cone(ctx, 260, 88, 36, 200, FLOOR, '#ffb347', 0.07 * k); break;
    case 'hall': for (const x of [250, 780]) cone(ctx, x, 176, 14, 170, FLOOR, '#ff8a3d', 0.06 * k); break;
    case 'exit': cone(ctx, 640, 66, 54, 330, FLOOR + 40, '#8fc6ff', 0.05 * k); break;
  }
  switch (s.screen) {
    case 'cell': if (!s.flags.lamp_empty) glow(ctx, 640, 80, 600, '#e9fbff', 0.10 * k); glow(ctx, 640, 74, 70, '#ffffff', 0.5 * k); break;
    case 'archive': glow(ctx, 260, 96, 380, '#ffb347', 0.10 * k); glow(ctx, 960, 128, 200, '#c23b2a', 0.22 * k); glow(ctx, 260, 92, 40, '#ffe2a8', 0.6 * k); glow(ctx, 961, 124, 20, '#ff4a3a', 0.8 * k); break;
    case 'hall': for (const x of [250, 780]) { glow(ctx, x, 170, 380, '#ff8a3d', 0.12 * k); glow(ctx, x, 168, 30, '#ffc890', 0.8 * k); } break;
    case 'exit': glow(ctx, 640, 80, 600, '#8fc6ff', 0.10 * k); glow(ctx, 640, 74, 60, '#e8f6ff', 0.4 * k); break;
  }
  ctx.restore();
}

// =====================================================================================
// EMISSIVES (after the darkness mask)
// =====================================================================================

export function drawEmissive(ctx: Ctx, s: GameState, a: Anim, t: number, frameThinking: boolean) {
  if (s.screen === 'cell') emCell(ctx, s, t);
  else if (s.screen === 'hall') emHall(ctx, s, a, t, frameThinking);
  else if (s.screen === 'archive') emArchive(ctx, s, t);
}

function emCell(ctx: Ctx, s: GameState, t: number) {
  // keypad backlight
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 1042, 413, 46, '#7fe8ff', 0.18);
  ctx.restore();
  ctx.fillStyle = '#103a40'; ctx.fillRect(1025, 385, 34, 13);
  ctx.fillStyle = '#9ff4ff';
  s.keypadEntry.slice(-4).forEach((sh, i) => { shapePath(ctx, sh, 1030 + i * 8, 391.5, 3); ctx.fill(); });
  const shapes = ['tri', 'circle', 'square', 'cross'] as const;
  ctx.fillStyle = 'rgba(160,240,255,0.85)';
  [[1031, 412], [1053, 412], [1031, 434], [1053, 434]].forEach(([x, y], i) => { shapePath(ctx, shapes[i], x, y, 5); ctx.fill(); });
  // glow-paint scratches
  if (s.lights.cell.level < 0.3) {
    const vis = clamp((0.3 - s.lights.cell.level) / 0.15, 0, 1);
    ctx.save();
    ctx.globalAlpha = vis * (0.85 + 0.15 * Math.sin(t / 900));
    ctx.shadowColor = '#7dff9a'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#9dffb0'; ctx.fillStyle = '#9dffb0';
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    P1_SCRATCHES.forEach((sc, i) => {
      const cx = 690 + i * 78, cy = 278;
      shapePath(ctx, sc.shape, cx, cy, 22);
      ctx.stroke();
      for (let k = 0; k < sc.tally; k++) {
        const tx = cx - (sc.tally - 1) * 6 + k * 12;
        ctx.beginPath(); ctx.moveTo(tx - 2, 318); ctx.lineTo(tx + 2, 342); ctx.stroke();
      }
    });
    ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(805, 382); ctx.rotate(-0.025);
    ctx.fillText('BLUE LIES. BLUE IS 2.', 0, 0);
    ctx.restore();
    ctx.restore();
  }
}

function emArchive(ctx: Ctx, s: GameState, t: number) {
  // projector indicator
  if (s.flags.projector_bulb) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 575, 507, 12, '#ffb347', 0.8);
    ctx.restore();
  }
  // fuse lamps
  const slots = ['fuse_camera', 'fuse_archive_lights', 'fuse_cell_door', 'fuse_shutter'];
  const on = [s.breaker.camera, s.breaker.archive_lights, s.breaker.cell_door, s.breaker.shutter];
  slots.forEach((id, i) => {
    const h = hotspotById(id)!;
    ctx.fillStyle = on[i] ? '#6dff9a' : '#ff4a3a';
    ctx.beginPath(); ctx.arc(h.x + h.w / 2, h.y - 6 + 0 * t, 2.5, 0, Math.PI * 2); ctx.fill();
  });
}

function emHall(ctx: Ctx, s: GameState, _a: Anim, t: number, thinking: boolean) {
  // status lamp
  const ok = !!s.flags.lift_powered;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 412, 280, 26, ok ? '#5dff8a' : '#ff3b2f', ok ? 0.9 : 0.45);
  ctx.restore();
  ctx.fillStyle = ok ? '#7dffa0' : '#5a1a16';
  ctx.beginPath(); ctx.arc(412, 280, 6, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = ok ? '#7dffa0' : 'rgba(255,90,70,0.45)';
  ctx.fillText(ok ? 'PRESSURE NOMINAL' : 'PRESSURE LOW', 428, 285);
  // override indicator near the switch
  if (s.warden.override) {
    const p = 0.6 + 0.4 * Math.sin(t / 250);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 755, 366, 34, '#ff2a2a', 0.5 * p); ctx.restore();
    ctx.fillStyle = hexA('#ff4a3a', 0.6 + 0.4 * p);
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('OVERRIDE', 755, 370);
  }
  // intercom LED
  ctx.fillStyle = thinking ? `rgba(255,190,80,${0.6 + 0.4 * Math.sin(t / 120)})` : 'rgba(120,255,160,0.5)';
  ctx.beginPath(); ctx.arc(848, 338, 3, 0, Math.PI * 2); ctx.fill();
  // lift console screen
  ctx.fillStyle = s.flags.lift_powered ? '#0f2b22' : '#0b1210'; ctx.fillRect(886, 368, 48, 22);
  ctx.fillStyle = '#7dffb0';
  s.consoleEntry.slice(-5).forEach((g, i) => {
    glyphPath(ctx, g, 892 + i * 9, 379, 3.5);
    if (glyphIsStroke(g)) { ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 1.2; ctx.stroke(); } else ctx.fill();
  });
  // lift indicator
  ctx.fillStyle = s.flags.lift_powered ? '#ffcf7a' : '#40342a';
  ctx.beginPath(); ctx.moveTo(1090, 164); ctx.lineTo(1100, 178); ctx.lineTo(1080, 178); ctx.closePath(); ctx.fill();
  // window glyphs (finger writing backlit by the archive)
  if (s.lights.hall.level < 0.3 && s.breaker.archive_lights) {
    const vis = clamp((0.3 - s.lights.hall.level) / 0.15, 0, 1);
    ctx.save();
    ctx.globalAlpha = vis * 0.75;
    ctx.shadowColor = '#d8f7ff'; ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(220,245,250,0.8)'; ctx.strokeStyle = 'rgba(220,245,250,0.8)';
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    P5_HALL_VIEW.forEach((g, i) => {
      const x = 144 + i * 28, y = 268 + Math.sin(i * 1.7) * 5;
      glyphPath(ctx, g, x, y, 10);
      if (glyphIsStroke(g)) ctx.stroke(); else ctx.fill();
      // smudge drip
      ctx.globalAlpha = vis * 0.25;
      ctx.fillRect(x - 1, y + 10, 2, 8 + (i % 3) * 5);
      ctx.globalAlpha = vis * 0.75;
    });
    ctx.restore();
  }
}

// =====================================================================================
// WARDEN LOCKS
// =====================================================================================

const LOCK_HOTSPOTS: [DoorId, ScreenId, string][] = [
  ['cell_door', 'cell', 'cell_door'], ['cell_door', 'archive', 'archive_to_cell'],
  ['shutter', 'archive', 'shutter'], ['shutter', 'hall', 'hall_to_archive'], ['lift', 'hall', 'lift'],
];

export function drawLocks(ctx: Ctx, s: GameState, t: number) {
  for (const [door, scr, hid] of LOCK_HOTSPOTS) {
    if (scr !== s.screen || !s.doors[door].wardenLock) continue;
    const h = hotspotById(hid);
    if (!h) continue;
    const y = h.y + h.h * 0.45;
    const pulse = 0.55 + 0.45 * Math.sin(t / 220);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, h.x + h.w / 2, y, Math.max(h.w, 120), '#ff1a1a', 0.25 * pulse);
    ctx.restore();
    // bar
    ctx.save();
    ctx.translate(h.x + h.w / 2, y);
    ctx.rotate(-0.06);
    ctx.fillStyle = '#9e0f16'; ctx.fillRect(-h.w / 2 - 10, -10, h.w + 20, 20);
    ctx.beginPath(); ctx.rect(-h.w / 2 - 10, -10, h.w + 20, 20); ctx.clip();
    ctx.fillStyle = '#1a0405';
    for (let x = -h.w / 2 - 30; x < h.w / 2 + 20; x += 18) {
      ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x + 8, 10); ctx.lineTo(x + 18, -10); ctx.lineTo(x + 10, -10); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // lock icon
    const lx = h.x + h.w / 2, ly = y - 46;
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 12;
    ctx.strokeStyle = '#ff4a44'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(lx, ly - 6, 9, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#ff4a44'; fillRR(ctx, lx - 13, ly - 6, 26, 20, 3, '#ff4a44');
    ctx.fillStyle = '#2a0506'; ctx.fillRect(lx - 2, ly, 4, 8);
    ctx.restore();
  }
}

// =====================================================================================
// HOVER
// =====================================================================================

export function drawHover(ctx: Ctx, id: string, t: number) {
  const h = hotspotById(id);
  if (!h) return;
  const a = 0.45 + 0.2 * Math.sin(t / 200);
  const p = 6, L = Math.min(16, h.w / 3, h.h / 3);
  const x0 = h.x - p, y0 = h.y - p, x1 = h.x + h.w + p, y1 = h.y + h.h + p;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
  ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
  ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
  ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = `rgba(235,245,255,${a + 0.2})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(200,230,255,0.8)'; ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.restore();
}

export { rrect };

/** Foreground silhouettes (drawn after the player, before the darkness). */
export function drawForeground(ctx: Ctx, screen: ScreenId, t: number) {
  ctx.save();
  if (screen === 'hall') {
    // hanging chain on the left, slight sway
    const sway = Math.sin(t / 1400) * 4;
    ctx.strokeStyle = '#05070b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(720, 0); ctx.quadraticCurveTo(720 + sway, 120, 722 + sway * 2, 230); ctx.stroke();
    ctx.fillStyle = '#05070b'; ctx.beginPath(); ctx.arc(722 + sway * 2, 236, 9, 0, Math.PI * 2); ctx.fill();
    // foreground pipe at the bottom right
    ctx.fillStyle = '#06080d'; ctx.fillRect(1180, 650, 100, 70);
    ctx.fillRect(0, 690, W, 30);
  } else if (screen === 'archive') {
    const sway = Math.sin(t / 1700) * 3;
    ctx.strokeStyle = '#030b0c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(1040, 0); ctx.quadraticCurveTo(1040 + sway, 60, 1036 + sway * 2, 110); ctx.stroke();
    ctx.fillStyle = '#030b0c'; ctx.fillRect(0, 696, W, 24);
    // edge of a desk in the foreground
    ctx.beginPath(); ctx.moveTo(1120, 720); ctx.lineTo(1150, 640); ctx.lineTo(1280, 640); ctx.lineTo(1280, 720); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function drawShadow(ctx: Ctx, x: number, y: number, w: number, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, w);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, 0.18); ctx.translate(-x, -y);
  ctx.fillStyle = g; ctx.fillRect(x - w, y - w, w * 2, w * 2);
  ctx.restore();
}
