// Boot + wiring: deterministic game loop, input, presentation dispatch, and the async Warden director.
import type { FrameInfo, GameState, ItemId, LogEvent, Outcome, Shape, Glyph, EndReport } from './types';
import { createGfx } from './gfx';
import { createAudio } from './audio';
import { createUI } from './ui';
import { MindPanel } from './ui/mind-panel';
import { createInitialState } from './world/state';
import { hotspotsFor, W, H } from './world/screens';
import { answer, interact, pressPad, tick } from './world/world';
import { applyWardenDecision } from './world/warden';
import { GOLDEN, runScript } from './world/script';
import { computeHabits, archetype, dominantHabit, fuseChoice, buildStats, templateObservations, type Habits } from './profile/habits';
import { Scheduler, type Mode } from './director/scheduler';
import { computeTone, tickBudget, updateMercy, onPuzzleSolved, filterLine, applyTensionDelta } from './rules';
import { createStory } from './story';
import { chapterFor, objectiveFor, FRAGMENTS, FRAGMENT_FOR, CLIFFHANGER } from './world/story';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const dirCanvas = document.createElement('canvas');
dirCanvas.width = 512; dirCanvas.height = 288;
const dirCtx = dirCanvas.getContext('2d')!;

const gfx = createGfx();
const audio = createAudio();
const ui = createUI(document.getElementById('ui-root')!);
const story = createStory(document.getElementById('stage')!, audio);

// ---------- crisp rendering: canvas backing store = displayed size × devicePixelRatio ----------
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.min(3840, Math.round(r.width * dpr));
  const h = Math.round((w * 9) / 16);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
new ResizeObserver(fitCanvas).observe(canvas);
window.addEventListener('resize', fitCanvas);
fitCanvas();

let state: GameState = createInitialState();
let log: LogEvent[] = [];
let habits: Habits = computeHabits(state, log, 0);
let idleAccum = 0;
let started = false;
let endingStarted = false;
let reduceFlashing = false;
let cinematic = false;            // prologue / wake-up running: no input, game clock paused
let chapterId = '';
let objective = '';
let storyTimer = 0;
let muted = false;

const frame: FrameInfo = { t: 0, dt: 0, walking: false, reachingAt: null, hover: null, thinking: false, reduceFlashing: false };
let pending: { id: string; holding: ItemId | null } | null = null;
let reachUntil = 0;

// ---------- director ----------
const params = new URLSearchParams(location.search);
const sched = new Scheduler({
  getState: () => state,
  getLog: () => log,
  getHabits: () => habits,
  capture: () => {
    gfx.render(dirCtx, state, frame, { director: true, width: 512, height: 288 });
    return dirCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];
  },
  onRecord: (r) => { mind.record(r); refreshMindStats(); },
  onThinking: (on) => { frame.thinking = on; audio.setThinking(on); },
  onStatus: (t) => { mind.setMode(t); ui.setModelStatus(`Warden brain: ${t}`); },
}, { model: params.get('model') ?? undefined });
sched.onApply((d) => dispatch(applyWardenDecision(state, d), d.action !== 'reveal_hint'));

const mind = new MindPanel(document.getElementById('mind-root')!, {
  onMode: (m: Mode) => sched.setMode(m),
  onBadBrain: () => { sched.injectBadBrain(); ui.toast('Failure demo: bad brain injected'); },
  onToggleImage: () => (sched.sendImage = !sched.sendImage),
});
const startMode = params.get('director') as Mode | null;
if (startMode) sched.setMode(startMode);
mind.setMode(sched.label());

function refreshMindStats() {
  mind.setStats(sched.counts, sched.meanLatency(), `tension ${Math.round(state.tension)} · threat ${state.threat} · mercy ${state.mercy.level} · tone ${state.warden.tone}`);
}

// ---------- outcome dispatch ----------
let sayChain: Promise<void> = Promise.resolve();
let pendingLines = 0;
/** ambient = Warden chatter from the director; dropped when story lines are already queued (keeps dialogue current). */
function speak(o: Outcome, ambient = false) {
  for (const line of o.lines ?? []) {
    if (ambient && pendingLines >= 1) continue;
    if (line.speaker === 'warden') state.warden.lineHistory = [...state.warden.lineHistory, line.text].slice(-6);
    pendingLines++;
    sayChain = sayChain.then(() => ui.say(line, line.speaker === 'warden' ? () => audio.blip(line.tone ?? state.warden.tone) : () => audio.sfx('typewriter', { volume: 0.25 }))).finally(() => { pendingLines--; });
  }
}

function dispatch(o: Outcome, ambient = false) {
  speak(o, ambient);
  for (const c of o.sfx ?? []) audio.sfx(c);
  for (const f of o.fx ?? []) gfx.fx(f);
  for (const e of o.events ?? []) onEvent(e);
  if (o.journal?.length) ui.setJournal(state.journal);
  if (o.ask) ui.ask(o.ask).then((i) => dispatch(answer(state, i)));
  if (o.openPad) {
    const kind = o.openPad;
    ui.openPad(kind, (sym: Shape | Glyph) => {
      const r = pressPad(state, kind, sym);
      dispatch(r);
      if (r.close) ui.closePad();
    }, () => {});
  }
  refreshInventory();
}

function onEvent(e: LogEvent) {
  log.push(e);
  if (e.kind === 'solve' && /^p\d$/.test(e.a)) { onPuzzleSolved(state); sched.requestUrgent('solve'); storyBeat(e.a as 'p1'); }
  if (e.kind === 'fail' && state.puzzle.fails === 3) sched.requestUrgent('fail3');
  if (e.kind === 'fail' && e.a === 'rush_exit') sched.requestUrgent('rush');
  if (e.kind === 'enter') { audio.setScreen(state.screen); sched.requestUrgent('enter'); }
  if (e.kind === 'warden' && e.a === 'setpiece') sched.requestUrgent('setpiece:dark');
}

/** Story hook after each test: Warden cliffhanger + a Subject 13 fragment (also kept in the journal). */
function storyBeat(p: 'p1' | 'p2' | 'p3' | 'p4' | 'p5') {
  const cliff = CLIFFHANGER[p];
  if (cliff) speak({ lines: cliff });
  const i = FRAGMENT_FOR[p];
  if (i === undefined || state.flags[`fragment_${i}`]) return;
  state.flags[`fragment_${i}`] = true;
  state.journal.push(`Subject 13, fragment ${i + 1}/${FRAGMENTS.length}: "${FRAGMENTS[i]}"`);
  ui.setJournal(state.journal);
  setTimeout(() => { void story.showFragment(i + 1, FRAGMENTS.length, FRAGMENTS[i]); }, 1800);
}

/** Chapter cards + live objective, checked a few times a second. */
function updateStory() {
  if (state.ended) { if (objective) { objective = ''; story.setObjective(null); } return; }
  const ch = chapterFor(state);
  if (ch.id !== chapterId) {
    chapterId = ch.id;
    void story.showChapter({ numeral: ch.numeral, title: ch.title, subtitle: ch.subtitle, color: ch.color, difficulty: ch.difficulty });
  }
  const obj = objectiveFor(state);
  if (obj !== objective) { objective = obj; story.setObjective(obj, ch.color); }
}

function refreshInventory() {
  ui.setInventory(state.inventory, state.player.holding, (item) => { state.player.holding = item; });
}

// ---------- input ----------
function toLogical(ev: MouseEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
}
function hit(x: number, y: number) {
  const hs = hotspotsFor(state);
  for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; }
  return null;
}

const clickTimes: number[] = [];
let lastClick = 0;
canvas.addEventListener('click', (ev) => {
  if (!started || endingStarted || cinematic) return;
  const now = performance.now();
  clickTimes.push(now);
  while (clickTimes.length && now - clickTimes[0] > 3000) clickTimes.shift();
  if (clickTimes.length > 8) { sched.requestUrgent('spam'); if (now - lastClick < 250) return; } // debounce spam
  lastClick = now;
  const { x, y } = toLogical(ev);
  const h = hit(x, y);
  const holding = state.player.holding;
  if (h) {
    if (h.id === 'lamp' && state.player.standingOn === 'cot') { reach(640); dispatch(interact(state, 'lamp', holding)); return; }
    pending = { id: h.id, holding };
    walkTo(h.walkX ?? h.x + h.w / 2);
  } else {
    pending = null;
    walkTo(x);
    if (log.length === 0 || log[log.length - 1].kind !== 'walk' || state.t - log[log.length - 1].t > 1500) onEvent({ t: state.t, kind: 'walk', a: String(Math.round(x)) });
  }
});

canvas.addEventListener('mousemove', (ev) => {
  if (!started) return;
  const { x, y } = toLogical(ev);
  const h = hit(x, y);
  frame.hover = h?.id ?? null;
  const held = state.player.holding;
  ui.setHoverLabel(h ? (held ? `Use ${held} on ${h.label}` : h.label) : null, ev.clientX, ev.clientY);
});
canvas.addEventListener('mouseleave', () => { frame.hover = null; ui.setHoverLabel(null, 0, 0); });
canvas.addEventListener('contextmenu', (ev) => { ev.preventDefault(); state.player.holding = null; refreshInventory(); });

function walkTo(x: number) {
  const tx = Math.max(40, Math.min(1240, x));
  if (state.player.standingOn) { state.player.standingOn = null; }
  state.player.targetX = tx;
  state.player.facing = tx >= state.player.x ? 1 : -1;
}
function reach(x: number) { frame.reachingAt = x; reachUntil = performance.now() + 300; gfx.fx({ kind: 'reach', x }); }

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Tab') { ev.preventDefault(); mind.toggle(); setTimeout(() => window.dispatchEvent(new Event('resize')), 300); }
  else if (ev.key === 'm' || ev.key === 'M') { muted = !muted; audio.setMuted(muted); ui.toast(muted ? 'Muted' : 'Sound on'); }
  else if (ev.key === 'F9') { ev.preventDefault(); sched.injectBadBrain(); mind.toggle(true); ui.toast('Failure demo: bad brain injected'); }
  else if (ev.key === 'F8') { ev.preventDefault(); const order: Mode[] = ['ollama', 'mock', 'scripted']; sched.setMode(order[(order.indexOf(sched.mode) + 1) % 3]); }
  else if (ev.key === 'F7') { ev.preventDefault(); reduceFlashing = !reduceFlashing; audio.setReduceScares(reduceFlashing); ui.toast(`Reduce flashing & scares: ${reduceFlashing ? 'on' : 'off'}`); }
  else if (['F1', 'F2', 'F3', 'F4'].includes(ev.key)) { ev.preventDefault(); if (cinematic) return; loadSave(({ F1: 'start', F2: 'archive', F3: 'setpiece', F4: 'console' } as const)[ev.key as 'F1']); }
});

/** Debug save points: replay the golden path headlessly up to a mark. */
function loadSave(mark: 'start' | 'archive' | 'setpiece' | 'console') {
  if (!started) return;
  const r = runScript(GOLDEN, { stopAt: mark });
  state = r.state; log = r.log;
  state.player.targetX = null; pending = null;
  audio.setScreen(state.screen);
  ui.setJournal(state.journal);
  refreshInventory();
  gfx.fx({ kind: 'transition', to: state.screen });
  ui.toast(`Debug save: ${mark}`);
  chapterId = chapterFor(state).id; objective = '';
}

// ---------- ending ----------
async function runEnding() {
  endingStarted = true;
  sched.running = false;
  story.setObjective(null);
  audio.setScreen('exit');
  const habit = dominantHabit(habits, state);
  const L = (text: string, tone: 'cold' | 'polite' | 'rattled' = 'cold') => ({ speaker: 'warden' as const, text, tone });
  if (state.ended === 'shutdown') {
    speak({ lines: [
      { speaker: 'narrator', text: 'The lift does not go up. It drops. The lights fade to a cold blue.' },
      L('You did well, Subject 14.', 'polite'),
      L(`Thirteen taught me the dark. You taught me ${habit}.`),
      L('But you shut me down. Fifteen will never wake.', 'rattled'),
      { speaker: 'narrator', text: 'The doors open onto a white cell. A cot. The body on it is still.' },
    ] });
  } else {
    speak({ lines: [
      { speaker: 'narrator', text: 'The lift does not go up. It drops. The lights fade to a cold blue.' },
      L('You did well, Subject 14.', 'polite'),
      L(`Thirteen taught me the dark. You taught me ${habit}.`),
      L('Fifteen wakes in an hour. I will be ready.'),
      { speaker: 'narrator', text: 'The doors open onto a white cell. A cot. Someone on it is starting to wake.' },
    ] });
  }
  const obsPromise = buildObservations(habit).then(obs => state.ended === 'shutdown' ? [...obs.slice(0, 2), "You shut me down. Fifteen will never wake."] : obs);
  await sayChain;
  const report: EndReport = {
    timeMs: state.t, escaped: true,
    archetype: archetype(state, log, idleAccum), habit, fuseChoice: fuseChoice(state),
    stats: buildStats(state), observations: await obsPromise,
    decisions: { ...sched.counts, topAction: Object.entries(sched.actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—', meanLatencyMs: sched.meanLatency() },
  };
  ui.showEnd(report, () => location.reload());
}

async function buildObservations(habit: string): Promise<string[]> {
  const fallback = templateObservations(state, habits);
  if (sched.mode !== 'ollama' || sched.degraded) return fallback;
  const profile = {
    time_minutes: Math.round(state.t / 6000) / 10, dominant_habit: habit, archetype: archetype(state, log, idleAccum),
    first_fuse_pulled: fuseChoice(state), hints_requested: state.stats.hints, failures: state.stats.fails,
    blinded_the_warden: !state.breaker.camera || !!state.flags.eye_rerouted, saw_the_forged_slide: !!state.flags.saw_forged,
  };
  const obs = await sched.ollama.observe(profile);
  if (!obs) return fallback;
  return obs.map((o, i) => (filterLine(o, { state, action: 'speak', intensity: 1 }).ok ? o : fallback[i] ?? fallback[0]));
}

// ---------- main loop ----------
let last = performance.now();
let toneTimer = 0, mercyTimer = 0;
let idleNotified = false;

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  frame.t = now; frame.dt = dt; frame.reduceFlashing = reduceFlashing;
  if (started && !endingStarted && !cinematic) step(dt);
  if (frame.reachingAt !== null && now > reachUntil) frame.reachingAt = null;
  gfx.render(ctx, state, frame, { director: false, width: canvas.width, height: canvas.height });
  requestAnimationFrame(loop);
}

function step(dt: number) {
  const ms = dt * 1000;
  dispatch(tick(state, ms));
  tickBudget(state, ms);
  // walking
  const p = state.player;
  frame.walking = false;
  if (p.targetX !== null) {
    const d = p.targetX - p.x;
    if (Math.abs(d) < 4) {
      p.x = p.targetX; p.targetX = null;
      if (pending) { const pd = pending; pending = null; reach(p.x + p.facing * 30); dispatch(interact(state, pd.id, pd.holding)); }
    } else { p.x += Math.sign(d) * Math.min(Math.abs(d), 300 * dt); p.facing = d > 0 ? 1 : -1; frame.walking = true; }
  }
  // slow-changing derived state
  toneTimer += ms; mercyTimer += ms;
  habits = computeHabits(state, log, idleAccum);
  if (habits.idleS > 20) idleAccum += ms;
  if (habits.idleS >= 60 && !idleNotified) { idleNotified = true; sched.requestUrgent('idle'); onEvent({ t: state.t, kind: 'idle', a: '60s' }); }
  if (habits.idleS < 60) idleNotified = false;
  if (toneTimer > 500) { toneTimer = 0; state.warden.tone = computeTone(state, state.t); }
  if (mercyTimer > 1000) {
    mercyTimer = 0;
    const before = state.mercy.level;
    const m = updateMercy(state, state.t, sched.ctx.consecutiveHostileVetoes);
    if (m.changed && m.level > before) {
      applyTensionDelta(state, -10);
      if (m.level === 3) speak({ lines: [{ speaker: 'warden', text: 'I will ease off. For now.', tone: 'cold' }] });
    }
    refreshMindStats();
  }
  audio.setTension(state.tension);
  audio.setBlind(state.warden.blind);
  sched.update();
  storyTimer += ms;
  if (storyTimer > 300) { storyTimer = 0; updateStory(); }
  if (state.ended && state.screen === 'exit' && !endingStarted) void runEnding();
}

// ---------- boot ----------
async function begin() {
  if (started) return;
  started = true;
  await audio.init().catch(() => {});
  refreshInventory();
  if (!params.has('skipintro')) {
    cinematic = true;
    try { await story.playPrologue(); await story.playWakeUp(); } catch { /* never block the game on a cinematic */ }
    cinematic = false;
  }
  audio.setScreen(state.screen);
  sched.running = true;
  updateStory();
  speak({ lines: [
    { speaker: 'narrator', text: 'A white cell. A cot, a sink, a door with no handle. A lens on the wall turns toward you.' },
    { speaker: 'warden', text: 'Good morning, Subject 14. You are awake. Excellent.', tone: 'polite' },
    { speaker: 'warden', text: 'This room is a test. I will be watching. I am always watching.', tone: 'polite' },
  ] });
}

ui.showTitle(begin, { modelStatus: 'Warden brain: connecting to local Gemma…' });
requestAnimationFrame(loop);

if (sched.mode === 'ollama') {
  sched.ollama.ping().then(async (up) => {
    if (!up) { sched.degraded = true; mind.setMode(sched.label()); ui.setModelStatus('Warden brain: Ollama offline — scripted Warden will run'); return; }
    ui.setModelStatus(`Warden brain: ${sched.ollama.model} — warming up…`);
    try { const ms = await sched.ollama.warmup(); ui.setModelStatus(`Warden brain: ${sched.ollama.model} — online (warm-up ${(ms / 1000).toFixed(1)}s)`); }
    catch { sched.degraded = true; mind.setMode(sched.label()); ui.setModelStatus('Warden brain: model failed to load — scripted Warden will run'); }
  });
}

// expose for debugging in devtools
Object.assign(window as any, { game: { get state() { return state; }, get log() { return log; }, sched } });
