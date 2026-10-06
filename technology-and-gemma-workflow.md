# The Room That Fights Back: Technology & Gemma Integration

This document provides a highly detailed, plain-English overview of the technologies used in "The Room That Fights Back," how the Gemma AI model is integrated, and the exact workflow of how Gemma receives and processes data to act as the Game Master (the "Warden").

---

## 1. Technologies Used & Why They Were Chosen

The game is built to be fast, self-contained, and perfectly suited for an AI to interact with it. 

### Core Stack
- **TypeScript**: The entire game logic and rules engine are written in TypeScript.
  - *Why*: It enforces strict contracts (like `GameState`) which is crucial for the safety layer. It also allows the core game logic to be "pure" (DOM-free), meaning we can run headless bots to automatically test if the game is solvable in milliseconds.
- **Vite**: Used as the build tool and development server.
  - *Why*: It provides lightning-fast hot reloading. It also easily proxies network requests (`/ollama` to `localhost:11434`), avoiding annoying CORS errors when the browser tries to talk to the local AI model.
- **HTML5 Canvas 2D**: All graphics are procedurally generated (drawn with code) rather than using image files like PNGs or JPEGs.
  - *Why*: It removes the need for asset management and allows for dynamic lighting, fog, and grain. Most importantly, Canvas has a built-in `toDataURL` function, making it trivial to instantly grab a screenshot of the game to send to Gemma's vision model.
- **Web Audio API**: All sounds and music are synthesized in real-time.
  - *Why*: No external audio files are needed. It allows the game to dynamically adjust the "tension" of the background music based on the player's actions.

### AI Integration
- **Ollama**: A local tool used to run Large Language Models offline.
- **Gemma 4 (`gemma4:e2b`)**: A lightweight, multimodal AI model by Google.
  - *Why*: It fits comfortably in a standard laptop GPU (like an RTX 4050 with 6GB VRAM) and runs fully offline. This ensures zero network latency, no rate-limiting, and complete privacy during gameplay.

---

## 2. How Gemma is Integrated

Gemma acts as the "Warden"—an AI Game Master that watches you play and tries to mess with you, help you, or talk to you. However, **Gemma does not run the game**. The game runs on a deterministic 60 frames-per-second loop that never waits for the AI.

Gemma is integrated as a "Director" that operates in the background. The game talks to Gemma through a `DirectorScheduler` which sends requests to the local Ollama API about every 2.5 to 4 seconds. When Gemma replies, its decision is handed to a strict **Rules Engine** that decides whether Gemma's idea is safe to execute.

---

## 3. The Workflow of Gemma (Step-by-Step)

Here is the exact lifecycle of how Gemma interacts with the game:

### Step 1: Gathering the Snapshot
Every few seconds, the game takes a snapshot of the current state. This snapshot has two parts:
1. **The Visuals**: The game quietly renders a 512x288 JPEG image of the room. This "Director View" removes the UI and bumps up the lighting slightly so Gemma can clearly see where the player is.
2. **The Text Context**: The game compiles a short text summary (around 400 tokens) detailing everything that is happening.

### Step 2: Sending Data to Gemma
The game sends a prompt to Gemma containing:
- A strict **System Prompt** telling it to act as the clinical, AI Warden (Subject 14's overseer).
- The **Text Snapshot** (see Section 4 for details).
- The **JPEG Image**.
- A request to output its decision strictly as JSON.

### Step 3: Constrained Decoding (JSON Schema)
To prevent Gemma from outputting gibberish or trying to do things that aren't programmed, the game uses **Ollama's Structured Outputs**. The game sends a dynamically generated JSON Schema defining exactly 12 actions Gemma is allowed to take (e.g., `flicker_lights`, `lock_door`, `spawn_hazard`, `speak`, `reveal_hint`). Gemma *must* pick an action from this list, along with a target, intensity (1-3), and an optional voice line.

### Step 4: The Rules Engine (The Safety Layer)
Once Gemma replies with a JSON decision, it doesn't happen immediately. It is passed through a ruthless **Rules Engine** with several stages:
- **Schema & Target Check**: Is the action valid? Is the target real?
- **Content Filter**: If Gemma wrote a dialogue line, does it contain spoilers, swearing, or out-of-character words (like "AI" or "JSON")? If so, the line is swapped for a safe fallback line.
- **Cooldowns & Budget**: Is Gemma spamming? Hostile actions cost "Threat Points". If Gemma is out of points, the action is vetoed.
- **Mercy Rule**: If the player is failing miserably, Gemma is blocked from doing hostile things and is forced to be helpful.
- **Solvability Check**: This is the most crucial step. The engine clones the game state, applies Gemma's hostile action (e.g., permanently locking a door), and runs a lightning-fast simulation to see if the game can still be beaten. If Gemma accidentally made the game impossible, the action is **Vetoed**.

### Step 5: Execution
If the decision survives the Rules Engine, it is placed in a queue. The game executes the action—lights flicker, a door locks, or the Warden's eerie synthesized voice speaks the line Gemma wrote.

---

## 4. How Data is Received by Gemma

Gemma receives a highly condensed package of information designed to give it perfect context without wasting token space.

### What the Text Snapshot looks like:
- **World State**: The current room, the in-game time, the "Tension" level (0-100), and whether the camera is online.
- **Player Stats**: How long the player has been idle, how much they are clicking (spamming), and their dominant habits (e.g., do they rely on hints? Do they rush?).
- **Event Log**: The last 10 things the player did (e.g., `-42s take bulb | -30s use bulb projector`).
- **Gemma's History**: What Gemma just did (so it doesn't repeat itself) and whether its last idea was vetoed by the rules.
- **Valid Targets**: A filtered list of things Gemma is allowed to interact with right now (e.g., which doors are currently in the room).

### What the Visual Snapshot looks like:
Gemma literally "sees" the room. However, if the player figures out how to pull the fuse for the Warden's camera, the game dynamically responds by sending Gemma a **pure black image with the text "NO SIGNAL"**. The player's actions literally blind the AI model.

---

## 5. Summary

1. The game runs smoothly at 60fps on its own.
2. In the background, the game takes a picture and writes a report of your actions.
3. It sends this to Gemma (running locally).
4. Gemma chooses 1 of 12 actions to mess with you or help you, and writes a line of dialogue.
5. The game's Rules Engine intercepts the idea, checks if it's fair and solvable, and if so, applies it to the room.
