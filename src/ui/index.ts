// DOM overlay UI (Agent C). Dialogue, inventory, journal, hover label, intercom
// interview, keypad/console close-ups, title, status chip, end dossier, toasts.
import type { EndReport, Glyph, ItemId, Line, Question, Shape, Tone, UIAPI } from '../types';
import { GLYPH_CHAR, SHAPE_CHAR } from '../world/screens';
import { UI_CSS } from './styles';
import { itemName, makeIcon } from './icons';

const TONE_COLOR: Record<Tone, string> = {
  polite: '#9effc2',
  mocking: '#ffc14d',
  rattled: '#ff3df0',
  cold: '#8fd3ff',
};
const CPS = 38;
const GLITCH_CHARS = '#%&@$?!/\\|█▓▒░<>';
const SHAPES: Shape[] = ['tri', 'circle', 'square', 'cross'];
const GLYPHS: Glyph[] = ['L', 'R', 'DR', 'DL', 'HL', 'HR'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const safe = (fn?: () => void) => { try { fn?.(); } catch (err) { console.warn('[ui] callback error', err); } };
const stop = (e: Event) => e.stopPropagation();
/** Keep pointer events on UI elements from reaching game listeners on window/document. */
function shield(node: HTMLElement) {
  for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'contextmenu', 'wheel']) node.addEventListener(t, stop);
}
function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createUI(root: HTMLElement): UIAPI {
  // ---------- style + layers ----------
  if (!document.getElementById('ui-style')) {
    const st = document.createElement('style');
    st.id = 'ui-style';
    st.textContent = UI_CSS;
    document.head.appendChild(st);
  }
  root.querySelectorAll(':scope > .ui-layer').forEach((n) => n.remove());

  /** Layer aligned exactly with the rendered game canvas (letterbox-aware). */
  const stage = el('div', 'ui-layer ui-stage');
  /** Layer covering the whole root (title, end, modals). */
  const full = el('div', 'ui-layer ui-full');
  root.append(stage, full);

  const layout = () => {
    const canvas = (root.parentElement?.querySelector('canvas') ?? document.getElementById('game')) as HTMLCanvasElement | null;
    const rr = root.getBoundingClientRect();
    let x = 0, y = 0, w = rr.width, h = rr.height;
    if (canvas) {
      const cr = canvas.getBoundingClientRect();
      if (cr.width > 0 && cr.height > 0) { x = cr.left - rr.left; y = cr.top - rr.top; w = cr.width; h = cr.height; }
    }
    if (!(w > 0)) w = 1280;
    Object.assign(stage.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    root.style.setProperty('--u', `${(w / 100).toFixed(3)}px`);
  };
  layout();
  window.addEventListener('resize', layout);
  try {
    const ro = new ResizeObserver(layout);
    ro.observe(root);
    const c = root.parentElement?.querySelector('canvas');
    if (c) ro.observe(c);
  } catch { /* old browser */ }
  requestAnimationFrame(layout);

  // ---------- hover label ----------
  const hover = el('div', 'ui-hover');
  full.appendChild(hover);

  // ---------- status chip ----------
  const chip = el('div', 'ui-chip');
  stage.appendChild(chip);
  let modelStatus = '';

  // ---------- toasts ----------
  const toasts = el('div', 'ui-toasts');
  stage.appendChild(toasts);

  // =====================================================================
  // DIALOGUE
  // =====================================================================
  const dlg = el('div', 'ui-dlg ui-hit');
  const dlgName = el('div', 'ui-dlg-name');
  const dlgText = el('div', 'ui-dlg-text');
  const dlgMore = el('div', 'ui-dlg-more', '▼');
  dlg.append(dlgName, dlgText, dlgMore);
  stage.appendChild(dlg);
  shield(dlg);

  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  let gen = 0;              // bumped on reset to abort queued lines
  let skipType = false;     // click during typing
  let skipHold = false;     // click during hold
  let typing = false;
  let hideTimer = 0;
  let glitchTimer = 0;

  dlg.addEventListener('click', () => {
    if (typing) skipType = true;
    else skipHold = true;
  });

  function buildLine(text: string): HTMLSpanElement[] {
    dlgText.textContent = '';
    const chars: HTMLSpanElement[] = [];
    const parts = text.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        dlgText.appendChild(document.createTextNode(' '));
        if (chars.length) chars[chars.length - 1].dataset.we = '1';
        continue;
      }
      const w = el('span', 'ui-w');
      for (const ch of Array.from(p)) {
        const c = el('span', 'ui-c', ch);
        w.appendChild(c);
        chars.push(c);
      }
      dlgText.appendChild(w);
    }
    return chars;
  }

  function styleFor(line: Line) {
    const speaker = line.speaker;
    const tone: Tone = line.tone ?? 'polite';
    dlg.className = 'ui-dlg ui-hit ui-show';
    dlgName.textContent = '';
    dlg.style.removeProperty('--ui-tc');
    if (speaker === 'warden') {
      dlg.classList.add('ui-warden', `ui-${tone}`);
      dlg.style.setProperty('--ui-tc', TONE_COLOR[tone] ?? TONE_COLOR.polite);
      dlgName.append(el('span', 'ui-dot'), el('span', '', 'WARDEN'), el('span', 'ui-tone', `// ${tone}`));
      dlgName.style.display = '';
    } else if (speaker === 'subject13') {
      dlg.classList.add('ui-subject13');
      dlgName.append(el('span', '', 'SUBJECT 13'));
      dlgName.style.display = '';
    } else {
      dlg.classList.add('ui-narrator');
      dlgName.style.display = 'none';
    }
    return speaker === 'warden' && tone === 'rattled';
  }

  function startGlitch(chars: HTMLSpanElement[]) {
    stopGlitch();
    const letters = chars.filter((c) => c.textContent && c.textContent.trim());
    if (!letters.length) return;
    glitchTimer = window.setInterval(() => {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const c = letters[Math.floor(Math.random() * letters.length)];
        if (!c.classList.contains('ui-on') || c.dataset.g) continue;
        const orig = c.textContent ?? '';
        c.dataset.g = '1';
        c.classList.add('ui-j');
        if (Math.random() < 0.6) c.textContent = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        setTimeout(() => { c.textContent = orig; c.classList.remove('ui-j'); delete c.dataset.g; }, 70 + Math.random() * 140);
      }
    }, 140);
  }
  function stopGlitch() { if (glitchTimer) { clearInterval(glitchTimer); glitchTimer = 0; } }

  async function runLine(line: Line, onChar: (() => void) | undefined, myGen: number) {
    if (myGen !== gen) return;
    clearTimeout(hideTimer);
    const text = String(line?.text ?? '');
    const rattled = styleFor(line ?? { speaker: 'narrator', text: '' });
    const chars = buildLine(text);
    if (rattled) startGlitch(chars);
    if (line?.speaker === 'subject13') {
      for (const c of chars) c.style.transform = `rotate(${(Math.random() * 10 - 5).toFixed(1)}deg) translateY(${(Math.random() * 2 - 1).toFixed(1)}px)`;
    }
    skipType = false; skipHold = false; typing = true;
    const stepMs = 1000 / CPS;
    let due = performance.now();
    for (let i = 0; i < chars.length; i++) {
      if (myGen !== gen) { typing = false; return; }
      if (skipType) { for (let j = i; j < chars.length; j++) chars[j].classList.add('ui-on'); break; }
      const c = chars[i];
      c.classList.add('ui-on');
      const ch = c.textContent ?? '';
      if (ch.trim()) safe(onChar);
      if (rattled && Math.random() < 0.06) { c.classList.add('ui-j'); setTimeout(() => c.classList.remove('ui-j'), 220); }
      due += stepMs * ((/[.!?]/.test(ch) ? 5 : /[,;:—–]/.test(ch) ? 3 : 1) + (c.dataset.we ? 1 : 0));
      const wait = due - performance.now();
      if (wait > 1) await sleep(wait); else if (i % 8 === 7) await sleep(0);
    }
    typing = false;
    dlg.classList.add('ui-done');
    const hold = 1200 + 25 * text.length;
    const end = performance.now() + hold;
    while (performance.now() < end && !skipHold && myGen === gen) await sleep(50);
    dlg.classList.remove('ui-done');
    stopGlitch();
  }

  function say(line: Line, onChar?: () => void): Promise<void> {
    const myGen = gen;
    pending++;
    const p = tail.then(() => runLine(line, onChar, myGen)).catch((e) => console.warn('[ui] say', e)).finally(() => {
      pending = Math.max(0, pending - 1);
      if (pending === 0) {
        clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => { if (pending === 0) dlg.classList.remove('ui-show'); }, 250);
      }
    });
    tail = p;
    return p;
  }

  function resetDialogue() {
    gen++;
    skipType = true; skipHold = true;
    stopGlitch();
    dlg.classList.remove('ui-show');
  }

  // =====================================================================
  // INVENTORY
  // =====================================================================
  const inv = el('div', 'ui-inv');
  stage.appendChild(inv);
  let invKey = '';
  let invSelect: (item: ItemId | null) => void = () => {};
  let invHolding: ItemId | null = null;
  const iconCache = new Map<string, HTMLCanvasElement>();

  function setInventory(items: ItemId[], holding: ItemId | null, onSelect: (item: ItemId | null) => void) {
    invSelect = onSelect ?? (() => {});
    invHolding = holding ?? null;
    const counts = new Map<ItemId, number>();
    for (const it of items ?? []) counts.set(it, (counts.get(it) ?? 0) + 1);
    const key = [...counts].map(([k, n]) => `${k}x${n}`).join(',');
    if (key !== invKey) {
      const prev = new Set(invKey.split(',').map((s) => s.split('x')[0]));
      invKey = key;
      inv.textContent = '';
      for (const [item, n] of counts) {
        const slot = el('div', 'ui-slot ui-hit');
        slot.dataset.item = item;
        if (prev.has(item)) slot.style.animation = 'none';
        let icon = iconCache.get(item);
        if (!icon) { icon = makeIcon(item, 72); iconCache.set(item, icon); }
        const ic = icon.cloneNode() as HTMLCanvasElement;
        ic.getContext('2d')?.drawImage(icon, 0, 0);
        slot.appendChild(ic);
        if (n > 1) slot.appendChild(el('span', 'ui-cnt', `×${n}`));
        slot.appendChild(el('span', 'ui-tip', itemName(item)));
        shield(slot);
        slot.addEventListener('click', () => {
          const next = invHolding === item ? null : item;
          invHolding = next;
          paintSel();
          safe(() => invSelect(next));
        });
        inv.appendChild(slot);
      }
    }
    paintSel();
  }
  function paintSel() {
    inv.querySelectorAll<HTMLElement>('.ui-slot').forEach((s) => s.classList.toggle('ui-sel', s.dataset.item === invHolding));
  }

  // =====================================================================
  // JOURNAL
  // =====================================================================
  const jbtn = el('button', 'ui-jbtn ui-hit');
  const jlabel = el('span', '', 'JOURNAL');
  const jcount = el('span', 'ui-jn', '');
  jbtn.append(jlabel, jcount);
  const jpanel = el('div', 'ui-jpanel ui-hit');
  stage.append(jbtn, jpanel);
  shield(jbtn); shield(jpanel);
  let jEntries: string[] = [];
  let jSeen = 0;
  let jInit = false;
  jbtn.addEventListener('click', () => {
    jpanel.classList.toggle('ui-open');
    if (jpanel.classList.contains('ui-open')) { renderJournal(); jSeen = jEntries.length; jcount.textContent = ''; }
  });
  function renderJournal() {
    jpanel.textContent = '';
    jpanel.appendChild(el('h3', '', 'JOURNAL — SUBJECT 14'));
    if (!jEntries.length) { jpanel.appendChild(el('div', 'ui-empty', 'Nothing written yet.')); return; }
    const ol = el('ol');
    jEntries.forEach((e, i) => ol.appendChild(el('li', i >= jSeen ? 'ui-new' : '', e)));
    jpanel.appendChild(ol);
    jpanel.scrollTop = jpanel.scrollHeight;
  }
  function setJournal(entries: string[]) {
    const next = Array.isArray(entries) ? entries.map(String) : [];
    const grew = next.length > jEntries.length;
    jEntries = next.slice();
    if (!jInit) { jInit = true; jSeen = jEntries.length; }
    if (jpanel.classList.contains('ui-open')) { renderJournal(); jSeen = jEntries.length; }
    const unread = jEntries.length - jSeen;
    jcount.textContent = unread > 0 ? `+${unread}` : '';
    if (grew && jEntries.length > 0) {
      jbtn.classList.remove('ui-pulse');
      void jbtn.offsetWidth;
      jbtn.classList.add('ui-pulse');
    }
    if (jEntries.length < jSeen) jSeen = jEntries.length;
  }

  // =====================================================================
  // HOVER LABEL
  // =====================================================================
  function setHoverLabel(label: string | null, x: number, y: number) {
    if (!label) { hover.style.display = 'none'; return; }
    if (hover.textContent !== label) hover.textContent = label;
    hover.style.display = 'block';
    const w = hover.offsetWidth, h = hover.offsetHeight;
    let lx = (x || 0) + 16, ly = (y || 0) + 18;
    if (lx + w > window.innerWidth - 4) lx = (x || 0) - w - 10;
    if (ly + h > window.innerHeight - 4) ly = (y || 0) - h - 10;
    hover.style.left = `${Math.max(2, lx)}px`;
    hover.style.top = `${Math.max(2, ly)}px`;
  }

  // =====================================================================
  // ASK (intercom interview)
  // =====================================================================
  let askTail: Promise<unknown> = Promise.resolve();
  let askCancel: (() => void) | null = null;

  function runAsk(q: Question): Promise<number> {
    return new Promise<number>((resolve) => {
      const modal = el('div', 'ui-modal ui-hit');
      const card = el('div', 'ui-card ui-ask');
      const hdr = el('div', 'ui-ask-hdr');
      hdr.append(el('span', 'ui-dot'), el('span', '', 'WARDEN — INTERCOM'));
      const pq = el('div', 'ui-ask-q', String(q?.prompt ?? ''));
      const opts = el('div', 'ui-ask-opts');
      const options = Array.isArray(q?.options) && q.options.length ? q.options : ['…'];
      let done = false;
      const finish = (i: number) => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', onKey, true);
        askCancel = null;
        const b = opts.children[i] as HTMLElement | undefined;
        b?.classList.add('ui-picked');
        setTimeout(() => { modal.remove(); resolve(i); }, b ? 220 : 0);
      };
      options.forEach((o, i) => {
        const b = el('button', 'ui-opt');
        b.append(el('span', 'ui-k', `${i + 1}`), document.createTextNode(String(o)));
        b.addEventListener('click', () => finish(i));
        opts.appendChild(b);
      });
      const onKey = (e: KeyboardEvent) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= options.length) { e.preventDefault(); e.stopPropagation(); finish(n - 1); }
      };
      window.addEventListener('keydown', onKey, true);
      askCancel = () => finish(0);
      card.append(hdr, pq, opts);
      modal.appendChild(card);
      shield(modal);
      full.appendChild(modal);
      setTimeout(() => (opts.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true }), 50);
    });
  }
  function ask(q: Question): Promise<number> {
    const p = askTail.then(() => runAsk(q));
    askTail = p.catch(() => undefined);
    return p;
  }

  // =====================================================================
  // PAD (keypad / console close-up)
  // =====================================================================
  let padModal: HTMLElement | null = null;
  let padKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  let padClearTimer = 0;

  function closePad() {
    clearTimeout(padClearTimer);
    if (padKeyHandler) window.removeEventListener('keydown', padKeyHandler, true);
    padKeyHandler = null;
    padModal?.remove();
    padModal = null;
  }

  function openPad(kind: 'keypad' | 'console', onPress: (sym: Shape | Glyph) => void, onClose: () => void) {
    closePad();
    const isKeypad = kind === 'keypad';
    const syms: (Shape | Glyph)[] = isKeypad ? SHAPES : GLYPHS;
    const charOf = (s: Shape | Glyph) => (isKeypad ? SHAPE_CHAR[s as Shape] : GLYPH_CHAR[s as Glyph]) ?? '?';
    const slots = isKeypad ? 4 : 5;

    const modal = el('div', 'ui-modal ui-hit');
    const card = el('div', 'ui-card ui-pad');
    const hdr = el('div', 'ui-pad-hdr');
    const x = el('button', 'ui-x', '×');
    x.title = 'Close (Esc)';
    hdr.append(el('span', '', isKeypad ? 'CELL 14 — DOOR KEYPAD' : 'OVERRIDE CONSOLE — HALL'), x);
    const disp = el('div', 'ui-disp');
    const cells: HTMLSpanElement[] = [];
    for (let i = 0; i < slots; i++) { const s = el('span'); cells.push(s); disp.appendChild(s); }
    const keys = el('div', `ui-keys ${isKeypad ? 'ui-k4' : 'ui-k6'}`);
    let entry: (Shape | Glyph)[] = [];
    const paint = () => cells.forEach((c, i) => (c.textContent = entry[i] ? charOf(entry[i]) : ''));

    const press = (s: Shape | Glyph, btn?: HTMLElement) => {
      if (entry.length >= slots) { clearTimeout(padClearTimer); entry = []; disp.classList.remove('ui-full'); }
      entry.push(s);
      paint();
      if (btn) { btn.classList.add('ui-press'); setTimeout(() => btn.classList.remove('ui-press'), 110); }
      if (entry.length >= slots) {
        disp.classList.add('ui-full');
        clearTimeout(padClearTimer);
        padClearTimer = window.setTimeout(() => { entry = []; disp.classList.remove('ui-full'); paint(); }, 750);
      }
      safe(() => onPress(s));
    };
    const btns: HTMLButtonElement[] = [];
    syms.forEach((s) => {
      const b = el('button', 'ui-key', charOf(s));
      b.title = String(s);
      b.addEventListener('click', () => press(s, b));
      keys.appendChild(b);
      btns.push(b);
    });
    const close = () => { if (padModal !== modal) return; closePad(); safe(onClose); };
    x.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const hint = el('div', 'ui-pad-hint', `keys 1–${syms.length} · esc to step back`);
    card.append(hdr, disp, keys, hint);
    modal.appendChild(card);
    shield(modal);
    full.appendChild(modal);
    padModal = modal;
    padKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= syms.length) { e.preventDefault(); e.stopPropagation(); press(syms[n - 1], btns[n - 1]); }
    };
    window.addEventListener('keydown', padKeyHandler, true);
  }

  // =====================================================================
  // TITLE
  // =====================================================================
  let title: HTMLElement | null = null;
  let titleStatus: HTMLElement | null = null;
  let titleCleanup: (() => void) | null = null;

  function showTitle(onStart: () => void, opts: { modelStatus: string }) {
    titleCleanup?.();
    title?.remove();
    modelStatus = opts?.modelStatus ?? modelStatus;
    const t = el('div', 'ui-title ui-hit');
    t.appendChild(el('div', 'ui-title-fac', 'CUSTODIAL INTELLIGENCE · W-14'));
    t.appendChild(el('h1', '', 'THE ROOM THAT FIGHTS BACK'));
    t.appendChild(el('div', 'ui-title-sub', 'Facility W-14 · Subject 14'));
    titleStatus = el('div', 'ui-title-status', modelStatus);
    t.appendChild(titleStatus);
    const b = el('button', 'ui-begin', 'BEGIN');
    t.appendChild(b);
    t.appendChild(el('div', 'ui-title-hint', "Click to walk & interact · Select an item, then click to use it · TAB: Game Master's mind · M: mute"));
    shield(t);
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      window.removeEventListener('keydown', onKey, true);
      t.classList.add('ui-gone');
      setTimeout(() => { t.remove(); if (title === t) { title = null; titleStatus = null; } }, 750);
      updateChip();
      safe(onStart);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); start(); } };
    b.addEventListener('click', start);
    window.addEventListener('keydown', onKey, true);
    titleCleanup = () => { started = true; window.removeEventListener('keydown', onKey, true); };
    full.appendChild(t);
    title = t;
    updateChip();
    setTimeout(() => b.focus({ preventScroll: true }), 50);
  }

  function updateChip() {
    const titleUp = !!title && !title.classList.contains('ui-gone');
    chip.textContent = modelStatus;
    chip.classList.toggle('ui-show', !!modelStatus && !titleUp);
  }
  function setModelStatus(text: string) {
    modelStatus = String(text ?? '');
    if (titleStatus) titleStatus.textContent = modelStatus;
    updateChip();
  }

  // =====================================================================
  // END DOSSIER
  // =====================================================================
  let endEl: HTMLElement | null = null;

  function showEnd(report: EndReport, onRestart: () => void) {
    endEl?.remove();
    closePad();
    askCancel?.();
    resetDialogue();
    setHoverLabel(null, 0, 0);
    jpanel.classList.remove('ui-open');

    const r = report ?? ({} as EndReport);
    const end = el('div', 'ui-end ui-hit');
    const paper = el('div', 'ui-paper');
    end.appendChild(paper);
    shield(end);

    paper.appendChild(el('h2', '', r.escaped ? 'SUBJECT 14 — FILE' : 'SUBJECT 14 — RETAINED'));
    paper.appendChild(el('div', 'ui-meta',
      `FACILITY W-14 · DURATION ${fmtTime(r.timeMs)} · OUTCOME: ${r.escaped ? 'EXITED FACILITY' : 'RETAINED'} · FUSE REMOVED: ${String(r.fuseChoice ?? 'none').replace(/_/g, ' ').toUpperCase()}`));
    paper.appendChild(el('div', 'ui-meta', 'WHAT THE ROOM LEARNED ABOUT YOU'));

    // typed elements, revealed in order
    const typed: { node: HTMLElement; text: string }[] = [];
    const typedEl = (parent: HTMLElement, cls: string, text: string) => {
      const n = el('span', cls);
      n.dataset.full = text;
      parent.appendChild(n);
      typed.push({ node: n, text });
      return n;
    };
    const blocks: HTMLElement[] = [];
    const block = (node: HTMLElement) => { node.classList.add('ui-hide'); paper.appendChild(node); blocks.push(node); return node; };

    // stats
    const hStats = block(el('h4', '', 'OBSERVED'));
    const statRows: HTMLElement[] = [];
    for (const s of Array.isArray(r.stats) ? r.stats : []) {
      const row = el('div', 'ui-row');
      typedEl(row, 'ui-l', String(s?.label ?? ''));
      typedEl(row, 'ui-v', String(s?.value ?? ''));
      paper.appendChild(row);
      statRows.push(row);
    }
    // archetype
    const hArch = block(el('h4', '', 'CLASSIFICATION'));
    const arch = block(el('div', 'ui-arch', String(r.archetype ?? 'unknown').toUpperCase()));
    const habit = block(el('div', 'ui-habit', r.habit ? `Dominant habit: ${r.habit}` : ''));
    // observations
    const hObs = block(el('h4', '', 'WARDEN OBSERVATIONS'));
    const obsNodes: HTMLElement[] = [];
    for (const o of (Array.isArray(r.observations) ? r.observations : []).slice(0, 3)) {
      const d = el('div', 'ui-obs');
      typedEl(d, '', `“${String(o)}”`);
      paper.appendChild(d);
      obsNodes.push(d);
    }
    // decisions
    const d = r.decisions ?? ({} as EndReport['decisions']);
    const hDec = block(el('h4', '', 'WARDEN DECISIONS'));
    const dec = block(el('div', 'ui-dec'));
    const cell = (label: string, value: string | number, wide = false) => {
      const c = el('div', wide ? 'ui-wide' : '');
      c.append(el('b', '', String(value)), el('small', '', label));
      dec.appendChild(c);
    };
    cell('made', d.made ?? 0);
    cell('accepted', d.accepted ?? 0);
    cell('amended', d.amended ?? 0);
    cell('vetoed', d.vetoed ?? 0);
    cell('fallback', d.fallback ?? 0);
    cell('mean latency', `${Math.round(d.meanLatencyMs ?? 0)} ms`);
    cell('most-used action', String(d.topAction ?? '—'), true);

    const stamp = el('div', 'ui-stamp');
    stamp.innerHTML = 'FILE FORWARDED TO:<br>SUBJECT 15 PREPARATION';
    paper.appendChild(stamp);

    const restart = el('button', 'ui-restart', 'RESTART');
    paper.appendChild(restart);
    const skip = el('div', 'ui-skip', 'click to skip');
    end.appendChild(skip);

    // hide all typed rows initially
    for (const n of [...statRows, ...obsNodes]) n.classList.add('ui-hide');
    for (const t of typed) t.node.textContent = '';

    full.appendChild(end);
    endEl = end;

    let skipping = false;
    let restarted = false;
    const myEnd = end;
    end.addEventListener('click', (e) => { if (e.target !== restart) skipping = true; });
    restart.addEventListener('click', () => {
      if (restarted) return;
      restarted = true;
      end.remove();
      if (endEl === end) endEl = null;
      safe(onRestart);
    });

    const typeInto = async (node: HTMLElement, text: string, cps: number) => {
      if (skipping) { node.textContent = text; return; }
      const step = 1000 / cps;
      for (let i = 1; i <= text.length; i++) {
        if (skipping || endEl !== myEnd) { node.textContent = text; return; }
        node.textContent = text.slice(0, i);
        if (i % 2 === 0) await sleep(step * 2);
      }
    };
    const pause = (ms: number) => (skipping ? Promise.resolve() : sleep(ms));
    const showB = (n: HTMLElement) => { n.classList.remove('ui-hide'); const nb = n.getBoundingClientRect().bottom, eb = end.getBoundingClientRect().bottom; if (nb > eb - 16) end.scrollTop += nb - eb + 40; };

    (async () => {
      await pause(700);
      showB(hStats);
      for (const row of statRows) {
        showB(row);
        const spans = row.querySelectorAll<HTMLElement>('span');
        for (const s of Array.from(spans)) await typeInto(s, s.dataset.full ?? '', 90);
        await pause(120);
      }
      await pause(400);
      showB(hArch); await pause(200);
      showB(arch); await pause(350);
      if (r.habit) showB(habit);
      await pause(500);
      showB(hObs);
      for (const o of obsNodes) {
        showB(o);
        const s = o.querySelector<HTMLElement>('span');
        if (s) await typeInto(s, s.dataset.full ?? '', 45);
        await pause(450);
      }
      await pause(300);
      showB(hDec); showB(dec);
      await pause(900);
      if (endEl !== myEnd) return;
      stamp.classList.add('ui-slam');
      await pause(500);
      restart.classList.add('ui-show');
      skip.remove();
      setTimeout(() => restart.focus({ preventScroll: true }), 50);
    })().catch((e) => console.warn('[ui] end reveal', e));
  }

  // =====================================================================
  // TOAST
  // =====================================================================
  function toast(text: string) {
    const t = el('div', 'ui-toast', String(text ?? ''));
    toasts.appendChild(t);
    while (toasts.children.length > 4) toasts.firstElementChild?.remove();
    setTimeout(() => { t.classList.add('ui-out'); setTimeout(() => t.remove(), 450); }, 2500);
  }

  return {
    say,
    setInventory,
    setJournal,
    setHoverLabel,
    ask,
    openPad,
    closePad,
    showTitle,
    setModelStatus,
    showEnd,
    toast,
  };
}
