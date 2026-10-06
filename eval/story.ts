// Story layer check: along the golden path, chapters only move forward and there is always an objective.
import { GOLDEN, runScript } from '../src/world/script';
import { chapterFor, objectiveFor, CHAPTERS } from '../src/world/story';

const order = Object.keys(CHAPTERS);
let last = -1; let bad = 0; const seen: string[] = []; let lastObj = '';
runScript(GOLDEN, {
  onStep: (s) => {
    if (s.ended) return;
    const c = order.indexOf(chapterFor(s).id);
    if (c < last) { bad++; console.log(`chapter went backwards: ${order[last]} -> ${order[c]}`); }
    if (c > last) seen.push(order[c]);
    last = Math.max(last, c);
    const o = objectiveFor(s);
    if (!o) { bad++; console.log('empty objective at', s.screen, Object.keys(s.stats.solvedAt)); }
    if (o !== lastObj) { console.log(`  [${order[c]}] ${o}`); lastObj = o; }
  },
});
console.log(`chapters seen: ${seen.join(' → ')}`);
const ok = bad === 0 && seen.length === order.length;
console.log(ok ? 'STORY: PASS' : 'STORY: FAIL');
process.exit(ok ? 0 : 1);
