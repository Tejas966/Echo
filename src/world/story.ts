// Narrative layer as data: chapters, live objectives, Subject 13 fragments, chapter cliffhangers. Pure (no DOM).
import type { GameState, Line, PuzzleId } from '../types';

export interface Chapter {
  id: string; numeral: string; title: string; subtitle: string; color: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'HARDEST' | 'BREATHER';
}

export const CHAPTERS: Record<string, Chapter> = {
  white_room: { id: 'white_room', numeral: 'I', title: 'THE WHITE ROOM', subtitle: 'The light never goes out.', color: '#bfefff', difficulty: 'EASY' },
  archive: { id: 'archive', numeral: 'II', title: 'THE ARCHIVE', subtitle: 'Every subject before you is filed here.', color: '#ffb347', difficulty: 'MEDIUM' },
  records: { id: 'records', numeral: 'III', title: 'FALSE RECORDS', subtitle: 'One of these subjects has not happened yet.', color: '#ff7a45', difficulty: 'HARD' },
  interview: { id: 'interview', numeral: 'IV', title: 'THE INTERVIEW', subtitle: 'It wants to know if it knows you.', color: '#9effc2', difficulty: 'BREATHER' },
  learned: { id: 'learned', numeral: 'V', title: 'WHAT IT LEARNED', subtitle: 'It has been studying you all along.', color: '#ff3d5a', difficulty: 'HARDEST' },
};

/** Which chapter the state is in. Chapters only move forward. */
export function chapterFor(s: GameState): Chapter {
  const solved = (p: PuzzleId) => s.stats.solvedAt[p] !== undefined;
  if (solved('p4') || (solved('p3') && s.flags.cage_open)) return CHAPTERS.learned;
  if (solved('p3')) return CHAPTERS.interview;
  if (solved('p2') || s.flags.visited_hall) return CHAPTERS.records;
  if (s.flags.visited_archive) return CHAPTERS.archive;
  return CHAPTERS.white_room;
}

/** The single next thing the player should be working toward (always true, never a spoiler). */
export function objectiveFor(s: GameState): string {
  const f = s.flags; const solved = (p: PuzzleId) => s.stats.solvedAt[p] !== undefined;
  if (s.ended) return '';
  if (!solved('p1')) {
    if (!f.lamp_empty) return f.got_cloth ? 'The light is relentless. Find a way to make it stop.' : 'Search the cell. Something here must help.';
    if (!f.knows_shapes) return 'In the dark, look closely at the walls.';
    if (!f.knows_mirror) return 'Some marks were gouged out. Thirteen hid them somewhere the Warden never looks.';
    return 'Open the cell door.';
  }
  if (!solved('p2')) return s.screen === 'cell' ? 'Leave the cell.' : 'Restore power to the shutter.';
  if (!solved('p3')) {
    if (!f.projector_bulb) return 'The projector needs light. You have some.';
    if (!f.visited_hall) return 'Go through the shutter. Find what needs pressure.';
    if (!f.knows_yellow && f.slides_seen) return 'One gauge on the slides is smeared. Find the missing reading.';
    return 'Set the manifold valves. Trust the records — mostly.';
  }
  if (!solved('p4')) return 'Answer the intercom.';
  if (!f.setpiece_done) return f.knows_window ? 'Read what Subject 13 left on the glass.' : 'Check the projector. The Warden has updated its records.';
  if (s.warden.override) return 'The Warden is holding the lights on. Take away its eye.';
  if (!f.knows_code) return 'Darken the hall. Read the glass.';
  return 'Enter Subject 13\'s code at the lift.';
}

/** Subject 13 fragments, revealed one per solved test. */
export const FRAGMENTS: string[] = [
  'Day 1. The camera follows me. When the light died, it hesitated. It does not like the dark.',
  'It asked which fuse I would pull. Before I pulled it. It already knew.',
  'The slides lie. I found my own face in its records, dated a week ahead.',
  'It is not testing us. It is learning. Every one of us makes the next room harder.',
  'If you are reading this, you got further than me. Do not let it keep what it learned.',
];
export const FRAGMENT_FOR: Partial<Record<PuzzleId, number>> = { p1: 0, p2: 1, p3: 2, p4: 3, p5: 4 };

/** Warden cliffhanger after each test — the hook into the next chapter. */
export const CLIFFHANGER: Partial<Record<PuzzleId, Line[]>> = {
  p1: [{ speaker: 'warden', text: 'One door. There are more, Subject 14. And I watched Thirteen open every one of them.', tone: 'cold' }],
  p2: [{ speaker: 'warden', text: 'The machine hall is waiting. So am I.', tone: 'cold' }],
  p3: [{ speaker: 'warden', text: 'You saw yourself in my records. Did you wonder how I knew what you would look like tomorrow?', tone: 'cold' }],
  p4: [
    { speaker: 'warden', text: 'Three questions. Three correct answers. I know you now, Subject 14.', tone: 'cold' },
    { speaker: 'narrator', text: 'Somewhere in the archive, the projector clicks on by itself.' },
  ],
};
