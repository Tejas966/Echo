// Scoped styles for the DOM overlay. All class names are prefixed `ui-`.
// Sizes use var(--u) = 1% of the rendered game-canvas width (set from JS), so the
// overlay scales with the stage.

export const UI_CSS = `
#ui-root { --u: 12.8px; font-family: 'Courier New', ui-monospace, Consolas, monospace; }
#ui-root > .ui-layer { position: absolute; pointer-events: none; }
#ui-root > .ui-layer.ui-full { inset: 0; }
.ui-layer * { box-sizing: border-box; }
.ui-hit { pointer-events: auto; }

/* ---------- dialogue ---------- */
.ui-dlg {
  position: absolute; left: 12%; right: 12%; bottom: 3.5%;
  min-height: calc(var(--u) * 7.2);
  padding: calc(var(--u) * 1.1) calc(var(--u) * 1.6) calc(var(--u) * 1.2);
  background: linear-gradient(180deg, rgba(6,9,12,0.86), rgba(3,5,7,0.94));
  border: 1px solid rgba(160,190,210,0.18); border-left: calc(var(--u) * 0.3) solid var(--ui-tc, #9effc2);
  box-shadow: 0 0 calc(var(--u)*2) rgba(0,0,0,0.6), inset 0 0 calc(var(--u)*3) rgba(0,0,0,0.5);
  color: #d8e0e8; font-size: clamp(11px, calc(var(--u) * 1.32), 26px); line-height: 1.45;
  opacity: 0; transform: translateY(calc(var(--u) * 0.6)); transition: opacity .28s, transform .28s;
  cursor: pointer; user-select: none;
}
.ui-dlg.ui-show { opacity: 1; transform: none; }
#ui-root .ui-dlg:not(.ui-show) { pointer-events: none; }
.ui-dlg::after { /* scanlines */
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px);
}
.ui-dlg-name {
  font-size: 0.72em; letter-spacing: 0.32em; font-weight: bold; color: var(--ui-tc, #9effc2);
  margin-bottom: 0.35em; display: flex; align-items: center; gap: 0.6em;
  text-shadow: 0 0 calc(var(--u)*0.6) var(--ui-tc, #9effc2);
}
.ui-dlg-name .ui-dot { width: 0.6em; height: 0.6em; border-radius: 50%; background: var(--ui-tc); box-shadow: 0 0 0.6em var(--ui-tc); animation: ui-blink 1.1s steps(2) infinite; }
.ui-dlg-name .ui-tone { opacity: .45; letter-spacing: .18em; font-weight: normal; font-size: .85em; }
.ui-dlg-text { color: var(--ui-tc, #d8e0e8); min-height: 2.9em; }
.ui-dlg-text .ui-w { white-space: nowrap; display: inline-block; }
.ui-dlg-text .ui-c { visibility: hidden; display: inline-block; white-space: pre; }
.ui-dlg-text .ui-c.ui-on { visibility: visible; }
.ui-dlg-more { position: absolute; right: calc(var(--u)*1.2); bottom: calc(var(--u)*0.6); font-size: .7em; opacity: 0; color: var(--ui-tc); }
.ui-dlg.ui-done .ui-dlg-more { opacity: .6; animation: ui-blink 1s steps(2) infinite; }

.ui-dlg.ui-warden .ui-dlg-text { text-shadow: 0 0 calc(var(--u)*0.5) color-mix(in srgb, var(--ui-tc) 45%, transparent); }
.ui-dlg.ui-rattled .ui-dlg-text .ui-c.ui-j { animation: ui-jit .18s steps(2) infinite; color: #fff; text-shadow: -2px 0 #00f6ff, 2px 0 #ff3df0; }
.ui-dlg.ui-rattled { animation: ui-boxjit 2.4s infinite; }
.ui-dlg.ui-narrator { --ui-tc: #aab3bb; border-left-color: #3a424a; }
.ui-dlg.ui-narrator .ui-dlg-text { font-style: italic; color: #9aa3ab; }
.ui-dlg.ui-subject13 { --ui-tc: #7cff8a; background: linear-gradient(180deg, rgba(4,14,6,0.88), rgba(2,8,3,0.95)); }
.ui-dlg.ui-subject13 .ui-dlg-text { font-family: 'Segoe Print', 'Bradley Hand', 'Ink Free', 'Comic Sans MS', cursive; color: #8dff95; letter-spacing: .02em; text-shadow: 0 0 2px #2b7a31, 1px 1px 0 rgba(0,0,0,.6); }
.ui-dlg.ui-subject13 .ui-dlg-name { font-family: 'Segoe Print', 'Ink Free', cursive; letter-spacing: .15em; }

@keyframes ui-blink { 50% { opacity: 0.15; } }
@keyframes ui-jit { 0% { transform: translate(1px,-1px); } 50% { transform: translate(-2px,1px) skewX(-12deg); } 100% { transform: translate(1px,0); } }
@keyframes ui-boxjit { 0%, 91%, 100% { transform: none; } 92% { transform: translate(-3px, 1px) skewX(2deg); } 94% { transform: translate(2px,-1px); } 96% { transform: none; } }

/* ---------- inventory ---------- */
.ui-inv { position: absolute; left: 1.2%; top: 2%; display: flex; gap: calc(var(--u) * 0.6); }
.ui-slot {
  position: relative; width: calc(var(--u) * 5.4); height: calc(var(--u) * 5.4);
  background: radial-gradient(circle at 50% 40%, rgba(40,50,60,0.75), rgba(8,10,13,0.9));
  border: 1px solid rgba(160,190,210,0.22); cursor: pointer;
  transition: border-color .15s, box-shadow .15s, transform .12s;
  animation: ui-slotin .35s ease-out;
}
.ui-slot:hover { border-color: rgba(200,230,240,0.55); transform: translateY(-2px); }
.ui-slot.ui-sel { border-color: #9effc2; box-shadow: 0 0 calc(var(--u)*0.9) rgba(158,255,194,0.55), inset 0 0 calc(var(--u)*0.8) rgba(158,255,194,0.2); }
.ui-slot canvas { width: 100%; height: 100%; display: block; }
.ui-slot .ui-cnt { position: absolute; right: 4%; bottom: 2%; font-size: clamp(9px, calc(var(--u)*1.0), 18px); color: #e8f0f4; text-shadow: 0 0 3px #000, 0 0 3px #000; font-weight: bold; }
.ui-slot .ui-tip {
  position: absolute; left: 50%; top: 104%; transform: translateX(-50%); white-space: nowrap;
  font-size: clamp(9px, calc(var(--u)*0.95), 16px); color: #cfe; background: rgba(0,0,0,0.85);
  padding: .15em .5em; border: 1px solid rgba(160,190,210,0.25); opacity: 0; transition: opacity .12s; pointer-events: none; letter-spacing: .08em;
}
.ui-slot:hover .ui-tip, .ui-slot.ui-sel .ui-tip { opacity: 1; }
@keyframes ui-slotin { from { transform: scale(1.35); box-shadow: 0 0 calc(var(--u)*2) rgba(255,255,255,0.5); } to { transform: none; } }

/* ---------- journal ---------- */
.ui-jbtn {
  position: absolute; right: 1.2%; top: 2%;
  font: inherit; font-size: clamp(9px, calc(var(--u)*1.0), 18px); letter-spacing: .25em;
  color: #c8d3dc; background: rgba(6,9,12,0.8); border: 1px solid rgba(160,190,210,0.3);
  padding: .5em .9em; cursor: pointer;
}
.ui-jbtn:hover { border-color: #c8d3dc; color: #fff; }
.ui-jbtn .ui-jn { color: #ffc14d; margin-left: .5em; }
.ui-jbtn.ui-pulse { animation: ui-pulse 0.5s ease-in-out 4; }
@keyframes ui-pulse { 50% { background: rgba(255,193,77,0.35); border-color: #ffc14d; color: #fff; box-shadow: 0 0 calc(var(--u)*1.4) rgba(255,193,77,.6); } }
.ui-jpanel {
  position: absolute; right: 1.2%; top: 8.5%; width: 34%; max-height: 62%; overflow-y: auto;
  background: linear-gradient(180deg, #d9d2bf, #c8bfa8); color: #2a2620;
  font-size: clamp(10px, calc(var(--u)*1.05), 19px); line-height: 1.45;
  padding: 1em 1.2em; box-shadow: 0 calc(var(--u)*0.5) calc(var(--u)*2.5) rgba(0,0,0,0.75);
  display: none; transform-origin: top right; animation: ui-pop .18s ease-out;
}
.ui-jpanel.ui-open { display: block; }
.ui-jpanel h3 { margin: 0 0 .6em; font-size: .85em; letter-spacing: .3em; border-bottom: 1px solid rgba(40,30,20,.35); padding-bottom: .4em; }
.ui-jpanel ol { margin: 0; padding-left: 1.6em; }
.ui-jpanel li { margin: 0 0 .55em; }
.ui-jpanel li.ui-new { background: rgba(255,210,90,0.35); }
.ui-jpanel .ui-empty { opacity: .55; font-style: italic; }
@keyframes ui-pop { from { opacity: 0; transform: scale(.94); } }

/* ---------- hover label ---------- */
.ui-hover {
  position: fixed; z-index: 30; pointer-events: none; display: none;
  font-size: clamp(10px, calc(var(--u)*1.0), 17px); letter-spacing: .12em; color: #e6eef2;
  background: rgba(0,0,0,0.72); border: 1px solid rgba(160,190,210,0.28); padding: .15em .55em; white-space: nowrap;
}

/* ---------- status chip ---------- */
.ui-chip {
  position: absolute; right: .8%; bottom: .6%; font-size: clamp(8px, calc(var(--u)*0.78), 13px);
  color: #7f8b95; letter-spacing: .08em; opacity: 0; transition: opacity .3s; white-space: nowrap; pointer-events: none;
}
.ui-chip.ui-show { opacity: .8; }

/* ---------- toast ---------- */
.ui-toasts { position: absolute; left: 50%; top: 3%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u)*0.5); }
.ui-toast {
  font-size: clamp(10px, calc(var(--u)*1.05), 18px); letter-spacing: .1em; color: #e8eef2;
  background: rgba(6,9,12,0.9); border: 1px solid rgba(160,190,210,0.3); padding: .45em 1.1em;
  animation: ui-tin .25s ease-out; transition: opacity .4s, transform .4s; white-space: nowrap;
}
.ui-toast.ui-out { opacity: 0; transform: translateY(-40%); }
@keyframes ui-tin { from { opacity: 0; transform: translateY(-60%); } }

/* ---------- modal (ask / pad) ---------- */
.ui-modal {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.45), rgba(0,0,0,0.82));
  animation: ui-fade .2s ease-out; pointer-events: auto;
}
@keyframes ui-fade { from { opacity: 0; } }
.ui-card {
  position: relative; background: linear-gradient(180deg, #0c1116, #06080b); border: 1px solid rgba(160,190,210,0.25);
  box-shadow: 0 0 calc(var(--u)*4) rgba(0,0,0,0.9), inset 0 0 calc(var(--u)*3) rgba(0,0,0,0.6);
  color: #d8e0e8; font-size: clamp(11px, calc(var(--u)*1.3), 24px); animation: ui-pop .2s ease-out;
}
.ui-ask { width: min(62%, calc(var(--u)*62)); padding: 1.4em 1.6em 1.2em; --ui-tc: #9effc2; border-left: calc(var(--u)*0.3) solid var(--ui-tc); }
.ui-ask-hdr { font-size: .7em; letter-spacing: .32em; color: var(--ui-tc); display: flex; gap: .6em; align-items: center; margin-bottom: .8em; text-shadow: 0 0 6px var(--ui-tc); }
.ui-ask-hdr .ui-dot { width: .6em; height: .6em; border-radius: 50%; background: var(--ui-tc); animation: ui-blink 1.1s steps(2) infinite; }
.ui-ask-q { color: var(--ui-tc); line-height: 1.45; margin-bottom: 1.1em; }
.ui-ask-opts { display: flex; flex-direction: column; gap: .5em; }
.ui-opt {
  font: inherit; font-size: .9em; text-align: left; color: #d8e0e8; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(160,190,210,0.22); padding: .55em .9em; cursor: pointer; transition: background .12s, border-color .12s, padding-left .12s;
}
.ui-opt:hover, .ui-opt:focus-visible { background: rgba(158,255,194,0.1); border-color: var(--ui-tc); padding-left: 1.3em; outline: none; }
.ui-opt .ui-k { color: var(--ui-tc); margin-right: .8em; opacity: .8; }
.ui-opt.ui-picked { background: rgba(158,255,194,0.25); border-color: var(--ui-tc); }

.ui-pad { padding: 1.3em 1.5em 1.5em; min-width: calc(var(--u)*30); }
.ui-pad-hdr { display: flex; justify-content: space-between; align-items: center; font-size: .66em; letter-spacing: .3em; color: #7f8b95; margin-bottom: 1em; }
.ui-x { font: inherit; font-size: 1.4em; line-height: 1; color: #9aa6b0; background: none; border: 1px solid rgba(160,190,210,0.25); width: 1.6em; height: 1.6em; cursor: pointer; }
.ui-x:hover { color: #fff; border-color: #fff; }
.ui-disp {
  display: flex; gap: .4em; justify-content: center; padding: .55em; margin-bottom: 1.1em;
  background: #020403; border: 1px solid #1d2a22; box-shadow: inset 0 0 calc(var(--u)*1.2) rgba(0,0,0,0.9);
}
.ui-disp span {
  width: 1.7em; height: 1.7em; display: flex; align-items: center; justify-content: center;
  color: #6dff9e; font-size: 1.2em; text-shadow: 0 0 6px #33ff88; border-bottom: 2px solid rgba(109,255,158,0.18);
  font-family: 'Segoe UI Symbol', 'DejaVu Sans', sans-serif;
}
.ui-disp.ui-full span { animation: ui-blink .25s steps(2) 3; }
.ui-keys { display: grid; gap: .55em; justify-content: center; }
.ui-keys.ui-k4 { grid-template-columns: repeat(2, calc(var(--u)*8)); }
.ui-keys.ui-k6 { grid-template-columns: repeat(3, calc(var(--u)*7)); }
.ui-key {
  height: calc(var(--u)*7); font-size: calc(var(--u)*3); color: #cfd8de; cursor: pointer;
  font-family: 'Segoe UI Symbol', 'DejaVu Sans', sans-serif;
  background: linear-gradient(180deg, #2a3138, #161b20); border: 1px solid #3b454e; border-bottom-width: calc(var(--u)*0.45);
  box-shadow: 0 calc(var(--u)*0.3) calc(var(--u)*0.6) rgba(0,0,0,0.7); transition: transform .06s, background .1s;
}
.ui-keys.ui-k6 .ui-key { height: calc(var(--u)*6); font-size: calc(var(--u)*2.6); background: linear-gradient(180deg, #24302a, #121a15); color: #b6f5c8; }
.ui-key:hover { background: linear-gradient(180deg, #343d45, #1d2329); color: #fff; }
.ui-key:active, .ui-key.ui-press { transform: translateY(calc(var(--u)*0.25)); border-bottom-width: calc(var(--u)*0.2); background: #3d4a52; }
.ui-pad-hint { margin-top: 1em; font-size: .55em; color: #5b6670; letter-spacing: .15em; text-align: center; }

/* ---------- title ---------- */
.ui-title {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 50% 45%, #0e1418 0%, #050608 70%); color: #d8e0e8; pointer-events: auto;
  transition: opacity .7s; z-index: 50; text-align: center;
}
.ui-title::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px); animation: ui-roll 8s linear infinite; }
@keyframes ui-roll { to { background-position: 0 300px; } }
.ui-title.ui-gone { opacity: 0; pointer-events: none; }
.ui-title-fac { font-size: clamp(9px, calc(var(--u)*0.95), 16px); letter-spacing: .6em; color: #5f6b75; margin-bottom: 2em; }
.ui-title h1 {
  margin: 0; font-size: clamp(22px, calc(var(--u)*4.6), 84px); letter-spacing: .14em; font-weight: bold; color: #e8eef2;
  text-shadow: 0 0 calc(var(--u)*1.5) rgba(158,255,194,0.25), 2px 0 rgba(255,61,240,0.35), -2px 0 rgba(0,246,255,0.3);
  animation: ui-flick 6s infinite;
}
@keyframes ui-flick { 0%, 100% { opacity: 1; } 41% { opacity: 1; } 42% { opacity: .35; } 43% { opacity: 1; } 44% { opacity: .6; transform: translateX(2px); } 45% { opacity: 1; transform: none; } 78% { opacity: 1; } 79% { opacity: .7; } 80% { opacity: 1; } }
.ui-title-sub { margin-top: .9em; font-size: clamp(11px, calc(var(--u)*1.4), 24px); letter-spacing: .35em; color: #9effc2; }
.ui-title-status { margin-top: 2.6em; font-size: clamp(10px, calc(var(--u)*1.0), 17px); color: #8a98a3; min-height: 1.4em; letter-spacing: .06em; }
.ui-title-status::before { content: '● '; color: #ffc14d; animation: ui-blink 1.2s steps(2) infinite; }
.ui-begin {
  margin-top: 2.2em; font: inherit; font-size: clamp(12px, calc(var(--u)*1.6), 28px); letter-spacing: .5em; padding: .6em 1.6em .6em 2.1em;
  color: #9effc2; background: transparent; border: 1px solid #9effc2; cursor: pointer; transition: background .15s, color .15s, box-shadow .15s;
}
.ui-begin:hover, .ui-begin:focus-visible { background: #9effc2; color: #050608; box-shadow: 0 0 calc(var(--u)*2.5) rgba(158,255,194,0.5); outline: none; }
.ui-title-hint { position: absolute; bottom: 5%; left: 0; right: 0; font-size: clamp(8px, calc(var(--u)*0.85), 15px); color: #55616b; letter-spacing: .08em; padding: 0 4%; line-height: 1.7; }

/* ---------- end dossier ---------- */
.ui-end {
  position: absolute; inset: 0; overflow-y: auto; z-index: 60; pointer-events: auto;
  background: radial-gradient(ellipse at 50% 30%, rgba(14,18,22,0.92), rgba(3,4,5,0.98));
  animation: ui-fade .8s ease-out; padding: 3% 0 4%;
}
.ui-paper {
  position: relative; margin: 0 auto; width: min(92%, calc(var(--u)*64)); color: #2b2620;
  font-size: clamp(10px, calc(var(--u)*1.12), 20px); line-height: 1.5;
  padding: 2.4em 2.8em 2.2em;
  background:
    radial-gradient(ellipse at 20% 10%, rgba(255,255,255,0.35), transparent 50%),
    radial-gradient(ellipse at 85% 90%, rgba(120,90,40,0.18), transparent 55%),
    repeating-linear-gradient(0deg, rgba(0,0,0,0.018) 0 2px, transparent 2px 4px),
    linear-gradient(180deg, #e3dcc8, #d3c9ae);
  box-shadow: 0 calc(var(--u)*1) calc(var(--u)*4) rgba(0,0,0,0.85);
  transform: rotate(-0.6deg);
}
.ui-paper::before { /* paper clip tab */
  content: 'CONFIDENTIAL'; position: absolute; top: -1.6em; left: 2.4em; font-size: .7em; letter-spacing: .3em;
  background: #b9ae8f; color: #4a4232; padding: .35em 1.2em; border-radius: 4px 4px 0 0;
}
.ui-paper h2 { margin: 0; font-size: 1.55em; letter-spacing: .14em; }
.ui-paper .ui-meta { font-size: .8em; color: #5c5446; letter-spacing: .1em; border-bottom: 2px solid #2b2620; padding-bottom: .6em; margin: .3em 0 1.1em; }
.ui-paper h4 { margin: 1.3em 0 .5em; font-size: .78em; letter-spacing: .3em; color: #5c5446; border-bottom: 1px dashed rgba(43,38,32,.4); padding-bottom: .2em; }
.ui-row { display: flex; gap: .6em; white-space: pre-wrap; }
.ui-row .ui-l { flex: 0 0 46%; color: #4a4336; }
.ui-row .ui-v { flex: 1; font-weight: bold; }
.ui-arch { font-size: 1.25em; font-weight: bold; letter-spacing: .2em; }
.ui-habit { font-style: italic; margin-top: .2em; }
.ui-obs { margin: .45em 0; padding-left: 1em; border-left: 3px solid #2f6b4a; color: #1e3b2b; }
.ui-obs::before { content: 'WARDEN: '; font-size: .75em; letter-spacing: .2em; color: #2f6b4a; }
.ui-dec { display: grid; grid-template-columns: repeat(4, 1fr); gap: .4em .8em; font-size: .9em; }
.ui-dec div { border: 1px solid rgba(43,38,32,.25); padding: .3em .5em; background: rgba(255,255,255,0.15); }
.ui-dec b { display: block; font-size: 1.35em; }
.ui-dec small { letter-spacing: .1em; color: #5c5446; font-size: .72em; text-transform: uppercase; }
.ui-dec .ui-wide { grid-column: span 2; }
.ui-hide { visibility: hidden; }
.ui-stamp {
  position: absolute; right: 5%; bottom: 1.6em; transform: rotate(-14deg); color: #b3121c; border: .22em solid #b3121c;
  padding: .35em .8em; font-weight: bold; letter-spacing: .12em; font-size: 1.15em; text-align: center; line-height: 1.25;
  opacity: 0; mix-blend-mode: multiply; pointer-events: none;
  background: repeating-linear-gradient(35deg, transparent 0 3px, rgba(227,220,200,0.25) 3px 4px);
}
.ui-stamp.ui-slam { animation: ui-slam .35s cubic-bezier(.2,1.6,.4,1) forwards; }
@keyframes ui-slam { from { opacity: 0; transform: rotate(-14deg) scale(2.6); } to { opacity: .88; transform: rotate(-14deg) scale(1); } }
.ui-restart {
  display: block; margin: 2.4em 0 0; font: inherit; font-size: .95em; letter-spacing: .4em; padding: .6em 1.6em;
  color: #e3dcc8; background: #2b2620; border: none; cursor: pointer; opacity: 0; transition: opacity .4s, background .15s;
}
.ui-restart.ui-show { opacity: 1; }
.ui-restart:hover { background: #b3121c; }
.ui-skip { text-align: center; color: #5f6b75; font-size: clamp(8px, calc(var(--u)*0.8), 13px); margin-top: 1.2em; letter-spacing: .15em; }

@media (prefers-reduced-motion: reduce) {
  .ui-title h1, .ui-dlg.ui-rattled, .ui-title::after { animation: none; }
}
`;
