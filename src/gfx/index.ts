// STUB — Agent A replaces this with the real renderer (docs/05). Keep the export signature.
import type { FrameInfo, FxEvent, GameState, GfxAPI } from '../types';
import { hotspotsFor } from '../world/screens';

export function createGfx(): GfxAPI {
  return {
    render(ctx: CanvasRenderingContext2D, s: GameState, _f: FrameInfo, o) {
      ctx.save();
      ctx.scale(o.width / 1280, o.height / 720);
      ctx.fillStyle = s.screen === 'cell' ? '#cfc9bb' : s.screen === 'archive' ? '#173b3f' : '#1b2433';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.strokeStyle = '#f0f';
      ctx.fillStyle = '#fff';
      ctx.font = '14px monospace';
      for (const h of hotspotsFor(s)) { ctx.strokeRect(h.x, h.y, h.w, h.h); ctx.fillText(h.id, h.x + 2, h.y + 14); }
      ctx.fillStyle = '#000';
      ctx.fillRect(s.player.x - 15, 470, 30, 130);
      const dark = 1 - Math.max(o.director ? 0.55 : 0, s.lights[s.screen].level);
      ctx.fillStyle = `rgba(0,0,20,${dark * 0.9})`;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
    },
    fx(_e: FxEvent) {},
  };
}
