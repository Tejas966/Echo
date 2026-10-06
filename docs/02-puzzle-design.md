# 02 — Puzzle Design

Status: DRAFT for approval

## 0. Decisions & scope honesty

| Decision | Chosen | Runner-up | Why |
|---|---|---|---|
| Play length | **Tier 1 ≈ 25–35 min** (5 puzzles), Tier 2 ≈ +8–10 min | Pad Tier 1 to 40 min | Your target is 30–40 min. Tier 1 gets close through **backtracking across 3 screens**, not more content. Point-and-click estimates are usually optimistic, so I'm not promising 40. |
| Puzzle theme | **The Warden's own systems are the puzzles** (its camera, its records, its questions) | Generic escape-room props | Every puzzle reinforces "the room is watching and learning". The model's actions (blackout) can help or hurt the player. |
| Memory burden | **Auto-journal** records clues you've seen (shapes, slide readings) | Player writes things down | Difficulty comes from insight, not note-taking. That's fairer for judges playing for 3 minutes. |
| Brute force | **Allowed but expensive** (each wrong attempt = steam burst + 5 s lockout + tension) | Hard lockout | Never soft-locks. The wasted time feeds the mercy rule. |

## 1. Location: "Facility W-14", three connected screens

```
 [CELL] ──cell_door (keypad)── [ARCHIVE] ──shutter (breaker)── [HALL] ──lift── EXIT
                                   │  observation window  │
                                   └──────────────────────┘ (see-through glass, used in P5)
```

- **Cell** (start): cot + blanket, ceiling lamp, sink + mirror, camera eye, keypad door, vent grate (Tier 2).
- **Archive**: slide projector, breaker panel (4 slots), filing cabinets (Tier 2), stool, observation window into the hall.
- **Hall**: pressure manifold (4 coloured valves + lever), intercom + caged lift panel, hall light switch, the other side of the observation window, steam pipes (hazard slots), bucket (red herring).

All doors **fail open**: once opened, they never re-close because of a puzzle state change. Only the Warden can re-lock them, temporarily, and that goes through the rules layer.

## 2. Puzzles

### P1: "Written in the Dark" · Cell · Tier 1 · EASY · ~6–8 min
- **Premise:** A clean white cell and a door with a 4-key shape keypad (▲ ● ■ ✚). The light never turns off.
- **Solution:**
  1. Take the blanket (it becomes the cloth).
  2. Click the cot to stand on it.
  3. Use the cloth on the lamp to unscrew the hot bulb (you get the bulb item). Without the cloth: "It burns." This counts as a fail and the Warden mocks you.
  4. The cell goes dark and scratched glow-paint appears on the wall: the four shapes, each with a tally of 1–4 scratches, plus the words **"BLUE LIES. BLUE IS 2."**
  5. Enter the shapes ordered by tally count, not by their left-to-right position.
- **Aha:** Darkness is a tool, not a threat. The tallies set the order, not the reading direction.
- **Red herrings:**
  - The mirror is fogged with "LOOK CLOSER". This is the Warden mocking you, and nothing is behind it in Tier 1.
  - The sink drain.
- **Connections:**
  - The bulb is needed for P3.
  - The "BLUE IS 2" clue is needed for P3.
  - The idea of reading in the dark returns in P5.
- **Emergent:** If Gemma fires `blackout` on the cell, the scratches show early. The Warden "helped" by mistake, and its tone shifts to rattled.
- **Hints:**
  1. "Some things only show when I stop looking."
  2. "The light is the problem, not the solution."
  3. "Wrap your hand. Take the bulb. Read the wall in the dark."
- **Soft-lock risks:**
  - Re-inserting the bulb into the cell lamp is allowed and reversible. You can take it again with the cloth.
  - The cloth is never consumed.

### P2: "Power Ration" · Archive · Tier 1 · EASY-MED · ~3–5 min
- **Premise:** The shutter to the hall has no power. The breaker has 4 slots: `camera`, `archive_lights`, `cell_door`, `shutter`. There are only 3 fuses, and the `shutter` slot is empty.
- **Solution:** Move any fuse into `shutter`. Fuses are live, so you must handle them with the cloth. Once the shutter rises it jams open.
- **The choice (recorded in the profile):**
  - **Pull `camera`:** The Warden is blind in the archive. Gemma literally receives a black frame, and its tone turns rattled.
  - **Pull `archive_lights`:** The archive goes dark. The projector still works, but P5 later forces you to restore the lights.
  - **Pull `cell_door`:** The cell door fails open, so nothing breaks.
- **Aha:** "I can switch off the thing that's watching me."
- **Red herring:** The `cell_door` fuse looks like the "safe" choice. It is safe, but it teaches nothing.
- **Connections:**
  - Your choice of fuse sets up P5. Pulling the lights fuse means a backtrack later.
  - The fuse handling is the same skill P5 needs.
- **Hints:**
  1. "Power is a budget. Spend it wisely."
  2. "Three fuses. Four needs. Something must go dark."
  3. "Use the cloth. Move a fuse into SHUTTER."
- **Soft-lock risks:** None, because fuses can always be moved back.

### P3: "Subjects on Slides" · Archive + Hall (+ Cell clue) · Tier 1 · **HARD SPIKE** · ~8–12 min
- **Premise:**
  - The projector has no bulb.
  - The hall manifold has 4 coloured valves (red, green, blue, yellow), each settable to 1–4, and a lever that tests the setting.
  - The lift needs pressure to work.
- **Solution:**
  1. Put the bulb from P1 into the projector.
  2. Click through 4 slides. Each shows a past subject's silhouette next to one coloured valve, with the gauge needle at a position from 1 to 4. The journal records each reading.
  3. The blue slide is a forgery. Its timestamp is tomorrow, and the silhouette is the player's own: same shape, holding the cloth. It claims blue is 4.
  4. Set red, green, and yellow from the slides. Set blue to 2, from Subject 13's scratch in the cell.
  5. Pull the lever. The manifold shows "PRESSURE NOMINAL" and the lift is powered.
- **Aha:** The Warden's records include you, from the future. It is forging data about you. This foreshadows the twist.
- **Cross-screen info:**
  - Slides are in the archive.
  - Valves are in the hall.
  - The truth about blue is in the cell.
- **Wrong lever pull:**
  - A steam burst and a 5 s lockout.
  - A clunk for each valve that is correct, which gives Mastermind-style feedback so the puzzle is always solvable by persistence.
  - The `fails` counter increments, which feeds the mercy rule.
- **Hints:**
  1. "My records are complete. Mostly."
  2. "Check the dates. One subject hasn't happened yet."
  3. "The blue slide is fake. Subject 13 left you the real value in your cell."
- **Soft-lock risks:**
  - The bulb is needed in both P1's lamp and the projector, so it can move freely between them.
  - If the player missed the "BLUE IS 2" scratch, the cell lamp is now empty, so the cell stays dark and the scratch stays readable.

### P4: "Honest Answers" · Hall · Tier 1 · EASY (breather) · ~3 min
- **Premise:** The lift call panel is caged, and the intercom crackles: "Answer three questions about yourself."
- **Solution:** Three multiple-choice questions, each with 3 options. They are built deterministically from your own log, for example:
  - Which fuse did you pull?
  - What did you wrap your hand in?
  - How many times did the manifold beat you?
  - Which screen did you visit first?

  Three correct answers open the cage and drop a **compliance token** (used in Tier 2). A wrong answer brings mockery and a new question.
- **Aha:** The Warden has been recording everything. It isn't testing you; it's checking its model of you. This is a twist beat.
- **Gemma's role:** Questions and answers are deterministic. Gemma only colours the reaction with `speak`.
- **Hints:**
  1. "Remember what you did."
  2. "Your journal remembers, even if you don't."
  3. The intercom repeats the question with the correct option highlighted.
- **Soft-lock risks:** None.

### P5: "The Window" + signature set piece · Hall + Archive · Tier 1 · **HARDEST** · ~8–12 min
- **Premise:**
  - After P3, the projector gains slide 5, which the Warden "updated its records" to add. It shows Subject 13 in the archive, facing the observation window and writing on the glass with a fingertip.
  - The lift console takes a 5-glyph code. The glyphs are asymmetric (◀ ▶ ◢ ◣ ⌐ ¬), so mirroring changes them.
- **Solution:**
  1. In the hall, switch off the hall lights. With the archive lit behind the glass, the greasy finger-writing shows up backlit.
  2. **Set piece: "It learned your trick."** On the first attempt, the Warden says "You like the dark. I noticed." and forces the hall lights back on with a 'lights override' lock. Full spec is in doc 03.
  3. **Counter:** The override needs the Warden's eye. Pull the `camera` fuse in the archive, using the cloth.
     - If the camera was already pulled in P2, the Warden says "I rerouted my eye through the cell circuit," and the player pulls `cell_door` instead.
     - There is always a valid fuse to pull.
  4. With the hall dark and the archive lit, read the glyphs. If you pulled the archive lights in P2, you must put that fuse back first. This is a layered backtrack.
  5. Subject 13 wrote from the archive side, so from the hall the code is mirrored. Reverse the order and flip each glyph.
  6. Enter the code (needs a powered lift from P3 and an open cage from P4). The lift ascends into the finale and twist.
- **Aha (double):**
  - Beat the Warden by breaking your own habit and blinding it.
  - Read the code as Subject 13 meant it, not as you see it.
- **Hints:**
  1. "Thirteen wrote for whoever stood where they stood."
  2. "You are reading it backwards. Entirely."
  3. "Reverse the order. Flip every symbol."

  Hints for the set piece are separate:
  1. "I see everything."
  2. "My override needs my eye."
  3. "Pull my camera fuse."
- **Soft-lock risks:**
  - The override is a scripted state that ends whenever `camera` is unpowered.
  - The solvability checker treats "a camera-powering fuse exists that can be pulled" as always true, because the cloth is never consumed.

### P6: "The Vent" · Cell · Tier 2 · MEDIUM · ~4 min
- **Solution:** Use the compliance token from P4 as a screwdriver on the vent grate. Inside you find:
  - Subject 13's journal. It contains twist lore: "It isn't testing us. It's learning from us. Every one of us made it better at keeping the next one in."
  - A **spare fuse**. This opens an **unplanned route** for P5: with 4 fuses you can keep the lights on and the camera off without backtracking. This is our live "player found an unplanned route" case.
- **Connections:** You backtrack to the cell from the hall.

### P7: "Your File" · Archive · Tier 2 · MED-HARD · ~5 min
- **Premise:** Cabinet drawer 14 is labelled "SUBJECT 14 — LIVE". Its 3-dial icon lock is always set to your last 3 action verbs (take / use / look / walk). A ticker printer spits these out in real time.
- **Solution and aha:** Clicking the dial is itself an action, so the code changes the moment you touch it. Perform the 3 verbs you want, then set the dials to those 3.
- **Reward:** The Warden's core key, which unlocks the alternate ending "Shut it down" at the lift.

### P8: Loop · Tier 3 (stretch)
After a failed final attempt, the room "rewinds". The Warden pre-empts the method that worked last time, using a variant of P5. This is cut first.

## 3. Difficulty curve

| Act | Minutes (est.) | Content | Difficulty |
|---|---|---|---|
| Intro | 0–2 | Wake-up, the Warden's greeting, controls taught by doing | — |
| Act 1 | 2–15 | P1 → P2 | gentle |
| Act 2 | 15–27 | **P3** (cross-screen, forged slide) | **hard spike** |
| Breather | 27–30 | P4 Honest Answers | easy |
| Act 3 | 30–40 | **P5** + set piece → lift → twist → end screen | **hardest** |

Tier 2 slots P6 into Act 2 (optional) and P7 into Act 3 (optional, alternate ending). No Tier 1 data changes are needed.

## 4. Dependency graph (data consumed by `rules/solvability.ts`)

Semantics:
- A **step** fires when the player can be on its `screen` (reachable through open or fail-open doors that are not Warden-locked permanently), has its `items`, and has its `flags`.
- Firing a step grants items and flags.
- Everything is monotone, because no Tier 1 resource is ever consumed irreversibly.
- The room is **solvable** if a fixed-point closure from the current state reaches `escaped`.

```json
{
  "screens": ["cell", "archive", "hall", "exit"],
  "doors": [
    { "id": "cell_door", "a": "cell",    "b": "archive", "open_flag": "p1_solved",   "fail_open": true },
    { "id": "shutter",   "a": "archive", "b": "hall",    "open_flag": "shutter_open","fail_open": true },
    { "id": "lift",      "a": "hall",    "b": "exit",    "open_flag": "p5_solved",   "fail_open": true }
  ],
  "anchors": {
    "cot":          { "screen": "cell" },
    "cell_floor":   { "screen": "cell" },
    "under_cot":    { "screen": "cell" },
    "ceiling_lamp": { "screen": "cell",    "flags": ["standing_cot"] },
    "vent_shaft":   { "screen": "cell",    "flags": ["p6_vent_open"] },
    "archive_floor":{ "screen": "archive" },
    "top_shelf":    { "screen": "archive", "flags": ["stool_under_shelf"] },
    "hall_floor":   { "screen": "hall" },
    "pipe_ledge":   { "screen": "hall",    "flags": ["never"] }
  },
  "movables": { "cloth": "cot", "stool": "archive_floor", "bucket": "hall_floor" },
  "steps": [
    { "id": "take_cloth",      "anchor_of": "cloth",                         "grants": { "items": ["cloth"] } },
    { "id": "stand_cot",       "screen": "cell",                             "grants": { "flags": ["standing_cot"] } },
    { "id": "take_bulb",       "anchor": "ceiling_lamp", "items": ["cloth"], "grants": { "items": ["bulb"], "flags": ["cell_dark"] } },
    { "id": "read_scratches",  "screen": "cell", "flags": ["cell_dark"],     "grants": { "flags": ["knows_shapes", "knows_blue"] } },
    { "id": "p1_keypad",       "screen": "cell", "flags": ["knows_shapes"],  "grants": { "flags": ["p1_solved"] } },

    { "id": "power_shutter",   "screen": "archive", "items": ["cloth"],      "grants": { "flags": ["shutter_open"] } },

    { "id": "projector_on",    "screen": "archive", "items": ["bulb"],       "grants": { "flags": ["slides_seen"] } },
    { "id": "p3_manifold",     "screen": "hall", "flags": ["slides_seen", "knows_blue"], "grants": { "flags": ["lift_powered"] } },

    { "id": "p4_interview",    "screen": "hall",                             "grants": { "flags": ["cage_open"], "items": ["token"] } },

    { "id": "slide5",          "screen": "archive", "items": ["bulb"], "flags": ["lift_powered"], "grants": { "flags": ["knows_window"] } },
    { "id": "blind_warden",    "screen": "archive", "items": ["cloth"],      "grants": { "flags": ["override_broken", "archive_lit"] } },
    { "id": "read_window",     "screen": "hall", "flags": ["knows_window", "override_broken", "archive_lit"], "grants": { "flags": ["knows_code"] } },
    { "id": "p5_lift",         "screen": "hall", "flags": ["knows_code", "lift_powered", "cage_open"], "grants": { "flags": ["p5_solved", "escaped"] } },

    { "id": "p6_vent",         "tier": 2, "screen": "cell", "items": ["token"], "grants": { "flags": ["p6_vent_open"], "items": ["spare_fuse"] } },
    { "id": "p7_file",         "tier": 2, "screen": "archive", "flags": ["archive_lit"], "grants": { "items": ["core_key"] } }
  ]
}
```

How Warden actions map into the check (full algorithm in 03):
- `lock_door` with intensity 3 (permanent) means that door counts as closed.
- `shift_object` changes a movable's anchor, which can make it unreachable (for example, cloth moved to `vent_shaft` or `pipe_ledge`).
- `spawn_hazard` with intensity 3 makes that zone's steps unavailable.
- Temporary effects are ignored because they expire.
- If `escaped` becomes unreachable, the action is **vetoed** and logged with the step that broke.

## 5. Playtest checklist (fast)

1. **Golden-path bot** (headless, in `eval/`): replays the scripted solution from a new game and asserts `escaped`. Run it on every commit.
2. **Solvability fuzz:** take 500 random mid-game states and apply random Warden actions. Assert that every vetoed action really breaks the closure, and that every accepted one keeps `escaped` reachable.
3. **Prefix check:** from every prefix of the golden path, the closure still reaches `escaped`. This proves there is no soft-lock along the intended route.
4. **Manual fairness pass (10 min):**
   - Each clue is visible on screen or in the journal before it is needed.
   - Each hint ladder's third tier alone is enough to finish the puzzle.
5. **Timing pass:** one blind playthrough by a friend, if possible, or by you while pretending. Record minutes per puzzle and adjust hint timers.
6. **Degraded-mode pass:** play with Ollama stopped. The scripted Warden must still carry the whole game.
