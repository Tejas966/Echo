// Warden spoken voice via the browser's built-in speech synthesis (offline Windows voices in Chrome).
// Deep, slow, per-tone delivery; the synthesized vocal blips keep playing quietly underneath for texture.
import type { Tone } from '../types';

const TONE: Record<Tone, { pitch: number; rate: number }> = {
  polite: { pitch: 0.7, rate: 0.9 },
  mocking: { pitch: 0.6, rate: 0.84 },
  rattled: { pitch: 0.8, rate: 1.05 },
  cold: { pitch: 0.45, rate: 0.8 },
};
const PREFERRED = [/Microsoft (David|Mark|Guy|George|Ryan)/i, /Google UK English Male/i, /Daniel/i, /English.*Male/i, /^en-GB/i, /^en/i];

export class WardenVoice {
  enabled = true;
  private voice: SpeechSynthesisVoice | null = null;
  private volume = 0.9;
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor() {
    if (!this.supported) { this.enabled = false; return; }
    const pick = () => {
      const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
      for (const re of PREFERRED) { const v = vs.find((x) => re.test(x.name) || re.test(x.lang)); if (v) { this.voice = v; return; } }
      this.voice = vs[0] ?? null;
    };
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
  }

  get name() { return this.voice?.name ?? 'default'; }
  setVolume(v: number) { this.volume = v; }

  /** Speak one line. Always resolves (end, error, or a length-based timeout) so dialogue never stalls. */
  speak(text: string, tone: Tone): Promise<void> {
    if (!this.enabled || !this.supported || this.volume <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
      const timer = setTimeout(finish, 2500 + text.length * 110);
      try {
        const u = new SpeechSynthesisUtterance(text.replace(/—/g, ', ').replace(/\bSubject 14\b/g, 'Subject fourteen'));
        if (this.voice) u.voice = this.voice;
        const p = TONE[tone] ?? TONE.cold;
        u.pitch = tone === 'rattled' ? 0.5 + Math.random() * 0.6 : p.pitch;
        u.rate = p.rate;
        u.volume = this.volume;
        u.onend = finish; u.onerror = finish;
        speechSynthesis.speak(u);
      } catch { finish(); }
    });
  }

  cancel() { if (this.supported) speechSynthesis.cancel(); }
}
