// Golden-path bot: plays the intended solution headlessly and checks the room stays solvable after every step.
import { GOLDEN, runScript } from '../src/world/script';
import { checkSolvable } from '../src/rules';

let bad = 0;
const r = runScript(GOLDEN, {
  onStep: (s, i, op) => {
    if (s.ended) return;
    const c = checkSolvable(s);
    if (!c.ok) { bad++; console.log(`UNSOLVABLE after step ${i} ${JSON.stringify(op)}: ${c.detail}`); }
  },
});
const s = r.state;
console.log(r.trace.slice(-6).join('\n'));
console.log(`\nflags: ${Object.keys(s.flags).filter((k) => s.flags[k]).join(', ')}`);
console.log(`solved: ${JSON.stringify(s.stats.solvedAt)}  ended=${s.ended} screen=${s.screen}`);
const ok = s.ended === 'escaped' && s.screen === 'exit' && bad === 0;
console.log(ok ? 'GOLDEN PATH: PASS' : `GOLDEN PATH: FAIL (unsolvable prefixes: ${bad})`);
process.exit(ok ? 0 : 1);
