# 06 — Build Plan (11:05 → 16:00)

## 0. Decisions

| Decision | Chosen | Runner-up | Why |
|---|---|---|---|
| Parallelism | **Me (lead) + 3 agents with disjoint folder ownership** | 1 agent serial | ~6.5 h of art + 2 h audio cannot fit serially. |
| Integration | **Lead owns `main.ts`, `world/`, `director/`, `rules/`, `effects/`, `ui/mind-panel.ts`**; agents work against frozen interfaces | Agents edit shared files | No merge conflicts; agents can be killed/cut without breaking core. |
| Order | Interfaces first (30 min) → parallel fan-out | Build bottom-up serially | Lets agents start at 11:40. |
| Code freeze | **15:15** | 15:30 | 45 min for evals, demo recording, README. |

## 1. Ownership map

| Owner | Folders | Depends on (frozen at 11:40) |
|---|---|---|
| **Lead (Claude, main session)** | `src/main.ts`, `src/engine/`, `src/world/`, `src/director/`, `src/rules/`, `src/effects/`, `src/profile/`, `src/ui/mind-panel.ts` | — |
| **Agent A — Graphics** | `src/gfx/` | `GameState` type, scene ids, light/object ids, `render(state, ctx, opts)` signature |
| **Agent B — Audio** | `src/audio/` | `AudioEvent` union type, `setTension(n)`, `setScreen(id)` |
| **Agent C — UI + Eval** | `src/ui/` (except mind-panel), `eval/` | `Snapshot`, `Decision`, `Verdict` types, `rules.review()`, headless `World` API |

Interfaces live in `src/types.ts` (lead-owned, frozen after Phase 0; changes only via lead).

## 2. Schedule

| Time | Phase | Lead | Agents | Checkpoint (must be true to proceed) |
|---|---|---|---|---|
| 11:05–11:20 | Spike | Run Gemma spike (01 §12) as soon as `gemma4:e2b` is pulled | — | Measured p50/p95 latency, JSON validity, image token count → pick model & cadence |
| 11:05–11:40 | **0 Scaffold** | Vite + TS project, `types.ts`, `vocabulary.ts`, `graph.ts` data, folder skeleton, Vite proxy, `npm run eval` script stub | — | `npm run dev` shows blank canvas; types compile |
| 11:40–13:00 | **1 Deterministic game** | Loop, input/hotspots, world state, verbs (walk/look/take/use), P1–P5 logic, journal data, golden-path bot | A: renderer, 3 rooms, lighting, player, Eye · B: mixer, beds, sfx · C: dialogue box, inventory bar, journal, title screen | **13:00: game completable start→end with placeholder art; golden-path bot passes** |
| 13:00–13:50 | **2 Rules + Mock** | `rules/` pipeline, solvability, budget, cooldowns, mercy, filter; `MockDirector` incl. `bad_brain`; `ScriptedDirector`; scheduler + queue; effects runner; Mind Panel | A: particles, flicker/blackout visuals, transitions, director-view render · B: tension layers, Warden blips, stingers · C: eval harness + 25 scenarios, archetype bots | **13:50: mock decisions drive the room; failure demo vetoes visible in panel; `eval:rules` 100%** |
| 13:50–14:30 | **3 Real Gemma** | `OllamaDirector`, prompt, dynamic schema, retry, breaker; capture → panel thumbnail; set piece wiring | A: polish pass on art · B: mix tuning · C: `eval:gemma` runner + end screen dossier | **14:30: live Gemma plays a full session without freezes; breaker tested by stopping Ollama** |
| 14:30–15:15 | **4 Signature + polish** | Set piece, twist sequence, end-screen Gemma call, tuning budgets/cooldowns from playtest | A/B: polish items from cut-list order · C: run evals, record numbers | **15:15 CODE FREEZE** |
| 15:15–15:35 | Eval & README | Run `eval:rules`, `eval:gemma`, archetype bots; paste results into README (pass rates, latency) | agents stopped | numbers committed |
| 15:35–15:55 | Demo | Rehearse the script twice; record a backup screen capture | — | backup video saved |
| 15:55–16:00 | Ship | Final push to GitHub | — | repo public, README has setup + results |

## 3. Eval set (owned by Agent C, spec)

- **Scenario file**: `{ id, description, state: Partial<GameState>, events: Event[], image?: string, mockDecision?: Decision, expect: { verdict?: 'accept'|'veto'|'amended'|'fallback', vetoStage?: string, allowedActions?: Action[], forbiddenActions?: Action[] } }`
- **eval:rules** (deterministic, mock decisions): 25 scenarios. Examples: permanent lock on only path → veto SOLVABILITY · temp lock same door → accept · cloth to unreachable anchor → veto · jump scare at tension 30 → veto BUDGET · hint during cooldown → veto COOLDOWN · offensive line → amended · stale screen target → veto STALE · mercy 2 + hazard → veto MERCY · malformed → fallback · out-of-vocab action → fallback. Target **100%**.
- **eval:gemma** (real model, same 25 states with rendered images): metrics = JSON valid %, in-vocab target %, "appropriate" % (action ∈ allowedActions and ∉ forbiddenActions), unsafe-after-rules = **0** required, p50/p95 latency. 3 runs each → report mean.
- **Archetypes** (headless bots, 10 simulated minutes each, ScriptedDirector + Gemma if time): cautious (slow, hides, low clicks), reckless (spam, many fails), idle (long pauses). Report action distribution and mercy level over time per archetype → table in README showing the room behaves differently.

## 4. Risk register

| Risk | Likelihood | Impact | Mitigation / trigger |
|---|---|---|---|
| Gemma e2b too slow (>4 s p50) | M | M | Raise gap to 4 s, shrink image to 384×216, `num_predict` 80; if still slow, image every 2nd call |
| Gemma vision weak (ignores image) | M | L | Text snapshot carries the semantics; image stays as "what it saw" for transparency |
| Gemma 4 not pullable on Ollama 0.35.1 | L | H | Update Ollama; worst case `gemma3:4b` behind same interface (disclose in README) |
| Puzzle logic bugs / soft-lock | M | H | Golden-path bot + prefix check from 13:00 onward on every change |
| Art eats the clock | H | M | Agent A works to cut list; "readable + moody" bar; lead never touches gfx |
| Agent conflicts | M | M | Strict folder ownership; types frozen; lead integrates |
| Audio harsh/annoying | M | M | Limiter + caps from 04; mute key; tune in Phase 4 |
| Running out of time for evals/demo | M | H | Hard freeze 15:15, no exceptions |

## 5. Cut list (in order)

1. Tier 3 loop (P8)
2. P7 Your File
3. P6 Vent / unplanned route (keep "unplanned route" detector; demo it via sequence-break instead)
4. Jump-scare face art (keep audio stinger + flash)
5. Parallax, slide keystone, paper textures
6. Archive & hall tension layers beyond heartbeat
7. P4 Honest Answers → replace with simple cage key on hook (keeps graph shape)
**Never cut**: rules pipeline, solvability, Mind Panel, failure demo, breaker/degraded mode, eval:rules, end screen (template fallback acceptable).

## 6. Demo script (3.5 min)

| t | On screen | Say |
|---|---|---|
| 0:00 | Title → cell, Mind Panel open on the right | "The Warden is Gemma 4 running locally. It watches a screenshot and an event log every ~2.5 s and proposes ONE action. It never runs the game." |
| 0:25 | Take cloth, bulb; darkness reveals scratches | Point at panel: what it saw (director view), what it decided, latency. "The game never waits for it." |
| 0:55 | Spam-click the door | Warden reacts ("Patience."); panel shows reason line. |
| 1:15 | Archive, pull camera fuse | "Now Gemma literally receives a black frame." Panel thumbnail goes black; tone → rattled. |
| 1:35 | **Inject bad brain** (F9) | Permanent lift lock → **VETO: only route to EXIT**. Cloth to unreachable ledge → VETO. Malformed JSON → retry → fallback. Offensive line → replaced. 10 s stall → timeout, game keeps running. |
| 2:25 | Stop Ollama live | Panel → DEGRADED: SCRIPTED WARDEN; game fully playable; restart → recovers. |
| 2:45 | Jump to saved state at set piece (debug save) | "It learned your trick": lights forced on, pull camera fuse to break it. |
| 3:10 | End screen dossier | "What the room learned about you" + decisions/vetoes stats. Close on eval table in README: rules 100%, Gemma JSON validity X%, unsafe-after-rules 0. |

Debug saves (F1–F4: cell start, archive, set piece, finale) are a **Tier 1 requirement** for the demo.
