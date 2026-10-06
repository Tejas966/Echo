// TEMP boot — lead replaces with full wiring in Phase 1.
import { createGfx } from './gfx';
import { createInitialState } from './world/state';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const gfx = createGfx();
const state = createInitialState();
let last = performance.now();
function frame(now: number) {
  const dt = (now - last) / 1000; last = now;
  gfx.render(ctx, state, { t: now, dt, walking: false, reachingAt: null, hover: null, thinking: false, reduceFlashing: false }, { director: false, width: 1280, height: 720 });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
