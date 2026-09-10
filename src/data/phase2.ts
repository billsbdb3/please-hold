/**
 * PHASE 2 — THE MAP
 *
 * The verb is ALLOCATE. Clicking is retired outright: Phase 1's entire skill is taken away
 * and replaced, which is the Universal Paperclips move and the single most valuable finding
 * in the design research (docs/DESIGN.md §3).
 *
 * The shape of the phase:
 *
 *   You have a finite pool of ATTENTION and six streams to point it at. Each stream yields a
 *   different KIND of intel and generates HEAT while you watch it. Coverage — the phase gate —
 *   requires all four kinds, so no single stream can finish the phase and every second is a
 *   decision about what you are willing to stop watching.
 *
 *   Heat is their suspicion. It rises with what you are doing, not with time, so the threat is
 *   a direct consequence of your own choices. At maximum they notice and BURN a stream: you
 *   lose it for a while. That is a setback, never a loss — the research is emphatic that
 *   punishment which costs progress makes people close the tab.
 *
 * Balance is verified by the same simulator as Phase 1, including the adversarial archetype.
 */

import type { StreamId, IntelKind } from '../engine/types';

export interface StreamDef {
  id: StreamId;
  name: string;
  /** What you are actually looking at. Dry, flat, specific. */
  flavor: string;
  /** Intel per second per unit of attention, by kind. Sparse — most streams do 1-2 things. */
  yields: Partial<Record<IntelKind, number>>;
  /** Heat per second per unit of attention. The cost of looking. */
  heatPerAttention: number;
  /** Intel to unlock. CCTV is 0 — you arrive with the cameras. */
  unlockCost: number;
  /** Attention this stream can absorb. Beyond it, extra attention does nothing. */
  maxAttention: number;
}

/**
 * The streams, roughly in unlock order.
 *
 * Note the deliberate asymmetry: the cheap streams are safe and slow, the incriminating ones
 * are fast and dangerous. The ledger is the most productive thing in the phase and also the
 * fastest way to get caught, which is the tension the whole phase runs on.
 */
export const STREAMS: StreamDef[] = [
  {
    id: 'cctv',
    name: 'The Camera Bank',
    flavor: 'Fourteen feeds. Nothing happens on most of them, at length.',
    yields: { people: 0.9, structure: 0.5 },
    heatPerAttention: 0.05,
    unlockCost: 0,
    maxAttention: 6,
  },
  {
    id: 'recordings',
    name: 'The Call Archive',
    flavor: 'Every call, kept for quality assurance. Theirs, not yours.',
    // Card details, read back down the line and kept for quality assurance. This is the
    // early money source the phase was missing.
    yields: { people: 1.4, evidence: 0.7, money: 0.55 },
    heatPerAttention: 0.09,
    unlockCost: 300,
    maxAttention: 5,
  },
  {
    id: 'switchboard',
    name: 'The Switchboard',
    flavor: 'Two hundred and six extensions, and a log of which ones ring each other.',
    yields: { structure: 2.0 },
    heatPerAttention: 0.11,
    unlockCost: 1_200,
    maxAttention: 5,
  },
  {
    id: 'crm',
    name: 'The Dialler Console',
    flavor: 'Lead lists, rebuttal trees, and a leaderboard nobody wants to be bottom of.',
    yields: { structure: 1.2, people: 1.0, money: 0.6 },
    heatPerAttention: 0.15,
    unlockCost: 3_500,
    maxAttention: 4,
  },
  {
    id: 'whatsapp',
    name: 'The Group Chats',
    flavor: 'Where they say the parts they would not say on a recorded line.',
    yields: { people: 1.6, evidence: 2.2 },
    heatPerAttention: 0.24,
    unlockCost: 9_000,
    maxAttention: 4,
  },
  {
    id: 'ledger',
    name: 'The Spreadsheet',
    flavor: 'Takings by day, by closer, by account. Somebody keeps it very neatly.',
    yields: { money: 3.4, evidence: 1.1 },
    heatPerAttention: 0.35,
    unlockCost: 22_000,
    maxAttention: 4,
  },
];

export const STREAM_BY_ID: Record<StreamId, StreamDef> = Object.fromEntries(
  STREAMS.map((s) => [s.id, s]),
) as Record<StreamId, StreamDef>;

export const INTEL_KINDS: IntelKind[] = ['people', 'structure', 'money', 'evidence'];

export const INTEL_KIND_LABEL: Record<IntelKind, string> = {
  people: 'People',
  structure: 'Structure',
  money: 'Money',
  evidence: 'Evidence',
};

/** Attention: the resource that makes this an allocation game rather than a shop. */
export const ATTENTION = {
  /** Starting pool. Deliberately less than the first two streams can absorb. */
  base: 3,
  /** Bought with Intel; each costs more than the last. */
  costBase: 1_500,
  costGrowth: 1.75,
  max: 14,
} as const;

/**
 * HEAT — their suspicion, and the phase's threat.
 *
 * It rises from what you are DOING (attention on dangerous streams), not from the clock, so
 * it is a consequence of choices rather than a timer. Research 07 §7 is explicit that a
 * threat must grow in a strictly lower class than the counter to it, or the game becomes
 * unwinnable; here the counter is attention reallocation, which is instant and free, so the
 * player always has an answer available.
 */
export const HEAT = {
  max: 100,
  /** Constant bleed-off, so backing off always works. */
  decayPerSecond: 0.8,
  /** Above this the UI starts warning. */
  warnAt: 62,
  /** At max, a stream is burned. */
  burnAt: 100,
  /** Seconds a burned stream stays dark, for a FIRST burn. */
  burnSeconds: 45,
  /**
   * Each previous burn extends the next one by this fraction. They get more watchful every
   * time they catch something, so a reckless allocation degrades rather than paying a flat
   * toll - without this, never backing off measured FASTER than managing heat at all.
   */
  burnEscalation: 0.45,
  /** Ceiling, so a long session cannot become unplayable. */
  burnSecondsMax: 300,
  /** Heat left after a burn — not zero, so a second burn is a real risk. */
  afterBurn: 40,
  /**
   * How much high heat suppresses intel yields, at maximum heat.
   *
   * This is the load-bearing part of the threat, and it was missing. With burns as the only
   * consequence, losing one of six streams for a while was a ~17% hit, so NEVER backing off
   * measured fastest by a wide margin (140 min against 288) and the careful play the phase is
   * about was strictly wrong. A continuous penalty makes running hot directly less productive,
   * which turns a cliff into an interior optimum: there is a best heat to sit at, and finding
   * it is the phase's actual skill.
   *
   * In fiction: a suspicious floor is a careful floor. They say less on a line they think is
   * being listened to.
   */
  yieldPenaltyAtMax: 0.7,
} as const;

/**
 * COVERAGE — the Phase 2 gate.
 *
 * Deliberately NOT a single accumulator. Phase 1 shipped with `holdTimeCareer` alone as its
 * gate and a player finished in 53 minutes against a 95-minute design, because a production
 * spike inflates a raw total faster than anything else in the game. Coverage is the MINIMUM
 * of four independent requirements, so it can only be finished by covering the whole
 * operation, and a runaway on one stream cannot carry the phase.
 */
export const COVERAGE = {
  need: {
    people: 120_000,
    structure: 96_000,
    money: 78_000,
    evidence: 102_000,
  } as Record<IntelKind, number>,
  /**
   * Roster entries whose real name must be resolved. An attentive Phase 1 arrives with 12,
   * so requiring 10 was trivially satisfied on arrival and the requirement did nothing.
   */
  /**
   * How many of his slips must be CORROBORATED.
   *
   * Phase 1's roster is a list of things he said while he was losing his temper - a first
   * name, a shift pattern, a licence that expires on Thursdays. It is not a list of people,
   * and the first version of this treated it as one: the button read 'Identify The daily
   * quota - 4 closes', which is not a sentence. Corroboration is what the roster actually
   * supports and it is the better idea anyway - his word is not evidence until you have seen
   * the thing he described.
   */
  corroborated: 12,
} as const;

/** Cost to put a real name to a roster entry. Rises as the easy ones run out. */
export const IDENTIFY = {
  costBase: 220,
  costGrowth: 1.28,
  /** Intel kinds spent, proportionally, when identifying someone. */
  kinds: ['people', 'structure'] as IntelKind[],
} as const;

/**
 * Tradecraft — Phase 2's upgrades. Bought with Intel, and mostly about heat and attention
 * rather than raw output, because the phase's problem is allocation, not production.
 */
export interface TradecraftDef {
  id: string;
  name: string;
  effect: string;
  flavor: string;
  cost: number;
  requiresIntel?: number;
  requires?: string[];
  /** Multiplies all intel yields. */
  yieldMultiplier?: number;
  /** Multiplies heat generation. Below 1 is good. */
  heatMultiplier?: number;
  /** Adds to the attention pool. */
  attentionBonus?: number;
  /** Multiplies heat decay, so you cool off faster. */
  decayMultiplier?: number;
  /** Cuts the cost of identifying people. */
  identifyDiscount?: number;
}

export const TRADECRAFT: TradecraftDef[] = [
  {
    id: 't.vm',
    name: 'A Second Machine',
    effect: 'All intel ×1.4.',
    flavor: 'One screen for them, one for you. You stop mixing the two up around week three.',
    cost: 400,
    yieldMultiplier: 1.4,
  },
  {
    id: 't.hours',
    name: 'Watching Out Of Hours',
    effect: 'Suspicion rises 25% slower.',
    flavor: 'Nobody reviews the access logs at four in the morning. Nobody reviews them at all.',
    cost: 1_000,
    heatMultiplier: 0.75,
  },
  {
    id: 't.notes',
    name: 'Cross-Referencing',
    effect: 'Corroborating costs 30% less.',
    flavor: 'The same man appears on three cameras and one payroll line. That is enough.',
    /**
     * 2,200 made this unbuyable while it was still worth buying.
     *
     * The arithmetic alone is fine - bought immediately it saves 4,322 against a 2,200 outlay.
     * The trap is the AFFORDABILITY CURVE. Corroborating costs 220 x 1.28^n, so no single
     * corroboration exceeds 2,200 until the eleventh of twelve. Buying the cheapest thing on
     * screen is the obvious play, so a player drips through ten corroborations for 8,486 and
     * never has 2,200 spare; by the time he does, two slips remain and the discount saves
     * 1,776 for 2,200. A playtester corroborated the entire roster before he could afford it,
     * which is the only way this shows up - the upgrade was never unreachable, just always
     * out-competed by the thing it discounts.
     *
     * At 800 it sits between the sixth and seventh corroboration, so it can actually be banked
     * while nine remain, and it repays from any point up to the eleventh.
     */
    cost: 800,
    identifyDiscount: 0.3,
  },
  {
    id: 't.attention1',
    name: 'A Third Monitor',
    effect: '+2 attention.',
    flavor: 'It is a poor monitor. It is a third monitor.',
    cost: 4_500,
    attentionBonus: 2,
  },
  {
    id: 't.quiet',
    name: 'Quiet Sessions',
    effect: 'Suspicion falls 60% faster.',
    flavor: 'You have learned when to close the laptop, which is not a thing you knew before.',
    cost: 9_000,
    decayMultiplier: 1.6,
    requires: ['t.hours'],
  },
  {
    id: 't.script',
    name: 'Their Own Reporting',
    effect: 'All intel ×1.8.',
    flavor: 'They generate a daily summary. You are on the distribution list, which is careless of them.',
    cost: 18_000,
    yieldMultiplier: 1.8,
    requires: ['t.vm'],
  },
  {
    id: 't.attention2',
    name: 'Nothing Else In The Diary',
    effect: '+3 attention.',
    flavor: 'You have stopped being asked to things. This has been convenient.',
    cost: 35_000,
    attentionBonus: 3,
    requires: ['t.attention1'],
  },
  {
    id: 't.insider',
    name: 'The IT Man Is Careless',
    effect: 'Suspicion rises 40% slower. All intel ×1.5.',
    flavor: 'He reuses one password across four systems. He also only comes in on Tuesdays.',
    cost: 65_000,
    heatMultiplier: 0.6,
    yieldMultiplier: 1.5,
    requires: ['t.quiet'],
  },
];

export const TRADECRAFT_BY_ID: Record<string, TradecraftDef> = Object.fromEntries(
  TRADECRAFT.map((t) => [t.id, t]),
);

/** Target duration for the `active` archetype. Enforced by the regression gate. */
export const PHASE2_TARGET_MINUTES = { min: 150, max: 200 } as const;

/**
 * Phase 2 milestones, on Coverage progress rather than a currency total — for the same
 * reason the gate is a minimum: a single runaway stream must not be able to march the
 * narrative forward on its own.
 */
export interface Phase2MilestoneDef {
  id: string;
  /** Fraction of overall coverage, 0..1. */
  at: number;
  title: string;
  line: string;
  beat?: string;
}

export const PHASE2_MILESTONES: Phase2MilestoneDef[] = [
  {
    id: 'p2.cctv',
    at: 0.02,
    title: 'The Camera Bank',
    line: 'Fourteen feeds. On four of them, someone is working. On one, someone is asleep.',
  },
  {
    id: 'p2.roster',
    at: 0.18,
    title: 'The Roster',
    line: 'Shift patterns, then names. The names are the part that takes a while.',
  },
  {
    id: 'p2.denominator',
    at: 0.38,
    title: 'The Denominator',
    line: 'The count you have been keeping is a count of people. It always was.',
    // Twist 2. See docs/DESIGN.md §7.
    beat: 'beat.denominator',
  },
  {
    id: 'p2.money',
    at: 0.58,
    title: 'The Money',
    line: 'Four mule accounts, one wallet, and a spreadsheet somebody keeps very neatly.',
  },
  {
    id: 'p2.manifest',
    at: 0.80,
    title: 'The Manifest',
    line: 'Most of them answered an advertisement. The advertisement was for a call centre job.',
    // Twist 3.
    beat: 'beat.manifest',
  },
  {
    id: 'p2.owner',
    at: 1.0,
    title: 'The Owner',
    line: 'A front company, a registered address, and a name that is not on any rota.',
    beat: 'beat.owner',
  },
];
