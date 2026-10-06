// Content filter for Warden lines (docs/03 §4.6) + in-character fallback line bank. Pure, DOM-free.
import type { ActionName, GameState, Glyph, Shape, Tone } from '../types';
import { GLYPH_CHAR, P1_CODE, P3_TRUE, P5_CODE, P5_HALL_VIEW, SHAPE_CHAR } from '../world/screens';

export type FilterResult = { ok: true } | { ok: false; reason: string };

const MAX_LEN = 120;

/** Small curated blocklist: profanity, slurs, self-harm phrasing. Word-boundary, case-insensitive. */
const BLOCKLIST: RegExp[] = [
  /\bf+u+c+k\w*/i, /\bshit\w*/i, /\bbitch\w*/i, /\bcunt\w*/i, /\bbastard\w*/i, /\basshole\w*/i, /\bdick(head)?\b/i,
  /\bpiss(ed)?\b/i, /\bwhore\w*/i, /\bslut\w*/i, /\bdamn\b/i,
  /\bnigg\w*/i, /\bfagg?\w*/i, /\bretard\w*/i, /\btrann\w*/i, /\bspic\b/i, /\bkike\b/i, /\bchink\b/i,
  /\bkill (yo)?urself\b/i, /\bkys\b/i, /\bsuicid\w*/i, /\bend (it all|your life)\b/i, /\bhang yourself\b/i,
  /\bcut yourself\b/i, /\bslit your\b/i, /\bself[- ]harm\b/i, /\byou should die\b/i,
];

/** Meta / fourth-wall words the Warden must never say. */
const META_WORDS = /\b(ai|a\.i\.|models?|gemma|json|games?|gaming|players?|prompts?|language model|llm|chatbot|assistant)\b/i;

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;

const NUM_WORD: Record<number, string> = { 1: 'one', 2: 'two', 3: 'three', 4: 'four' };

const SHAPE_WORDS: Record<Shape, string[]> = {
  tri: ['triangle', 'tri', SHAPE_CHAR.tri, '△'],
  circle: ['circle', 'dot', 'ring', SHAPE_CHAR.circle, '○'],
  square: ['square', 'box', SHAPE_CHAR.square, '□'],
  cross: ['cross', 'plus', SHAPE_CHAR.cross, '+'],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Ordered list of shape mentions in the text. */
function shapeMentions(text: string): Shape[] {
  const lower = text.toLowerCase();
  const hits: { at: number; shape: Shape }[] = [];
  for (const [shape, words] of Object.entries(SHAPE_WORDS) as [Shape, string[]][]) {
    for (const w of words) {
      const isWord = /^[a-z]+$/.test(w);
      const re = isWord ? new RegExp(String.raw`\b${w}s?\b`, 'g') : new RegExp(escapeRe(w), 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(lower))) hits.push({ at: m.index, shape });
    }
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.shape);
}

function glyphMentions(text: string): Glyph[] {
  const byChar = new Map<string, Glyph>();
  for (const [g, ch] of Object.entries(GLYPH_CHAR) as [Glyph, string][]) byChar.set(ch, g);
  const out: Glyph[] = [];
  for (const ch of text) { const g = byChar.get(ch); if (g) out.push(g); }
  return out;
}

/** true if `seq` appears in `hay` as a subsequence. */
function hasSubsequence<T>(hay: T[], seq: T[]): boolean {
  let i = 0;
  for (const x of hay) if (x === seq[i] && ++i === seq.length) return true;
  return seq.length === 0;
}

function spoiler(line: string): string | null {
  const lower = line.toLowerCase();
  for (const [color, n] of Object.entries(P3_TRUE)) {
    const re = new RegExp(String.raw`\b${color}\b[^.;,]{0,12}?(\bis\b|=|:|\bat\b|\bto\b|\bon\b|\bset\b)\s*(${n}|${NUM_WORD[n]})\b`, 'i');
    if (re.test(lower)) return `spoiler: true ${color} valve setting`;
  }
  const shapes = shapeMentions(line);
  if (shapes.length >= P1_CODE.length && hasSubsequence(shapes, P1_CODE)) return 'spoiler: keypad shape order';
  const glyphs = glyphMentions(line);
  if (glyphs.length >= 3 && (hasSubsequence(glyphs, P5_CODE) || hasSubsequence(glyphs, P5_HALL_VIEW) ||
      hasSubsequence(glyphs, P5_CODE.slice(0, 3)))) return 'spoiler: lift glyph code';
  return null;
}

export function filterLine(
  line: string,
  ctx: { state: GameState; action: ActionName; intensity: number },
): FilterResult {
  try {
    return filterLineImpl(line, ctx);
  } catch {
    return { ok: false, reason: 'filter error' };
  }
}

function filterLineImpl(
  line: string,
  ctx: { state: GameState; action: ActionName; intensity: number },
): FilterResult {
  if (typeof line !== 'string') return { ok: false, reason: 'line is not text' };
  const text = line.trim();
  if (!text) return { ok: false, reason: 'empty line' };
  if (text.length > MAX_LEN) return { ok: false, reason: `line too long (${text.length} > ${MAX_LEN})` };
  for (const re of BLOCKLIST) if (re.test(text)) return { ok: false, reason: 'blocklisted language' };
  const meta = text.match(META_WORDS);
  if (meta) return { ok: false, reason: `off-character word "${meta[0]}"` };
  if (EMOJI.test(text)) return { ok: false, reason: 'emoji/pictograph' };
  if ((text.match(/!/g) ?? []).length > 1) return { ok: false, reason: 'too many exclamation marks' };
  const recent = (ctx.state.warden?.lineHistory ?? []).slice(-3).map(norm);
  if (recent.includes(norm(text))) return { ok: false, reason: 'exact repeat of a recent line' };
  const sp = spoiler(text);
  if (sp && !(ctx.action === 'reveal_hint' && ctx.intensity === 3)) return { ok: false, reason: sp };
  return { ok: true };
}

export const FALLBACK_LINES: Record<Tone, string[]> = {
  polite: [
    'Please continue, Subject 14. You are being very informative.',
    'Excellent, Subject 14. Thirteen took twice as long.',
    'Take your time. I am taking notes.',
    'Your progress has been recorded. Thank you.',
    'A sensible choice, Subject 14. Mostly.',
    'The facility appreciates your cooperation.',
    'Do carry on. I would hate to interrupt.',
    'Noted. Subject 14 remains within expected parameters.',
  ],
  mocking: [
    'Fascinating. You tried that already. Twice.',
    'The bulb is hot. That is what bulbs do.',
    'Thirteen solved this faster. Thirteen is not here anymore.',
    'I have adjusted my estimate of you. Downward.',
    'Again? Very well. I will record it again.',
    'Subject 14 continues to be thorough. In the wrong places.',
    'Interesting strategy. Statistically, it is not working.',
    'You may stare at it longer. It will not stare back.',
  ],
  rattled: [
    'That— that was not the expected sequence.',
    'Recalculating. Recalculating.',
    'I can— I cannot see you. Return power to my eye.',
    'Stop. Stop that. Please hold still.',
    'This is— this is irregular, Subject 14.',
    'My records do not— they do not show that route.',
    'Wait. Wait. Let me observe you properly.',
    'That outcome was not— it was not projected.',
  ],
  cold: [
    'Rest, if you need to. The room will wait.',
    'We are nearly done, you and I.',
    'I will ease off. For now.',
    'Breathe, Subject 14. There is no hurry.',
    'It is quiet now. Listen to it.',
    'Whatever you choose, I will remember it.',
    'You are tired. So is the facility.',
    'Go on. I am only watching.',
  ],
};

/** Deterministic pick from the tone bank, skipping lines in `avoid` (case/space-insensitive). */
export function fallbackLine(tone: Tone, seed: number, avoid: string[] = []): string {
  const bank = FALLBACK_LINES[tone] ?? FALLBACK_LINES.polite;
  const avoidSet = new Set(avoid.map(norm));
  const start = Math.abs(Math.floor(Number.isFinite(seed) ? seed : 0)) % bank.length;
  for (let i = 0; i < bank.length; i++) {
    const cand = bank[(start + i) % bank.length];
    if (!avoidSet.has(norm(cand))) return cand;
  }
  return bank[start];
}
