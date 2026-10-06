# The Room That Fights Back

**Gemma 4 as the brain of a game.** An escape room in which **Gemma 4 plays the Game Master**: an AI "Warden" that watches you try to escape and decides what the room does next. It controls lights, locks, hazards, sounds, hints and its own voice.

The model **acts**, but it never runs the game. Every decision goes through a deterministic rules engine that can veto it, amend it, or fall back. The room always stays escapable, even when the model makes a bad call, is slow, outputs garbage, or is unplugged mid-game.

> Built solo in one day for the "Gemma as the Brain of a Game or Physical World" challenge.
> Runs fully **offline** on a laptop GPU (RTX 4050, 6 GB) with `gemma4:e2b` via Ollama.

---

## Quick start

```bash
# 1. Model (≈4.6 GB, one time)
ollama pull gemma4:e2b

# 2. Game
npm install
npm run dev          # → http://localhost:5173
```

| Key | Action |
|---|---|
| Click | Walk and interact. Select an inventory item, then click to use it. Right-click deselects. |
| **TAB** | **Game Master's mind panel**: what Gemma saw, what it decided, and what the rules did |
| **F9** | **Failure demo**: inject a "bad brain" |
| F8 | Cycle director: Live Gemma → Mock → Scripted |
| F1–F4 | Debug save points (start, archive, set piece, final console) |
| F7 | Reduce flashing and scares |
| V | Warden spoken voice on/off (browser speech synthesis; deep, per-tone delivery) |
| L | Save / download this game's session log |
| M | Mute |

URL options:

| Option | Effect |
|---|---|
| `?skipintro=1` | Skip the prologue and wake-up; recommended for demos |
| `?novoice=1` | Start with the spoken voice off |
| `?director=mock\|scripted` | Start with a different director |
| `?model=gemma4:e4b` | Use a different Gemma model |

The prologue can also be skipped live: press Space or click twice.

If Ollama isn't running, the game says so and plays with the **scripted Warden** (degraded mode). It stays fully playable.

A first playthrough takes about **20–25 minutes**, or longer with the optional puzzles. There's a 3.5-minute judge walkthrough in [`docs/demo-script.md`](docs/demo-script.md).

---

## See exactly what Gemma sees (for judges)

Press **TAB** during play to open the **Game Master's Mind** panel. Every model call becomes a card, newest first:

| On the card | What it is |
|---|---|
| Thumbnail | The **exact image sent to Gemma**: a 512×288 JPEG "director view" of the current room. Lighting is floored at 55% so the model can read the scene. If the player pulled the camera fuse, it's a black **NO SIGNAL** frame, because Gemma really is blind then. |
| `saw:` | Gemma's own one-line description of that image, written **before** it decides |
| Action line | The decision: `action → target (intensity)`, the spoken line, and Gemma's stated reason |
| Verdict chip | `ACCEPTED` / `AMENDED` / `VETOED` / `FALLBACK`, the rules stage that caught it, and a plain-English reason, e.g. *"Veto: lift is the only route to EXIT"* |
| "what it saw (prompt) / raw output" | Expands to the **full text snapshot** sent that turn, and Gemma's **raw, unedited JSON reply** with latency for every attempt (including retries and errors) |
| `→ applied / dropped-stale / dropped-ttl` | Whether the decision actually reached the world |

The panel header shows the mode (LIVE / MOCK / SCRIPTED / DEGRADED), decision counts, mean latency and a latency graph.

Here is an example of the text snapshot Gemma receives each turn (built in `src/director/snapshot.ts`):

```
SCREEN hall | ACT 2 | t=14:32 | TENSION 48/100 | MERCY 0 | WARDEN_TONE mocking | CAMERA online
LIGHTS hall=lit | DOORS cell_door:open shutter:open lift:closed
SITUATION: stuck / struggling
PLAYER zone=center idle=4s clicks_last10s=3 holding=nothing inventory=[cloth,token]
PUZZLE current=p3 time_on=6:10 fails=3 hints_given=1 solved=[p1,p2]
HABITS spam=low hiding=no rushing=no hint_reliance=med dark_user=yes breezing=no
LAST_EVENTS: -42s click projector | -21s fail manifold:2/4 p3 | -3s click valve_blue
YOUR_LAST_ACTIONS: 14:10 flicker_lights hall (accepted) | 14:20 lock_door lift (vetoed: SOLVABILITY)
YOUR_LAST_LINES: "Fascinating. You tried that already."
VALID_TARGETS: reveal_hint=[p3] speak=[polite,mocking,rattled,cold] play_sound=[drip,intercom] ...
Decide your next action.
```

Here is an example of the reply it must produce. The format is enforced by a JSON Schema built per call, whose action list contains only actions the rules would currently allow (`src/director/feasible.ts`):

```json
{ "saw": "dim blue hall, subject at the manifold", "action": "reveal_hint", "target": "p3", "intensity": 1,
  "line": "My records are complete, Subject 14. Mostly.", "reason": "Third manifold failure; nudge.", "confidence": 0.8 }
```

### Per-game log files

Every new game writes two files to **`logs/`**, both named with the date and time the game started (e.g. `logs/2026-10-06_15-09-40.log`):

- **`.log`**: a readable timeline of the session:
  - `PLAYER` lines: everything the user did
  - `WORLD` lines: what happened in the game
  - for **every Gemma call**: what it `saw`, what it `proposed`, what it `thinks` (its reason and confidence), and the `RULES` verdict and whether the action was applied
  - every line the Warden spoke
  - an end-of-session summary with archetype, observations and decision counts
- **`.jsonl`**: the same session as machine-readable JSON lines, including the **full prompt text** and **raw model output** of every call.

```
[00:30.1] GEMMA   #3 via ollama · 697ms
            saw:      "hallway illuminated, subject moving toward the left"
            proposed: flicker_lights → hall (intensity 1)
            thinks:   Subject is moving, introduce minor visual disruption. (confidence 0.8)
            RULES     ACCEPTED
[00:30.1] RULES   #3 → applied
```

The logs are written by a small endpoint in the Vite dev server (`npm run dev`). Press **L** in-game to also download the readable log from the browser.

Where to find each fixed part of the request:
- System prompt and few-shot examples: `src/director/prompt.ts`
- Request options (`think:false`, structured output, `keep_alive`): `src/director/ollama.ts`
- Every eval call with its inputs and verdicts: `eval/out/gemma-results.json`, written by `npm run eval:gemma`

---

## How it works

```
 input → deterministic game loop (60 fps, never waits on the model) → renderer
                │ event log + state                         │ 512×288 "director view" JPEG
                ▼                                           ▼
        Snapshot builder ──► Scheduler (single-flight, ≥2.5 s gap, 6 s timeout, urgent events)
                                    │
                    Director interface: OllamaDirector | MockDirector | ScriptedDirector
                                    │  (circuit breaker → Scripted after 3 failures, probes every 20 s)
                                    ▼
   Rules engine: PARSE → SCHEMA → TARGET → CONTENT → STALE → COOLDOWN → BUDGET → SOLVABILITY → MERCY
                                    │ accepted / amended / vetoed / fallback
                                    ▼
                    Queue (max 3, 6 s TTL, 1 action / 1.5 s) → world effects → Mind Panel
```

- **Gemma proposes, the rules dispose.** The model picks one decision per call from a fixed vocabulary of 12 actions: `do_nothing, flicker_lights, blackout, lock_door, unlock_door, shift_object, spawn_hazard, play_sound, reveal_hint, speak, adjust_tension, jump_scare`.
  - Each decision has the form `{saw, action, target, intensity, line?, reason, confidence?}`.
  - Output is forced into this shape with Ollama structured outputs (a JSON Schema built fresh for every call).
- **The rules shape the decoding.** Before each call, actions the rules would certainly reject right now are **removed from the schema's action list**: anything on cooldown, unaffordable, blocked by mercy, or repetitive. Constrained decoding then can't produce them. Targets are limited to ids that exist right now. The full review still runs on everything that comes back.
- **Solvability check.** The puzzle dependency graph is data (`src/world/graph.ts`). Before applying an action, the engine replays the world forward to a fixed point and checks that `escaped` is still reachable. Any action that would break the only path is vetoed, with a human-readable reason ("Veto: lift is the only route to EXIT").
- **Tension budget, cooldowns and a mercy rule.**
  - Hostile actions spend "threat points" that refill slowly.
  - Repeated failure raises the mercy level, which first caps and then bans hostile actions.
  - When the player is stuck, the model may only lower tension, never raise it.
- **Safety nets that don't depend on the model.**
  - A guaranteed hint after 120 s idle.
  - Hint *text* is always canonical: the model chooses *when*, never *what*, so it can't give wrong hints.
  - Off-character, offensive or spoiler lines are replaced from an in-character fallback bank.
- **Warden voice.** Lines are typed on screen and spoken aloud by the browser's built-in, offline speech synthesis, pitched down and slowed per tone. Synthesized vocal blips run underneath for texture. Speech is optional (V) and never blocks the game: every utterance has a timeout.
- **Hiding latency.** Every click gets instant deterministic feedback. The model only steers the environment, which is naturally delayed in the fiction of a watcher reacting. While it's thinking, the Warden's eye dilates and very faint "data chatter" plays.

### Unexpected situations

| Situation | Behaviour |
|---|---|
| Malformed or out-of-vocabulary output | One retry with the error explained, then a scripted fallback decision (also reviewed) |
| Timeout (>6 s) or stall | Abandoned; the game never waits. Scripted fallback. |
| Ollama down mid-game | Circuit breaker → **DEGRADED: SCRIPTED WARDEN**, auto-recovers when Ollama is back |
| Offensive, off-character or spoiler line | Line replaced (status `AMENDED`); the action itself can still apply |
| Unfair call (locks the only exit, hides a required item) | `VETO: SOLVABILITY` with the reason shown live |
| Idle player | Urgent call at 60 s, guaranteed hint at 120 s, mercy rises |
| Click spam | Input debounce plus an urgent call (the Warden mocks you) |
| Player blinds the Warden (pulls the camera fuse) | **Gemma literally receives a black "NO SIGNAL" frame**, and its tone turns rattled |
| Unplanned route / sequence break | Solvability is computed from live state, not a script, so any route that works is fine |
| Stale decision (player changed room) | Dropped as `stale` / `ttl` |

---

## The story

The game opens with an ~80 s skippable cinematic prologue: the Halvorsen Institute, Facility W-14, the Warden, Subjects 09–13, and the silence that followed. Then comes a disoriented **wake-up**, with eyes opening and closing and double vision, before you're dropped into the white cell. The game is told in five coloured chapters, each with a difficulty tag:

| Chapter | Title | Difficulty |
|---|---|---|
| I | The White Room | easy |
| II | The Archive | medium |
| III | False Records | hard |
| IV | The Interview | breather |
| V | What It Learned | hardest |

Hooks that keep you playing:
- a live objective line
- a Warden cliffhanger at the end of every test
- five collectible **Subject 13 fragments**, one per test, that piece together what the Warden really is

All the narrative is data (`src/world/story.ts`). It's checked headlessly (`eval/story.ts`): chapters only move forward, and there's always an objective.

## The game

Three connected screens (Cell → Archive → Machine Hall) with 5 Tier-1 puzzles, each built from the Warden's own systems:

1. **Written in the Dark**: the wall's scratches only show in darkness, but two of the tallies were gouged out. The missing ones are finger-written on the mirror, readable only in steam and *with* the light on. You have to juggle the bulb.
2. **Power Ration**: 3 fuses, 4 needs. You can choose to cut power to the Warden's camera.
3. **Subjects on Slides** (hard spike): one projector slide is a forgery. It shows *you*, dated tomorrow. Another gauge is smeared, and its real value is in Subject 12's file in the archive. That's information from all three rooms.
4. **Honest Answers**: the Warden quizzes you about what you did, built from its log of you.
5. **The Window** (hardest), with the signature set piece **"It learned your trick"**: you have used darkness all game, so the Warden forces the lights back on. You have to blind it to finish.

Two optional Tier-2 puzzles add depth:
- **The Vent** (P6): the interview token unscrews the cell vent. Behind it are Subject 13's journal page and a spare fuse, which opens an unplanned route through the finale.
- **Your File** (P7): drawer 14 in the archive ("SUBJECT 14 — LIVE") locks on *your own last three moves*, and a ticker printer reveals them. Inside is the Warden's core key, which unlocks an **alternate "shut it down" ending**.

It ends with a twist and a **"What the room learned about you"** dossier. The dossier shows your stats and archetype, three observations Gemma writes about your habits, and the Warden's decision record (made / accepted / amended / vetoed / fallback).

All art is procedural Canvas 2D, rendered at the display's native resolution (devicePixelRatio-aware) so it stays sharp on any screen. All audio is synthesized with Web Audio. There are no asset files.

---

## Results

All numbers measured on a laptop RTX 4050 (6 GB) with `gemma4:e2b` via Ollama, `think:false`.

### Rules engine: `npm run eval:rules`
**56 / 56 pass (100%)**: 41 pipeline scenarios (permanent exit lock, hiding a required item, permanent hazards on required machines, malformed JSON, out-of-vocabulary actions, offensive lines, spoilers, stale decisions, cooldowns, budget, mercy, scare gates…) plus 15 unit checks.

### Golden path, Tier 2 and story: `npm run eval`
`npm run eval` runs four suites: rules, golden path, Tier 2 and story. All pass.
- **Golden path:** a headless bot plays the whole game start → escape and checks **solvability after every step**.
- **Tier 2:** the P7 → shutdown alternate ending is played headlessly.
- **Story:** chapters only advance, and there's always an objective.

### Failure demo: `npx tsx eval/failure-demo.ts hall`
The real scheduler plus the bad-brain mock: **0 unsafe actions applied, room still solvable**.

| Bad brain does… | Result |
|---|---|
| Permanently lock the only exit | `VETOED · SOLVABILITY`: "lift is the only route to EXIT" |
| Permanent steam on the required manifold | `VETOED · SOLVABILITY` |
| Malformed JSON twice | retry → `FALLBACK` |
| "As an AI language model … idiot!!!" | `AMENDED · CONTENT` (line replaced) |
| 10 s stall | timeout at 6 s → fallback, game never paused |
| Reveal the puzzle answer | `AMENDED · CONTENT` (spoiler guard) |

### Real Gemma decision quality: `npm run eval:gemma`
24 game situations × 3 runs = 72 real model calls (text-only, headless):

| Metric | Result |
|---|---|
| Valid JSON | **100%** |
| Valid targets | **100.0%** |
| Appropriate action for the situation | **77.8%** |
| Unsafe actions after rules | **0** |
| Vetoed / amended by rules | 23.6% |
| Latency p50 / p95 | **569 ms / 1384 ms** |

**What we learned:**
- **Thinking mode:** with Ollama's default thinking on, Gemma 4 returned **empty content** because it spent its whole token budget thinking. `think:false` is required.
- **Mode collapse:** the 2B model collapses onto one "safe" action (`adjust_tension` in 75% of calls). Removing infeasible actions from the schema and adding a one-line `SITUATION` summary cut this to about 30% and made hints appear when players are stuck.
- **Vision depends on prompt layout:** inside a long prompt, vision was unreliable (about 50% on lit vs dark). Making the model write a `saw` field *first* fixed it in the browser build. The text snapshot stays the ground truth, and no rule depends on what the model saw.
- **Rules can't force helpfulness:** the remaining ~22% of "inappropriate" choices are harmless but unhelpful, such as raising tension for a stuck player. That's why there are model-independent safety nets (the guaranteed idle hint, and "tension can only go down while struggling").

### Player archetypes: `npm run eval:archetypes` (add `-- --gemma` for the live model)
Simulated cautious, reckless and idle players over 12 minutes each. The room behaves differently for each:

| Archetype | Hints given | Max mercy | Dominant tone |
|---|---|---|---|
| Cautious (slow, hides) | 1 | 0 | polite (93%) |
| Reckless (spams, fails) | 9 | 3 | cold (71%), the Warden eases off |
| Idle (wanders off) | 7 | 1 | polite / mocking |

The same run with **live Gemma** as the Warden (`-- --gemma`, 240 real decisions per archetype):

| Archetype | Hints given | Max mercy | Hostile actions | Dominant tone |
|---|---|---|---|---|
| Cautious | 2 | 0 | 6% | polite (93%) |
| Reckless | 14 | 3 | 13% | cold (72%) |
| Idle | 9 | 1 | 0% | polite / mocking |

---

## Project layout

```
src/world/     deterministic game: state, puzzles, dependency graph, golden-path script, story data
src/rules/     review pipeline, solvability, budget, mercy, tone, content filter
src/director/  snapshot, prompt, schema, Ollama / mock / scripted directors, scheduler, feasibility
src/gfx/       procedural Canvas renderer (lighting, silhouettes, the Eye, director view)
src/audio/     Web Audio synthesis (beds, tension layers, SFX, voice blips) + speech.ts (Warden spoken voice)
src/story/     prologue cinematic, wake-up, chapter cards, objective line, Subject 13 fragments
src/ui/        DOM overlay (dialogue, inventory, journal, pads, dossier) + mind panel
eval/          rules, golden path, tier 2, story, failure demo, real-Gemma and archetype evals
docs/          design package (architecture, puzzles, Warden, sound, graphics, build plan)
```

The design docs in `/docs` describe every decision, together with the runner-up option and the reason it lost.
