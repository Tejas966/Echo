import { GOLDEN, runScript } from '../src/world/script';
import { interact, pressPad, enterScreen } from '../src/world/world';

// Run golden path to the console (when the player has spare fuse but hasn't entered the lift code yet).
// At this point, the last verbs should be populated.
const r = runScript(GOLDEN, { stopAt: 'console' });
let s = r.state;

let bad = 0;

// Go back to archive
enterScreen(s, 'archive', 300);

// Check printer
interact(s, 'printer', null);

// Interact with drawer14
interact(s, 'drawer14', null);

if (!s.stats.lastVerbs || s.stats.lastVerbs.length < 3) {
  console.log(`TIER 2 P7: FAIL (lastVerbs missing or < 3)`);
  process.exit(1);
}

// Press the exact 3 last verbs
pressPad(s, 'file', s.stats.lastVerbs[0]);
pressPad(s, 'file', s.stats.lastVerbs[1]);
pressPad(s, 'file', s.stats.lastVerbs[2]);

// Should now have core_key
if (!s.inventory.includes('core_key')) {
  console.log(`TIER 2 P7: FAIL (core_key not in inventory)`);
  process.exit(1);
}

// Go to hall
interact(s, 'shutter', null);

// Use core key on lift panel
interact(s, 'lift_panel', 'core_key');

const ok = s.ended === 'shutdown';
console.log(ok ? 'TIER 2 P7: PASS' : 'TIER 2 P7: FAIL (ended not shutdown)');
process.exit(ok ? 0 : 1);
