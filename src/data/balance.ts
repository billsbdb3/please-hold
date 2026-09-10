/**
 * Balance configuration — Phase 1, "THE MARK".
 *
 * Every number here is derived, not guessed. The working is in
 * ../../../please-hold-research/07-balance-math.md. The old build was hand-tuned by
 * trial and error across seven revisions and ended up with a documented design that
 * disagreed with the code in 34 of 40 parameters, so the rules now are:
 *
 *   1. ALL tunable numbers live in this file. No magic numbers in logic files.
 *   2. The headless simulator reads THIS file, not a copy. The old build's two
 *      simulators each modelled a different game and neither imported balance.
 *   3. A phase whose simulated duration leaves its target window FAILS THE BUILD.
 *
 * Cost model:      cost(n) = baseCost · growth^n
 * Production:      prod    = baseProduction · owned · multipliers
 * Buy N at once:   cost    = baseCost · growth^owned · (growth^N − 1)/(growth − 1)
 *
 * Growth rates sit in 1.08–1.12: low enough that a purchase always feels close,
 * high enough that the wall arrives on schedule. ln2/ln(r) gives the doubling
 * cadence — at r=1.08 that is ~9 purchases per doubling of cost.
 */

import type { GeneratorId } from '../engine/types';

export interface GeneratorDef {
  id: GeneratorId;
  name: string;
  /** Shown once, on first unlock. Dry. Never explains itself. */
  flavor: string;
  /** Shown permanently in the shop row. States mechanics plainly. */
  effect: string;
  baseCost: number;
  growth: number;
  /** Hold Time per second per unit, before multipliers. */
  baseProduction: number;
  /**
   * Softcap threshold. Past this many owned, each additional unit contributes
   * less. Keeps a single generator from becoming the whole game and makes the
   * next tier the obvious purchase instead of a grind.
   */
  softCapAt: number;
  /** Hold Time lifetime required before this tier appears at all. */
  unlocksAt: number;
  /**
   * Cascade: each tier boosts every tier BELOW it by this fraction per unit owned.
   * The good idea worth keeping from the old build — it makes a high tier feel
   * like an investment in everything you already own rather than a replacement.
   */
  cascadeBoost: number;
}

/**
 * Softcap exponent. Past the threshold, effective owned count grows as
 * `threshold + (owned − threshold)^SOFT_CAP_EXPONENT`, with the exponent below 1
 * so returns diminish smoothly rather than stopping dead.
 */
export const SOFT_CAP_EXPONENT = 0.85;

/** Cascade contribution is capped so a tall stack cannot run away. */
export const CASCADE_CAP = 2.0;

export const GENERATORS: GeneratorDef[] = [
  {
    id: 'confusion',
    name: 'Genuine Confusion',
    flavor: 'You do not know which window is the browser. This is true.',
    effect: 'Wastes their time passively.',
    baseCost: 10,
    growth: 1.13,
    baseProduction: 0.5,
    softCapAt: 25,
    unlocksAt: 0,
    cascadeBoost: 0,
  },
  {
    id: 'wrongPassword',
    name: 'Incorrect Password',
    flavor: 'Entered carefully, and wrongly, four times.',
    effect: 'Wastes their time. Boosts nothing. Sincere.',
    baseCost: 150,
    growth: 1.14,
    baseProduction: 3,
    softCapAt: 22,
    unlocksAt: 500,
    cascadeBoost: 0.004,
  },
  {
    id: 'catInterrupt',
    name: 'The Cat',
    flavor: 'The cat is on the desk. The cat is on the keyboard. The cat is leaving.',
    effect: 'Interrupts at intervals. Boosts lower tiers.',
    baseCost: 2_200,
    growth: 1.15,
    baseProduction: 16,
    softCapAt: 20,
    unlocksAt: 8_000,
    cascadeBoost: 0.008,
  },
  {
    id: 'speakerphone',
    name: 'Speakerphone',
    flavor: 'Now neither of you can hear anything. He does not ask you to turn it off.',
    effect: 'Every instruction must be repeated.',
    baseCost: 30_000,
    growth: 1.16,
    baseProduction: 85,
    softCapAt: 18,
    unlocksAt: 120_000,
    cascadeBoost: 0.012,
  },
  {
    id: 'secondDevice',
    name: 'The iPad',
    flavor: 'You have suggested doing this on the iPad instead. He is considering it.',
    effect: 'Introduces a second device that also does not work.',
    baseCost: 420_000,
    growth: 1.17,
    baseProduction: 450,
    softCapAt: 16,
    unlocksAt: 1_500_000,
    cascadeBoost: 0.016,
  },
  {
    id: 'relative',
    name: 'Your Nephew',
    flavor: 'Your nephew is good with computers. Your nephew has questions of his own.',
    effect: 'A second voice. He must explain everything again, from the start.',
    baseCost: 6_000_000,
    growth: 1.18,
    baseProduction: 2_400,
    softCapAt: 15,
    unlocksAt: 12_000_000,
    cascadeBoost: 0.02,
  },
];

/**
 * RESERVED FOR PHASE 2 — not part of the Phase 1 ladder.
 *
 * These three were written for Phase 1 and measured as dead content: the simulator
 * showed that with the redial loop running, no archetype ever bought The Neighbour or
 * The Filing Cabinet even once, and The Other Line peaked at a single unit. The reason
 * is structural rather than a pricing mistake — generator cost is paid from banked
 * Hold Time, a redial zeroes that, and a player redialling every few minutes never
 * banks enough to reach the top of a nine-rung ladder. Six rungs is what a
 * prestige-driven 100-minute phase actually exercises.
 *
 * They are kept rather than deleted because the writing is good and Phase 2's economy
 * has no reset, so a deeper ladder will work there. `tests/balance.test.ts` asserts
 * that nothing in the LIVE ladder is dead, which is what stops this recurring.
 */
export const PHASE2_RESERVED_GENERATORS: GeneratorDef[] = [
  {
    id: 'otherLine',
    name: 'The Other Line',
    flavor: 'You have put him on hold to answer a second call. The second call is also him.',
    effect: 'He is now waiting for himself.',
    baseCost: 20_000_000,
    growth: 1.18,
    baseProduction: 9_000,
    softCapAt: 14,
    unlocksAt: 25_000_000,
    cascadeBoost: 0.022,
  },
  {
    id: 'neighbour',
    name: 'The Neighbour',
    flavor: 'She has come round. She also has a computer problem. It is unrelated.',
    effect: 'A second, genuine, unrelated support case.',
    baseCost: 60_000_000,
    growth: 1.19,
    baseProduction: 26_000,
    softCapAt: 13,
    unlocksAt: 70_000_000,
    cascadeBoost: 0.024,
  },
  {
    id: 'filingCabinet',
    name: 'The Filing Cabinet',
    flavor: 'You are reading him account numbers from 1987. They are real. They are not yours.',
    effect: 'Thirty-eight years of paperwork, read aloud, in order.',
    baseCost: 150_000_000,
    growth: 1.19,
    baseProduction: 75_000,
    softCapAt: 12,
    unlocksAt: 160_000_000,
    cascadeBoost: 0.026,
  },
];

export const GENERATOR_BY_ID: Record<GeneratorId, GeneratorDef> = Object.fromEntries(
  [...GENERATORS, ...PHASE2_RESERVED_GENERATORS].map((g) => [g.id, g]),
) as Record<GeneratorId, GeneratorDef>;

/** Manual stalling — the Phase 1 verb. */
export const STALL = {
  /** Minimum ms between registered stalls. Stops autoclickers being strictly better. */
  cooldown: 100,
  baseValue: 1,
  /** Manual stalls scale with passive rate, so clicking never becomes pointless. */
  hpsScale: 0.02,
  /** Composure cost per stall. Staying in character is work. */
  composureCost: 0.4,
  comboMax: 4,
  comboGain: 0.25,
  /** Combo decay per second, once the grace period expires. */
  comboDecay: 0.5,
  comboGraceMs: 700,
} as const;

/**
 * Composure — the Phase 1 threat, and a genuine tradeoff rather than a penalty.
 *
 * The old build's Will-to-Live was a pure punishment: low WtL was simply bad. Here,
 * as composure falls, manual stalling gets STRONGER (you are rattled, and a rattled
 * mark is a convincing mark) while rapport gain gets WEAKER (you are also becoming
 * hard to believe). So the player chooses whether to run hot.
 */
export const COMPOSURE = {
  max: 100,
  /** Always-on trickle back toward calm. */
  regen: 0.6,
  /** Seconds of active play before the call starts to get to you. */
  drainStartsAt: 240,
  /** Drain per second once started. */
  baseDrain: 0.45,
  /** Additional drain, scaling with how long you have been on the line. */
  fatigueDrainPerMinute: 0.012,
  /** Hard ceiling so the endgame cannot become unsurvivable. */
  maxDrain: 2.0,
  /** Below this, the countdown to losing the call begins. */
  criticalAt: 8,
  /** Seconds at critical before the scammer hangs up. */
  criticalGraceSeconds: 12,
  /** Seconds the "line went dead" notice stays on screen after a dropped call. */
  dropNoticeSeconds: 7,
  /**
   * Taking a breath: the active counter to composure drain.
   *
   * A threat with no counter-play is the "unwinnable" anti-pattern, and until this
   * existed the only way to recover composure was to stop playing — which is a strange
   * thing for a game to ask. Spending the currency you are trying to accumulate makes
   * the composure economy an actual decision rather than a countdown.
   */
  breath: {
    /** Fraction of MAX composure restored. */
    restoreFraction: 0.4,
    /** Floor on the cost, so it is never free at the start of a call. */
    minCost: 8,
    /** Cost also scales with production, so it stays meaningful late. */
    ppsMultiplier: 1.5,
    /** Cannot be spammed. */
    cooldownSeconds: 4,
  },
  bands: [
    { id: 'steady',   min: 70, label: 'Steady',   stallMultiplier: 1.0, rapportMultiplier: 1.0 },
    { id: 'strained', min: 40, label: 'Strained', stallMultiplier: 1.3, rapportMultiplier: 0.85 },
    { id: 'slipping', min: 15, label: 'Slipping', stallMultiplier: 1.8, rapportMultiplier: 0.6 },
    { id: 'breaking', min: 0,  label: 'Breaking', stallMultiplier: 2.5, rapportMultiplier: 0.25 },
  ],
} as const;

/**
 * Rapport — the meta-gate. Cannot be bought with Hold Time, only earned by
 * behaving like a plausible victim. This is the Paperclips "Trust" lesson: the real
 * bottleneck is permission, not currency.
 */
export const RAPPORT = {
  /** Gained per manual stall, modulated by composure band. */
  perStall: 0.06,
  /** Passive gain per second while the call is alive and composure is steady. */
  perSecond: 0.015,
  max: 100,
} as const;

/**
 * Phase 1 milestones. Six, per the derivation, with the multiplier each grants so
 * the 6-decade budget sums exactly. `at` is lifetime Hold Time.
 */
export interface MilestoneDef {
  id: string;
  at: number;
  title: string;
  /** Log line. Flat. */
  line: string;
  /** Global production multiplier granted. 1 = narrative only. */
  multiplier: number;
  /** Rapport floor this milestone sets, so progress cannot be lost. */
  rapportFloor?: number;
  /** Marks a narrative beat that interrupts play. */
  beat?: string;
}

/**
 * Milestone positions as fractions of PHASE1_GATE, log-spaced so beats land at
 * roughly minutes 1 / 20 / 40 / 60 / 85 / 105 of the target phase.
 */
const MILESTONE_FRACTIONS = [2.5e-5, 5e-3, 3e-2, 1e-1, 3e-1, 1.0] as const;

const PHASE1_MILESTONE_DEFS: Omit<MilestoneDef, 'at'>[] = [
  {
    id: 'p1.contact',
    title: 'First Contact',
    line: 'He has given you his name. It is not his name.',
    multiplier: 1,
    rapportFloor: 5,
  },
  {
    id: 'p1.remote',
    title: 'The Remote Session',
    line: 'He has installed the tool. He is inside your computer. Your computer is not real.',
    multiplier: 1.5,
    rapportFloor: 15,
    beat: 'beat.remote',
  },
  {
    id: 'p1.screenshare',
    title: 'Screen Share',
    line: 'You can see his desktop. There are 41 windows open. One is a spreadsheet.',
    multiplier: 1.5,
    rapportFloor: 30,
    beat: 'beat.screenshare',
  },
  {
    id: 'p1.quota',
    title: 'The Quota',
    line: 'He has been told to close two accounts before the shift ends. It is 4:40.',
    multiplier: 1.5,
    rapportFloor: 45,
    // Point of no return. See docs/DESIGN.md §7, Twist 1.
    beat: 'beat.quota',
  },
  {
    id: 'p1.persistent',
    title: 'Persistent Access',
    line: 'You no longer need him to let you in. He does not know this.',
    multiplier: 1.5,
    rapportFloor: 60,
    beat: 'beat.persistent',
  },
  {
    id: 'p1.switchboard',
    title: 'The Switchboard',
    line: 'Two hundred and six extensions. All of them ring somewhere.',
    multiplier: 2,
    rapportFloor: 75,
    beat: 'beat.switchboard',
  },
];

/** Career Hold Time that ends Phase 1. The last milestone sits exactly here. */
export const PHASE1_GATE = 300_000_000;

/**
 * The milestones, with absolute thresholds derived from the gate. Exported in the
 * same shape as before so nothing downstream cares that placement became relative.
 */
export const PHASE1_MILESTONES: MilestoneDef[] = PHASE1_MILESTONE_DEFS.map((m, i) => ({
  ...m,
  at: Math.round(PHASE1_GATE * MILESTONE_FRACTIONS[i]),
}));

/**
 * REDIAL — the within-phase soft reset.
 *
 * You hang up and call back. You lose the call: banked Hold Time, every generator,
 * every in-call upgrade. You keep the dossier, and you gain Notes.
 *
 * Notes use a square-root of the best single call, per the standard prestige-currency
 * result: a root compresses an unbounded range into a spendable one, and requires 4x
 * the progress to double the reward, which stops a single lucky call from trivialising
 * the tree. `divisor` sets how deep the first call must go before a redial is worth it.
 */
export const REDIAL = {
  /** notes = max(1, floor(sqrt(bestCallLifetime / divisor))) */
  divisor: 12_000,
  /**
   * Hold Time a single call must reach before redialling unlocks.
   *
   * Lowered 1_000_000 -> 120_000 after measurement. The old value was an ABSOLUTE
   * threshold, which made the gate regressive: an engaged player met the redial loop
   * at minute 14, a casual one at minute 34, and a barely-attentive one not until
   * minute 103. The slower you played, the longer you were locked out of the single
   * mechanic that makes playing faster — the exact "prestige too late" failure the
   * research names as a top-five killer of the genre.
   *
   * At 120_000 the first redial lands in the first ten minutes for everyone, which is
   * where the genre puts it: the first reset should arrive before boredom, not after.
   */
  minLifetimeToRedial: 120_000,
  /**
   * An eligible redial always pays at least one page. Without this floor a player who
   * redials at exactly the minimum earns sqrt(120_000/250_000) = 0 Notes, so the
   * mechanic would unlock and then visibly do nothing, which is worse than it staying
   * locked. The cheapest dossier entry costs exactly 1 for the same reason.
   */
  minNotes: 1,
  /** Rapport retained across a redial, as a fraction. He half-remembers you. */
  rapportRetained: 0.35,
} as const;

/**
 * Dossier upgrades: bought with Notes, permanent across every redial.
 *
 * These are the reason a reset feels like a gain. Each one makes the NEXT call
 * measurably shorter to climb, which is the whole psychological trick of prestige.
 */
export interface DossierDef {
  id: string;
  name: string;
  effect: string;
  flavor: string;
  cost: number;
  requires?: string[];
  /** Permanent global production multiplier. */
  globalMultiplier?: number;
  /** Generators you begin every call already owning. */
  startingGenerators?: Partial<Record<GeneratorId, number>>;
  /** Rapport you begin every call with. */
  startingRapport?: number;
  /** Added to max composure. */
  composureBonus?: number;
  /** Multiplies Notes earned on future redials. */
  notesMultiplier?: number;
  /** Multiplies the value of a manual stall. */
  stallMultiplier?: number;
  /** Opportunity events arrive this much more often. */
  eventRateMultiplier?: number;
  /**
   * Automatically re-buy the cheapest affordable tactic every few seconds.
   *
   * Automation as an earned reward is one of the genre's core satisfaction beats, and
   * it is also the correctly-targeted fix for the measured problem: a low-attention
   * player loses almost nothing to being absent (generators run while idle) and almost
   * everything to not BUYING while absent. This closes that specific gap without
   * making an engaged player meaningfully faster, because they were already buying.
   */
  autoBuy?: boolean;
}

export const DOSSIER: DossierDef[] = [
  {
    id: 'd.callback',
    name: 'His Direct Number',
    effect: 'Start every call with 15 rapport.',
    flavor: 'You do not have to be transferred any more. You ask for him by name.',
    cost: 1,
    startingRapport: 15,
  },
  {
    id: 'd.script',
    name: 'A Copy Of The Script',
    effect: 'All production ×1.5.',
    flavor: 'You know what he is going to say. You let him say it.',
    cost: 14,
    globalMultiplier: 1.5,
  },
  {
    id: 'd.warmup',
    name: 'Pre-Written Confusion',
    effect: 'Begin each call with 10 Genuine Confusion.',
    flavor: 'You have the questions written down in advance now.',
    cost: 20,
    startingGenerators: { confusion: 10 },
  },
  {
    id: 'd.chair',
    name: 'A Better Chair',
    effect: '+25 maximum composure.',
    flavor: 'It was expensive. It was, on reflection, the correct decision.',
    cost: 30,
    composureBonus: 25,
  },
  {
    id: 'd.shorthand',
    name: 'Shorthand',
    effect: 'Notes earned ×1.5.',
    flavor: 'You have stopped writing full sentences. There is not time.',
    cost: 48,
    notesMultiplier: 1.5,
  },
  {
    id: 'd.rehearsed',
    name: 'Rehearsed Helplessness',
    effect: 'Manual stalls ×2.',
    flavor: 'You have practised sounding like this. It comes easily now, which you have chosen not to examine.',
    cost: 68,
    stallMultiplier: 2,
    requires: ['d.script'],
  },
  {
    id: 'd.roster',
    name: 'The Shift Roster',
    effect: 'Opportunity windows arrive twice as often.',
    flavor: 'You know when the floor manager takes his break. It is 3:15.',
    cost: 95,
    eventRateMultiplier: 2,
  },
  {
    id: 'd.routine',
    name: 'The Routine',
    effect: 'Re-buys your cheapest tactic on its own, every few seconds.',
    flavor: 'You no longer decide to do any of this. You have a way of doing it.',
    cost: 100,
    autoBuy: true,
    requires: ['d.rehearsed'],
  },
  {
    id: 'd.deadname',
    name: 'The Name He Uses',
    effect: 'Start every call with 35 rapport. All production ×1.6.',
    flavor: '"Brandon." He has been Brandon for four years. He answers to it before he thinks.',
    cost: 136,
    startingRapport: 35,
    globalMultiplier: 1.6,
    requires: ['d.callback'],
  },
  {
    id: 'd.toolkit',
    name: 'A Prepared Machine',
    effect: 'Begin each call with 15 Incorrect Password and 8 The Cat.',
    flavor: 'The virtual machine is already running. The cat is real.',
    cost: 187,
    startingGenerators: { wrongPassword: 15, catInterrupt: 8 },
    requires: ['d.warmup'],
  },
  {
    id: 'd.filing',
    name: 'A Filing System',
    effect: 'Notes earned ×2.',
    flavor: 'Sixty-one pages. Cross-referenced. You have started using tabs.',
    cost: 272,
    notesMultiplier: 2,
    requires: ['d.shorthand'],
  },
  {
    id: 'd.composure',
    name: 'Professional Detachment',
    effect: '+40 maximum composure. All production ×1.8.',
    flavor: 'It stopped being upsetting somewhere around the fourth call. You have not decided whether that is good.',
    cost: 408,
    composureBonus: 40,
    globalMultiplier: 1.8,
    requires: ['d.chair'],
  },
  {
    id: 'd.operation',
    name: 'The Shape Of It',
    effect: 'All production ×2.5.',
    flavor: 'It is not one man with a phone. You have drawn the org chart on the back of an envelope and it does not fit.',
    cost: 680,
    globalMultiplier: 2.5,
    requires: ['d.deadname', 'd.filing'],
  },
];

export const DOSSIER_BY_ID: Record<string, DossierDef> = Object.fromEntries(
  DOSSIER.map((d) => [d.id, d]),
);

/**
 * OPPORTUNITY EVENTS.
 *
 * A short window the player can click for a production burst. The design constraint
 * from the research: this must reward attention WITHOUT punishing absence. Missing one
 * costs nothing at all — there is no penalty branch — so an idle player is never
 * behind, only slower. That is the golden-cookie pattern.
 */
export const EVENTS = {
  minInterval: 95,
  maxInterval: 190,
  /** Seconds the window stays open. Generous enough to be catchable, not free. */
  windowSeconds: 7,
  pool: [
    { id: 'e.mute', label: 'He has muted himself to ask someone', multiplier: 5, duration: 14 },
    { id: 'e.supervisor', label: 'A supervisor is reading over his shoulder', multiplier: 4, duration: 20 },
    { id: 'e.script', label: 'He has lost his place in the script', multiplier: 6, duration: 12 },
    { id: 'e.shift', label: 'The shift is changing', multiplier: 7, duration: 10 },
    { id: 'e.crash', label: 'His remote tool has crashed', multiplier: 8, duration: 9 },
    { id: 'e.newguy', label: 'He is training someone', multiplier: 4, duration: 22 },
    { id: 'e.power', label: 'The generator has cut out at his end', multiplier: 9, duration: 8 },
  ],
} as const;

/**
 * Target duration window in minutes for the `active` archetype. The simulator's
 * regression test fails the build if the real figure leaves this window — the
 * anti-drift gate the hand-tuned build never had.
 */
/**
 * The design target, now actually met.
 *
 * History worth keeping: this shipped at 18-45 because the original content (6
 * generator tiers, 16 upgrades, no reset) measured 35 minutes and flatlined at 45
 * with nothing left to buy. Rather than stretch coefficients over dead time, the
 * window was set to the truth and the gap closed with CONTENT: three more tiers, 33
 * upgrades, penalty-free opportunity windows, and the redial soft reset with its
 * 12-entry dossier. The gate is read off the measured career curve, not guessed.
 */
export const PHASE1_TARGET_MINUTES = { min: 90, max: 120 } as const;

/** Idle handling. Generators keep running; only the composure drain pauses. */
export const IDLE = {
  /** Seconds without interaction before the player counts as idle. */
  thresholdSeconds: 180,
  /** Offline production is credited at this fraction of the live rate. */
  offlineRate: 0.4,
  /** Offline credit is capped at 24h. Stated plainly in the welcome-back panel. */
  maxOfflineHours: 24,
} as const;

export const SAVE = {
  intervalSeconds: 20,
} as const;
