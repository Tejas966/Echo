# The Room That Fights Back — project context

Hackathon entry for "Gemma as the Brain of a Game". A 2D point-and-click escape room (Silent Age style). **Gemma 4 plays the AI Warden** (the Game Master). Deadline **16:00 today**. Solo dev with Claude Code agents. The design docs live in `/docs` (01–06) and are the source of truth.

## Architecture principles (non-negotiable)
1. **Gemma is a director, not the engine.** The game loop, puzzles, and input are deterministic and fully playable without Gemma.
2. **Gemma proposes, the rules engine disposes.**
   - Pipeline: parse → validate (vocab + targets) → content filter → staleness → cooldown → tension budget → **solvability** → mercy → apply.
   - Every verdict is shown in the Mind Panel.
3. **Single-flight async loop.**
   - Minimum gap of 2.5 s between calls, 6 s timeout, urgent events can trigger an early call.
   - Decisions go to a queue: max 3, TTL 6 s, reviewed against the **live** state.
4. **Failure handling.**
   - Bad output → one retry → fallback from the scripted Warden.
   - 3 consecutive failures → circuit breaker switches to the scripted Warden and probes Ollama every 20 s.
5. **One `Director` interface** with `OllamaDirector`, `MockDirector` (scripted good and bad decisions), and `ScriptedDirector` (degraded mode).
6. **Pure logic stays DOM-free.** `world/`, `rules/`, `profile/`, and most of `director/` must run headless in Node for `eval/`.

## Stack
- TypeScript + Vite + Canvas 2D, with a DOM overlay for the UI. Web Audio for all sound. No external art.
- Ollama runs locally with `gemma4:e2b` (`e4b` as an option). The Vite proxy maps `/ollama` to `127.0.0.1:11434`.
- Requests use `format` = JSON Schema, **`think: false` (mandatory — with thinking on, content comes back empty)**, `keep_alive: "30m"`, and a 512×288 JPEG "director view" (lighting floored at 55%).
- Spike results: warm p50 ~0.75 s, JSON 100% valid. **Vision is unreliable inside the long prompt**, so the text snapshot is ground truth and the image is only for flavour and the `saw` field. Never make rules depend on what the model saw.

## Action vocabulary (fixed, 12)
`do_nothing`, `flicker_lights`, `blackout`, `lock_door`, `unlock_door`, `shift_object`, `spawn_hazard`, `play_sound`, `reveal_hint`, `speak`, `adjust_tension`, `jump_scare`

Decision format: `{saw, action, target, intensity:1|2|3, line?, reason, confidence?}` (`saw` comes first). Any action may carry a `line`. Limits for each action are in docs/01 §4.

## Scope tiers
- **Tier 1 (must ship):**
  - 3 screens (cell, archive, hall) and P1–P5.
  - The signature set piece ("It learned your trick").
  - The full director, rules, and mock pipeline.
  - The Mind Panel, the live failure demo, an eval set of 20–30 scenarios, 3 archetype bots, and the "What the room learned about you" end screen.
- **Tier 2:** P6 Vent (unplanned route, journal lore), P7 Your File (alternate ending), the twist expanded.
- **Tier 3:** Loop/rewind (P8), extra polish.
- **Cut order if behind:** Tier 3 → P7 → P6 → jump scares → extra audio layers. **Never cut:** the rules engine, the Mind Panel, the failure demo, or the eval set.

## Working conventions
- No two agents edit the same directory at the same time. Each agent owns specific folders (see docs/06).
- The puzzle dependency graph is data (`src/world/graph.ts`, mirroring docs/02 §4). Change the data, not the checker.
- Every Warden-facing id (doors, hazard slots, movables, scares, sound cues, puzzles) is defined once in `src/director/vocabulary.ts`.
- Commit at every checkpoint. `npm run eval` must pass before a commit is pushed.
- Keep Warden lines ≤120 characters and in character. Fallback lines live in `src/director/scripted.ts`.

## Commands & status (updated 11:55)
- `npm run dev` runs the game (Ollama must be serving `gemma4:e2b`). `npm run typecheck`.
- Evals:
  - `npm run eval` (rules + golden path, must pass before push)
  - `npm run eval:gemma` (real model, about 1 min)
  - `npm run eval:archetypes [-- --gemma]`
  - `npx tsx eval/failure-demo.ts hall`
- Tier 1 is complete and play-tested end to end with live Gemma: P1–P5, the set piece, twist, dossier, Mind Panel, F9 failure demo, degraded mode, and evals.
- `src/director/feasible.ts` removes rule-infeasible actions from the JSON schema before each call. This is the main fix for e2b's tendency to repeat the same action.
- Dev-only pages: `/src/audio/test.html`, `/src/gfx/preview.html`, `/src/ui/dev.html`.
