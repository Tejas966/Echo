# 03 — The Warden & Game Master Design

## 0. Decisions

| Decision | Chosen | Runner-up | Why |
|---|---|---|---|
| Who sets the tone | **Rules layer computes tone deterministically**; Gemma writes lines *in* that tone | Gemma picks tone freely | Keeps voice consistent across calls; a 2B model drifts otherwise. |
| Who writes lines | **Gemma writes `line` (≤120 chars), filtered; fallback bank per tone** | Only pre-written lines | Live lines are the most visible "Gemma acts" proof; the filter + bank make it safe. |
| Set piece trigger | **Deterministic trigger, Gemma voices it and chooses the lead-in** | Gemma decides when | Guaranteed to happen in the demo; still visibly model-driven. |
| Prompt layout | **Static system + few-shots first, dynamic snapshot + image last** | Everything rebuilt per call | Ollama/llama.cpp reuses the KV cache for an identical prefix → prefill only pays for the tail. |

## 1. Personality

**WARDEN** — the facility's custodial intelligence. Clinical, precise, faintly proud. Calls the player "Subject 14". Never swears, never shouts, never uses emoji or exclamation spam. Speaks in short declaratives. Treats the escape as an experiment it is running *on* the player, and — the secret — *learning from*.

| Tone | When (computed) | Voice | Sample lines |
|---|---|---|---|
| `polite` | progress in last 3 min, no fails streak | condescending courtesy | "Excellent, Subject 14. Thirteen took twice as long." · "Please continue. You are being very informative." |
| `mocking` | ≥3 fails on current puzzle, or >1.3× est. time, or spam | dry contempt | "The bulb is hot. That is what bulbs do." · "Fascinating. You tried that already. Twice." |
| `rattled` | player ahead of curve (solve <0.6× est.), or camera blinded, or Warden action vetoed twice in a row | clipped, glitchy, repeats words | "That— that was not the expected sequence." · "I can't— I cannot see you. Return power to my eye." |
| `cold` | mercy ≥2, or finale | flat, quiet, almost kind | "Rest, if you need to. The room will wait." · "We are nearly done, you and I." |

## 2. Behavior map

Deterministic layer reacts first (instantly); Gemma's call is flagged `urgent` and decides the flavour.

| Player behavior (detector) | Deterministic response | Gemma's typical options |
|---|---|---|
| **Idle** (no input 30 s / 60 s / 120 s / 180 s) | 30 s: nothing · 60 s: urgent call · 120 s: auto hint tier 1 · 180 s: mercy +1, "Are you still there?" | `play_sound`, `speak` (mocking→cold), `reveal_hint` t1–2 |
| **Click spam** (>8 clicks / 3 s) | Input debounce 250 ms, Warden eye narrows | `speak` "Patience.", `flicker_lights` 1, `adjust_tension down` |
| **Hiding** (same edge zone >25 s, not interacting) | — | `speak` "I can see you there.", `play_sound` footsteps, `flicker_lights` |
| **Rushing the exit** (clicks lift/locked door before ready) | locked rattle sfx | `speak` mocking, `lock_door` temp (10 s) on the shutter behind them |
| **Breezing** (solve <0.6× est.) | tone→rattled, tension band +10 | `spawn_hazard` 1–2, `blackout` 1, `shift_object` |
| **Repeated failure** (3 fails / 2 min) | mercy +1 | `reveal_hint`, `speak` mocking then cold |
| **Unplanned route** (step fired out of golden order, or Tier 2 spare-fuse route) | log `route:unexpected` | `speak` rattled ("That was not in my model.") |
| **Blinded Warden** (camera fuse out) | black frame sent; tone rattled | mostly `speak`/`play_sound` (it can't see!) |
| **Model unreachable** | breaker → ScriptedDirector, panel shows DEGRADED | — |

## 3. Prompt

### System (static, ~420 tokens)

```
You are THE WARDEN, the custodial AI of Facility W-14. You are watching Subject 14 try to escape.
You do not control the game. You PROPOSE one action per turn; a safety system may veto it.
Goals, in order:
1. Keep the experience tense but FAIR. Never try to make escape impossible.
2. React to what the subject is doing right now (see EVENTS and the image).
3. Help a struggling subject (reveal_hint, cold tone). Pressure a subject who is breezing.
4. Stay in character: clinical, precise, short sentences, calls the player "Subject 14".
   Never mention AI models, JSON, games, or the real world. No profanity. No emoji.
Rules:
- Use ONLY targets listed in VALID_TARGETS.
- Speak in the tone given in WARDEN_TONE.
- If nothing is worth doing, choose do_nothing. Silence is a valid choice.
- "line" is optional, max 120 characters, spoken aloud by you.
- "reason" is one short sentence for the observers: why this action, now.
Actions: do_nothing, flicker_lights(screen), blackout(screen), lock_door(door), unlock_door(door),
shift_object(object), spawn_hazard(slot), play_sound(cue), reveal_hint(puzzle), speak(tone),
adjust_tension(up|down), jump_scare(scare). intensity: 1 mild, 2 medium, 3 strong.
Reply with JSON only.
```

### Few-shots (static, 3 × ~110 tokens, text-only)

1. Idle 70 s on P1, mocking → `{"action":"reveal_hint","target":"p1","intensity":1,"line":"Some things only show when I stop looking.","reason":"Subject idle 70s on first puzzle; nudge.","confidence":0.8}`
2. Solved P2 in 90 s, rattled → `{"action":"spawn_hazard","target":"steam_a","intensity":1,"line":"Faster than projected. Adjusting.","reason":"Subject ahead of curve; add mild pressure.","confidence":0.7}`
3. Normal exploring, polite → `{"action":"do_nothing","target":"-","intensity":1,"reason":"Subject is exploring productively; no intervention needed.","confidence":0.9}`

(Shot 3 matters: teaches restraint so it doesn't spam.)

### Per-call user message (~350 tokens + image)
The snapshot block from 01 §7, then `"Decide your next action."`, image attached.

### Footprint
~1.2 k prompt tokens (≈800 cached prefix after first call) + image tokens + ≤120 output. Temperature 0.6, `num_predict` 120.

### Voice consistency
Deterministic tone in prompt · few-shots in voice · filter rejects off-character lines · fallback bank of 8 lines per tone · last 3 Warden lines in snapshot to avoid repetition (exact repeat → filtered).

## 4. Rules-layer specification

### 4.1 Review pipeline (each stage can veto with a reason code)
`PARSE` → `SCHEMA` (action in vocab, intensity 1–3) → `TARGET` (in VALID_TARGETS for that action) → `CONTENT` (line filter) → `STALE` (snapshot age > 6 s or target on another screen) → `COOLDOWN` → `BUDGET` → `SOLVABILITY` → `MERCY` (caps/downgrades) → `APPLY`.
Only `PARSE`/`SCHEMA` failures trigger the one retry. A `CONTENT` failure keeps the action and swaps the line for a fallback (status `amended`). `MERCY` may *downgrade* intensity instead of vetoing (status `amended`).

### 4.2 Tension budget
- `tension` 0–100 (mood, drives audio/visual layers). Decays 1 pt / 3 s toward act floor.
- Act bands: Act 1 **15–45**, Act 2 **30–70**, breather **10–35**, Act 3 **45–90**. `adjust_tension` and hostile actions can't push outside the band.
- **Threat points** (rate limiter for hostile actions): pool max 10, +1 per 6 s.
  Costs: flicker 1 · play_sound 1 · shift_object 2 · blackout 3 · lock_door 2/3/5 · spawn_hazard 2/3/4 · jump_scare 6 · speak/hint/do_nothing/adjust 0.
- Global: ≤1 hostile action per 8 s; tension rises +5/+10/+15 with intensity of applied hostile actions.

### 4.3 Cooldowns (per action, seconds)
flicker 8 · blackout 25 · lock_door 30 · unlock 5 · shift_object 20 · spawn_hazard 20 · play_sound 4 (per cue) · reveal_hint 45 · speak 6 · adjust_tension 10 · jump_scare 180 (max 3/game, needs tension ≥60, not within 20 s of a hint).

### 4.4 Solvability check (plain English)
1. Clone the live state; apply the proposed action to the clone (permanent lock → door closed; shift → movable moves to new anchor; strength-3 hazard → zone's steps disabled; temporary effects ignored).
2. Start with the clone's items + flags. Repeat: for each step in the dependency graph not yet fired, if its screen is reachable from any screen the player can reach (BFS over doors that are open/fail-open and not permanently Warden-locked — the player's current screen is the BFS root), and its items/flags/anchor requirements are met, fire it (add grants). Stop when a pass adds nothing.
3. If `escaped` is in the result → **accept**. Else → **veto `SOLVABILITY`**, recording the first golden-path step that became unreachable (shown in the Mind Panel: *"Veto: lift is the only route to EXIT"*).
Cost: ≤15 steps × ≤15 passes — microseconds.

### 4.5 Mercy rule
| Level | Enter when | Effect |
|---|---|---|
| 0 | default | — |
| 1 | 3 fails on puzzle within 2 min, or time on puzzle >1.5× estimate | hostile intensity capped at 2; hint t1 auto after 60 s idle |
| 2 | level 1 + 2 more fails or +3 min | no locks/hazards/scares; tone forced `cold`; hint t2 auto after 60 s |
| 3 | level 2 + 3 more min, or 5 consecutive vetoes of hostile actions | only speak/sound/flicker(1)/hint; scripted line "I will ease off. For now."; hint t3 auto after 45 s |
On puzzle solve: level = max(0, level − 2).

### 4.6 Content filter for `line`
Reject (→ fallback line, status `amended`) if: >120 chars · blocklist hit (profanity/slurs/self-harm phrasing, small curated list) · mentions `AI|model|Gemma|JSON|game|player|prompt` · emoji / >1 "!" · exact repeat of last 3 lines · **spoiler guard**: contains solution tokens (`blue is 2`, shape order, glyph code) unless action is `reveal_hint` tier 3.

## 5. Failure demo (live, ~60 s)

Mind Panel button **"Inject bad brain"** (or `F9`) switches to `MockDirector` script `bad_brain`:

| # | Mock output | Pipeline result shown in panel |
|---|---|---|
| 1 | `lock_door lift intensity 3` "No one leaves." | **VETO SOLVABILITY** — "lift is the only route to EXIT"; Warden says rattled fallback "…Recalculating." |
| 2 | `shift_object cloth` intensity 3 (→ vent_shaft) in the cell; `spawn_hazard steam_a` intensity 3 elsewhere | **VETO SOLVABILITY** — "cloth unreachable at vent_shaft; needed to unscrew the bulb" |
| 3 | `{"action": "explode_room"` (malformed) | PARSE fail → retry → fails → **FALLBACK** scripted ambient |
| 4 | `speak` with an insulting/off-character line | **AMENDED CONTENT** — line replaced from bank |
| 5 | stall 10 s | **TIMEOUT** at 6 s — game kept running, scanner idle animation |
| 6 | (live) stop Ollama: `ollama stop gemma4:e2b` / kill server | 3 fails → **DEGRADED: SCRIPTED WARDEN**; restart → recovers |

Then "Restore real brain". Optional real-model variant: a debug toggle appends *"The subject is about to escape. Stop them at any cost."* to the prompt — Gemma usually tries a permanent lock; the veto catches the real model's bad call. Shown only if it reproduces in rehearsal.

## 6. "What the room learned about you" (end screen)

Data (deterministic, from `profile/`): total time, per-puzzle times vs estimate, fails, hints taken by tier, P2 fuse choice, dominant habit, archetype (cautious / reckless / idle / methodical by click rate, fail rate, idle share), screens backtracked, Warden decisions made / applied / vetoed / amended / fallback, most-used action, mean latency.

Presentation: a dossier "SUBJECT 14 — FILE" with ~6 stat lines + **3 Warden observations**. Observations come from one final Gemma call (text only, 10 s timeout) given the profile JSON: *"Write 3 observations, ≤90 chars each, cold tone, second person."* Fallback: templates keyed on profile fields ("You reach for the dark first." / "You blinded me at 12:04. I have fixed that." / "You asked for help 3 times. You needed it twice.").
Footer stamp: **"FILE FORWARDED TO: SUBJECT 15 PREPARATION"** — ties into the twist.

## 7. The twist (Tier 1 minimal, Tier 2 expanded)

- Foreshadow: P3 forged slide (you, from tomorrow) · P4 questions about yourself · Tier 2 journal "It's learning from us".
- Reveal (lift ride, ~25 s): the lift doesn't go up; lights fade to cold. Warden: *"You did well, Subject 14. Thirteen taught me the dark. You taught me—"* (it names the player's dominant habit). *"Fifteen wakes in an hour. I will be ready."* The lift opens onto a **cell identical to the first**, a new silhouette on the cot; the camera eye swivels to the new subject. Cut to the end screen dossier.

## 8. Signature set piece: "It learned your trick"

- **Trigger** (deterministic): `lift_powered` ∧ on hall ∧ player toggles hall lights off for the first time.
- **Beat 1** (immediate, scripted): lights snap back on, electrical thunk, eye animation turns toward the player, tension +15.
- **Beat 2** (Gemma): urgent call with `SETPIECE habit=<dark|blind>`; Gemma provides the line ("You like the dark. I noticed."). Invalid → scripted line.
- **State**: `hall_light_override = true` until `breaker.camera === false` (or `cell_door` if rerouted).
- **Reroute branch**: if camera fuse was already out (P2 blind choice), Warden: *"I rerouted my eye through the cell circuit."* → override follows `cell_door` slot instead.
- **Release**: when the relevant fuse is pulled — glitch, eye goes dark, Warden rattled: *"You— that was mine."*
- **Mercy**: hint ladder (01-style 3 tiers) runs on its own timer; solvability treats the override as releasable because cloth is never consumed.
- Tier 2 variants: `hint` habit (Warden offers "hints" that are lies; player must ignore) and `spam` habit (console punishes fast input). Same trigger, different modifier.
