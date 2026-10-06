# Demo Script

A 3.5-minute talk track for demoing "The Room That Fights Back".

## Setup
- Have a terminal open.
- Start the dev server: `npm run dev`
- Ensure Ollama is running (`gemma4:e2b`).
- Open `http://localhost:5173` in a Chrome foreground tab.

## Talk Track

**1. Introduction (0:00 - 0:30)**
- "This is 'The Room That Fights Back'. It's an escape room where Gemma 4 plays the Game Master—an AI Warden watching your every move."
- *Action: Click to start the game.*
- "The model isn't just generating text; it's controlling the room's lights, locks, and hazards in real time. We've built a deterministic rules engine that acts as a safety layer between Gemma's decisions and the game world."

**2. The Mind Panel (0:30 - 1:00)**
- *Action: Press `TAB` to open the Mind Panel.*
- "If we look behind the curtain, we can see exactly what Gemma is doing. The Mind Panel shows what the model saw, its proposed action, and how the rules engine evaluated it."
- "The model chooses from 12 distinct actions. Before the prompt is even built, the rules engine culls any infeasible actions from the schema to ensure valid outputs."

**3. The Failure Demo (1:00 - 1:45)**
- *Action: Press `F9` to toggle the Failure Demo.*
- "What happens if the model hallucinates or goes rogue? Let's inject a 'bad brain' that actively tries to break the game."
- "Notice how it tries to permanently lock the only exit or spam the lights. The rules engine instantly catches this. It evaluates solvability by checking the puzzle dependency graph and vetoes any action that makes the game impossible to beat. The game stays fully playable."
- *Action: Press `F9` again to return to normal mode.*

**4. Degraded Mode / Outage (1:45 - 2:30)**
- "Now, what if the model goes down completely?"
- *Action: Open the terminal and run `ollama stop gemma4:e2b` (or quit Ollama).*
- "The game detects the timeout. Instead of freezing, the circuit breaker kicks in, seamlessly falling back to a degraded 'Scripted Warden' mode. You can still finish the puzzle."
- *Action: Restart Ollama in the background.*

**5. Set Piece and The Ending (2:30 - 3:30)**
- *Action: Press `F3` to jump to the set piece save.*
- "Let's skip ahead to the climax. You've been using darkness to your advantage, so the Warden forces the lights back on. The room adapts to your habits."
- *Action: Press `F4` to jump to the final console.*
- "We're at the final override console."
- *Action: Enter the code on the console: ▶ ◢ ⌐ ▶ ◣ (R, DR, HL, R, DL).*
- "The lift doors open."
- *Action: Click to enter the lift.*
- "At the end, you're presented with a dossier that shows your specific player archetype and observations dynamically written by the model based on your gameplay."
