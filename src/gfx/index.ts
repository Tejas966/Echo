// Renderer (docs/05). Canvas 2D, everything procedural.
import type { DoorId, FrameInfo, FxEvent, GameState, GfxAPI, HazardSlot, ScareId, ScreenId, Tone } from '../types';
import { EYE_POS, FLOOR_Y, HAZARD_POS } from '../world/screens';
import type { Ctx } from './util';
import { clamp, easeOut, glow, hash, hexA, lerp, makeCanvas, TONE_COLOR } from './util';
import { drawFigure, drawItemIcon } from './figure';
import type { Anim, Light } from './scenes';
import { drawDynamic, drawEmissive, drawExitForeground, drawHover, drawLocks, drawStatic, fixtureTint, lightsFor } from './scenes';
import { drawBeam, drawSlide } from './slides';
import { flickerFactor, grainTile, heartbeat, Particles, softSprite, vignette } from './fx';

const LW = 1280, LH = 720;

const DARK_COLOR: Record<ScreenId, string> = {
  cell: '6,8,12',
  archive: '2,10,12',
  hall: '3,5,10',
  exit: '4,8,16',
};

const FOG_COLOR: Record<ScreenId, string> = {
  cell: '#e9fbff',
  archive: '#5fa3a0',
  hall: '#8aa0bf',
  exit: '#8fb4d8',
};

export function createGfx(): GfxAPI {
  // ---------- caches ----------
  const bg = new Map<ScreenId, HTMLCanvasElement>();
  const darkCanvases = new Map<string, HTMLCanvasElement>();
  let scratch: HTMLCanvasElement | null = null;
  const particles = new Particles();
  (globalThis as unknown as { __gfxParticles?: Particles }).__gfxParticles = particles;

  // ---------- animation state ----------
  const anim: Anim = { door: { cell_door: 0, shutter: 0, lift: 0 }, cage: 0, lever: 0 };
  let walkPhase = 0, walkBlend = 0, standY = 0, reachBlend = 0;
  let eyeX = 0, eyeY = 0, pupil = 4;
  let lastReduce = false;
  let lastReach: { x: number; until: number } | null = null;
  let lastT = 0;

  // ---------- fx state ----------
  let shake = { s: 0, t0: 0, dur: 300 };
  let flash = { color: '#ffffff', t0: -1e9, ms: 0 };
  let glitchUntil = 0;
  let scanT0 = -1e9;
  let scare: { id: ScareId; t0: number } | null = null;
  let transT0 = -1e9;
  const bursts: { slot: HazardSlot; kind: 0 | 1; until: number }[] = [];
  const pendingFx: FxEvent[] = [];

  function getBg(screen: ScreenId) {
    let c = bg.get(screen);
    if (!c) {
      c = makeCanvas(LW, LH);
      drawStatic(c.getContext('2d')!, screen);
      bg.set(screen, c);
    }
    return c;
  }

  function getDark(w: number, h: number) {
    const key = `${w}x${h}`;
    let c = darkCanvases.get(key);
    if (!c) { c = makeCanvas(w, h); darkCanvases.set(key, c); }
    return c;
  }

  function handleFx(e: FxEvent, now: number) {
    switch (e.kind) {
      case 'shake': shake = { s: Math.max(e.strength, 0), t0: now, dur: 300 }; break;
      case 'flash': flash = { color: e.color, t0: now, ms: Math.max(60, e.ms) }; break;
      case 'glitch': glitchUntil = Math.max(glitchUntil, now + e.ms); break;
      case 'scan': scanT0 = now; break;
      case 'scare':
        scare = { id: e.id, t0: now };
        shake = { s: 10, t0: now, dur: 350 };
        break;
      case 'transition': transT0 = now; break;
      case 'steam': bursts.push({ slot: e.slot, kind: 0, until: now + e.ms }); break;
      case 'sparks': bursts.push({ slot: e.slot, kind: 1, until: now + e.ms }); break;
      case 'reach': lastReach = { x: e.x, until: now + 260 }; break;
    }
  }

  // ------------------------------------------------------------------
  function render(ctx: CanvasRenderingContext2D, s: GameState, f: FrameInfo, o: { director: boolean; width: number; height: number }) {
    const now = f.t;
    const dir = o.director;
    const sx = o.width / LW, sy = o.height / LH;
    const dt = clamp(f.dt || 0, 0, 0.05);

    if (!dir) {
      lastReduce = f.reduceFlashing;
      lastT = now;
      while (pendingFx.length) handleFx(pendingFx.shift()!, now);
      updateAnim(s, f, dt, now);
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Director view: blind camera in the archive => no signal.
    if (dir && s.warden.blind && s.screen === 'archive') {
      noSignal(ctx, o.width, o.height, now);
      ctx.restore();
      return;
    }

    // shake
    let ox = 0, oy = 0;
    if (!dir) {
      const p = (now - shake.t0) / shake.dur;
      if (p < 1 && shake.s > 0) {
        const k = shake.s * (1 - p);
        ox = (Math.random() - 0.5) * 2 * k; oy = (Math.random() - 0.5) * 2 * k;
      }
    }
    ctx.setTransform(sx, 0, 0, sy, ox * sx, oy * sy);

    const L = s.lights[s.screen];
    // effective ambient (flicker / blackout)
    let ff = 1;
    let eff = clamp(L.level, 0, 1);
    if (L.mode === 'flicker') { ff = flickerFactor(now, f.reduceFlashing); eff *= ff; }
    else if (L.mode === 'off') { eff = Math.min(eff, 0.05); ff = 0; }
    let fixtureK = clamp((L.level - 0.25) / 0.5, 0, 1) * ff;
    if (L.mode === 'off') fixtureK = 0;
    if (s.screen === 'cell' && s.flags.lamp_empty) fixtureK = 0;
    if (s.screen === 'archive' && !s.breaker.archive_lights) fixtureK = Math.min(fixtureK, 0.0);
    if (s.screen === 'hall' && L.switchedOff && !s.warden.override) fixtureK = 0;
    if (s.screen === 'exit') eff *= 0.7;
    if (dir) eff = Math.max(eff, 0.55);

    // ---- scene ----
    ctx.drawImage(getBg(s.screen), 0, 0, LW, LH);
    drawDynamic(ctx, s, anim, now);

    // player
    const pdraw = playerParams(s, f, now);
    const hand = drawFigure(ctx, s.player.x, FLOOR_Y + standY, 1, {
      ...pdraw, color: s.screen === 'cell' ? '#0d0f12' : '#05070a',
      outline: dir ? '#ffffff' : undefined, outlineW: 6,
    });

    if (s.screen === 'exit') drawExitForeground(ctx);

    // ---- darkness ----
    const darkA = clamp(0.08 + (1 - eff) * 0.9, 0, 0.965);
    if (darkA > 0.01) {
      const dc = getDark(o.width, o.height);
      const d = dc.getContext('2d')!;
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, dc.width, dc.height);
      d.fillStyle = dir ? `rgba(14,26,78,${darkA})` : `rgba(${DARK_COLOR[s.screen]},${darkA})`;
      d.fillRect(0, 0, dc.width, dc.height);
      d.setTransform(sx, 0, 0, sy, 0, 0);
      d.globalCompositeOperation = 'destination-out';
      const lights: Light[] = lightsFor(s, fixtureK, anim);
      lights.push(eyeLight(s));
      for (const h of s.hazards) {
        const hp = HAZARD_POS[h.slot];
        if (!hp || hp.screen !== s.screen) continue;
        if (h.slot === 'sparks_archive') lights.push({ x: hp.x, y: hp.y, r: 170, a: 0.6 * particles.sparkGlow(s.screen) });
        else lights.push({ x: hp.x, y: hp.y + 40, r: 110, a: 0.25 });
      }
      for (const l of lights) {
        if (l.a <= 0.01) continue;
        const g = d.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
        g.addColorStop(0, `rgba(0,0,0,${clamp(l.a, 0, 1)})`);
        g.addColorStop(0.5, `rgba(0,0,0,${clamp(l.a * 0.45, 0, 1)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = g;
        d.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      ctx.drawImage(dc, 0, 0, LW, LH);
    }

    fixtureTint(ctx, s, fixtureK);

    // ---- atmosphere ----
    if (!dir) atmosphere(ctx, s.screen, now, fixtureK);

    // ---- emissives ----
    if (s.screen === 'archive' && s.slide > 0) {
      const pf = L.mode === 'flicker' ? 0.75 + 0.25 * ff : 1;
      drawBeam(ctx, now, pf);
      drawSlide(ctx, s.slide, now, pf);
    }
    drawEmissive(ctx, s, anim, now, f.thinking);
    drawEye(ctx, s, f, now, dir);
    particles.draw(ctx, s.screen);
    drawLocks(ctx, s, now);

    // player rim in the dark so the silhouette stays readable
    if (!dir && eff < 0.6) {
      drawFigure(ctx, s.player.x, FLOOR_Y + standY, 1, {
        ...pdraw, color: `rgba(70,90,120,${(0.6 - eff) * 0.45})`,
      });
    }
    if (s.player.holding) drawItemIcon(ctx, s.player.holding, hand.hx, hand.hy + 4, 1);

    if (!dir && f.hover) drawHover(ctx, f.hover, now);

    // ---- post ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!dir) post(ctx, s, f, o.width, o.height, now);
    else directorLabel(ctx, s, o.width, o.height, eff);
    ctx.restore();
  }

  // ------------------------------------------------------------------
  function updateAnim(s: GameState, f: FrameInfo, dt: number, now: number) {
    const sp = dt * 2.2;
    (Object.keys(anim.door) as DoorId[]).forEach((d) => {
      const target = s.doors[d].open ? 1 : 0;
      const k = anim.door[d];
      anim.door[d] = k < target ? Math.min(target, k + sp * (d === 'shutter' ? 0.6 : 1)) : Math.max(target, k - sp * 1.5);
    });
    anim.cage = lerp(anim.cage, s.flags.cage_open ? 1 : 0, Math.min(1, dt * 5));
    anim.lever = lerp(anim.lever, s.flags.lift_powered ? 1 : 0, Math.min(1, dt * 8));
    walkBlend = lerp(walkBlend, f.walking ? 1 : 0, Math.min(1, dt * 10));
    if (f.walking) walkPhase += dt * 8.5;
    standY = lerp(standY, s.player.standingOn === 'cot' ? -70 : 0, Math.min(1, dt * 9));
    const reaching = f.reachingAt != null || (lastReach != null && now < lastReach.until);
    reachBlend = lerp(reachBlend, reaching ? 1 : 0, Math.min(1, dt * 14));

    // eye tracking
    const e = EYE_POS[s.screen];
    const tx = clamp((s.player.x - e.x) / 500, -1, 1) * 6;
    const ty = 3 + (s.player.standingOn ? -1 : 0);
    eyeX = lerp(eyeX, tx, Math.min(1, dt * 3));
    eyeY = lerp(eyeY, ty, Math.min(1, dt * 3));
    const pt = f.thinking ? 6.5 + 1.2 * Math.sin(now / 140) : s.warden.tone === 'cold' ? 3 : 4;
    pupil = lerp(pupil, pt, Math.min(1, dt * 6));

    // hazards (continuous) + bursts
    for (const h of s.hazards) {
      const kind: 0 | 1 = h.slot === 'sparks_archive' ? 1 : 0;
      particles.emit(h.slot, kind, dt, 1);
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      if (now > bursts[i].until) { bursts.splice(i, 1); continue; }
      particles.emit(bursts[i].slot, bursts[i].kind, dt, 1.4);
    }
    particles.update(dt);
  }

  function playerParams(s: GameState, f: FrameInfo, now: number) {
    let facing = s.player.facing;
    const rx = f.reachingAt ?? (lastReach && now < lastReach.until ? lastReach.x : null);
    if (rx != null && Math.abs(rx - s.player.x) > 4) facing = rx > s.player.x ? 1 : -1;
    const reachAngle = s.player.standingOn === 'cot' ? 2.7 : 1.75;
    return {
      facing,
      phase: walkPhase,
      walk: walkBlend,
      breath: now / 1000,
      reach: reachBlend > 0.05 ? lerp(0.1, reachAngle, reachBlend) : null,
    } as const;
  }

  function eyeLight(s: GameState): Light {
    const e = EYE_POS[s.screen];
    return { x: e.x, y: e.y, r: 70, a: s.warden.blind ? 0.1 : 0.35 };
  }

  function eyeColor(tone: Tone) { return TONE_COLOR[tone]; }

  function drawEye(ctx: Ctx, s: GameState, f: FrameInfo, now: number, dir: boolean) {
    const e = EYE_POS[s.screen];
    const tone: Tone = s.screen === 'exit' ? 'cold' : s.warden.tone;
    const blind = s.warden.blind && s.screen !== 'exit';
    let col = blind ? '#6a6a6a' : eyeColor(tone);
    let inten = 1;
    if (!blind && tone === 'rattled') {
      inten = f.reduceFlashing ? 0.75 + 0.25 * Math.sin(now / 300) : 0.45 + 0.55 * hash(Math.floor(now / 110));
    }
    // housing
    ctx.fillStyle = '#16191e';
    ctx.beginPath(); ctx.arc(e.x, e.y, 25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3b414b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, 23, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#040507';
    ctx.beginPath(); ctx.arc(e.x, e.y, 17, 0, Math.PI * 2); ctx.fill();
    if (!blind) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, e.x + eyeX, e.y + eyeY, 70, col, 0.22 * inten);
      ctx.restore();
    }
    const ix = e.x + eyeX, iy = e.y + eyeY;
    ctx.save();
    ctx.beginPath(); ctx.arc(e.x, e.y, 17, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = blind ? 0.6 : 0.4 + 0.6 * inten;
    ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ix, iy, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha *= 0.6;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + now / 4000;
      ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * (pupil + 1), iy + Math.sin(a) * (pupil + 1)); ctx.lineTo(ix + Math.cos(a) * 9, iy + Math.sin(a) * 9); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(ix, iy, blind ? 3 : pupil, 0, Math.PI * 2); ctx.fill();
    if (blind) {
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(200,200,200,${Math.random() * 0.5})`;
        ctx.fillRect(e.x - 17 + Math.random() * 34, e.y - 17 + Math.random() * 34, 2, 2);
      }
    }
    // specular
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(e.x - 6, e.y - 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // tally light
    if (!blind && !dir) {
      ctx.fillStyle = f.thinking ? hexA('#ff3b2f', 0.6 + 0.4 * Math.sin(now / 90)) : 'rgba(255,60,50,0.5)';
      ctx.beginPath(); ctx.arc(e.x + 18, e.y - 18, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    col = col; // keep
  }

  function atmosphere(ctx: Ctx, screen: ScreenId, now: number, k: number) {
    const spr = softSprite();
    ctx.save();
    // drifting fog bands
    ctx.globalAlpha = screen === 'cell' ? 0.03 : 0.06;
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'none';
    const tint = FOG_COLOR[screen];
    for (let i = 0; i < 3; i++) {
      const x = ((now / (40 + i * 13)) + i * 500) % (LW + 800) - 400;
      const y = 380 + i * 90 + Math.sin(now / 5000 + i) * 20;
      ctx.drawImage(tintedSoft(tint), x - 400, y - 80, 800, 160);
    }
    // dust motes near fixtures
    if (k > 0.05) {
      ctx.globalAlpha = 1;
      const centres: Record<ScreenId, [number, number][]> = {
        cell: [[640, 260]], archive: [[260, 260]], hall: [[250, 300], [780, 300]], exit: [[640, 260]],
      };
      for (const [cx, cy] of centres[screen]) {
        for (let i = 0; i < 18; i++) {
          const ph = hash(i * 17 + cx);
          const x = cx + (hash(i * 5 + cx) - 0.5) * 360 + Math.sin(now / 2300 + i) * 18;
          const y = cy + ((ph * 360 + now / 60) % 360) - 180;
          ctx.fillStyle = `rgba(255,240,220,${0.25 * k * (0.4 + 0.6 * Math.sin(now / 700 + i) ** 2)})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
    ctx.restore();
    void spr;
  }

  const tintCache = new Map<string, HTMLCanvasElement>();
  function tintedSoft(color: string) {
    let c = tintCache.get(color);
    if (c) return c;
    c = makeCanvas(128, 64);
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 32, 0, 64, 32, 64);
    g.addColorStop(0, hexA(color, 1)); g.addColorStop(1, hexA(color, 0));
    x.setTransform(1, 0, 0, 0.5, 0, 16);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    tintCache.set(color, c);
    return c;
  }

  // ------------------------------------------------------------------
  function post(ctx: Ctx, s: GameState, f: FrameInfo, w: number, h: number, now: number) {
    const T = clamp(s.tension, 0, 100);
    ctx.save();
    // tension grading
    if (T >= 30) {
      const k = clamp((T - 30) / 30, 0, 1);
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${0.2 * k + (T > 60 ? 0.1 : 0)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(30,60,110,${0.06 * k})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (T >= 60) {
      const k = clamp((T - 60) / 25, 0, 1);
      ctx.globalCompositeOperation = 'lighten';
      ctx.fillStyle = `rgb(${Math.round(38 * k)},0,${Math.round(4 * k)})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
    // vignette
    ctx.globalAlpha = 0.55 + clamp((T - 60) / 40, 0, 1) * 0.35;
    ctx.drawImage(vignette(w, h, '0,0,0'), 0, 0);
    if (T > 85) {
      const hb = heartbeat(now);
      ctx.globalAlpha = (0.25 + 0.45 * hb) * (f.reduceFlashing ? 0.5 : 1);
      ctx.drawImage(vignette(w, h, '150,0,10'), 0, 0);
    }
    ctx.globalAlpha = 1;
    // grain
    const gt = grainTile();
    const pat = ctx.createPattern(gt, 'repeat');
    if (pat) {
      const ox = Math.floor(Math.random() * 256), oy = Math.floor(Math.random() * 256);
      ctx.translate(-ox, -oy);
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.07 + T / 2000;
      ctx.fillStyle = pat;
      ctx.fillRect(ox, oy, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // occasional ambient scan line
    const cyc = now % 7000;
    if (cyc < 1400) {
      const y = (cyc / 1400) * h;
      ctx.fillStyle = 'rgba(200,230,255,0.035)';
      ctx.fillRect(0, y, w, 3 * (h / LH));
    }
    // decision scan sweep
    const sp = (now - scanT0) / 650;
    if (sp >= 0 && sp < 1) {
      const y = easeOut(sp) * h;
      const col = TONE_COLOR[s.warden.tone];
      const g = ctx.createLinearGradient(0, y - 40, 0, y);
      g.addColorStop(0, hexA(col, 0)); g.addColorStop(1, hexA(col, 0.22 * (1 - sp)));
      ctx.fillStyle = g; ctx.fillRect(0, y - 40, w, 40);
      ctx.fillStyle = hexA(col, 0.6 * (1 - sp)); ctx.fillRect(0, y, w, 2);
    }
    // glitch
    const rattledGlitch = s.warden.tone === 'rattled' && !f.reduceFlashing && (now % 3100) < 90;
    if (now < glitchUntil || rattledGlitch) glitch(ctx, w, h, now);
    // scare
    if (scare) {
      const p = (now - scare.t0) / 260;
      if (p >= 1 || p < 0) scare = null;
      else scareFace(ctx, w, h, p, s.warden.tone, lastReduce);
    }
    // flash
    const fp = (now - flash.t0) / flash.ms;
    if (fp >= 0 && fp < 1) {
      ctx.globalAlpha = (1 - fp) * (lastReduce ? 0.2 : 0.7);
      ctx.fillStyle = flash.color;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    // transition: the Eye blinks open
    const tp = (now - transT0) / 380;
    if (tp >= 0 && tp < 1) {
      const e = easeOut(tp);
      ctx.fillStyle = `rgba(0,0,0,${(1 - e) * 0.7})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#000';
      const lid = (h / 2) * (1 - e);
      ctx.fillRect(0, 0, w, lid);
      ctx.fillRect(0, h - lid, w, lid);
    }
    ctx.restore();
  }

  function glitch(ctx: Ctx, w: number, h: number, now: number) {
    const src = ctx.canvas;
    if (!scratch || scratch.width !== src.width || scratch.height !== src.height) scratch = makeCanvas(src.width, src.height);
    const sc = scratch.getContext('2d')!;
    sc.clearRect(0, 0, scratch.width, scratch.height);
    sc.drawImage(src, 0, 0);
    const seed = Math.floor(now / 40);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const y = Math.floor(hash(seed * 11 + i) * h);
      const sh = Math.floor(4 + hash(seed * 7 + i) * h * 0.06);
      const dx = Math.floor((hash(seed * 3 + i) - 0.5) * 40 * (w / LW));
      ctx.drawImage(scratch, 0, y, w, sh, dx, y, w, sh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = i % 2 ? '#ff00aa' : '#00e5ff';
      ctx.fillRect(0, y, w, Math.max(1, sh / 3));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // RGB split
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12;
    ctx.drawImage(scratch, 4 * (w / LW), 0);
    ctx.drawImage(scratch, -4 * (w / LW), 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function scareFace(ctx: Ctx, w: number, h: number, p: number, tone: Tone, reduce: boolean) {
    // flash white -> black, then a silhouette face
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (p < 0.2) {
      ctx.globalAlpha = (1 - p / 0.2) * (reduce ? 0.15 : 0.9);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    const cx = w / 2 + (Math.random() - 0.5) * 12 * (w / LW), cy = h * 0.55;
    const s = (w / LW) * (1 + p * 0.25);
    ctx.fillStyle = '#16181c';
    ctx.beginPath(); ctx.ellipse(cx, cy, 260 * s, 330 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(cx - 120 * s, cy + 250 * s, 240 * s, 200 * s);
    const col = TONE_COLOR[tone];
    for (const d of [-1, 1]) {
      const ex = cx + d * 95 * s, ey = cy - 40 * s;
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 70 * s);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, hexA(col, 0.9)); g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(ex - 70 * s, ey - 70 * s, 140 * s, 140 * s);
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(ex, ey, 18 * s, 26 * s, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, cy + 150 * s, 70 * s, 22 * s, 0, 0, Math.PI * 2); ctx.fill();
  }

  function noSignal(ctx: Ctx, w: number, h: number, now: number) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const gt = grainTile();
    const pat = ctx.createPattern(gt, 'repeat');
    if (pat) {
      const ox = Math.floor(hash(Math.floor(now / 50)) * 256), oy = Math.floor(hash(Math.floor(now / 50) + 9) * 256);
      ctx.translate(-ox, -oy);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = pat;
      ctx.fillRect(ox, oy, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(w / 2 - w * 0.2, h / 2 - h * 0.08, w * 0.4, h * 0.16);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(h * 0.08)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('NO SIGNAL', w / 2, h / 2);
  }

  function directorLabel(ctx: Ctx, s: GameState, w: number, h: number, _eff: number) {
    const L = s.lights[s.screen];
    const lights = L.mode === 'off' || L.level < 0.3 ? 'off' : L.mode === 'flicker' ? 'flicker' : 'on';
    const text = `SCREEN: ${s.screen} · LIGHTS: ${lights}`;
    const fs = Math.max(10, Math.round(h * 0.042));
    ctx.font = `bold ${fs}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(4, 4, tw + 10, fs + 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 9, 8);
    void w;
  }

  return {
    render,
    fx(e: FxEvent) {
      if (e.kind === 'scare' || e.kind === 'flash') {
        // honour reduce-flashing seen on the last frame (applied at draw time)
      }
      pendingFx.push(e);
      if (pendingFx.length > 64) pendingFx.shift();
      void lastT;
    },
  };
}
