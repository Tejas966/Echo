# 01 — Approach & Architecture

Status: DRAFT for approval · Owner: Tejas · Deadline 16:00

## 0. Decisions at a glance

| Decision | Chosen | Runner-up | Why |
|---|---|---|---|
| Stack | **TypeScript + Vite + Canvas 2D, DOM overlay for UI** | Phaser 3 | Zero framework learning curve, `canvas.toDataURL` is trivial, game logic stays pure TS so it runs headless in Node for evals. Phaser's scene/asset system buys little when all art is procedural. |
| Model host | **Local Ollama, `gemma4:e2b`** (try `e4b` in the spike) | Gemini API | No network/rate-limit risk in demo, judges see it run offline. `e2b` (~4.6 GB) fits the 6 GB RTX 4050; `e4b` (~6.6 GB) will partly spill to CPU and be slower. Decide by the spike numbers. |
| Browser → Ollama | **Vite dev-server proxy `/ollama → http://127.0.0.1:11434`** | `OLLAMA_ORIGINS` env var | No CORS config on the user's machine, one-line setup. |
| Decisions per call | **1 decision per call** (an action + optional voice line) | Batched list of 2–3 | Small model, cleaner validation, cleaner mind panel. |
| Output enforcement | **Ollama `format` = JSON Schema (constrained decoding) + our own validator** | Prompt-only JSON | Constrained decoding makes malformed JSON rare; the validator still catches semantic errors (bad targets, stale, unsafe). |
| Call cadence | **Single-flight loop, min gap 2.5 s, plus event-triggered early calls** | Fixed 3 s timer | Never queues up behind a slow model; important events get fast reactions. |
| Screenshot | **512×288 JPEG q≈0.6, "director view" render, only at call time** | Every frame / full-res | ~15–25 KB, cheap prefill, still readable. |

## 1. Approaches evaluated

| Criterion | **TS + Canvas (chosen)** | Phaser 3 | DOM/SVG |
|---|---|---|---|
| Time to first playable | Fast (we write ~300 lines of engine) | Fast but framework friction | Fastest for static scenes |
| Procedural lighting / fog / grain | Full control (composite ops, gradients) | Good (needs WebGL pipelines for fancy) | Weak (CSS filters, slow) |
| Screenshot for Gemma | `offscreen.toDataURL('image/jpeg')` | Same, via renderer snapshot (async) | Needs html2canvas — slow & lossy |
| Headless eval in Node | Yes — logic modules are DOM-free | Awkward (logic tends to live in scenes) | Awkward |
| Deploy (GitHub repo) | `npm i && npm run dev` | Same | Same |

## 2. Module breakdown & data flow

```
            ┌──────────── deterministic, 60 fps, never waits on Gemma ───────────┐
 input ──► GameLoop ──► World (state, puzzles, items, doors) ──► Renderer ──► canvas
   │           │                       ▲                          │
   │           ▼                       │ apply()                  │ captureDirectorView()
   │       EventLog ──────┐            │                          ▼
   │                      ▼            │                   512×288 JPEG
   │               SnapshotBuilder ◄───┼──────────────────────────┘
   │                      │            │
   │                      ▼            │
   │            DirectorScheduler (single-flight, min gap 2.5 s, timeout 6 s)
   │                      │            │
   │           Director interface      │
   │   ┌───────────┬──────┴─────┬──────┘
   │   ▼           ▼            ▼
   │ OllamaDir   MockDir    ScriptedDir      (+ CircuitBreaker picks which)
   │   └───────────┴─────┬──────┘
   │                     ▼   RawDecision (+ raw text, latency)
   │              RulesEngine.review()   ── parse → validate → filter → stale →
   │                     │                  cooldown → budget → solvability → mercy
   │                     ▼
   │              DecisionQueue (max 3, newest wins, TTL 6 s)
   │                     ▼
   │              EffectsRunner (lights, doors, audio, dialogue)  ──► World
   │                     │
   └──────────────► MindPanel (what it saw / said / verdict / latency / mode)
```

Folder structure:

```
/src
  main.ts                 boot, wires everything
  engine/   loop.ts input.ts time.ts                (pure-ish; time injectable for headless)
  world/    state.ts screens.ts objects.ts puzzles.ts graph.ts verbs.ts
  director/ types.ts vocabulary.ts schema.ts prompt.ts snapshot.ts capture.ts
            ollama.ts mock.ts scripted.ts scheduler.ts breaker.ts
  rules/    review.ts solvability.ts budget.ts cooldowns.ts mercy.ts filter.ts
  effects/  runner.ts
  gfx/      renderer.ts lighting.ts particles.ts silhouettes.ts warden-eye.ts
  audio/    mixer.ts beds.ts sfx.ts voice.ts
  ui/       dialogue.ts inventory.ts mind-panel.ts end-screen.ts title.ts
  profile/  habits.ts learned.ts                    (player profile + end screen data)
/eval       scenarios/*.json  run-rules.ts  run-gemma.ts  archetypes.ts
/docs       01..06
```

Rule: `world/`, `rules/`, `director/` (except `capture.ts`, `ollama.ts` fetch), `profile/` must not touch DOM/Canvas/Audio — so `eval/` can import them in Node.

## 3. Director interface

```ts
interface Director {
  readonly kind: 'ollama' | 'mock' | 'scripted';
  decide(snap: Snapshot, signal: AbortSignal): Promise<DirectorResult>;
}
type DirectorResult =
  | { ok: true;  raw: string; decision: unknown; latencyMs: number }
  | { ok: false; raw?: string; error: 'timeout'|'http'|'parse'|'unreachable'; latencyMs: number };
```

- **OllamaDirector**: `POST /ollama/api/chat`, `stream:false`, `format: <schema>`, `keep_alive: "30m"`, `options:{temperature:0.6, num_predict:120, num_ctx:4096}`, image in `messages[].images` (base64, no prefix). Warm-up call on title screen.
- **MockDirector**: replays a script of decisions (good + deliberately bad: permanent exit lock, out-of-vocab action, malformed JSON, offensive line, 10 s stall). Selected by `?director=mock` or the mind-panel toggle.
- **ScriptedDirector**: deterministic heuristics over the snapshot (idle → hint, spam → flicker + mocking line, solved → polite line…). It is the degraded mode and the fallback source.
- **CircuitBreaker**: 3 consecutive failures → switch to Scripted, show "WARDEN: DEGRADED" in panel; probe Ollama every 20 s; recover on first success.
- **Retry policy**: parse/validation failure → **one** immediate retry with an appended "Your last reply was invalid: <reason>. Reply with valid JSON only." If that fails → fallback decision from ScriptedDirector (tagged `source:"fallback"`). Timeout (6 s) → no retry, fallback.

## 4. Action vocabulary (12, fixed)

| # | action | target | intensity (1–3) meaning | Hard limits (rules layer) |
|---|---|---|---|---|
| 1 | `do_nothing` | `-` | — | always allowed |
| 2 | `flicker_lights` | screen id | duration 1/2/4 s | ≤3 Hz flicker; cooldown 8 s |
| 3 | `blackout` | screen id | 3/6/10 s | cooldown 25 s; never during dialogue input |
| 4 | `lock_door` | door id | 10 s / 25 s / **permanent** | solvability check; cooldown 30 s |
| 5 | `unlock_door` | door id | — | only Warden-locks; puzzle locks untouchable |
| 6 | `shift_object` | movable id | to anchor A/B/C | target anchor must be reachable (solvability) |
| 7 | `spawn_hazard` | hazard slot id | 5/10/20 s | never on player's tile; solvability for 3 |
| 8 | `play_sound` | sound cue id | volume tier | cooldown 4 s per cue |
| 9 | `reveal_hint` | puzzle id | hint tier 1/2/3 | tier ≤ allowed by mercy state; cooldown 45 s |
| 10 | `speak` | tone: `polite`/`mocking`/`rattled`/`cold` | — | line required; filter; cooldown 6 s |
| 11 | `adjust_tension` | `up`/`down` | step size 5/10/15 | clamped by budget & mercy |
| 12 | `jump_scare` | scare id | — | tension ≥ 60, cooldown 180 s, max 3/game, not within 20 s of a hint |

Every action may carry an optional `line` (the Warden says it while acting). `speak` is just "line with no world effect".

## 5. Output JSON Schema (sent to Ollama as `format`)

Built **per call** so `target` enums contain only ids valid right now (current screen's doors, hazard slots, unsolved puzzles…).

```json
{
  "type": "object",
  "properties": {
    "action":     { "enum": ["do_nothing","flicker_lights","blackout","lock_door","unlock_door","shift_object","spawn_hazard","play_sound","reveal_hint","speak","adjust_tension","jump_scare"] },
    "target":     { "type": "string" },
    "intensity":  { "enum": [1,2,3] },
    "line":       { "type": "string", "maxLength": 120 },
    "reason":     { "type": "string", "maxLength": 100 },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
  },
  "required": ["action","target","intensity","reason"]
}
```

(We keep `target` a string in the schema and check it against the per-action valid set ourselves; a cross-field `oneOf` makes small models stumble.)

## 6. State model

```ts
interface GameState {
  v: number;                       // stateVersion, ++ on every meaningful change
  t: number;                       // game ms
  screen: 'cell'|'archive'|'hall'|'exit';
  player: { x: number; zone: string; standingOn?: string };
  inventory: ItemId[];
  flags: Record<string, boolean>;  // puzzle progress (see 02 graph)
  doors: Record<DoorId, { puzzleLocked: boolean; wardenLock?: { until: number | 'perm' } }>;
  objects: Record<ObjId, { anchor: string; visible: boolean }>;
  lights: Record<ScreenId, { level: number; mode: 'on'|'flicker'|'off' }>;
  hazards: { slot: string; until: number }[];
  breaker: Record<'camera'|'archive_lights'|'shutter'|'cell_door', boolean>;
  tension: number;                 // 0..100
  mercy: { level: 0|1|2|3; since: number };
  warden: { tone: Tone; blind: boolean; lastActions: AppliedAction[] };
}
```

## 7. Event log & snapshot (what Gemma gets)

Event log entry: `{ t, kind: 'click'|'use'|'take'|'walk'|'enter'|'fail'|'solve'|'hint'|'warden', a: string, b?: string }`. Ring buffer of 200; snapshot takes the **last 10**, rendered as terse lines.

Snapshot (text part, target ≤ 400 tokens):

```
SCREEN archive | ACT 2 | t=14:32 | TENSION 48/100 | MERCY 0 | WARDEN_TONE mocking | CAMERA online
PLAYER zone=projector idle=4s clicks_last10s=3 screens_visited=cell,archive
PUZZLE current=p3_projector time_on=6m10s fails=3 hints_given=1
HABITS spam=low hides=no rushes=no hint_reliance=med dark_user=yes
LAST_EVENTS:
 -42s take bulb | -30s use bulb projector | -21s fail valve_order | -9s click slide_3 | -3s click slide_3
YOUR_LAST: 14:10 flicker_lights archive (applied) | 14:20 lock_door shutter perm (VETOED: breaks escape path)
VALID_TARGETS: doors=[shutter,cell_door] hazards=[steam_a] objects=[stool] puzzles=[p3] scares=[face_window]
```

Plus the image. If `breaker.camera === false` the image sent is a black frame with static ("the Warden is blind") — the player's choice literally blinds the model.

## 8. Screenshot capture

- **Director view**: re-render the current scene into a 512×288 offscreen canvas **with lighting floored at 55 %** (darkness drawn as a blue tint, not black), no UI, no grain, player drawn with a thin white outline. The player sees moody darkness; Gemma still reads the room. This is deliberate and shown in the mind panel ("what it saw").
- Cost: render ~2 ms + `toDataURL('image/jpeg', 0.6)` ~5–10 ms, only once per call (~every 2.5–4 s). ~20 KB base64.
- Image tokens: fixed per image by the model's vision encoder (Gemma 3 used 256; **verify Gemma 4 in spike**).

## 9. Scheduler & queue

```
loop:
  if inFlight or now - lastReturn < 2500ms and !urgentEvent: wait
  snap = buildSnapshot(state, log); img = capture()
  res  = await race(director.decide(snap), timeout 6000)
  verdict = rules.review(res, liveState)      // reviews against LIVE state, not the snapshot
  if verdict.accepted: queue.push(verdict.action)
  panel.show(snap, img, res, verdict)
```

- Urgent events (puzzle solved, 3rd consecutive fail, screen change, 60 s idle) set `urgentEvent` → call skips the 2.5 s gap if nothing is in flight.
- Queue: max 3, TTL 6 s from snapshot time, one action executed per 1.5 s so effects don't stack. Decision targeting a screen the player has left → dropped as `stale`.

## 10. Latency budget (estimates — the spike replaces these with measured numbers)

| Stage | e2b, warm | Notes |
|---|---|---|
| Snapshot + capture + encode | 10–20 ms | |
| HTTP via Vite proxy | <5 ms | localhost |
| Prefill (image + ~600 text tokens) | 300–800 ms | GPU |
| Decode (~60 output tokens) | 0.8–1.5 s | ~50–80 tok/s expected |
| Rules review incl. solvability | <2 ms | fixed-point over ~30 steps |
| **Total** | **~1.2–2.5 s** | Cold load 5–15 s → warm-up on title screen, `keep_alive 30m` |

**How we hide it**: (1) every click gets instant deterministic feedback — Gemma is never in the interaction path; (2) the Warden's eye animates "observing → deciding" while a call is in flight; (3) environment reactions are naturally delayed in fiction (a watcher reacting); (4) ambient scripted bed (drones, distant machinery) always runs; (5) typewriter text gives a speak action 1–3 s of visible life.

## 11. Ollama setup (process)

1. You already have Ollama 0.35.1 installed. Pull the model (≈4.6 GB): `ollama pull gemma4:e2b`. Optional comparison: `ollama pull gemma4:e4b` (≈6.6 GB). If pull says the model needs a newer version, update Ollama from ollama.com first.
2. Smoke test: `ollama run gemma4:e2b "Reply with the word ready."`
3. Keep it hot: the game sends `keep_alive:"30m"`; nothing else needed. Close other GPU apps during the demo.
4. The game calls `http://localhost:5173/ollama/api/chat`; Vite proxies to `127.0.0.1:11434`. No env vars.

## 12. Spike RESULTS (11:25, gemma4:e2b, RTX 4050)

| Metric | Result | Consequence |
|---|---|---|
| Default (thinking on) | content **empty** — all 120 tokens spent in `message.thinking`; cold load 112 s | **`think: false` is mandatory** in every request |
| Warm latency, `think:false` | **p50 ≈ 0.7–0.8 s, p95 ≈ 1.0 s**; cold ≈ 1.2 s after load | Way inside budget. Keep 2.5 s min gap (pacing, not latency, is the limit). Warm-up call on title screen still needed (first load is slow). |
| JSON validity (format=schema) | **22/22 valid**, all in-vocab | Retry path is rarely hit → failure demo must use MockDirector to show it. |
| Prompt size | 424–431 tokens incl. image (image ≈ 80–90 tokens) | Cheap; we can afford few-shots. |
| Vision, asked directly | Correct (dark bg + green glowing marks vs beige room) | Encoder works. |
| Vision inside decision prompt | **unreliable: 4–6/10** on lit vs dark, even with a `saw`-first field | **Image is NOT trusted for state.** Text snapshot is ground truth; image is used for flavour + the `saw` field shown in the Mind Panel. Rules never depend on vision. |
| Action diversity | collapses (`adjust_tension` ×12 with invalid target `cell`) without few-shots | Few-shots + `YOUR_LAST` actions + "don't repeat" rule + TARGET stage catches bad targets; ScriptedDirector covers. |

Schema change: add `saw` (string ≤80) as the **first** property (model fills it first → doubles as "what it saw").
Optional: `gemma4:e4b` may see better; it needs a 6.6 GB pull and spills past 6 GB VRAM. Swap behind the same interface only if pulled in the background and measured better.

## 12b. Original spike proposal

`/spike/ping.mjs` (Node, deleted afterwards): sends one 512×288 JPEG + a ~400-token snapshot with the schema above to `gemma4:e2b` 10×, prints: JSON validity, in-vocab rate, p50/p95 latency, image token count (from `prompt_eval_count`), and whether it notices an obvious visual change (lights off vs on). Repeat for `e4b` if pulled. Outcome decides model + call cadence.
