// STUB — Agent C replaces this with the real DOM UI. Keep the export signature.
import type { UIAPI } from '../types';

export function createUI(root: HTMLElement): UIAPI {
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:5%;right:5%;bottom:4%;min-height:2em;padding:8px;background:#000a;color:#cfe;';
  root.appendChild(box);
  return {
    async say(line, onChar) { box.textContent = `${line.speaker.toUpperCase()}: ${line.text}`; onChar?.(); await new Promise((r) => setTimeout(r, 1200)); },
    setInventory() {}, setJournal() {}, setHoverLabel() {},
    async ask(q) { return Number(prompt(q.prompt + '\n' + q.options.map((o, i) => `${i}: ${o}`).join('\n')) ?? 0); },
    openPad() {}, closePad() {},
    showTitle(onStart) { onStart(); }, setModelStatus() {},
    showEnd(r) { box.textContent = 'END ' + JSON.stringify(r.decisions); }, toast(t) { box.textContent = t; },
  };
}
