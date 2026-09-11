/**
 * PHASE 2 ENGAGEMENT — attention fatigue, camera events, and the chain.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Phase 2 shipped measuring ~0.13 player decisions per minute against Phase 1's ~1.5, over a
 * LONGER duration. The audit in docs/../please-hold-research/15-decision-density-audit.md found
 * three causes, and this file addresses all three:
 *
 *  1. THE MAIN LOOP WAS STABLE ONCE SOLVED. Yields were constant, so the optimal allocation
 *     converged inside about fifteen minutes and then the game asked nothing for two hours.
 *     FATIGUE fixes this at the root: watching a stream degrades what it gives you, resting it
 *     restores it, so the best allocation DRIFTS and has to be revisited. This is Universal
 *     Paperclips' Probe Trust / value-drift pattern, which was the one structural idea I had
 *     copied the shape of (a finite pool over several sinks) without its dynamics — nothing in
 *     my version reacted to what the player did.
 *
 *  2. NOTHING REPLACED THE VERB. Phase 1 always had a hand busy. CAMERA EVENTS give Phase 2 a
 *     moment-to-moment action without turning it into a clicker: an optional, capped reward for
 *     noticing something.
 *
 *  3. THE CAMERA BANK WAS OPTIMAL TO IGNORE. At 1.40 intel per attention point it was the worst
 *     stream in the game, so the phase greyed out its own centrepiece. Events fire only while
 *     the cameras are watched, which makes the wall's value its event stream rather than its
 *     yield.
 *
 * THE GUARDRAIL, WHICH MATTERS MORE THAN THE FEATURES
 * --------------------------------------------------
 * Research (11-active-play-layers.md, 12-bonus-events.md) is unambiguous that an active layer
 * over an idle economy must be a MULTIPLIER ON TOP, never the income itself: engaged play about
 * 1.3-2x faster, not 10x. Cookie Clicker's author removed his 'missed golden cookies' counter
 * because it gave players anxiety — the counter, not the miss. A player rewrote Cookie
 * Clicker's source specifically because the active/idle gap had grown too large.
 *
 * So: every event reward is capped in SECONDS OF PRODUCTION, a miss costs nothing, nothing
 * counts misses, and an upgrade eventually claims them for you at reduced value. A player who
 * ignores this entire file must still finish the phase.
 */

import type { IntelKind, StreamId } from '../engine/types';

/**
 * ATTENTION FATIGUE.
 *
 * You have already seen that room. Keep the same camera up and you learn less from it; leave it
 * alone and there is something new to notice when you come back.
 */
export const FATIGUE = {
  /**
   * Freshness lost per second at ONE attention point, scaled by the square root of attention.
   *
   * Was 0.010 and linear in attention, which was wrong by more than an order of magnitude: a
   * stream went completely stale in 42 seconds at one point of attention and SEVEN at six, then
   * recovered in 30. So any allocation held for more than a minute sat permanently at the floor -
   * every stream reading 'nothing new here' at once, which is not a decision but a flat 42% tax
   * on the whole economy. Playing it as designed would have meant re-allocating every twenty
   * seconds, precisely the twitch busywork the research says players beg to automate.
   *
   * At 0.0009 with square-root scaling a stream takes about eight minutes to go stale at one
   * point and three at six, so rotation is a considered move every few minutes. Square root
   * rather than linear so that concentrating attention does not burn a stream out almost
   * instantly.
   */
  decayPerSecondAtOneAttention: 0.0009,
  /**
   * Freshness recovered per second while a stream is unattended.
   *
   * Faster than decay, so rotating genuinely pays rather than merely slowing the loss.
   */
  /*
   * RAISED 3.3x, from 0.0018. Recovery took 267 seconds to return a stream to fresh, and a single
   * use of Look Closer took 28 seconds to undo - so rotating away from a stream felt like nothing
   * happened, and the playtest verdict was that freshness 'takes incredibly long to get back'.
   *
   * Decay should be slow because it is a slow tax you plan around. RECOVERY should be quick,
   * because it is the reward for making the decision - a lever with a four-minute response time is
   * not a lever.
   */
  recoveryPerSecond: 0.006,
  /**
   * The floor. Deliberately not near zero: a stale stream must stay WORTH watching, or a player
   * who ignores fatigue entirely is punished rather than merely out-performed, which breaks the
   * idle-is-viable contract.
   */
  /*
   * Raised from 0.45: at 0.45, ignoring the engagement layer entirely cost 2.16x the completion
   * time, past the point where idle play is still a real option.
   */
  /*
   * SLOW BUT DEEP.
   *
   * Slowing the decay to a sensible timescale made rotation barely worth doing - a player who
   * never rotated finished within 6% of one who did, so the mechanic existed without mattering.
   * The timescale is the part that has to be gentle (a decision every few minutes, not every
   * twenty seconds); the DEPTH can be significant, because a deep penalty on a slow clock is a
   * real choice rather than micro-management.
   */
  floor: 0.52,
} as const;

/** Where a camera event can be in its life. */
export type CameraEventTier = 'mundane' | 'revealing' | 'incriminating' | 'human';

export interface CameraEventDef {
  tier: CameraEventTier;
  /** What is on the screen. Present tense, no editorial — see docs/DESIGN.md §9. */
  line: string;
  /** Intel kinds this observation is worth. */
  kinds: IntelKind[];
}

/**
 * Tier gating, on coverage rather than on time.
 *
 * The uncomfortable material has to be EARNED, and tying it to coverage means it arrives
 * because of what the player has uncovered rather than because a clock ran out. It also gives
 * Twist 2 (the denominator, at coverage 0.38) and Twist 3 (the manifest, at 0.80) their
 * groundwork: by the time the game says most of them answered an advertisement, the player has
 * already clicked on a sleeping teenager and a drawer of other people's passports.
 */
export const TIER_UNLOCK: Record<CameraEventTier, number> = {
  mundane: 0,
  revealing: 0.12,
  incriminating: 0.34,
  human: 0.52,
};

/** Reward weight by tier. Multiplies the base payout. */
export const TIER_WEIGHT: Record<CameraEventTier, number> = {
  mundane: 1,
  revealing: 1.6,
  incriminating: 2.4,
  human: 2.4,
};

export const CAMERA_EVENTS: CameraEventDef[] = [
  // ---------------------------------------------------------------- mundane but useful
  { tier: 'mundane', kinds: ['structure'],
    line: 'Someone has written on the whiteboard. The sales target is now a different number. The previous number is still faintly visible.' },
  { tier: 'mundane', kinds: ['structure', 'people'],
    line: 'A monitor is unlocked. The screen saver has not engaged. It will not engage while the mouse is being moved.' },
  { tier: 'mundane', kinds: ['people'],
    line: 'The kettle has been switched on. Steam is present. No one is standing near the kettle.' },
  { tier: 'mundane', kinds: ['structure'],
    line: 'A lead sheet has been left on the printer tray. It has been there for some time.' },
  { tier: 'mundane', kinds: ['people'],
    line: 'A chair has been rotated to face the wall. It has not been rotated back.' },
  { tier: 'mundane', kinds: ['people'],
    line: 'Someone is charging a phone at the desk. The phone is not the desk phone.' },
  { tier: 'mundane', kinds: ['structure'],
    line: 'A sticky note has been attached to the base of a monitor. The note faces the camera. The writing is not legible.' },
  { tier: 'mundane', kinds: ['structure'],
    line: 'The clock shows a time. The clock is eleven minutes fast. It has not been corrected.' },
  { tier: 'mundane', kinds: ['structure'],
    line: 'A window has been opened. It is night outside. The blind moves.' },
  { tier: 'mundane', kinds: ['people'],
    line: 'Someone has left a headset on the desk, still connected. A call may or may not be in progress.' },
  { tier: 'mundane', kinds: ['structure'],
    line: 'The pantry bin is full. A second bin has been placed beside it.' },
  { tier: 'mundane', kinds: ['structure'],
    line: 'A desk has two monitors. One shows a spreadsheet. The other shows a screensaver of a beach.' },

  // ---------------------------------------------------------------- operationally revealing
  { tier: 'revealing', kinds: ['people', 'structure'],
    line: 'A shift handover is taking place. One person is seated. One person is standing and pointing at the screen. The seated person nods.' },
  { tier: 'revealing', kinds: ['structure', 'evidence'],
    line: 'Someone is typing a password. The typing is slow. The same field is corrected twice.' },
  { tier: 'revealing', kinds: ['people', 'structure'],
    line: 'A manager is reviewing a printed rota. Names are being crossed out. The rota is placed face down when finished.' },
  { tier: 'revealing', kinds: ['evidence'],
    line: 'A remote-access session is open on the monitor. A second cursor moves that no one at the desk is controlling.' },
  { tier: 'revealing', kinds: ['structure'],
    line: 'Someone is reading from a laminated sheet held below the desk edge. The sheet is returned to a drawer between calls.' },
  { tier: 'revealing', kinds: ['people', 'structure'],
    line: 'A group of four has gathered at the whiteboard. One person writes. The others watch. The meeting ends and the desks refill.' },
  { tier: 'revealing', kinds: ['people'],
    line: 'A new employee is being shown the dialler console. The trainer takes the mouse. The trainee watches. The trainee is given the mouse and the trainer takes it back.' },
  { tier: 'revealing', kinds: ['evidence'],
    line: 'Two monitors now show the same screen. One is a copy of the other.' },
  { tier: 'revealing', kinds: ['people'],
    line: 'A call is transferred. The first agent removes the headset. A second agent puts on a headset at the same desk.' },
  { tier: 'revealing', kinds: ['evidence'],
    line: 'Someone photographs their own monitor with a phone. The photograph is checked and the phone is put away.' },
  { tier: 'revealing', kinds: ['structure', 'evidence'],
    line: 'A SIM card is being changed in a handset. The old SIM is placed in a small tin with others.' },
  { tier: 'revealing', kinds: ['people'],
    line: 'The manager stands behind a seated agent and does not speak. The agent continues the call. The manager remains.' },
  { tier: 'revealing', kinds: ['structure', 'evidence'],
    line: 'A caller ID on the switchboard display reads a US area code. The building is not in the United States.' },
  { tier: 'revealing', kinds: ['structure'],
    line: 'Someone is counting headsets into a cardboard box. The count is written on the lid.' },

  // ---------------------------------------------------------------- genuinely incriminating
  { tier: 'incriminating', kinds: ['money', 'evidence'],
    line: 'An agent is reading a long number aloud from a screen. The number is read twice. The second reading is slower.' },
  { tier: 'incriminating', kinds: ['evidence'],
    line: 'A file is open, headed with a person\u2019s full name, an address, and a date of birth. The file is scrolled.' },
  { tier: 'incriminating', kinds: ['money', 'evidence'],
    line: 'Cash is being counted on the back-office desk. The counting is done twice. The total is written down.' },
  { tier: 'incriminating', kinds: ['money', 'evidence'],
    line: 'A gift card is held up while a code is read into the headset. The card is then set aside on a pile of cards.' },
  { tier: 'incriminating', kinds: ['money'],
    line: 'A spreadsheet lists first names and dollar amounts. A row is highlighted. The highlight moves down.' },
  { tier: 'incriminating', kinds: ['money', 'evidence'],
    line: 'A screen shows a bank login that is not the operator\u2019s own name. The balance is edited. The figure changes.' },
  { tier: 'incriminating', kinds: ['structure', 'money'],
    line: 'A whiteboard column headed with initials is being filled in with tally marks. One column has noticeably more marks than the others.' },
  { tier: 'incriminating', kinds: ['evidence'],
    line: 'A printed script has a line underlined in red. The line is read aloud. The reading matches the underline.' },
  { tier: 'incriminating', kinds: ['money', 'evidence'],
    line: 'A drawer is opened. Inside are bundled banknotes and a ledger. The drawer is closed and locked.' },
  { tier: 'incriminating', kinds: ['money'],
    line: 'An agent is holding a call while a manager writes a figure on a slip of paper and places it beside the keyboard. The agent reads the figure into the headset.' },
  { tier: 'incriminating', kinds: ['evidence'],
    line: 'A monitor shows a remote desktop with a stranger\u2019s family photographs as the wallpaper. The session continues.' },
  { tier: 'incriminating', kinds: ['money', 'evidence'],
    line: 'A list of account numbers is being copied by hand into a notebook. The notebook is closed and pocketed.' },
  { tier: 'incriminating', kinds: ['money'],
    line: 'Someone is testing gift cards through a website. Cards that fail are moved to the left. Cards that pass are moved to the right.' },

  // ---------------------------------------------------------------- human and uncomfortable
  { tier: 'human', kinds: ['people'],
    line: 'An employee is crying. The headset is still on. The call has not ended.' },
  { tier: 'human', kinds: ['people', 'structure'],
    line: 'A manager is shouting at a seated employee. The words are not audible on the feed. The employee looks at the desk.' },
  { tier: 'human', kinds: ['people'],
    line: 'The employee at this desk appears very young. An identity card is clipped to the monitor. The photograph on it is of a child.' },
  { tier: 'human', kinds: ['people', 'evidence'],
    line: 'A passport is in the open drawer. It is not the drawer owner\u2019s photograph on the passport. The drawer is one of several.' },
  { tier: 'human', kinds: ['people'],
    line: 'An employee has fallen asleep at the desk. It is the middle of the night shift. No one wakes them.' },
  { tier: 'human', kinds: ['people'],
    line: 'Someone is packing a personal bag at the desk while the shift continues around them. A supervisor watches from across the floor.' },
  { tier: 'human', kinds: ['people'],
    line: 'An employee stops mid-call, removes the headset, sits without moving, then puts the headset back on and resumes.' },
  { tier: 'human', kinds: ['people', 'evidence'],
    line: 'A row of passports is laid out on the back-office desk. They are photographed together. They are returned to the drawer.' },
  { tier: 'human', kinds: ['people', 'evidence'],
    line: 'An employee is being handed a document to sign. They read it. They look up. They sign it.' },
  { tier: 'human', kinds: ['people'],
    line: 'Someone is eating at the desk with one hand while reading the script with the other. The plate is set on top of a lead sheet.' },
  { tier: 'human', kinds: ['people', 'structure'],
    line: 'An employee leaves the floor. Their chair is taken by another within the minute. The name card at the desk is not changed.' },
];

/**
 * Event tuning. Numbers taken from 12-bonus-events.md rather than invented.
 *
 * Cookie Clicker's golden cookies sit on a 300-900s window with a rising probability curve and
 * a 13s catch window; the reward is capped at 15 minutes of production. The shape is right and
 * the magnitude is far too big for a 150-minute phase, so the cadence is tightened and the
 * payout is cut hard.
 */
export const CAMERA_EVENT = {
  /** Soft-floored random interval, seconds, at one attention point on the cameras. */
  /*
   * FEWER, BIGGER MOMENTS.
   *
   * At 90-210s and a 0.55 attention exponent the simulator caught 128 events in a 161-minute
   * run - a lit feed roughly every 75 seconds for two and a half hours, which is exactly the
   * obligation the research warns about rather than an optional bonus. 11-active-play-layers.md
   * suggests on the order of 25-40 optional events across a phase this long, so the interval is
   * widened and each catch is worth more.
   */
  /*
   * Tightened again. Reported three times as too sparse - 'too much time inbetween'. With
   * concurrent events now allowed on different streams, a shorter interval fills the console
   * rather than merely speeding one queue up.
   */
  minInterval: 95,
  maxInterval: 260,
  /**
   * How much more attention on the cameras speeds events up. Sub-linear, so filling the wall
   * with attention is not simply correct.
   */
  /*
   * Raised from 0.3, which made buying attention nearly pointless for events: going from 3 points
   * to 10 moved the interval only from 221s to 154s, so the thing the player was saving up for
   * would not have fixed what he was complaining about.
   */
  attentionExponent: 0.45,
  /** Seconds the feed stays lit. Long enough not to be a reflex test. */
  window: 12,
  /** With the analyst upgrade, the window is this much longer. */
  windowBonus: 13,
  /** Minimum gap after an event resolves. */
  cooldown: 4,
  /**
   * How many moments may be live at once, at most one per stream.
   *
   * Was effectively one, globally, which is why a six-stream operations console felt empty: the
   * player asked for 'more cameras or other things to pop off'. Several things happening on
   * different streams at once is what a control room IS, and it makes the allocation legible -
   * you can see which streams are producing.
   */
  maxConcurrent: 3,

  /**
   * Payout, as SECONDS OF CURRENT PRODUCTION. This is the guardrail: the reward scales with
   * the player's own economy, so it stays relevant late without ever being a windfall, and it
   * can never outpace idle income by more than the cap.
   */
  payoutSeconds: 42,
  /** Hard ceiling on a single claim, in seconds of production, after tier and chain. */
  payoutSecondsMax: 90,
  /** A floor for the very early game, when production is near zero. */
  payoutFlat: 40,

  /** Chance of a 'hot lead': a short yield surge instead of a lump. */
  hotLeadChance: 0.06,
  hotLeadMultiplier: 3,
  hotLeadSeconds: 30,

  /**
   * Chance the thing you clicked turns out to be nothing.
   *
   * Cookie Clicker ships this deliberately (its 'Blab' effect does nothing at all). A dud is
   * also exactly this game's register: most of what you watch is a man not doing very much.
   */
  dudChance: 0.04,
} as const;

/** Lines for a dud. Nothing is granted; something is still said. */
export const DUD_LINES: string[] = [
  'Nothing. The movement was a screensaver starting.',
  'Nothing. Somebody walked past the lens and kept walking.',
  'Nothing. A moth.',
  'Nothing. The camera adjusted its own exposure.',
  'Nothing of substance. Two people discussing a rota you already have.',
  'Nothing. The chair moved because the floor is not level.',
];

/**
 * THE CHAIN.
 *
 * Consecutive catches build a multiplier on further catches. It DECAYS with time rather than
 * breaking on a miss, which is the deliberate compromise: 13-multipliers-and-buffs.md wants a
 * back-loaded build-and-break streak for tension, and 12-bonus-events.md warns that punishing
 * a miss is how players come to feel chained to a game. Decay gives the attentive player a
 * rising bonus and the absent player merely no bonus — never a loss and never a scolding.
 */
export const CHAIN = {
  /** Added per catch. */
  perCatch: 1,
  /**
   * Added by reading a stream properly.
   *
   * Looking closer IS an act of noticing, so it should feed the streak - and it is the only thing
   * frequent enough to keep one alive between events. Without this the chain sat at 1.04x however
   * attentively the phase was played, which made it decoration.
   */
  perLookCloser: 0.34,
  /** Cap, so the chain cannot become the whole economy. */
  max: 8,
  /**
   * Chain lost per second when nothing is being caught.
   *
   * Has to be matched to the event cadence. At 0.018/s a chain could not survive the ~5 minute
   * gap between events at all, so it never built and the mechanic did nothing.
   */
  /*
   * Slowed from 0.004. The chain never got past 1.04x in play because the gap between catches
   * cost more than a catch was worth. A streak that cannot be built is not a mechanic.
   */
  decayPerSecond: 0.0022,
  /** Each point of chain adds this to the event payout multiplier. */
  payoutPerPoint: 0.22,
  /**
   * Each point of chain adds this to ALL intel yields, so it is felt outside the events too.
   *
   * Raised from 0.025 to make heat discipline matter again. With a weak chain a burn cost almost
   * nothing and recklessness measured FASTER than careful play - the same inversion this phase
   * had before. The chain is now what recklessness actually loses when it gets caught.
   */
  yieldPerPoint: 0.06,
  /** A burn resets it. Getting caught is the one thing that actually costs you the streak. */
  brokenByBurn: true,
} as const;

/** Fraction of an event's value granted when the desk claims it for you. */
export const DESK_CLAIM_FRACTION = 0.5;

/**
 * LOOKING CLOSER — the verb Phase 2 was missing.
 *
 * The complaint that mattered most was not that the phase was slow but that there was nothing to
 * DO: 'now im just waiting for 1.5k to get another thing to do at once'. Phase 1 always had a
 * hand busy. Phase 2 had allocation, which stabilises, and then several minutes of watching bars.
 *
 * This is deliberately NOT Phase 1's stall button rebuilt. It is always available, it is modest,
 * and it COSTS something: reading a stream properly makes it go stale faster, so a player who
 * hammers it burns out the very stream they are reading. That is a tradeoff rather than a clicker,
 * and it is the same choice the phase is already about - what to spend attention on - only at a
 * scale of seconds instead of minutes.
 *
 * The numbers are set from the guardrail rather than by feel. Engaged play should be about
 * 1.3-2x idle, so the maximum possible contribution has to land near 40%: a claim worth
 * `seconds` of that stream's output on a `cooldown` gives at most seconds/cooldown of extra
 * income, which at 6 and 15 is 0.4. And that ceiling is only reachable by rotating perfectly,
 * which the freshness cost then punishes.
 */
export const LOOK_CLOSER = {
  /** Seconds of that stream's own output, granted at once. */
  seconds: 7,
  /** Per-stream cooldown, seconds. */
  cooldown: 15,
  /**
   * Freshness spent by reading properly.
   *
   * WAS 0.05, WHICH MADE THIS A TRAP. Used on cooldown that is 0.05 every 15 seconds, or
   * 0.0033/s of staleness against a base decay of 0.0009/s at one attention point - it TRIPLED
   * the rate at which a stream went stale. So the mechanic gave 40% more output while driving the
   * stream to the 0.52 floor and costing 48%, and using it diligently made you SLOWER.
   *
   * The simulator said so plainly and I nearly missed it: the `optimal` archetype, which reads
   * streams almost every time it can, finished eleven minutes BEHIND `active`, which does it
   * sixty percent of the time. An action that punishes the player for using it well is worse than
   * no action at all, because it also punishes them for paying attention.
   *
   * At 0.018 it is a real cost that plans into rotation rather than defeating it.
   */
  freshnessCost: 0.018,
} as const;

/** Which stream the events belong to. */
export const EVENT_STREAM: StreamId = 'cctv';
