/**
 * THE SOUNDBOARD.
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 1's personas were a passive multiplier you chose once. But the practice this game is about
 * is not PICKING a voice, it is WORKING one — firing off lines to stall, to confuse, and to wind
 * somebody up. Scammer Payback's own fan-made soundboard exists for exactly that purpose: a set of
 * canned lines in a persona's voice, played at a scammer to keep him on the phone.
 *
 * We take the MECHANIC and nothing else. Their audio and their lines are their copyright and their
 * likeness; every line below is written for this game in this game's register (docs/DESIGN.md §9).
 *
 * WHAT IT ADDS THAT THE STALL BUTTON DID NOT
 * ------------------------------------------
 * A single stall button asks 'how fast'. A board of lines asks 'which one', and each answer costs
 * something different:
 *
 *   - a line that builds RAPPORT keeps him talking to you, which is the gate you cannot buy
 *   - a line that builds RAGE gets him shouting, and shouting is how the ROSTER fills
 *   - a line that stalls hard buys time but does neither
 *
 * So the board makes an existing tension playable. The player already had to balance rapport
 * against boil-overs; until now there was no lever to express the choice with, only a number that
 * drifted. Rage becomes a TOOL rather than purely a threat, which is the correct reading of the
 * fiction: you want him to lose his temper, because that is when he tells you things.
 *
 * REPETITION IS THE REAL MECHANIC. Play the same line twice running and it does far less, and
 * annoys him in the wrong way — he has heard it. That forces the whole board into use, which is
 * the same fault a playtester reported on the roster: 'cant be the same things over and over
 * again'. Variety should be structural, not a matter of the player's good manners.
 */

/** How a line behaves. All values are multipliers on, or additions to, the base stall. */
export interface BoardLine {
  id: string;
  /** Which persona's board it sits on. */
  persona: string;
  /** What you say. Appears in the transcript. */
  text: string;
  /** What it does to him, in the log, when it lands. */
  effect: string;
  /** Multiplier on the stall's hold-time value. */
  stall: number;
  /** Multiplier on the rapport the stall would have earned. */
  rapport: number;
  /** Multiplier on the rage the stall would have caused. */
  rage: number;
  /** Extra composure cost, added to the stall's own. Negative recovers composure. */
  composure: number;
  /** Seconds before this specific line may be used again. */
  cooldown: number;
}

export const BOARD = {
  /**
   * How much a line is worth the second time in a row: he has heard it.
   *
   * Deliberately harsh. If repeating were merely slightly worse, the optimal play would be to find
   * the best line and press it, and the board would be a stall button with extra steps.
   */
  repeatPenalty: 0.35,
  /** And repeating annoys him in the way that does not help. */
  repeatRageBonus: 1.6,
  /** How many recent lines he remembers. Beyond this, a line is fresh again. */
  memory: 3,
} as const;

/**
 * The lines.
 *
 * Five archetypes per persona, so every board offers the same shape of decision in a different
 * voice: bewilderment, a stall, a provocation, a deflection, and dead air.
 */
export const BOARD_LINES: BoardLine[] = [
  // ------------------------------------------------------------------ Doris, 71, bewildered
  { id: 'doris.tv', persona: 'doris',
    text: 'Is this about the television?',
    effect: 'He explains that it is not about the television. He explains it twice.',
    stall: 0.9, rapport: 1.6, rage: 0.5, composure: -1, cooldown: 12 },
  { id: 'doris.glasses', persona: 'doris',
    text: 'I am just finding my glasses. Bear with me.',
    effect: 'He waits. You can hear him deciding to wait.',
    stall: 1.7, rapport: 1.0, rage: 0.6, composure: 0, cooldown: 20 },
  { id: 'doris.spell', persona: 'doris',
    text: 'Could you spell that? No, slower.',
    effect: 'He spells it. He is asked to spell it again, and does.',
    stall: 1.2, rapport: 0.6, rage: 2.1, composure: 2, cooldown: 16 },
  { id: 'doris.grandson', persona: 'doris',
    text: 'My grandson usually does this for me. Shall I fetch him.',
    effect: 'He would prefer you did not fetch the grandson.',
    stall: 1.3, rapport: 1.2, rage: 1.2, composure: 0, cooldown: 18 },
  { id: 'doris.silence', persona: 'doris',
    text: '(say nothing at all)',
    effect: 'Forty seconds of nothing. He asks whether you are still there. You are.',
    stall: 1.5, rapport: 0.3, rage: 2.6, composure: -2, cooldown: 26 },

  // ------------------------------------------------------------------ Nigel, officious
  { id: 'nigel.reference', persona: 'nigel',
    text: 'Before we go on, I shall need a reference number for this call.',
    effect: 'He invents a reference number. You ask him to confirm it. He cannot.',
    stall: 1.4, rapport: 0.9, rage: 1.8, composure: 1, cooldown: 16 },
  { id: 'nigel.policy', persona: 'nigel',
    text: 'I am obliged to tell you I am recording this, as is my policy.',
    effect: 'A pause. Somebody off-microphone is consulted.',
    stall: 1.5, rapport: 0.7, rage: 2.0, composure: 2, cooldown: 22 },
  { id: 'nigel.form', persona: 'nigel',
    text: 'I have the form here. I shall read the whole form back to you.',
    effect: 'You read the form back to him. All of it. He does not interrupt, at first.',
    stall: 1.9, rapport: 1.5, rage: 1.1, composure: 0, cooldown: 24 },
  { id: 'nigel.escalate', persona: 'nigel',
    text: 'I would rather deal with your supervisor, if he is on the floor.',
    effect: 'He says his supervisor is unavailable. He says the name anyway.',
    stall: 1.0, rapport: 1.0, rage: 1.5, composure: 0, cooldown: 20 },
  { id: 'nigel.hold', persona: 'nigel',
    text: 'One moment. I am putting YOU on hold.',
    effect: 'He is on hold. He remains on hold. He is still there when you return.',
    stall: 2.1, rapport: 0.5, rage: 2.3, composure: 3, cooldown: 34 },

  // ------------------------------------------------------------------ The Teenager, flat
  { id: 'teen.what', persona: 'teenager',
    text: 'What.',
    effect: 'He repeats the whole opening. You say it again.',
    stall: 1.1, rapport: 0.7, rage: 1.9, composure: -1, cooldown: 10 },
  { id: 'teen.mum', persona: 'teenager',
    text: 'This is my mum\u2019s laptop. Is that a problem.',
    effect: 'He says it is not a problem. He would like you to turn it on.',
    stall: 1.3, rapport: 1.5, rage: 0.9, composure: 0, cooldown: 16 },
  { id: 'teen.loading', persona: 'teenager',
    text: 'It is loading.',
    effect: 'It is loading. It continues to load for some time.',
    stall: 1.8, rapport: 0.9, rage: 1.2, composure: -1, cooldown: 20 },
  { id: 'teen.already', persona: 'teenager',
    text: 'Someone already called about this yesterday.',
    effect: 'He says nobody called yesterday. He asks who called. You do not know.',
    stall: 1.2, rapport: 0.8, rage: 2.0, composure: 1, cooldown: 18 },
  { id: 'teen.silence', persona: 'teenager',
    text: '(chew something audibly)',
    effect: 'He asks what that noise is. You do not answer.',
    stall: 1.4, rapport: 0.4, rage: 2.4, composure: -2, cooldown: 24 },

  // ------------------------------------------------------------------ Mr Pemberton, pedantic
  { id: 'pemberton.define', persona: 'pemberton',
    text: 'Define "compromised", in this context.',
    effect: 'He defines it. You take issue with the definition, at length.',
    stall: 1.6, rapport: 0.8, rage: 2.0, composure: 1, cooldown: 20 },
  { id: 'pemberton.notes', persona: 'pemberton',
    text: 'I am writing this down. Say the last part again, verbatim.',
    effect: 'He says it again. You read it back with one word changed, and he corrects you.',
    stall: 1.7, rapport: 1.5, rage: 1.4, composure: 0, cooldown: 22 },
  { id: 'pemberton.credentials', persona: 'pemberton',
    text: 'Which department, exactly. Not the company. The department.',
    effect: 'He names a department. It does not match the one he named earlier.',
    stall: 1.2, rapport: 0.9, rage: 1.9, composure: 1, cooldown: 18 },
  { id: 'pemberton.slow', persona: 'pemberton',
    text: 'I type slowly. I would rather do this properly than quickly.',
    effect: 'He agrees that it should be done properly. He does not sound as though he means it.',
    stall: 2.0, rapport: 1.1, rage: 1.0, composure: 0, cooldown: 26 },
  { id: 'pemberton.silence', persona: 'pemberton',
    text: '(read the terms aloud, to yourself)',
    effect: 'You read to yourself for a while. He listens, because he has to.',
    stall: 1.6, rapport: 0.4, rage: 2.2, composure: -1, cooldown: 28 },

  // ------------------------------------------------------------------ Deborah, Accounts Payable
  { id: 'deborah.po', persona: 'deborah',
    text: 'I cannot process this without a purchase order.',
    effect: 'He does not have a purchase order. He asks what one is.',
    stall: 1.5, rapport: 0.9, rage: 1.9, composure: 1, cooldown: 18 },
  { id: 'deborah.terms', persona: 'deborah',
    text: 'Our terms are thirty days. Yours are not the terms.',
    effect: 'He explains urgency. You explain thirty days.',
    stall: 1.4, rapport: 0.8, rage: 2.1, composure: 1, cooldown: 20 },
  { id: 'deborah.transfer', persona: 'deborah',
    text: 'I shall put you through to the right department. Please hold.',
    effect: 'You put him on hold. There is music. It is your music now.',
    stall: 2.2, rapport: 0.6, rage: 2.2, composure: 2, cooldown: 34 },
  { id: 'deborah.invoice', persona: 'deborah',
    text: 'Send it in writing and I shall raise it on Monday.',
    effect: 'He says it cannot wait until Monday. It is Monday.',
    stall: 1.3, rapport: 1.3, rage: 1.3, composure: 0, cooldown: 16 },
  { id: 'deborah.system', persona: 'deborah',
    text: 'The system is slow today. It is slow every day.',
    effect: 'He sympathises about the system. He is sincere about this and nothing else.',
    stall: 1.8, rapport: 1.4, rage: 0.7, composure: -1, cooldown: 22 },

  // ------------------------------------------------------------------ A Very Sincere Man
  { id: 'sincere.thankyou', persona: 'sincere',
    text: 'Thank you for calling. Genuinely. It has been a quiet day.',
    effect: 'He does not know what to do with this. He carries on.',
    stall: 1.2, rapport: 1.8, rage: 0.4, composure: -2, cooldown: 14 },
  { id: 'sincere.help', persona: 'sincere',
    text: 'You sound tired. Are they making you do doubles.',
    effect: 'A pause. He says the hours are fine. He says it too quickly.',
    stall: 1.4, rapport: 1.9, rage: 0.6, composure: -1, cooldown: 20 },
  { id: 'sincere.name', persona: 'sincere',
    text: 'What should I call you. Your real one is fine.',
    effect: 'He gives a name. It is not the one he opened with.',
    stall: 1.1, rapport: 1.5, rage: 1.4, composure: 0, cooldown: 22 },
  { id: 'sincere.trust', persona: 'sincere',
    text: 'I shall do whatever you say. I trust you completely.',
    effect: 'He relaxes. This is the part you will think about later.',
    stall: 1.9, rapport: 1.6, rage: 0.5, composure: 0, cooldown: 24 },
  /*
   * Warmth IS this persona's provocation. Being asked, sincerely and without embarrassment, to
   * explain himself to somebody who has been nothing but kind is the thing that actually makes a
   * man on that floor come apart - and it means every board can play both sides of the phase's
   * central tension rather than only one.
   */
  { id: 'sincere.why', persona: 'sincere',
    text: 'Can I ask you something. Do you like doing this.',
    effect: 'He does not answer. He starts the script again, from the top, faster.',
    stall: 1.3, rapport: 1.2, rage: 2.5, composure: 1, cooldown: 28 },
  { id: 'sincere.silence', persona: 'sincere',
    text: '(wait, warmly)',
    effect: 'Neither of you says anything. It is not uncomfortable, which is worse.',
    stall: 1.5, rapport: 0.9, rage: 2.0, composure: -2, cooldown: 26 },
];

export const BOARD_BY_ID: Record<string, BoardLine> = Object.fromEntries(
  BOARD_LINES.map((l) => [l.id, l]),
);

/** The board for one persona. */
export function boardFor(persona: string): BoardLine[] {
  return BOARD_LINES.filter((l) => l.persona === persona);
}
