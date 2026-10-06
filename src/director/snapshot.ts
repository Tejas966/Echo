// Builds the compact text snapshot the model sees (docs/01 §7). Pure.
import type { GameState, LogEvent, Snapshot } from '../types';
import type { Habits } from '../profile/habits';
import { validTargets } from './vocabulary';

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

function eventLine(e: LogEvent, now: number) {
  return `-${Math.round((now - e.t) / 1000)}s ${e.kind} ${e.a}${e.b ? ' ' + e.b : ''}`;
}

export function buildSnapshot(s: GameState, log: LogEvent[], h: Habits, image?: string, urgent?: string): Snapshot {
  const vt = validTargets(s);
  const recent = log.filter((e) => e.kind !== 'warden').slice(-10).map((e) => eventLine(e, s.t)).join(' | ') || 'none';
  const yours = s.warden.lastActions.slice(-3)
    .map((a) => `${mmss(a.t)} ${a.action} ${a.target} (${a.status}${a.stage ? ': ' + a.stage : ''})`).join(' | ') || 'none';
  const said = s.warden.lineHistory.slice(-3).map((l) => `"${l}"`).join(' ') || 'none';
  const timeOn = s.t - s.puzzle.startedAt;
  const lines = [
    `SCREEN ${s.screen} | ACT ${s.act === 4 ? 'breather' : s.act} | t=${mmss(s.t)} | TENSION ${Math.round(s.tension)}/100 | MERCY ${s.mercy.level} | WARDEN_TONE ${s.warden.tone} | CAMERA ${s.warden.blind ? 'BLIND (you cannot see; the image is black)' : 'online'}`,
    `LIGHTS ${s.screen}=${s.lights[s.screen].level < 0.3 ? 'dark' : 'lit'} | DOORS ${Object.entries(s.doors).map(([k, d]) => `${k}:${d.wardenLock ? 'warden-locked' : d.open ? 'open' : 'closed'}`).join(' ')}`,
    `PLAYER zone=${s.player.x < 300 ? 'left' : s.player.x > 980 ? 'right' : 'center'} idle=${h.idleS}s clicks_last10s=${h.clicksLast10s} holding=${s.player.holding ?? 'nothing'} inventory=[${s.inventory.join(',')}]`,
    `PUZZLE current=${s.puzzle.current} time_on=${mmss(timeOn)} fails=${s.puzzle.fails} hints_given=${s.puzzle.hints} solved=[${Object.keys(s.stats.solvedAt).join(',')}]`,
    `HABITS spam=${h.spam} hiding=${h.hiding ? 'yes' : 'no'} rushing=${h.rushing ? 'yes' : 'no'} hint_reliance=${h.hintReliance} dark_user=${h.darkUser ? 'yes' : 'no'} breezing=${h.breezing ? 'yes' : 'no'}`,
    `LAST_EVENTS: ${recent}`,
    `YOUR_LAST_ACTIONS: ${yours}`,
    `YOUR_LAST_LINES: ${said}`,
    `VALID_TARGETS: ${Object.entries(vt).filter(([, v]) => v.length).map(([k, v]) => `${k}=[${v.join(',')}]`).join(' ')}`,
  ];
  if (urgent) lines.push(`ATTENTION: ${urgent}`);
  lines.push('Decide your next action.');
  return { t: s.t, v: s.v, screen: s.screen, text: lines.join('\n'), image, validTargets: vt, urgent };
}

/** Human description of urgent triggers, appended to the snapshot. */
export const URGENT_TEXT: Record<string, string> = {
  solve: 'The subject just solved a test.',
  fail3: 'The subject has failed the same test 3 times.',
  enter: 'The subject just entered a new room.',
  idle: 'The subject has not moved for over a minute.',
  spam: 'The subject is clicking frantically.',
  'setpiece:dark': 'SET PIECE: the subject tried to use darkness again, and you forced the hall lights back ON. Speak one cold line (speak, target cold) taunting them that you learned their trick.',
  rush: 'The subject is trying to rush the exit before it is ready.',
};
