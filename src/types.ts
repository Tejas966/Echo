// Shared contract between all modules. FROZEN after Phase 0 — only the lead edits this file.
// Types plus the ACTIONS constant only. No DOM.

// ---------- ids ----------
export type ScreenId = 'cell' | 'archive' | 'hall' | 'exit';
export type ItemId = 'cloth' | 'bulb' | 'fuse' | 'token' | 'spare_fuse' | 'core_key';
export type DoorId = 'cell_door' | 'shutter' | 'lift';
export type BreakerSlot = 'camera' | 'archive_lights' | 'cell_door' | 'shutter';
export type ValveColor = 'red' | 'green' | 'blue' | 'yellow';
export type Shape = 'tri' | 'circle' | 'square' | 'cross'; // P1 keypad: ▲ ● ■ ✚
export type Glyph = 'L' | 'R' | 'DR' | 'DL' | 'HL' | 'HR'; // P5: ◀ ▶ ◢ ◣ ⌐ ¬ (L<->R, DR<->DL, HL<->HR mirror pairs)
export type Tone = 'polite' | 'mocking' | 'rattled' | 'cold';
export type PuzzleId = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7';
export type HazardSlot = 'steam_a' | 'steam_b' | 'sparks_archive';
export type MovableId = 'cloth' | 'stool' | 'bucket';
export type ScareId = 'face_window' | 'slam' | 'lights_face';

// ---------- world state ----------
export interface PlayerState {
  x: number;               // logical x in 0..1280 on current screen
  targetX: number | null;  // walking destination
  facing: 1 | -1;
  standingOn: 'cot' | null;
  holding: ItemId | null;  // item selected in inventory (cursor)
}

export interface WardenLock { until: number | 'perm' }

export interface DoorState { open: boolean; wardenLock?: WardenLock }

export interface LightState {
  level: number;                 // 0..1 ambient
  mode: 'on' | 'flicker' | 'off';
  until?: number;                // game ms when a Warden-caused flicker/blackout ends
  switchedOff?: boolean;         // player toggled (hall switch / missing bulb)
}

export interface Hazard { slot: HazardSlot; until: number | 'perm' }

export interface WardenState {
  tone: Tone;
  blind: boolean;              // camera fuse out (or override reroute case)
  lineHistory: string[];       // last lines spoken
  lastActions: AppliedLog[];   // last few Warden decisions with verdicts (for snapshot)
  override: null | 'camera' | 'cell_door'; // P5 set piece: which breaker slot holds the hall-light override
}

export interface AppliedLog { t: number; action: ActionName; target: string; status: VerdictStatus; stage?: VetoStage }

export interface GameState {
  v: number;                       // state version, ++ on every meaningful change
  t: number;                       // game ms since start
  screen: ScreenId;
  act: 1 | 2 | 3 | 4;              // 4 = breather (P4)
  player: PlayerState;
  inventory: ItemId[];             // 'fuse' may appear multiple times
  flags: Record<string, boolean>;  // puzzle progress — names match docs/02 §4 graph
  doors: Record<DoorId, DoorState>;
  objects: Record<MovableId, { anchor: string }>;
  lights: Record<ScreenId, LightState>;
  hazards: Hazard[];
  breaker: Record<BreakerSlot, boolean>; // fuse present?
  valves: Record<ValveColor, 1 | 2 | 3 | 4>;
  slide: number;                   // projector slide index shown (0 = none)
  keypadEntry: Shape[];
  consoleEntry: Glyph[];
  journal: string[];
  tension: number;                 // 0..100
  threat: number;                  // threat points pool 0..10
  mercy: { level: 0 | 1 | 2 | 3; since: number };
  warden: WardenState;
  puzzle: { current: PuzzleId; startedAt: number; fails: number; hints: number };
  stats: { fails: Record<string, number>; hints: number; clicks: number; solvedAt: Partial<Record<PuzzleId, number>> };
  scaresUsed: number;
  interview: { asked: number; correct: number; q: Question | null }; // P4 state (lead-only)
  ended: null | 'escaped' | 'shutdown';
}

// ---------- event log ----------
export type LogKind = 'click' | 'use' | 'take' | 'walk' | 'enter' | 'fail' | 'solve' | 'hint' | 'warden' | 'look' | 'idle';
export interface LogEvent { t: number; kind: LogKind; a: string; b?: string }

// ---------- Warden decisions ----------
export const ACTIONS = [
  'do_nothing', 'flicker_lights', 'blackout', 'lock_door', 'unlock_door', 'shift_object',
  'spawn_hazard', 'play_sound', 'reveal_hint', 'speak', 'adjust_tension', 'jump_scare',
] as const;
export type ActionName = typeof ACTIONS[number];
export type Intensity = 1 | 2 | 3;

export interface Decision {
  saw?: string;
  action: ActionName;
  target: string;
  intensity: Intensity;
  line?: string;
  reason: string;
  confidence?: number;
}

export type DirectorKind = 'ollama' | 'mock' | 'scripted';
export type DecisionSource = DirectorKind | 'fallback';

export type DirectorResult =
  | { ok: true; raw: string; decision: unknown; latencyMs: number }
  | { ok: false; raw?: string; error: 'timeout' | 'http' | 'parse' | 'unreachable' | 'aborted'; latencyMs: number };

export interface Snapshot {
  t: number;
  v: number;               // state version at capture
  screen: ScreenId;
  text: string;            // compact text block sent to the model
  image?: string;          // base64 JPEG (no data: prefix)
  validTargets: ValidTargets;
  urgent?: string;         // reason for an urgent call, e.g. 'solve', 'setpiece:dark'
}

export type ValidTargets = Record<ActionName, string[]>;

export interface Director {
  readonly kind: DirectorKind;
  decide(snap: Snapshot, signal: AbortSignal): Promise<DirectorResult>;
}

export type VerdictStatus = 'accepted' | 'amended' | 'vetoed' | 'fallback';
export type VetoStage =
  | 'PARSE' | 'SCHEMA' | 'TARGET' | 'CONTENT' | 'STALE' | 'COOLDOWN' | 'BUDGET' | 'SOLVABILITY' | 'MERCY';

export interface Verdict {
  status: VerdictStatus;
  stage?: VetoStage;           // stage that vetoed or amended
  detail?: string;             // human-readable reason (shown in Mind Panel)
  proposed: Decision | null;   // what the model proposed (null if unparseable)
  final: Decision | null;      // what will be applied (null if vetoed)
  source: DecisionSource;
}

/** Context the rules engine needs besides live state. */
export interface ReviewContext {
  now: number;                          // game ms
  snapshot: Snapshot;
  cooldowns: Record<string, number>;    // key -> game ms when last applied (key = action or action:target)
  lastHostileAt: number;
  consecutiveHostileVetoes: number;
}

// ---------- world outcomes (pure world -> presentation) ----------
export type Speaker = 'warden' | 'narrator' | 'subject13';

export interface Line { speaker: Speaker; text: string; tone?: Tone }

export type SfxCue =
  | 'hover' | 'click' | 'pickup' | 'success' | 'fail' | 'step'
  | 'door_open' | 'door_lock' | 'shutter' | 'flicker' | 'blackout' | 'lights_on'
  | 'steam' | 'sparks' | 'scrape' | 'manifold_wrong' | 'manifold_right' | 'valve_click'
  | 'hint' | 'scare' | 'setpiece_slam' | 'lift' | 'keypad_beep' | 'fuse_out' | 'fuse_in'
  | 'burn' | 'projector' | 'intercom' | 'drip' | 'footsteps_far' | 'typewriter';

export type FxEvent =
  | { kind: 'shake'; strength: number }
  | { kind: 'flash'; color: string; ms: number }
  | { kind: 'glitch'; ms: number }
  | { kind: 'scan' }                       // scan line sweep (decision applied)
  | { kind: 'scare'; id: ScareId }
  | { kind: 'transition'; to: ScreenId }
  | { kind: 'steam'; slot: HazardSlot; ms: number }
  | { kind: 'sparks'; slot: HazardSlot; ms: number }
  | { kind: 'reach'; x: number };

export interface Question { prompt: string; options: string[]; correct: number }

export interface Outcome {
  lines?: Line[];
  sfx?: SfxCue[];
  fx?: FxEvent[];
  events?: LogEvent[];
  ask?: Question;          // P4 interview
  openPad?: 'keypad' | 'console';
  journal?: string[];      // new journal entries (also pushed into state.journal by world)
}

// ---------- scene layout (shared between world hit-testing and gfx drawing) ----------
export interface Hotspot {
  id: string;
  screen: ScreenId;
  x: number; y: number; w: number; h: number;  // logical 1280x720 coordinates
  label: string;                                 // shown on hover
  walkX?: number;                                // where the player stands to interact (default: center x)
  visible?: (s: GameState) => boolean;           // hidden hotspots aren't clickable or drawn
}

// ---------- presentation module APIs (implemented by agents) ----------
/** Transient per-frame info the renderer needs that isn't game state. */
export interface FrameInfo {
  t: number;                 // real ms
  dt: number;                // seconds
  walking: boolean;
  reachingAt: number | null; // x the player is reaching toward
  hover: string | null;      // hovered hotspot id
  thinking: boolean;         // Gemma call in flight
  reduceFlashing: boolean;
}

export interface GfxAPI {
  /** Draw one frame. When opts.director is true, draw the 'director view' (docs/05 §3): ambient floored, no grain/vignette, player outlined. */
  render(ctx: CanvasRenderingContext2D, state: GameState, frame: FrameInfo, opts: { director: boolean; width: number; height: number }): void;
  fx(e: FxEvent): void;
}

export interface AudioAPI {
  init(): Promise<void>;          // call from a user gesture
  setScreen(s: ScreenId): void;
  setTension(t: number): void;    // 0..100
  sfx(cue: SfxCue, opts?: { volume?: number }): void;
  blip(tone: Tone): void;         // one typed character of Warden voice
  setThinking(on: boolean): void;
  setBlind(on: boolean): void;
  setMaster(v: number): void;     // 0..1
  setMuted(m: boolean): void;
  setReduceScares(on: boolean): void;
}

export interface EndReport {
  timeMs: number;
  escaped: boolean;
  archetype: 'cautious' | 'reckless' | 'idle' | 'methodical';
  habit: string;
  fuseChoice: BreakerSlot | 'none';
  stats: { label: string; value: string }[];
  observations: string[];          // 3 Warden observations
  decisions: { made: number; accepted: number; amended: number; vetoed: number; fallback: number; topAction: string; meanLatencyMs: number };
}

export interface UIAPI {
  /** Typewriter-print a line. Resolves when fully shown (+ short hold). onChar fires per char (for voice blips). */
  say(line: Line, onChar?: () => void): Promise<void>;
  setInventory(items: ItemId[], holding: ItemId | null, onSelect: (item: ItemId | null) => void): void;
  setJournal(entries: string[]): void;
  setHoverLabel(label: string | null, x: number, y: number): void;
  ask(q: Question): Promise<number>;
  openPad(kind: 'keypad' | 'console', onPress: (sym: Shape | Glyph) => void, onClose: () => void): void;
  closePad(): void;
  showTitle(onStart: () => void, opts: { modelStatus: string }): void;
  setModelStatus(text: string): void;
  showEnd(report: EndReport, onRestart: () => void): void;
  toast(text: string): void;
}
