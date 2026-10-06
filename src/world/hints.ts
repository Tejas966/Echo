import type { PuzzleId } from '../types';

/** 3-tier hint ladders (docs/02). Hints are ALWAYS canonical text — the model chooses when, never what. */
export const HINTS: Record<PuzzleId | 'setpiece', [string, string, string]> = {
  p1: [
    'Some things only show when I stop looking.',
    'The light is the problem, Subject 14. Not the solution.',
    'Wrap your hand. Take the bulb. Read the wall in the dark.',
  ],
  p2: [
    'Power is a budget. Spend it wisely.',
    'Three fuses. Four needs. Something must go dark.',
    'Use the blanket on a live fuse. Move it into SHUTTER.',
  ],
  p3: [
    'My records are complete. Mostly.',
    'Check the dates. One subject has not happened yet.',
    'The blue slide is a forgery. Thirteen left you the real value in your cell.',
  ],
  p4: [
    'Remember what you did.',
    'Your journal remembers, even if you do not.',
    'Answer honestly. I already know the truth.',
  ],
  p5: [
    'Thirteen wrote for whoever stood where they stood.',
    'You are reading it backwards. Entirely.',
    'Reverse the order. Flip every symbol.',
  ],
  p6: ['The vent is screwed shut. Anything flat will do.', 'My compliance token is flat.', 'Use the token on the vent.'],
  p7: ['Your file is always current.', 'The lock is your last three moves.', 'Act three times, then enter those three.'],
  setpiece: ['I see everything.', 'My override needs my eye.', 'Pull the fuse that powers my eye.'],
};
