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
| M | Mute |

URL options: `?director=mock|scripted`, `?model=gemma4:e4b`.
If Ollama isn't running, the game says so and plays with the **scripted Warden** (degraded mode). It stays fully playable.

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

1. **Written in the Dark**: the light never goes off… unless you take the bulb.
2. **Power Ration**: 3 fuses, 4 needs. You can choose to cut power to the Warden's camera.
3. **Subjects on Slides** (hard spike): one projector slide is a forgery. It shows *you*, dated tomorrow.
4. **Honest Answers**: the Warden quizzes you about what you did, built from its log of you.
5. **The Window** (hardest), with the signature set piece **"It learned your trick"**: you have used darkness all game, so the Warden forces the lights back on. You have to blind it to finish.

It ends with a twist and a **"What the room learned about you"** dossier. The dossier shows your stats and archetype, three observations Gemma writes about your habits, and the Warden's decision record (made / accepted / amended / vetoed / fallback).

All art is procedural Canvas 2D and all audio is synthesized with Web Audio. There are no asset files.

---

## Results

All numbers measured on a laptop RTX 4050 (6 GB) with `gemma4:e2b` via Ollama, `think:false`.

### Rules engine: `npm run eval:rules`
**56 / 56 pass (100%)**: 41 pipeline scenarios (permanent exit lock, hiding a required item, permanent hazards on required machines, malformed JSON, out-of-vocabulary actions, offensive lines, spoilers, stale decisions, cooldowns, budget, mercy, scare gates…) plus 15 unit checks.

### Golden path: `npm run eval:golden`
A headless bot plays the whole game start → escape and checks **solvability after every step**: PASS.

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
- **Rules can't force helpfulness:** the remaining 19% of "inappropriate" choices are harmless but unhelpful, such as raising tension for a stuck player. That's why there are model-independent safety nets (the guaranteed idle hint, and "tension can only go down while struggling").

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
src/world/     deterministic game: state, puzzles, dependency graph, golden-path script
src/rules/     review pipeline, solvability, budget, mercy, tone, content filter
src/director/  snapshot, prompt, schema, Ollama / mock / scripted directors, scheduler, feasibility
src/gfx/       procedural Canvas renderer (lighting, silhouettes, the Eye, director view)
src/audio/     Web Audio synthesis (beds, tension layers, SFX, Warden voice blips)
src/ui/        DOM overlay (dialogue, inventory, journal, pads, dossier) + mind panel
eval/          rules, golden path, failure demo, real-Gemma and archetype evals
docs/          design package (architecture, puzzles, Warden, sound, graphics, build plan)
```

The design docs in `/docs` describe every decision, together with the runner-up option and the reason it lost.
