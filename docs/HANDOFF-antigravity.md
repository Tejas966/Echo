# HANDOFF PROMPT — for Antigravity (paste everything below the line into the agent)

---

You are taking over a hackathon project mid-build for about 1h45m. Then the original developer (Claude Code) takes it back. Your job is to **finish specific, well-scoped tasks without breaking anything that already works**. Read this whole prompt before touching code.

## 0. Hard rules (read first)

1. **The deadline is 16:00 today.** Code freeze is 15:15. You are working roughly 12:00 → 13:45. Leave the repo **green and committed** at the end of every task. Never leave it half-finished.
2. **Before every commit**, run these from the repo root (Windows, PowerShell or Git Bash). All must pass:
   ```
   npx tsc --noEmit
   npm run eval            # rules eval must print 56/56 (or more) passed, then "GOLDEN PATH: PASS"
   ```
   If either fails, fix it before committing. Never commit red.
3. **Don't refactor working code.** Don't rename files, exports or ids. Don't reformat files you aren't changing. Don't upgrade dependencies.
4. **`src/types.ts` is the shared contract.** Only *add* optional fields. Never remove or rename anything in it.
5. **Never weaken the safety layer.** Don't loosen `src/rules/` checks, don't bypass `review()`, and don't apply model output without it. The rules engine is the core of the judging criteria.
6. **The game must stay fully playable without the model.** Test with `?director=scripted` too.
7. **Commit style:** small commits with clear messages. End each message with the trailer `Co-Authored-By: Antigravity <noreply@google.com>`. Push to `origin main` after each green commit (the repo is `https://github.com/Tejas966/Echo`).
8. **Write a progress log** in `docs/HANDOFF-log.md`: what you did, what you verified, what's left, and any known bugs. The next session starts by reading it. Update it after every task.
9. If something in this prompt contradicts the code, **the code wins**. Note the discrepancy in the log.

## 1. What the project is

**"The Room That Fights Back"** is an entry for the challenge *"Gemma as the Brain of a Game or Physical World: models usually answer, make one act."*

It's a 2D point-and-click escape room (Silent Age style, all procedural Canvas 2D art and Web Audio synthesis, no asset files). **Gemma 4 (`gemma4:e2b` via local Ollama) plays "the Warden"**, an AI Game Master. Every ~2.5 s it sees a 512×288 screenshot plus a compact text snapshot and proposes **one** action from a fixed 12-action vocabulary.

A deterministic **rules engine** reviews every proposal and accepts, amends, vetoes or falls back. Its stages are PARSE → SCHEMA → TARGET → CONTENT → STALE → COOLDOWN → BUDGET → SOLVABILITY → MERCY. The judges care most about handling latency, unreliable output, unexpected situations and bad model decisions.

Read these first (10 min):
- `CLAUDE.md`: principles, vocabulary, scope tiers, commands.
- `README.md`: architecture, controls, measured results.
- `docs/02-puzzle-design.md`: the puzzles. P6 and P7 are Tier 2.
- `docs/03-warden-and-gamemaster-design.md`: Warden personality, rules spec, failure demo, end screen, twist.
- `docs/06-build-plan.md` §6: the demo script.

### Run it
```
ollama list                 # must show gemma4:e2b (already pulled)
npm install                 # already done; only if node_modules is missing
npm run dev                 # http://localhost:5173
```
Controls: click to walk and interact. Click an inventory item, then a hotspot, to use it. Right-click deselects.

| Key | Action |
|---|---|
| TAB | Mind panel |
| F9 | Failure demo |
| F8 | Cycle Gemma / Mock / Scripted |
| F1–F4 | Debug saves: start / archive / setpiece / console |
| F7 | Reduce flashing |
| M | Mute |

URL options: `?director=mock|scripted`.
Dev pages: `/src/audio/test.html` (audio bench), `/src/gfx/preview.html`, `/src/ui/dev.html`.

**Important:** if you drive the game from an automated browser, the tab must be in the **foreground**. `requestAnimationFrame` pauses in background tabs and the game clock freezes. Also note that Vite hot-reloads the page whenever any file changes.

### Code map (who owns what)
```
src/types.ts              shared contract (add-only)
src/main.ts               boot, input, game loop, dispatch, ending sequence, debug saves
src/world/state.ts        initial GameState
src/world/screens.ts      hotspot rectangles (1280x720 logical) + puzzle constants (codes, slides)
src/world/world.ts        ALL puzzle logic: interact(), pressPad(), answer(), tick(), recompute()
src/world/warden.ts       applies an ACCEPTED Warden decision to the world
src/world/graph.ts        puzzle dependency graph as DATA (consumed by solvability)
src/world/script.ts       GOLDEN path ops + runScript() (headless bot, also debug saves)
src/world/hints.ts        canonical 3-tier hint text per puzzle
src/rules/*               review pipeline, solvability, filter, budget, mercy, tone (DON'T weaken)
src/director/*            snapshot, prompt, schema, ollama/mock/scripted directors, scheduler, feasible.ts
src/profile/habits.ts     habits, archetype, end-report stats + template observations
src/gfx/*                 renderer (scenes.ts draws objects at hotspot rects, reads GameState)
src/audio/*               Web Audio engine (index.ts createAudio, sfx.ts recipes, beds.ts, core.ts)
src/ui/*                  DOM overlay (index.ts createUI); ui/mind-panel.ts = Game Master's mind panel
eval/                     run-rules.ts, golden.ts, failure-demo.ts, run-gemma.ts, archetypes.ts
```

### How the world works (you need this for Task 2)
- **World functions are pure and DOM-free.** They mutate `GameState` and return an `Outcome` (`lines`, `sfx`, `fx`, `events`, `journal`, `ask`, `openPad`). `main.ts` dispatches outcomes to the UI, audio and graphics.
- **Flags:**
  - Puzzle progress lives in `state.flags`, named as in `docs/02 §4`.
  - When an item is first acquired, the world sets `got_<item>` (used by solvability).
  - Puzzles are recorded as solved through `solve(s, o, 'pX')` in `world.ts`.
- **Hotspots** live in `HOTSPOTS` in `screens.ts`. A `visible(s)` predicate hides them. The renderer draws objects at those rectangles: see `src/gfx/scenes.ts`, searching for existing ids like `'cabinets'`.
- **`recompute(s)`** derives light levels, Warden blindness, the current puzzle and the act. It runs every tick.

## 2. Current status (as of ~12:00)

**Done and verified:**
- **Tier 1 is complete** and play-tested end to end in Chrome with live Gemma: all 3 screens, P1–P5, the set piece, the twist, the dossier, the mind panel, the F9 failure demo, degraded mode and the circuit breaker.
- **P6 (vent) logic already exists:** using the token on the vent gives a spare fuse plus journal lore. It was never play-tested in the browser.
- **Evals:**
  - rules: 56/56
  - golden path: PASS
  - failure demo: 0 unsafe
  - real Gemma (72 calls): 100% valid JSON, 80.6% appropriate, 0 unsafe after rules, p50 504 ms

**Not done / unknown:**
- **Audio has never been listened to.** It was written blind and only checked numerically.
- P7 is not implemented.
- Real-human play length is unknown.
- `eval/out/archetypes-gemma.log` may contain a finished Gemma archetype run. If it does, add a "Gemma-driven" row set to the README archetype table.

## 3. Tasks, in priority order (stop wherever time runs out; each must end green and committed)

### Task 1: Audio listening pass and fixes (~25 min, highest value: the user explicitly wants good, atmospheric sound)
1. Run `npm run dev`, open `http://localhost:5173/src/audio/test.html`, and listen on headphones and on laptop speakers to:
   - every bed (cell, archive, hall, exit)
   - tension at 0, 40, 70 and 100
   - all four Warden voice tones
   - every SFX cue, especially `scare`, `setpiece_slam`, `blackout`, `lights_on`, `step`, `typewriter`, `hint`
2. Fix, in `src/audio/` only:
   - anything **harsh, clipping, too loud or piercing**: the high whine, the scare stinger, noise bursts
   - anything **inaudible**: beds may be too quiet on laptop speakers
   - anything **annoying on repeat**: footsteps, typewriter, hover
   - Targets: the Warden blips should sound like eerie synthetic speech, not beeps. The beds should be noticeable but sit under the dialogue. The scare should startle but never hurt.
3. Then play the real game for 3 minutes (cell → archive) and check the mix in context. Make sure dialogue blips don't fight the beds, and that the typewriter clicks are subtle.
4. Log what you changed and why in `docs/HANDOFF-log.md`.

### Task 2: Tier 2 puzzle P7 "Your File" + alternate ending (~45 min)
The spec is in `docs/02 §2 P7`. Implement a **simplified, robust** version:

- **New hotspots** in `screens.ts`, on the archive screen:
  - `drawer14`: a visible part of the cabinets, roughly `x:300 y:420 w:60 h:50`. Label "Drawer 14 — SUBJECT 14 — LIVE". Make sure it doesn't overlap `cabinets` in a way that breaks clicks: hit-testing takes the **last matching** hotspot in array order, so add it *after* `cabinets`.
  - `printer`: a small ticker printer on a shelf, roughly `x:150 y:250 w:70 h:40`.
- **Mechanic** (a deterministic meta-puzzle):
  - The drawer has a 3-dial lock of action verbs: TAKE / USE / LOOK / WALK.
  - The combination is always **the player's last three verbs, recorded before they touched the drawer**.
  - Clicking the printer prints the player's last 3 verbs from the event log, mapped as `take` → TAKE, `use` → USE, `click`/`look` → LOOK, `walk`/`enter` → WALK. It adds them to the journal and the Warden says something like "Your file is always current."
  - Clicking `drawer14` opens a new pad kind `'file'` with 4 verb buttons. Entering 3 verbs that match the last 3 **non-drawer, non-printer** verbs gives `core_key` (use `give(s, 'core_key')`), solves `p7` via the existing `solveExtra()` helper, and writes a journal entry.
  - To do that, add `'file'` to the `openPad` kind union in `types.ts`, handle it in `ui/index.ts` `openPad`, and handle it in `world.ts` `pressPad`.
  - If adding a pad kind is too invasive, fall back to `ui.ask()`, as P4 does: three questions in sequence, "Which verb was your last move?", and so on.
- **Alternate ending:**
  - Using `core_key` on `lift_panel` (with the cage open) sets `s.ended = 'shutdown'`, shows the lines "You wouldn't—" (rattled) and then the narrator "The Eye goes dark. For the first time, the facility is silent.", and moves the player to `exit`.
  - In `main.ts`, `runEnding()` must branch on `state.ended`:
    - For `'shutdown'`, the twist lines change: no Subject 15, the Warden is shut down.
    - The `EndReport` stays `escaped: true`, but add an observation like "You shut me down. Fifteen will never wake."
    - Show the dossier as usual.
- **Graphics** (`src/gfx/scenes.ts`): draw drawer 14 with a small dial lock and a glowing "LIVE" label, and the ticker printer with a paper strip. Keep it simple and match the existing style.
- **Hints:** `HINTS.p7` already exists in `hints.ts`. It is only used if `s.puzzle.current === 'p7'`, which never happens because the current puzzle is always p1–p5. That's fine; P7 is optional.
- **Solvability:** P7 is optional, so the escape path is unaffected. **Don't** add P7 to `GOLDEN`. Do add a separate headless check in `eval/golden.ts`, or a new `eval/tier2.ts`: run `GOLDEN` up to the `'console'` mark, then call `interact(s, 'printer')` and pad presses or answers to get `core_key`. Then use it on `lift_panel` and assert `ended === 'shutdown'`. Make it exit with code 1 on failure, and add it to `npm run eval` in `package.json`.
- **Vocabulary** (optional): if you want the Warden to be able to hint P7, add `'p7'` to `validTargets.reveal_hint` only when the player is in the archive and `!s.stats.solvedAt.p7`.

### Task 3: Play-test P6 (vent) + unplanned route (~10 min)
- Get the token: `F3` goes to the set-piece save, where the token is already in inventory after P4.
- Go to the cell (hall → archive → cell). Select the token and click the vent. You should get a spare fuse and Subject 13's journal line. Check the vent looks open.
- In the archive, insert the spare fuse into an empty slot. Confirm `fuseSlot()` in `world.ts` accepts `spare_fuse`. Check there are no errors and the breaker renders it.
- Fix any bug you find in `world.ts` or `gfx`.

### Task 4: README + demo prep (~15 min)
- If `eval/out/archetypes-gemma.log` has finished results, add them to the README archetype table as "Gemma-driven" rows.
- Run `npm run eval:gemma` once more if time allows (about 1 min, needs Ollama). If the numbers changed, update the README Results table **with honest numbers**.
- Write `docs/demo-script.md`: a 3.5-minute talk track based on `docs/06 §6`, with the exact key presses (Tab, F9, `ollama stop gemma4:e2b` in a terminal for the degraded-mode demo, F3 for the set piece, F4 → console code ▶ ◢ ⌐ ▶ ◣ → lift for the ending).
  - Note that the code in screens.ts is `P5_CODE = ['R','DR','HL','R','DL']`, which is ▶ ◢ ⌐ ▶ ◣.
  - Note that `ollama stop` only unloads the model, which may reload automatically on the next request. To demo a real outage, quit the Ollama app from the system tray instead, then restart it.

## 4. Things NOT to do
- Don't change the action vocabulary, the rules thresholds or the review stage order.
- Don't touch `src/director/scheduler.ts`, `feasible.ts`, `prompt.ts` or `src/rules/**` unless a bug is clearly there. If so, write a test first, in `eval/scenarios/rules.ts` for rules.
- Don't add npm dependencies, external assets, fonts or CDNs.
- Don't add `localStorage` saves, a settings menu or other new systems.
- Don't commit `eval/out/` (it's gitignored) or `node_modules`.
- Don't push a commit where `npm run eval` fails.

## 5. Definition of done (for each task)
1. `npx tsc --noEmit` is clean and `npm run eval` passes.
2. The feature was checked manually in Chrome at `http://localhost:5173`, with live Gemma **and** with `?director=scripted`.
3. Committed, pushed, and logged in `docs/HANDOFF-log.md`.

## 6. Final hand-back (last 5 minutes of your session)
Update `docs/HANDOFF-log.md` with:
- the tasks completed
- the files changed
- the eval output, pasted
- known bugs
- what you would do next
- the exact current state of `git log --oneline | head -10`

Commit and push.
