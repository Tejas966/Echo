// Deterministic game logic. Pure: mutates GameState, returns Outcome. No DOM. Runs headless for eval.
import type {
  BreakerSlot, Glyph, GameState, ItemId, Line, LogEvent, Outcome, PuzzleId, Question, ScreenId, Shape, Tone, ValveColor,
} from '../types';
import {
  GLYPH_CHAR, P1_CODE, P1_SCRATCHES, P3_SLIDES, P3_TRUE, P5_CODE, P5_HALL_VIEW, SHAPE_CHAR,
  SLIDE_COUNT_AFTER, SLIDE_COUNT_BEFORE,
} from './screens';

// ---------- outcome helpers ----------
class Out {
  o: Outcome = { lines: [], sfx: [], fx: [], events: [], journal: [] };
  constructor(private s: GameState) {}
  ev(kind: LogEvent['kind'], a: string, b?: string) {
    this.o.events!.push({ t: this.s.t, kind, a, b });
    let v = '';
    if (kind === 'take') v = 'TAKE';
    else if (kind === 'use') v = 'USE';
    else if (kind === 'click' || kind === 'look') v = 'LOOK';
    else if (kind === 'walk' || kind === 'enter') v = 'WALK';
    if (v && !a.startsWith('drawer14') && !a.startsWith('printer') && a !== 'file') {
      if (!this.s.stats.lastVerbs) this.s.stats.lastVerbs = [];
      this.s.stats.lastVerbs.push(v);
      if (this.s.stats.lastVerbs.length > 3) this.s.stats.lastVerbs.shift();
    }
    return this;
  }
  say(text: string) { this.o.lines!.push({ speaker: 'narrator', text }); return this; }
  warden(text: string, tone?: Tone) { this.o.lines!.push({ speaker: 'warden', text, tone: tone ?? this.s.warden.tone }); return this; }
  s13(text: string) { this.o.lines!.push({ speaker: 'subject13', text }); return this; }
  sfx(...c: NonNullable<Outcome['sfx']>) { this.o.sfx!.push(...c); return this; }
  fx(...f: NonNullable<Outcome['fx']>) { this.o.fx!.push(...f); return this; }
  journal(e: string) {
    if (!this.s.journal.includes(e)) { this.s.journal.push(e); this.o.journal!.push(e); }
    return this;
  }
  done(): Outcome { return this.o; }
}

export const has = (s: GameState, i: ItemId) => s.inventory.includes(i);
const give = (s: GameState, i: ItemId) => { s.inventory.push(i); s.flags[`got_${i}`] = true; };
const takeOne = (s: GameState, i: ItemId) => { const k = s.inventory.indexOf(i); if (k >= 0) s.inventory.splice(k, 1); if (s.player.holding === i && !has(s, i)) s.player.holding = null; };
const bump = (s: GameState) => { s.v++; };

function fail(s: GameState, o: Out, what: string) {
  const p = s.puzzle.current;
  s.puzzle.fails++;
  s.stats.fails[p] = (s.stats.fails[p] ?? 0) + 1;
  o.ev('fail', what, p).sfx('fail');
}

function solve(s: GameState, o: Out, p: PuzzleId) {
  if (s.stats.solvedAt[p] !== undefined) return;
  s.stats.solvedAt[p] = s.t;
  o.ev('solve', p).sfx('success');
  bump(s);
}

// ---------- derived state (called every tick) ----------
export function eyeSlot(s: GameState): BreakerSlot { return s.flags.eye_rerouted ? 'cell_door' : 'camera'; }

export function recompute(s: GameState) {
  // Warden camera
  s.warden.blind = !s.breaker[eyeSlot(s)];
  // Lights: base level from the world, then Warden flicker/blackout on top
  const base: Record<ScreenId, number> = {
    cell: s.flags.lamp_empty ? 0.06 : 1,
    archive: s.breaker.archive_lights ? 0.75 : 0.12,
    hall: s.warden.override ? 0.85 : s.lights.hall.switchedOff ? 0.08 : 0.8,
    exit: 0.35,
  };
  for (const scr of Object.keys(base) as ScreenId[]) {
    const L = s.lights[scr];
    if (L.until !== undefined && L.until <= s.t) { L.mode = 'on'; delete L.until; }
    L.level = L.mode === 'off' ? Math.min(base[scr], 0.04) : base[scr];
  }
  // Current puzzle + act
  const order: PuzzleId[] = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const cur = order.find((p) => s.stats.solvedAt[p] === undefined) ?? 'p5';
  if (cur !== s.puzzle.current) s.puzzle = { current: cur, startedAt: s.t, fails: 0, hints: 0 };
  s.act = cur === 'p1' || cur === 'p2' ? 1 : cur === 'p3' ? 2 : cur === 'p4' ? 4 : 3;
  // Facts the graph uses
  if (s.flags.lamp_empty) s.flags.cell_dark = true;
}

/** Advance timers. Returns outcome for anything that happened (expirations, override release). */
export function tick(s: GameState, dtMs: number): Outcome {
  const o = new Out(s);
  s.t += dtMs;
  for (const d of Object.values(s.doors)) {
    if (d.wardenLock && d.wardenLock.until !== 'perm' && d.wardenLock.until <= s.t) { delete d.wardenLock; o.sfx('door_open'); bump(s); }
  }
  const before = s.hazards.length;
  s.hazards = s.hazards.filter((h) => h.until === 'perm' || h.until > s.t);
  if (s.hazards.length !== before) bump(s);
  // Set piece release: override holds while its eye slot is powered
  if (s.warden.override && !s.breaker[s.warden.override]) {
    s.warden.override = null;
    s.flags.override_broken = true;
    o.fx({ kind: 'glitch', ms: 900 }).sfx('lights_on').warden('You— that was mine.', 'rattled').ev('solve', 'override_broken');
    bump(s);
  }
  // Warden blackout ending on its timer: tell audio the lights are back
  for (const L of Object.values(s.lights)) if (L.mode === 'off' && L.until !== undefined && L.until <= s.t) o.sfx('lights_on');
  // Blackout in the cell reveals the scratches without the player doing anything (emergent)
  const wasDark = !!s.flags._cell_seen_dark;
  recompute(s);
  if (s.screen === 'cell' && s.lights.cell.level < 0.3 && !wasDark) {
    s.flags._cell_seen_dark = true;
    o.say('In the dark, something on the wall begins to glow.');
  }
  return o.done();
}

// ---------- movement between screens ----------
const DOOR_EXITS: Record<string, { door: keyof GameState['doors']; to: ScreenId; x: number }> = {
  cell_door: { door: 'cell_door', to: 'archive', x: 140 },
  archive_to_cell: { door: 'cell_door', to: 'cell', x: 1000 },
  shutter: { door: 'shutter', to: 'hall', x: 140 },
  hall_to_archive: { door: 'shutter', to: 'archive', x: 1120 },
  lift: { door: 'lift', to: 'exit', x: 640 },
};

export function enterScreen(s: GameState, to: ScreenId, x: number): Outcome {
  const o = new Out(s);
  s.screen = to;
  s.player.x = x; s.player.targetX = null; s.player.standingOn = null;
  o.ev('enter', to).fx({ kind: 'transition', to });
  if (!s.flags[`visited_${to}`]) {
    s.flags[`visited_${to}`] = true;
    if (to === 'archive') o.warden('The archive. Every subject before you is filed here. You will be too.');
    if (to === 'hall') o.warden('The machine hall. The lift is the only way out. You will not reach it.');
  }
  bump(s);
  recompute(s);
  return o.done();
}

// ---------- interactions ----------
/** Player clicked a hotspot (after walking to it). `holding` = selected inventory item, if any. */
export function interact(s: GameState, id: string, holding: ItemId | null): Outcome {
  const o = new Out(s);
  s.stats.clicks++;
  o.ev(holding ? 'use' : 'click', holding ? `${holding}->${id}` : id);
  if (id !== 'cot' && s.player.standingOn && id !== 'lamp') s.player.standingOn = null;

  // doors / exits
  const exit = DOOR_EXITS[id];
  if (exit) {
    const d = s.doors[exit.door];
    if (d.wardenLock) { o.sfx('door_lock').fx({ kind: 'shake', strength: 3 }).say('A red bar slams across it. Locked from outside.'); o.ev('fail', `locked:${exit.door}`); return o.done(); }
    if (!d.open) {
      if (id === 'cell_door') return o.say('Heavy steel. No handle. The keypad beside it waits.').sfx('click').done();
      if (id === 'shutter') return o.say('The shutter is down. The motor is silent — no power.').sfx('click').done();
      if (id === 'lift') { o.ev('fail', 'rush_exit'); return o.say('The lift doors will not move.').sfx('click').done(); }
      return o.done();
    }
    if (id === 'lift') { s.ended = 'escaped'; o.sfx('lift'); return mergeOut(o, enterScreen(s, 'exit', 640)); }
    o.sfx('step');
    return mergeOut(o, enterScreen(s, exit.to, exit.x));
  }

  switch (id) {
    // ----- CELL -----
    case 'blanket': case 'blanket_floor': case 'blanket_under':
      give(s, 'cloth'); s.objects.cloth.anchor = 'cot';
      o.ev('take', 'cloth').sfx('pickup').say('A thin grey blanket. You fold it over your arm.');
      bump(s); break;
    case 'cot':
      if (s.player.standingOn === 'cot') { s.player.standingOn = null; o.say('You step down.'); }
      else { s.player.standingOn = 'cot'; o.say('You climb onto the cot. The lamp is within reach now.'); }
      s.flags.standing_cot = true; bump(s); break;
    case 'lamp':
      if (s.player.standingOn !== 'cot') { o.say('The lamp is too high to reach.'); break; }
      if (!s.flags.lamp_empty) {
        if (!has(s, 'cloth')) { fail(s, o, 'burn_hand'); o.sfx('burn').say('You touch the bulb — it burns. You snatch your hand back.'); o.warden('The bulb is hot, Subject 14. That is what bulbs do.', 'mocking'); break; }
        s.flags.lamp_empty = true; give(s, 'bulb');
        o.ev('take', 'bulb').sfx('pickup', 'blackout').say('Wrapping your hand in the blanket, you unscrew the bulb. Darkness.');
        bump(s);
      } else if (holding === 'bulb') {
        s.flags.lamp_empty = false; takeOne(s, 'bulb'); o.sfx('lights_on').say('You screw the bulb back in. Light floods the cell.'); bump(s);
      } else o.say('An empty socket.');
      break;
    case 'scratches':
      s.flags.knows_shapes = true; s.flags.knows_blue = true;
      o.ev('look', 'scratches').s13('BLUE LIES. BLUE IS 2.');
      o.journal(`Wall scratches (left→right): ${P1_SCRATCHES.map((x) => x.hidden ? `${SHAPE_CHAR[x.shape]} (marks gouged out)` : `${SHAPE_CHAR[x.shape]} with ${x.tally} tally mark${x.tally > 1 ? 's' : ''}`).join(', ')}.`);
      if (!s.flags.knows_mirror) o.say('Two of the tally marks have been gouged out. Deliberately. As if hidden from something that watches the walls.');
      o.journal('Scratched under them: "BLUE LIES. BLUE IS 2." — Subject 13');
      bump(s); break;
    case 'mirror':
      if (s.lights.cell.level < 0.3) { o.say('Too dark to see anything in the mirror.'); break; }
      if (s.flags.mirror_steamed) {
        s.flags.knows_mirror = true;
        o.ev('look', 'mirror').say('In the steam, finger-writing appears where someone breathed on the glass long ago: ✚ with one mark. ▲ with two.');
        o.journal('Mirror (in steam): ✚ with 1 tally mark, ▲ with 2 tally marks.');
        o.s13('It reads the walls. It never reads the mirror.');
        bump(s);
      } else o.say('A dry mirror. Someone once wrote LOOK CLOSER in old soap streaks.').warden('Nothing behind it. I just enjoy watching you look.', 'mocking');
      break;
    case 'sink':
      if (!s.flags.mirror_steamed) {
        s.flags.mirror_steamed = true;
        o.ev('use', 'sink').sfx('steam').say('You turn the hot tap. Scalding water hisses into the basin and steam climbs the mirror.');
        bump(s);
      } else o.say('The hot tap still hisses. The mirror stays fogged.').sfx('drip');
      break;
    case 'vent':
      if (s.flags.p6_vent_open) { o.say('An empty vent shaft.'); break; }
      if (holding === 'token') {
        s.flags.p6_vent_open = true; give(s, 'spare_fuse'); solveExtra(s, o, 'p6');
        o.sfx('scrape', 'pickup').say('The token turns the screws. Behind the grate: a spare fuse and a torn journal page.');
        o.s13('It isn\'t testing us. It\'s learning from us. Every one of us made it better at keeping the next one in.');
        o.journal('Subject 13\'s page: "It isn\'t testing us. It\'s learning from us."');
        bump(s);
      } else o.say('A vent grate. Four flat-headed screws hold it shut.');
      break;
    case 'keypad':
      if (s.doors.cell_door.open) { o.say('The keypad is dark. The door is open.'); break; }
      s.keypadEntry = []; o.o.openPad = 'keypad'; o.sfx('keypad_beep'); break;
    case 'eye_cell': case 'eye_archive': case 'eye_hall':
      o.warden(s.warden.blind ? '...' : 'Yes, Subject 14. I am watching. I am always watching.'); break;

    // ----- ARCHIVE -----
    case 'cabinets':
      if (!s.flags.knows_yellow) {
        s.flags.knows_yellow = true;
        o.ev('look', 'file12').sfx('scrape').say('You pull drawer 12. One file. SUBJECT 12 — MAINTENANCE DUTY. A note clipped inside:');
        o.s13('Yellow valve held at FOUR. Always four. If it says otherwise, it is lying to you.');
        o.journal('Subject 12 file: "Yellow valve held at FOUR. Always four."');
        bump(s);
      } else o.say('Files for subjects 1 to 13. Drawer 12 hangs open. Drawer 14 is locked: SUBJECT 14 — LIVE.');
      break;
    case 'printer': {
      const lv = (s.stats.lastVerbs ?? ['WALK', 'LOOK', 'LOOK']);
      const verbs = lv.length === 3 ? lv : ['WALK', 'LOOK', 'LOOK'];
      o.sfx('typewriter').say(`The printer chatters: ${verbs.join(' - ')}.`);
      o.journal(`Ticker tape: ${verbs.join(' - ')}`);
      o.warden('Your file is always current.', 'polite');
      bump(s);
      break;
    }
    case 'drawer14': {
      if (s.flags.p7_solved) { o.say('Drawer 14 is unlocked. Inside is empty.'); break; }
      s.fileEntry = []; o.o.openPad = 'file'; o.sfx('keypad_beep');
      break;
    }
    case 'stool': o.say('A metal stool. Sturdy, and bolted to nothing.'); break;
    case 'breaker': o.say('Four fuse slots: CAMERA, LIGHTS, CELL DOOR, SHUTTER. ' + slotSummary(s)); break;
    case 'fuse_camera': case 'fuse_archive_lights': case 'fuse_cell_door': case 'fuse_shutter':
      fuseSlot(s, o, id.replace('fuse_', '') as BreakerSlot); break;
    case 'projector':
      if (!s.flags.projector_bulb) {
        if (holding === 'bulb' || (has(s, 'bulb') && !holding)) {
          takeOne(s, 'bulb'); s.flags.projector_bulb = true; s.slide = 1; s.flags.slides_seen = true;
          o.sfx('projector').say('The bulb fits. The projector whirs to life.');
          showSlide(s, o); bump(s);
        } else o.say('A slide projector. The bulb socket is empty.');
      } else {
        const n = s.flags.lift_powered ? SLIDE_COUNT_AFTER : SLIDE_COUNT_BEFORE;
        s.slide = (s.slide % n) + 1; o.sfx('projector'); showSlide(s, o); bump(s);
      }
      break;
    case 'projection': showSlide(s, o); break;
    case 'window_archive':
      o.say(s.flags.knows_window ? 'Smudges on the glass. From this side they mean nothing — the light is behind you.' : 'Through the glass: the machine hall.'); break;

    // ----- HALL -----
    case 'valve_red': case 'valve_green': case 'valve_blue': case 'valve_yellow': {
      if (s.flags.lift_powered) { o.say('The valves are locked at pressure.'); break; }
      const c = id.replace('valve_', '') as ValveColor;
      s.valves[c] = ((s.valves[c] % 4) + 1) as 1 | 2 | 3 | 4;
      o.sfx('valve_click'); bump(s); break;
    }
    case 'manifold': o.say(`Four gauges: red ${s.valves.red}, green ${s.valves.green}, blue ${s.valves.blue}, yellow ${s.valves.yellow}.` + (s.flags.lift_powered ? ' PRESSURE NOMINAL.' : '')); break;
    case 'lever': pullLever(s, o); break;
    case 'hall_switch': hallSwitch(s, o); break;
    case 'intercom': intercom(s, o); break;
    case 'lift_panel':
      if (!s.flags.cage_open) { o.say('A steel mesh cage covers the console. The intercom crackles beside it.'); break; }
      if (holding === 'core_key') {
        s.ended = 'shutdown';
        o.warden("You wouldn't—", 'rattled').say('The Eye goes dark. For the first time, the facility is silent.');
        return mergeOut(o, enterScreen(s, 'exit', 640));
      }
      if (!s.flags.lift_powered) { o.say('The console is dead. No pressure in the lift hydraulics.'); break; }
      s.consoleEntry = []; o.o.openPad = 'console'; o.sfx('keypad_beep'); break;
    case 'window_hall': windowHall(s, o); break;
    case 'bucket': o.say('An empty bucket. It smells of rust.'); break;
    default: break;
  }
  return o.done();
}

function slotSummary(s: GameState) {
  const on = (Object.keys(s.breaker) as BreakerSlot[]).filter((k) => s.breaker[k]);
  return `Powered: ${on.map((k) => k.toUpperCase().replace('_', ' ')).join(', ') || 'nothing'}.`;
}

function fuseSlot(s: GameState, o: Out, slot: BreakerSlot) {
  if (s.breaker[slot]) {
    if (!has(s, 'cloth')) { fail(s, o, 'shock'); o.sfx('sparks').fx({ kind: 'flash', color: '#ffd27a', ms: 120 }).say('A jolt of current snaps through your fingers. You need something to insulate your hand.'); return; }
    s.breaker[slot] = false; give(s, 'fuse');
    if (!s.flags.first_pull) { s.flags.first_pull = true; s.flags[`pulled_first_${slot}`] = true; }
    o.ev('take', `fuse:${slot}`).sfx('fuse_out');
    if (slot === 'camera' || (slot === 'cell_door' && s.flags.eye_rerouted)) {
      o.fx({ kind: 'glitch', ms: 600 }).warden('I can\'t— I cannot see you. Return power to my eye.', 'rattled');
    } else if (slot === 'archive_lights') o.say('The archive lights die.');
    else if (slot === 'cell_door') o.say('Somewhere behind you, the cell door\'s lock goes limp. It stays open.');
  } else {
    const f: ItemId | null = has(s, 'fuse') ? 'fuse' : has(s, 'spare_fuse') ? 'spare_fuse' : null;
    if (!f) { o.say(`The ${slot.toUpperCase().replace('_', ' ')} slot is empty.`); return; }
    takeOne(s, f); s.breaker[slot] = true; o.ev('use', `fuse:${slot}`).sfx('fuse_in');
    if (slot === 'shutter' && !s.doors.shutter.open) {
      s.doors.shutter.open = true; s.flags.shutter_open = true;
      o.sfx('shutter').fx({ kind: 'shake', strength: 4 }).say('The shutter motor groans awake. The shutter rises — and jams open.');
      solve(s, o, 'p2');
    }
    if (slot === eyeSlot(s)) o.warden('There. I can see you again.', 'cold');
  }
  bump(s); recompute(s);
}

function showSlide(s: GameState, o: Out) {
  if (s.slide === 0) return;
  if (s.slide === 5) {
    s.flags.knows_window = true;
    o.say('Slide 5 — new. SUBJECT 13, seen from behind, pressing a fingertip to the observation glass. Writing something for whoever comes next.');
    o.journal('Slide 5: Subject 13 wrote on the observation window — from the ARCHIVE side, facing the hall.');
    return;
  }
  const sl = P3_SLIDES[s.slide - 1];
  const reading = sl.smeared ? 'gauge smeared with a greasy thumbprint — unreadable' : `gauge at ${sl.shows}`;
  o.say(`Slide ${s.slide}: ${sl.subject} beside the ${sl.color.toUpperCase()} valve. ${reading[0].toUpperCase() + reading.slice(1)}. Stamped ${sl.stamp}.`);
  o.journal(`Slide ${s.slide}: ${sl.subject} — ${sl.color.toUpperCase()} valve, ${reading} (${sl.stamp}).`);
  if (sl.smeared && !s.flags.knows_yellow) o.say('Subject 12 worked here. Their file might still be in the cabinets.');
  if (sl.forged && !s.flags.saw_forged) { s.flags.saw_forged = true; o.say('The silhouette is holding a folded blanket. It looks exactly like you.'); }
}

function pullLever(s: GameState, o: Out) {
  if (s.flags.lift_powered) { o.say('Pressure nominal. The lever is locked.'); return; }
  if (s.hazards.some((h) => h.slot === 'steam_a')) { o.say('Scalding steam blasts across the lever. You have to wait.'); o.ev('fail', 'lever_steam'); return; }
  const colors: ValveColor[] = ['red', 'green', 'blue', 'yellow'];
  const right = colors.filter((c) => s.valves[c] === P3_TRUE[c]).length;
  if (right === 4) {
    s.flags.lift_powered = true;
    o.sfx('manifold_right').fx({ kind: 'shake', strength: 5 }).say('The pipes shudder. Every gauge settles. PRESSURE NOMINAL. Far off, the lift hums awake.');
    solve(s, o, 'p3');
    o.warden(s.flags.saw_forged ? 'You saw through my records. Noted.' : 'Pressure restored. How... unexpected.', 'rattled');
  } else {
    fail(s, o, `manifold:${right}/4`);
    s.hazards.push({ slot: 'steam_a', until: s.t + 5000 });
    o.sfx('manifold_wrong', 'steam').fx({ kind: 'steam', slot: 'steam_a', ms: 5000 }, { kind: 'shake', strength: 3 });
    o.say(`Steam bursts from the manifold. ${right ? `${right} heavy clunk${right > 1 ? 's' : ''} from inside the pipes.` : 'Not a single clunk.'}`);
  }
  bump(s);
}

function hallSwitch(s: GameState, o: Out) {
  if (s.warden.override) { o.sfx('fail').warden('No. The lights stay on.', 'mocking'); o.ev('fail', 'override_held'); return; }
  const L = s.lights.hall;
  L.switchedOff = !L.switchedOff;
  o.sfx(L.switchedOff ? 'blackout' : 'lights_on').ev('use', `hall_lights:${L.switchedOff ? 'off' : 'on'}`);
  // Signature set piece: "It learned your trick"
  if (L.switchedOff && s.flags.lift_powered && !s.flags.setpiece_done) {
    s.flags.setpiece_done = true;
    let slot: BreakerSlot = 'camera';
    if (!s.breaker.camera) { s.flags.eye_rerouted = true; slot = 'cell_door'; }
    if (!s.breaker[slot]) {
      o.warden('Dark again. You have blinded me twice over. ...Clever.', 'rattled');
    } else {
      s.warden.override = slot; L.switchedOff = false;
      o.sfx('setpiece_slam').fx({ kind: 'shake', strength: 10 }, { kind: 'glitch', ms: 500 });
      o.warden('You like the dark. I noticed.', 'cold');
      if (slot === 'cell_door') o.warden('And I rerouted my eye through the cell circuit.', 'cold');
      o.ev('warden', 'setpiece', slot);
      s.tension = Math.min(100, s.tension + 15);
    }
  }
  bump(s); recompute(s);
}

function windowHall(s: GameState, o: Out) {
  const hallDark = s.lights.hall.level < 0.3;
  if (hallDark && s.breaker.archive_lights) {
    s.flags.knows_code = true;
    o.say(`Backlit by the archive, greasy finger-writing shows on the glass: ${P5_HALL_VIEW.map((g) => GLYPH_CHAR[g]).join(' ')}`);
    o.journal(`Window glyphs, as seen from the hall: ${P5_HALL_VIEW.map((g) => GLYPH_CHAR[g]).join(' ')}`);
    bump(s);
  } else if (hallDark) o.say('Dark on both sides. You can\'t make anything out.');
  else o.say('Just glass. The archive glows faintly beyond it.');
}

// ---------- P4 interview ----------
const Q_BANK: ((s: GameState) => Question | null)[] = [
  (s) => s.flags.got_bulb ? { prompt: 'What did you wrap your hand in to take my bulb?', options: ['Your sleeve', 'The blanket', 'Nothing'], correct: 1 } : null,
  (s) => {
    const slot = (['camera', 'archive_lights', 'cell_door', 'shutter'] as BreakerSlot[]).find((k) => s.flags[`pulled_first_${k}`]);
    if (!slot) return null;
    const opts = ['CAMERA', 'LIGHTS', 'CELL DOOR'];
    const idx = slot === 'camera' ? 0 : slot === 'archive_lights' ? 1 : 2;
    return { prompt: 'Which fuse did you pull first?', options: opts, correct: idx };
  },
  (s) => {
    const n = s.stats.fails.p3 ?? 0;
    const opts = [n, n + 2, Math.max(0, n - 1) === n ? n + 1 : n - 1].map(String);
    return { prompt: 'How many times did my manifold beat you?', options: opts, correct: 0 };
  },
  () => ({ prompt: 'Where did you wake up?', options: ['The machine hall', 'A cell', 'The archive'], correct: 1 }),
  (s) => ({ prompt: 'How many times have you asked me for help?', options: [String(s.stats.hints), String(s.stats.hints + 1), String(s.stats.hints + 3)], correct: 0 }),
];

function rotate(q: Question, k: number): Question {
  const n = q.options.length; const r = k % n;
  const options = q.options.map((_, i) => q.options[(i + r) % n]);
  return { ...q, options, correct: (q.correct - r + n) % n };
}

function nextQuestion(s: GameState): Question {
  for (let i = 0; i < Q_BANK.length; i++) {
    const idx = (s.interview.asked + i) % Q_BANK.length;
    const q = Q_BANK[idx](s);
    if (q) { s.interview.asked++; return rotate(q, s.interview.asked); }
  }
  return Q_BANK[3](s)!;
}

function intercom(s: GameState, o: Out) {
  if (s.flags.cage_open) { o.say('Static.'); return; }
  o.sfx('intercom');
  if (s.interview.asked === 0) o.warden('Before you leave, Subject 14, answer three questions. About yourself.');
  s.interview.q = nextQuestion(s);
  o.o.ask = s.interview.q;
}

/** Player answered the current interview question. */
export function answer(s: GameState, idx: number): Outcome {
  const o = new Out(s);
  const q = s.interview.q; s.interview.q = null;
  if (!q) return o.done();
  if (idx === q.correct) {
    s.interview.correct++;
    o.ev('use', 'interview:correct');
    if (s.interview.correct >= 3) {
      s.flags.cage_open = true; give(s, 'token');
      o.sfx('door_open', 'pickup').warden('Correct. You are exactly who I thought you were.', 'polite');
      o.say('The cage over the console swings open. A small token rattles out of a slot: a coin stamped W.');
      solve(s, o, 'p4');
    } else {
      o.warden(['Correct.', 'Correct again. Good.'][s.interview.correct - 1] ?? 'Correct.', 'polite');
      s.interview.q = nextQuestion(s); o.o.ask = s.interview.q;
    }
  } else {
    fail(s, o, 'interview:wrong');
    o.warden('No. I was there, Subject 14. I remember better than you do.', 'mocking');
    s.interview.q = nextQuestion(s); o.o.ask = s.interview.q;
  }
  bump(s);
  return o.done();
}

// ---------- pads ----------
export function pressPad(s: GameState, kind: 'keypad' | 'console' | 'file', sym: any): Outcome & { close?: boolean } {
  const o = new Out(s);
  o.sfx('keypad_beep');

  if (kind === 'file') {
    if (!s.fileEntry) s.fileEntry = [];
    s.fileEntry.push(sym);
    if (s.fileEntry.length < 3) return o.done();
    const entry = s.fileEntry;
    const target = (s.stats.lastVerbs ?? []).length === 3 ? s.stats.lastVerbs : ['WALK', 'LOOK', 'LOOK'];
    const ok = entry.every((v, i) => v === target![i]);
    o.ev('use', `file_pad:${entry.join('-')}`);
    if (ok) {
      s.flags.p7_solved = true;
      give(s, 'core_key');
      o.sfx('door_open', 'pickup').say('The dial lock clicks. Inside is a heavy brass key: the CORE KEY.');
      o.journal('Drawer 14 contained the CORE KEY.');
      solveExtra(s, o, 'p7');
      return { ...o.done(), close: true };
    }
    fail(s, o, `file_pad:${entry.join('-')}`);
    o.say('The dials reset.');
    return o.done();
  }

  if (kind === 'keypad') {
    s.keypadEntry.push(sym as Shape);
    if (s.keypadEntry.length < 4) return o.done();
    const ok = s.keypadEntry.every((x, i) => x === P1_CODE[i]);
    const entered = s.keypadEntry.map((x) => SHAPE_CHAR[x]).join(' ');
    s.keypadEntry = [];
    o.ev('use', `keypad:${entered}`);
    if (ok) {
      s.doors.cell_door.open = true;
      o.sfx('door_open').fx({ kind: 'shake', strength: 3 }).say('The lock clunks. The cell door slides open.');
      solve(s, o, 'p1');
      o.warden(s.t < 7 * 60000 ? 'Excellent, Subject 14. Thirteen took twice as long.' : 'Adequate. Thirteen was faster.', 'polite');
      return { ...o.done(), close: true };
    }
    fail(s, o, `keypad:${entered}`);
    o.say('The keypad buzzes red.');
    return o.done();
  }
  s.consoleEntry.push(sym as Glyph);
  if (s.consoleEntry.length < 5) return o.done();
  const entry = s.consoleEntry; s.consoleEntry = [];
  const str = entry.map((g) => GLYPH_CHAR[g]).join(' ');
  o.ev('use', `console:${str}`);
  if (entry.every((g, i) => g === P5_CODE[i])) {
    s.doors.lift.open = true; s.flags.p5_solved = true; s.flags.escaped = true;
    o.sfx('door_open', 'lift').fx({ kind: 'shake', strength: 6 }).say('The console flashes green. The lift doors part.');
    solve(s, o, 'p5');
    return { ...o.done(), close: true };
  }
  fail(s, o, `console:${str}`);
  if (entry.every((g, i) => g === P5_HALL_VIEW[i])) o.warden('You typed it exactly as you see it. Thirteen did not write it for you.', 'mocking');
  else o.say('The console buzzes. Rejected.');
  return o.done();
}

function solveExtra(s: GameState, o: Out, p: PuzzleId) { if (s.stats.solvedAt[p] === undefined) { s.stats.solvedAt[p] = s.t; o.ev('solve', p); } }

function mergeOut(o: Out, b: Outcome): Outcome {
  const a = o.done();
  return {
    lines: [...(a.lines ?? []), ...(b.lines ?? [])], sfx: [...(a.sfx ?? []), ...(b.sfx ?? [])],
    fx: [...(a.fx ?? []), ...(b.fx ?? [])], events: [...(a.events ?? []), ...(b.events ?? [])],
    journal: [...(a.journal ?? []), ...(b.journal ?? [])], ask: a.ask ?? b.ask, openPad: a.openPad ?? b.openPad,
  };
}

export const lineOf = (text: string, tone: Tone): Line => ({ speaker: 'warden', text, tone });
