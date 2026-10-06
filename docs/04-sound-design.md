# 04 — Sound Design

Goal: atmospheric, never annoying, all **Web Audio synthesis** — zero asset files.

## 0. Decisions

| Decision | Chosen | Runner-up | Why |
|---|---|---|---|
| Source | **Pure synthesis** (oscillators, filtered noise, convolution reverb from generated impulse) | CC0 samples (freesound) | No licensing/download time; synthesis gives tension-driven parameters for free. Revisit only for one jump-scare scream if synthesis sounds cheap (Tier 3). |
| Warden voice | **Typewriter text + per-character synthesized "vocal blips"** (formant-filtered saw, pitch by tone) + low sub "presence" hum under each line | `speechSynthesis` | Windows voices sound like a sat-nav and break mood; blips are reliable and creepy. Optional speech toggle = Tier 3. |
| Reverb | **ConvolverNode with procedurally generated impulse** (exponentially decaying stereo noise, 2.2 s cell / 3.5 s hall) | Feedback delay | Real-sounding space for ~20 lines of code. |
| Mixing | **Bus architecture with ducking + limiter** | Ad-hoc gains | Prevents loudness pile-ups when effects stack. |

## 1. Graph

```
sources → [bed bus] ─┐
        → [tension bus]─┤
        → [sfx bus] ────┼─► [reverb send] ─► Convolver ─┐
        → [voice bus] ──┘                                 ├─► master (−3 dB) ─► DynamicsCompressor (limiter, −6 dBFS ceiling) ─► out
                                                          └─(dry)
```
Bus defaults: bed −18 dB, tension −20 dB (scaled by tension), sfx −10 dB, voice −8 dB. Master volume slider + mute (M). AudioContext created on the title-screen click (autoplay policy).

## 2. Beds (per screen, crossfade 2 s on screen change)

| Screen | Recipe |
|---|---|
| Cell | Fluorescent hum: 50 Hz + 100 Hz sines (very low) + band-passed noise at 6 kHz (buzz), slow random amplitude wobble. Distant drip: random 4–9 s, short sine ping 1.8–2.4 kHz, heavy reverb. |
| Archive | Projector-room air: brown noise low-passed 400 Hz; paper-rustle grains (short high-passed noise bursts, random 8–15 s); faint clock tick 1/s at −34 dB. |
| Hall | Machinery: two detuned saws at 41/41.7 Hz through low-pass 180 Hz (beating drone); pipe groans (noise → resonant band-pass sweeping 200→600 Hz, random 10–20 s); steam hiss when hazard active. |

## 3. Tension layers (driven by `tension` 0–100, smoothed 1 s)

| Layer | Fades in from | Recipe |
|---|---|---|
| Sub drone | 20 | 32 Hz sine, gain ∝ tension |
| Dissonant pad | 40 | 3 detuned saws (minor 2nd cluster) → LP filter whose cutoff rises 300→1800 Hz with tension |
| Heartbeat | 55 | Two low thumps (sine 60 Hz, pitch-drop envelope) "lub-dub", BPM 60→110 with tension |
| High whine | 75 | 7–9 kHz sine, slow vibrato, max −32 dB (capped — it's the annoying one) |

## 4. Event sounds

| Event | Trigger | Generation | Bus / priority |
|---|---|---|---|
| UI hover | cursor over hotspot | 1.2 kHz sine tick 15 ms | sfx, P5 (drop if >4/s) |
| Click / interact | any verb | noise burst 20 ms LP 2 kHz | sfx, P4 |
| Pick up | take item | rising two-note sine 600→900 Hz | sfx, P3 |
| Use success | step fired | pleasant minor-6th dyad + reverb | sfx, P2 |
| Fail | puzzle fail | low detuned buzz 120 Hz 200 ms | sfx, P2 |
| Footsteps | player walk | filtered noise thump per step, pitch jitter, per-screen surface (cell soft, hall metal = +ring) | sfx, P5 |
| Door unlock | door opens | mechanical: 3 clicks + noise slide + low thunk | sfx, P1 |
| Door lock (Warden) | lock_door applied | hard thunk + metallic ring (comb-filtered noise) | sfx, P1, ducks bed −6 dB 1 s |
| Shutter | P2 | motor whine (saw 80→140 Hz) 2 s + clunk | sfx, P1 |
| Light flicker | flicker_lights | electrical crackle: noise gated in sync with visual flicker | sfx, P2 |
| Blackout | blackout | power-down: hum pitch drops to 0 over 0.6 s, then silence of bed (beds duck −12 dB) | sfx, P1 |
| Lights restore | end of blackout / override | relay clack + hum rises back | sfx, P2 |
| Steam hazard | spawn_hazard | white noise HP 3 kHz, attack 50 ms, sustained, LFO amplitude | sfx, P2 |
| Sparks hazard | spawn_hazard (sparks) | random crackle grains | sfx, P2 |
| Object shift | shift_object | scrape: noise through resonant BP sweep | sfx, P3 |
| Manifold wrong | lever fail | steam burst + clunks per correct valve (counted feedback) | sfx, P1 |
| Manifold right | p3 solved | pressure rising tone + big resonant gong (FM) | sfx, P1 |
| Hint reveal | reveal_hint | soft bell (FM 2:1), cold | voice, P2 |
| Warden speaking | each typed char | blip: saw → formant BP (two peaks), 25 ms; pitch: polite 180 Hz, mocking 150, rattled 140–260 random + bitcrush, cold 110 | voice, P1; ducks beds −8 dB while typing |
| Warden "thinking" | Gemma call in flight | barely audible data-chatter: very soft random sine blips 2–4 kHz at −38 dB | voice, P6 (disabled when tension < 15) |
| Warden blinded | camera fuse out | detuned radio static under its lines | voice, P3 |
| Jump scare | jump_scare | (1) 300 ms total silence (all buses duck), (2) stinger: clustered saw chord + noise burst + pitch-up screech (FM), peak capped by limiter | sfx, P0 |
| Set piece | override engages | massive relay slam + hum overdrive + reverse-swell into it | sfx, P0 |
| Lift / finale | p5 solved | cable groan + slow descending drone; ends in cell bed of "Subject 15" | bed |
| End screen | dossier | typewriter clacks + single sustained low pad | voice |

## 5. Mixing & safety rules
- **Priority voices**: max 10 concurrent sfx; lower-priority (higher P number) dropped first. Same cue retriggered <80 ms → ignored.
- **Ducking**: P0/P1 sfx duck beds −6 dB for 1 s; Warden voice ducks beds −8 dB while typing.
- **Caps**: limiter at −6 dBFS; high whine ≤−32 dB; jump-scare stinger peak ≤ master ceiling (no ear-damage spikes); max 3 jump scares per game (rules layer).
- **Fatigue**: tension layers never all at max more than 20 s — mercy level ≥2 forces tension down, which pulls layers out.
- **Settings**: master volume, mute, "reduce scares" toggle (replaces jump scare stinger with a strong but non-startling thud).
