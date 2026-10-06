# 05 — Graphics & Animation

Style: The Silent Age-ish flat silhouettes, strong colored light, everything **drawn in code on Canvas 2D**. Internal resolution **1280×720**, CSS-scaled to fit.

## 0. Decisions

| Decision | Chosen | Runner-up | Why |
|---|---|---|---|
| Art pipeline | **Scenes described as data (rects, polys, gradients) + small draw helpers** | Hand-written SVG files | Data-driven scenes are fast to iterate, and the same data drives hotspots + director view. |
| Lighting | **Darkness layer on an offscreen canvas, lights punched out with `destination-out` radial gradients, then multiplied over the scene** | WebGL shaders | Canvas 2D is enough at 1280×720, no shader debugging. |
| Character | **Silhouette built from rounded rects/ellipses with a procedural 2-bone walk cycle** | Sprite sheet | No art; looks deliberate in silhouette style. |
| Warden presence | **The Eye**: a lens on the wall of each screen (iris tracks player, color by tone) + scan line + glitch | Full-screen face | One element, high recognisability, cheap. |

## 1. Palette

| Screen | Base | Accent / light | Mood |
|---|---|---|---|
| Cell | bone white walls `#d9d4c7`, floor `#a49c8a` | fluorescent cyan-white `#e9fbff` | clinical, too bright |
| Archive | deep teal `#173b3f`, cabinets `#0f2629` | projector warm amber `#ffb347`, red darkroom `#c23b2a` | secretive |
| Hall | iron blue `#1b2433`, pipes `#2c3a4f` | sodium orange `#ff8a3d`, steam white | industrial, hostile |

Per-tension grading (post-process tint over everything): tension <30 neutral · 30–60 desaturate 20% + cool shift · 60–85 red-shift shadows, vignette strengthens · >85 pulsing red vignette with heartbeat.
Warden eye color by tone: polite pale green `#9effc2`, mocking amber `#ffc14d`, rattled flickering magenta `#ff3df0`, cold ice blue `#8fd3ff`, blind = dead grey + static.

## 2. Layers (render order)

1. Background wall (gradient fill + panel lines)
2. Far parallax props (pipes, shelves silhouettes) — parallax 0.85 when the camera pans (hall is wider than screen)
3. Mid props & interactive objects (hotspots)
4. Player
5. Foreground silhouettes (bars, cables) — parallax 1.15
6. Light: darkness mask with light cones/pools punched out; additive glow sprites for lamps
7. Atmosphere: fog bands (large blurred gradients drifting), dust particles in light cones
8. Post: tension tint, vignette, film grain (pre-generated 256² noise tile, offset each frame), scan line
9. UI (DOM): dialogue box, inventory bar, journal, Mind Panel

## 3. Lighting & the Gemma screenshot

- Each light: `{x, y, radius, color, intensity, cone?: {angle, spread}, flicker?: profile}`.
- Room ambient level 0–1 (`lights[screen].level`); blackout → 0.04 ambient; only emissive things (glow-paint scratches, keypad backlight, the Eye, steam) drawn after the mask so they shine in darkness.
- Flicker: deterministic seeded profile (on/off pattern ≤3 Hz, with brief dim stutters), synced with crackle sfx.
- **Director view** (01 §8): same scene render into 512×288 with ambient floored at 0.55 and a blue tint for "dark" areas, no grain/vignette, player outlined white, small corner label `SCREEN: hall · LIGHTS: off`. Blind camera → black + static frame.

## 4. Animation plan

| Thing | Approach | Effort |
|---|---|---|
| Walk cycle | Click-to-walk on a floor line; 2-segment legs swing by `sin(phase)`, body bob, arm swing, slight lean; idle breathing scale 1±0.01 | 30 min |
| Interact | reach pose (arm extends to target) 250 ms; take = item shrinks into inventory slot (DOM fly animation) | 15 min |
| Stand on cot | player y offset tween | 5 min |
| Doors | keypad door slides sideways with ease-out; shutter rises with juddering (noise on y); lift doors part | 20 min |
| Locks (Warden) | red bar slams across door + lock icon pulse | 10 min |
| Flicker / blackout | via light system | (in lighting) |
| Screen shake | on slams/scares: decaying random offset 8 px, 300 ms | 5 min |
| The Eye | circle + iris that lerps toward player x; pupil dilates while Gemma "thinks"; scan line sweeps down the screen on each decision applied; glitch (RGB-split slices offset 2–3 frames) on veto/rattled | 40 min |
| Jump scare | full-screen silhouette face (big ellipse head + eye holes glowing) pops in for 250 ms with shake + flash white→black | 20 min |
| Steam / sparks | particle emitters (pooled, ≤150 particles) | 25 min |
| Projector slides | light cone from projector + slide image drawn into a rect on wall with slight keystone + dust in beam | 30 min |
| Glow scratches / window glyphs | drawn shape paths with additive glow, visible only when ambient < 0.3 | 15 min |
| Screen transitions | fade to black 300 ms + iris (the Eye "blinks" closed/open) | 15 min |
| Mind Panel | DOM side drawer: thumbnail, snapshot text, raw JSON, verdict chips (green ACCEPT / amber AMENDED / red VETO / grey FALLBACK), latency sparkline, mode badge | 45 min |
| End screen dossier | DOM: paper texture via CSS gradients, typewriter reveal, red "FORWARDED" stamp | 30 min |

## 5. Asset list

| Asset | Screen | Procedure | Effort |
|---|---|---|---|
| Cell walls, floor, tiled panel lines | cell | gradients + line loops | 10 m |
| Cot + blanket | cell | rects + bezier drape | 10 m |
| Ceiling lamp (bulb in/out) | cell | rect housing + glowing ellipse | 5 m |
| Sink + fogged mirror text | cell | rects + blurred text | 10 m |
| Keypad door + 4-shape keypad | cell | rects + shape paths | 15 m |
| Vent grate (T2) | cell | rect + slats | 5 m |
| Glow scratches + tallies | cell | stroked paths, jitter | 10 m |
| Archive cabinets, shelves, stool | archive | rect grids, handles | 15 m |
| Projector + 5 slides | archive | box + lens; slides = mini scenes (silhouette + valve + needle + timestamp text) | 30 m |
| Breaker panel + fuses | archive | rects, labels, fuse cylinders | 15 m |
| Observation window (both sides) + finger glyphs | archive/hall | rect with reflection gradient; glyph paths | 15 m |
| Manifold: 4 valves, gauges, lever | hall | circles, needles, colored wheels | 25 m |
| Intercom + caged lift panel + lift doors | hall | rects, mesh pattern (line grid) | 20 m |
| Pipes, steam vents, bucket | hall | thick strokes w/ highlight, ellipse | 15 m |
| Player silhouette + held item | all | composite shapes | 20 m |
| Subject 13 / 15 silhouettes | slides / finale | reuse player w/ different proportions | 5 m |
| The Eye | all | see above | 40 m |
| Icons (inventory items: cloth, bulb, token, fuse) | UI | small canvas draws → dataURL | 15 m |
| Particles (dust, steam, sparks) | all | pooled emitter | 25 m |
| Post FX (grain tile, vignette, tint) | all | generated once | 20 m |

**Total ≈ 6.5 h of art work if done serially** → must be split across an agent (see 06) and trimmed: Tier 1 polish target is "readable + moody", not detailed. Cut first: parallax foreground, slide keystone, jump-scare face detail, end-screen paper texture.
