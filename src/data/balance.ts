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
    unlocksAt: 1_800_000,
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
    unlocksAt: 25_000_000,
    cascadeBoost: 0.02,
  },
];

export const GENERATOR_BY_ID: Record<GeneratorId, GeneratorDef> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
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

export const PHASE1_MILESTONES: MilestoneDef[] = [
  {
    id: 'p1.contact',
    at: 100,
    title: 'First Contact',
    line: 'He has given you his name. It is not his name.',
    multiplier: 1,
    rapportFloor: 5,
  },
  {
    id: 'p1.remote',
    at: 5_000,
    title: 'The Remote Session',
    line: 'He has installed the tool. He is inside your computer. Your computer is not real.',
    multiplier: 1.5,
    rapportFloor: 15,
    beat: 'beat.remote',
  },
  {
    id: 'p1.screenshare',
    at: 100_000,
    title: 'Screen Share',
    line: 'You can see his desktop. There are 41 windows open. One is a spreadsheet.',
    multiplier: 1.5,
    rapportFloor: 30,
    beat: 'beat.screenshare',
  },
  {
    id: 'p1.quota',
    at: 2_000_000,
    title: 'The Quota',
    line: 'He has been told to close two accounts before the shift ends. It is 4:40.',
    multiplier: 1.5,
    rapportFloor: 45,
    // Point of no return. See docs/DESIGN.md §7, Twist 1.
    beat: 'beat.quota',
  },
  {
    id: 'p1.persistent',
    at: 40_000_000,
    title: 'Persistent Access',
    line: 'You no longer need him to let you in. He does not know this.',
    multiplier: 1.5,
    rapportFloor: 60,
    beat: 'beat.persistent',
  },
  {
    id: 'p1.switchboard',
    at: 1_000_000_000,
    title: 'The Switchboard',
    line: 'Two hundred and six extensions. All of them ring somewhere.',
    multiplier: 2,
    rapportFloor: 75,
    beat: 'beat.switchboard',
  },
];

/** Lifetime Hold Time that ends Phase 1. Matches the last milestone. */
export const PHASE1_GATE = 1_000_000_000;

/**
 * Target duration window in minutes for the `active` archetype. The simulator's
 * regression test fails the build if the real figure leaves this window — the
 * anti-drift gate the hand-tuned build never had.
 */
/**
 * MEASURED, not aspirational. The design target is 90-120 minutes, but the content
 * that currently exists (6 generator tiers, 16 upgrades) supports ~25-30 minutes of
 * real progression: past that the simulated curve flatlines and the only thing still
 * driving numbers up is the two real-time-gated upgrades. Rather than stretch the
 * coefficients and ship 90 minutes of dead time, the gate sits where the curve is
 * still alive and this window reflects reality.
 *
 * Closing the gap to 90-120 is a CONTENT task, tracked in docs/DESIGN.md §12:
 * more tiers, roughly triple the upgrade count, and the mid-phase event mechanic.
 */
export const PHASE1_TARGET_MINUTES = { min: 18, max: 45 } as const;

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
