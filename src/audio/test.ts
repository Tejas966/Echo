// Dev test bench for the audio engine: /src/audio/test.html
import type { ScreenId, SfxCue, Tone } from '../types';
import { createAudio, audioDebug } from './index';

const A = createAudio();
const $ = (id: string) => document.getElementById(id)!;
const CUES: SfxCue[] = ['hover', 'click', 'pickup', 'success', 'fail', 'step', 'door_open', 'door_lock', 'shutter', 'flicker',
  'blackout', 'lights_on', 'steam', 'sparks', 'scrape', 'manifold_wrong', 'manifold_right', 'valve_click', 'hint', 'scare',
  'setpiece_slam', 'lift', 'keypad_beep', 'fuse_out', 'fuse_in', 'burn', 'projector', 'intercom', 'drip', 'footsteps_far', 'typewriter'];
const SCREENS: ScreenId[] = ['cell', 'archive', 'hall', 'exit'];
const TONES: Tone[] = ['polite', 'mocking', 'rattled', 'cold'];
const LINE = 'You took the fuse. I noticed. I notice everything, Subject 14.';

function btn(parent: string, label: string, fn: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button'); b.textContent = label; b.onclick = () => fn(b); $(parent).appendChild(b); return b;
}

$('init').onclick = async () => { await A.init(); A.setScreen('cell'); ($('init') as HTMLButtonElement).textContent = 'audio running'; meter(); };
SCREENS.forEach((s) => btn('screens', s, () => A.setScreen(s)));
($('tension') as HTMLInputElement).oninput = (ev) => { const v = +(ev.target as HTMLInputElement).value; $('tv').textContent = String(v); A.setTension(v); };
($('master') as HTMLInputElement).oninput = (ev) => A.setMaster(+(ev.target as HTMLInputElement).value);
TONES.forEach((t) => btn('tones', `say (${t})`, () => speak(t)));
btn('tones', 'step x8 (walk)', () => { for (let i = 0; i < 8; i++) setTimeout(() => A.sfx('step'), i * 340); });
btn('tones', 'typewriter line', () => { for (let i = 0; i < 40; i++) setTimeout(() => A.sfx('typewriter', { volume: 0.7 }), i * 45 + Math.random() * 20); });
const toggles: [string, (on: boolean) => void][] = [['thinking', A.setThinking], ['blind', A.setBlind], ['muted', A.setMuted], ['reduceScares', A.setReduceScares]];
toggles.forEach(([name, fn]) => { let on = false; btn('toggles', name, (b) => { on = !on; b.classList.toggle('on', on); fn(on); }); });
CUES.forEach((c) => btn('cues', c, () => A.sfx(c)));

function speak(tone: Tone): void {
  let i = 0;
  const step = () => {
    if (i >= LINE.length) return;
    const ch = LINE[i++];
    if (ch !== ' ') A.blip(tone);
    setTimeout(step, ch === '.' || ch === ',' ? 260 : 38);
  };
  step();
}

let hold = 0;
const buf = new Float32Array(2048);
function peakNow(): number {
  const tap = audioDebug.tap; if (!tap) return 0;
  tap.getFloatTimeDomainData(buf);
  let p = 0; for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
  return p;
}
const dbs = (v: number) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
function meter(): void {
  const p = peakNow(); hold = Math.max(hold, p);
  $('pk').textContent = dbs(p); $('hold').textContent = dbs(hold);
  ($('bar') as HTMLElement).style.width = `${Math.min(100, p * 100)}%`;
  requestAnimationFrame(meter);
}
$('reset').onclick = () => { hold = 0; };

// Measure: plays each cue alone with beds silent-ish and records the peak during its tail.
$('measure').onclick = async () => {
  await A.init();
  const out = $('out'); out.textContent = '';
  for (const c of CUES) {
    let pk = 0; const t0 = performance.now();
    A.sfx(c);
    await new Promise<void>((res) => {
      const iv = setInterval(() => { pk = Math.max(pk, peakNow()); if (performance.now() - t0 > 1800) { clearInterval(iv); res(); } }, 20);
    });
    out.textContent += `${c.padEnd(16)} ${dbs(pk)} dBFS\n`;
  }
  (window as unknown as { __measured: string }).__measured = out.textContent;
};
(window as unknown as { __A: typeof A }).__A = A;
