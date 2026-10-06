// Dev-only harness for src/story. Not imported by the game.
import { createStory } from './index';
import { createAudio } from '../audio/index';

const game = document.getElementById('game') as HTMLCanvasElement;
const g = game.getContext('2d')!;
let t0 = performance.now();
(function draw(now: number) {
  const t = (now - t0) / 1000;
  g.fillStyle = '#d9dde0'; g.fillRect(0, 0, 1280, 720);
  g.fillStyle = '#b9bec2'; g.fillRect(0, 520, 1280, 200);
  g.fillStyle = '#1a1d20'; g.fillRect(200, 440, 340, 18); g.fillRect(560 + Math.sin(t) * 200, 330, 50, 190);
  g.fillStyle = '#9effc2'; g.beginPath(); g.arc(1100, 120, 26, 0, 7); g.fill();
  g.fillStyle = '#333'; g.font = '28px monospace'; g.fillText('fake game canvas  t=' + t.toFixed(1), 40, 60);
  requestAnimationFrame(draw);
})(t0);

const audio = createAudio();
const story = createStory(document.getElementById('stage')!, audio);
(window as unknown as { story: unknown }).story = story;
let inited = false;
document.getElementById('bar')!.addEventListener('click', async (e) => {
  const a = (e.target as HTMLElement).dataset.a;
  if (!a) return;
  if (!inited) { inited = true; try { await audio.init(); } catch { /* */ } }
  if (a === 'pro') story.playPrologue().then(() => console.log('prologue done'));
  if (a === 'wake') story.playWakeUp().then(() => console.log('wake done'));
  if (a === 'ch') story.showChapter({ numeral: 'I', title: 'THE CELL', subtitle: 'Nothing here was left by accident.', color: '#9effc2', difficulty: 'EASY' });
  if (a === 'ch2') {
    story.showChapter({ numeral: 'II', title: 'THE ARCHIVE', subtitle: 'Someone kept records of you.', color: '#ffb347', difficulty: 'MEDIUM' });
    story.showChapter({ numeral: 'V', title: 'THE CORE', subtitle: 'It has never been this close.', color: '#ff4d4d', difficulty: 'HARDEST' });
  }
  if (a === 'obj') story.setObjective(['Find a way out of the cell.', 'Restore power to the hall.'][Math.floor(Math.random() * 2)], '#9effc2');
  if (a === 'frag') story.showFragment(2, 5, "it watches the door, not the vent. it always watches the door. don't let it see you count.");
});
const q = new URLSearchParams(location.search).get('t');
if (q === 'ch') story.showChapter({ numeral: 'I', title: 'THE CELL', subtitle: 'Nothing here was left by accident.', color: '#9effc2', difficulty: 'EASY' });
