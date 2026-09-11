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
    baseCost: 260_000,
    growth: 1.17,
    baseProduction: 450,
    softCapAt: 16,
    unlocksAt: 900_000,
    cascadeBoost: 0.016,
  },
  {
    id: 'relative',
    name: 'Your Nephew',
    flavor: 'Your nephew is good with computers. Your nephew has questions of his own.',
    effect: 'A second voice. He must explain everything again, from the start.',
    baseCost: 900_000,
    growth: 1.18,
    baseProduction: 2_400,
    softCapAt: 15,
    unlocksAt: 3_000_000,
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
/**
 * PERSONAS — the voice changer.
 *
 * Scammer Payback's signature is not just stalling, it is stalling *as somebody*. He runs
 * a voice changer and plays a rotating cast of characters, and the comedy — plus the rage —
 * comes from which character he chooses to inflict on a given scammer.
 *
 * Mechanically each persona is a different point on a triangle:
 *   - how much time you waste (stall value)
 *   - how much he believes you (rapport)
 *   - how furious he gets (rage)
 *
 * Nobody is best at everything, so switching is a tactical decision rather than an upgrade
 * path. It costs composure, because dropping one voice and finding another mid-call is work.
 */
export interface PersonaDef {
  id: string;
  name: string;
  /** The character, in one dry line. */
  flavor: string;
  stallMultiplier: number;
  rapportMultiplier: number;
  rageMultiplier: number;
  /** Multiplies composure drain while this persona is active. */
  drainMultiplier: number;
  /** Career Hold Time before this voice is available. */
  unlocksAt: number;
}

export const PERSONAS: PersonaDef[] = [
  {
    id: 'doris',
    name: 'Doris',
    flavor: 'Seventy-one. Genuinely bewildered. Keeps asking whether this will affect her television.',
    stallMultiplier: 1.0,
    rapportMultiplier: 1.4,
    rageMultiplier: 0.7,
    drainMultiplier: 1.0,
    unlocksAt: 0,
  },
  {
    id: 'nigel',
    name: 'Nigel',
    flavor: 'Would like to be transferred to somebody more senior. Has been transferred four times.',
    stallMultiplier: 1.3,
    rapportMultiplier: 0.9,
    rageMultiplier: 1.5,
    drainMultiplier: 1.1,
    unlocksAt: 40_000,
  },
  {
    id: 'teenager',
    name: 'The Teenager',
    flavor: 'Answers everything with "mm". Is not being difficult. This is simply the voice.',
    stallMultiplier: 0.8,
    rapportMultiplier: 0.6,
    rageMultiplier: 2.2,
    drainMultiplier: 0.9,
    unlocksAt: 400_000,
  },
  {
    id: 'pemberton',
    name: 'Mr Pemberton',
    flavor: 'Retired accountant. Requires everything in writing. Reads reference numbers back, digit by digit, twice.',
    stallMultiplier: 2.0,
    rapportMultiplier: 1.1,
    rageMultiplier: 1.2,
    drainMultiplier: 1.2,
    unlocksAt: 2_500_000,
  },
  {
    id: 'deborah',
    name: 'Deborah, Accounts Payable',
    flavor: 'Has asked for a purchase order number. Will not proceed without a purchase order number.',
    stallMultiplier: 1.6,
    rapportMultiplier: 0.55,
    rageMultiplier: 2.6,
    drainMultiplier: 1.45,
    unlocksAt: 9_000_000,
  },
  {
    id: 'sincere',
    name: 'A Very Sincere Man',
    flavor: 'Takes every word literally. Was asked to open a window and has opened a window.',
    stallMultiplier: 1.7,
    rapportMultiplier: 1.6,
    rageMultiplier: 1.9,
    drainMultiplier: 0.8,
    unlocksAt: 25_000_000,
  },
];

export const PERSONA_BY_ID: Record<string, PersonaDef> = Object.fromEntries(
  PERSONAS.map((p) => [p.id, p]),
);

/** Composure cost of changing voice mid-call. */
export const PERSONA_SWITCH_COST = 4;

/**
 * RAGE — the offensive resource, and the reason any of this is funny.
 *
 * Composure is what you protect; rage is what you inflict. Stalling in character builds it,
 * and when it boils over he loses his temper — which is both the payoff and, because a
 * furious man is a careless man, the moment something useful slips out: a real name, a
 * floor, a supervisor. That is how Phase 1 begins feeding the roster Phase 2 is built on.
 *
 * The tradeoff is that an enraged scammer is abusive, so high rage RAISES composure drain.
 * You cannot pin it at maximum and walk away.
 */
export const RAGE = {
  max: 100,
  /** Gained per manual stall, before the persona multiplier. */
  perStall: 0.055,
  /** Gained per second while the call is live. */
  perSecond: 0.05,
  /** Decays when you stop provoking him. */
  decayPerSecond: 0.05,
  /** Seconds after a stall before decay resumes. */
  decayGraceSeconds: 6,
  /** At maximum he loses it: a production burst. */
  boilOverBurst: 3,
  boilOverBurstSeconds: 10,
  /** Rage left after a boil-over, so the next one takes real work. */
  resetTo: 20,
  /** Additional composure drain per second at full rage, scaling from zero. */
  drainAtMaxRage: 0.9,
  /** He says something he should not have. */
  boilOverNotes: 1,
  /**
   * Fraction of rage carried across a redial.
   *
   * Zeroing it looked right — a different person answers — but it silently suppressed the
   * entire mechanic for anyone who redialled often: a casual player reset every ~5.6
   * minutes while needing ~8 to boil over, so they never once saw him lose his temper.
   * Carrying most of it over is also the better fiction. Word gets round a call floor.
   */
  carriedAcrossRedial: 0.6,
} as const;

/**
 * What he says when he loses it. Delivered flat, as transcript.
 *
 * The register is deliberately administrative: the funniest thing an enraged man on a scam
 * floor says is not a threat, it is a complaint about process.
 */
export const BOIL_OVER_LINES: string[] = [
  'He has told you his real name. He appears to regret it immediately.',
  'He is shouting the name of his supervisor. You write it down.',
  'He has told you which building he is in. He has told you which floor.',
  'He says he has been doing this for six years. He says it the way a man describes a job.',
  'He has called you something he will have to explain to his floor manager.',
  'He has hung up on his own colleague by mistake. You can hear the colleague.',
  'He has asked whether you think this is funny. You have not spoken for four minutes.',
  'He is threatening to come to your house. He has the address wrong. It is a garden centre.',
  'He has told you what his quota is. It is higher than last month.',
  'Someone off-microphone has told him to keep his voice down.',
  'He has put the phone down on the desk. He has not put it down far enough.',
  'He is explaining to somebody nearby that you are the problem. You have been agreeable throughout.',
  'He has read the script from the beginning. He is reading it faster this time.',
  'He has asked you to confirm the number he called you on. He called you.',
  'He is breathing in a way that suggests he has been told about his blood pressure.',
  'He has spelled a word out for you. He has spelled it incorrectly, twice, identically.',
  'He has told you he is being recorded for quality. He has told you this as a threat.',
  'He has offered to escalate you to his manager. His manager can be heard declining.',
  'He has said the word "sir" eleven times in one sentence. None of them landed.',
  'He is typing hard enough that you can hear which key is the return key.',
  'He has asked whether anyone else is in the house with you. You have said the dog is.',
  'He has begun a sentence about his mother and elected not to finish it.',
  'A colleague has laughed. He has told the colleague what he will do about it.',
  'He has told you the call is being terminated. The call has not been terminated.',
  'He has apologised. It was not to you, and it was not sincere, but it was audible.',
  'He is counting to ten in a language you were not supposed to hear him use.',
]; 

/**
 * What he lets slip when he loses it.
 *
 * Escalating, and each one is a PERMANENT addition to the roster. This is the fix for a
 * mechanic a player described as "I've gotten the temper to trigger 4x. does that boost
 * anything?" — it granted +1 Note and a burst, both invisible against payouts of 6+. Now
 * each boil-over puts a named person or a fact on a board you keep, which makes rage the
 * thing you actively farm, and builds the org chart Phase 2 is made of.
 *
 * The register stays administrative. The funniest thing a furious man on a scam floor
 * discloses is not a threat, it is paperwork.
 */
export interface SlipDef {
  /** What appears on the roster. */
  entry: string;
  /** The transcript line. */
  line: string;
  /** Roles map onto the real org chart: dialer, closer, manager, IT, owner. */
  role: 'dialer' | 'closer' | 'verifier' | 'manager' | 'it' | 'trainer' | 'owner';
  /**
   * Whether this slip is about somebody who answered an advertisement.
   *
   * Was computed as `slipIndex % 3 === 1`, which is meaningless once the draw order is random
   * and was never honest even before: it marked whichever slip happened to land in that
   * position rather than the ones actually about a recruited person. Twist 2 reads this field,
   * so it has to be true of the slip, not of its index.
   */
  falseAd?: boolean;
}

export const SLIPS: SlipDef[] = [
  // --- Names and people. The roster's backbone: a person you can put on an org chart.
  { entry: 'A first name — "Brandon"', role: 'dialer', falseAd: true,
    line: 'He has told you his name is Brandon. It is the third name he has used today.' },
  { entry: 'A real first name — "Vikram"', role: 'dialer', falseAd: true,
    line: 'Someone has called him by a name that is not the one he gave you. He does not correct them.' },
  { entry: 'A supervisor — "Sir Andrew"', role: 'manager',
    line: 'He is shouting for someone called Sir Andrew. Sir Andrew does not come.' },
  { entry: 'A colleague — "Ravi, the one with the headset"', role: 'closer',
    line: 'He has told a colleague to shut up. He used the colleague\'s name.' },
  { entry: 'A surname, on a lanyard', role: 'dialer',
    line: 'He has read his own lanyard aloud to prove he is from the bank. It is not the bank.' },
  { entry: 'The floor manager — "he counts the closes"', role: 'manager',
    line: 'He has explained that someone walks the floor counting. He lowered his voice to explain it.' },
  { entry: 'A trainer — takes the new ones for a week', role: 'manager',
    line: 'He has complained that the new intake is slow. He has said who trains them.' },
  { entry: 'The verifier — takes the card details, sits by the window', role: 'verifier',
    line: 'He has passed you to someone whose only job is to read the numbers back.' },
  { entry: 'A second verifier — only works nights', role: 'verifier',
    line: 'He has said the usual one has gone home. He has said who covers.' },
  { entry: 'The IT man — comes in on Tuesdays', role: 'it',
    line: 'He says the person who fixes this only comes in on Tuesdays.' },
  { entry: 'The owner — referred to only as "the boss"', role: 'owner',
    line: 'He has mentioned the boss. He lowered his voice to do it.' },
  { entry: 'The owner drives a white Fortuner', role: 'owner',
    line: 'He has described his employer\'s car. He has described it admiringly.' },
  { entry: 'A brother-in-law works the next desk', role: 'closer', falseAd: true,
    line: 'He has explained that the man beside him is family. He does not seem pleased about it.' },
  { entry: 'Somebody called "Madam" approves refunds', role: 'manager',
    line: 'He has asked someone he calls Madam for permission. He was refused.' },

  // --- Structure. Where they are, when, and how the room is arranged.
  { entry: 'The shift pattern — 09:00 to 18:30', role: 'dialer',
    line: 'He has complained about his hours. You now know his hours.' },
  { entry: 'The night shift starts at 19:00 for the US', role: 'dialer',
    line: 'He has said the others come in when he leaves, and who they call.' },
  { entry: 'The floor — second, above a pharmacy', role: 'dialer',
    line: 'He has told you which floor he is on, and what is downstairs.' },
  { entry: 'The building — a business park, unit 12', role: 'manager',
    line: 'He has described the car park. At length. He is not thinking clearly.' },
  { entry: 'The other floor — a second room, forty seats', role: 'owner',
    line: 'He has let slip that this is not the only room.' },
  { entry: 'The daily quota — 4 closes', role: 'manager',
    line: 'He has told you his quota. He is two behind. It is 4:40.' },
  { entry: 'The quota rose this month', role: 'manager',
    line: 'He has said what the number used to be. He has said what it is now.' },
  { entry: 'Sixty-one seats, forty-four occupied', role: 'manager',
    line: 'He has counted the empty desks at you, as evidence that he is overworked.' },
  { entry: 'The company name on the door — a marketing firm', role: 'owner',
    line: 'He has said what it says on the door downstairs. It does not say what they do.' },
  { entry: 'Fridays are half days', role: 'dialer',
    line: 'He has told you when he will not be here. This was not wise.' },
  { entry: 'The room is above the ceiling of another business', role: 'dialer',
    line: 'He is complaining about noise from below. He has said what is below.' },
  { entry: 'A rota is printed and pinned by the door', role: 'manager',
    line: 'He has told you to hold while he checks who is in. There is a list of who is in.' },
  { entry: 'The air conditioning has been broken since May', role: 'dialer',
    line: 'He has described the temperature of the room he is sitting in. Repeatedly.' },

  // --- Money. The part that becomes evidence.
  { entry: 'Gift cards are accepted "for tax reasons"', role: 'closer',
    line: 'He has explained why the refund must be paid in gift cards. The explanation is long.' },
  { entry: 'A bank name, used for wires', role: 'closer',
    line: 'He has read out where the money goes. He read it twice, slowly, to be helpful.' },
  { entry: 'An account is in a third party\'s name', role: 'closer',
    line: 'He has said the name on the account is not the company\'s. He said it as reassurance.' },
  { entry: 'A wallet address, read out in full', role: 'it',
    line: 'He has read thirty-four characters aloud without pausing. You did not ask him to repeat it.' },
  { entry: 'The courier collects on Thursdays', role: 'manager',
    line: 'He has said when the cash leaves the building. He was complaining about the wait.' },
  { entry: 'A figure — £38,000 last month', role: 'owner',
    line: 'He has told you what the room turns over. He is proud of it.' },
  { entry: 'They buy leads by the thousand', role: 'it',
    line: 'He has complained that the list he was given is old. He has said who sells it.' },
  { entry: 'Refunds are "processed" by moving a decimal point', role: 'verifier',
    line: 'He has described editing a number on a screen and calling it a refund.' },
  { entry: 'A mule is paid ten per cent', role: 'closer',
    line: 'He has said what the man whose account it is takes. He thinks it is too much.' },

  // --- Operations. Software, scripts, the machinery.
  { entry: 'The dialler software — a licence expiring Thursday', role: 'it',
    line: 'He is complaining that the system logged him out again. It does this on Thursdays.' },
  { entry: 'The script is printed and laminated', role: 'trainer',
    line: 'He has read the same sentence to you three times, with the same stress on the same word.' },
  { entry: 'A remote-access tool, named', role: 'it',
    line: 'He has told you what to download. He has spelled it out. Twice.' },
  { entry: 'One password, four systems', role: 'it',
    line: 'He has typed his password aloud while complaining about having to type it.' },
  { entry: 'The screens are recorded for "quality"', role: 'manager',
    line: 'He has warned a colleague that the screens are recorded. You now know the screens are recorded.' },
  { entry: 'Calls route through a US number', role: 'it',
    line: 'He has insisted the number on your phone is local. He has explained how it is done.' },
  { entry: 'The rebuttal sheet has nine objections on it', role: 'trainer',
    line: 'He has worked through the objections in order. You have raised none of them.' },
  { entry: 'A leaderboard, updated by hand', role: 'manager',
    line: 'He has said where his name is on the board. It is not near the top.' },

  // --- The uncomfortable ones. Honest from the start, surfaced at Twist 2.
  { entry: 'He answered an advertisement for a call centre job', role: 'dialer', falseAd: true,
    line: 'He has told you what the advertisement said. It said customer support.' },
  { entry: 'His passport is in a drawer that is not his', role: 'dialer', falseAd: true,
    line: 'He has said he cannot simply leave. He has said why, and then stopped talking.' },
  { entry: 'He is nineteen', role: 'dialer', falseAd: true,
    line: 'He has told you his age, to explain why he is not the manager.' },
  { entry: 'Six years, described as a job', role: 'closer',
    line: 'He says he has been doing this for six years. He says it the way a man describes a job.' },
  { entry: 'Someone was dismissed for refusing a call', role: 'manager', falseAd: true,
    line: 'He has explained what happens to people who will not read the script.' },
  { entry: 'The desk beside him has changed occupant twice this month', role: 'dialer', falseAd: true,
    line: 'He has said nobody stays. He said it as a complaint about training.' },
  { entry: 'He is paid per close, not per hour', role: 'closer',
    line: 'He has explained why he cannot let you go. It is not about you.' },
];

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
export const PHASE1_GATE = 100_000_000;

/**
 * PHASE 1 COMPLETION — three conditions, not one number.
 *
 * It used to be `holdTimeCareer >= PHASE1_GATE` alone, and a player finished in 53 minutes
 * against a 95-minute design because career total is precisely the quantity a snowball
 * inflates fastest. Their words: "the access bar just rose very quickly and it was done."
 *
 * So completion now requires all three tracks to have delivered:
 *   - TIME on the line (career Hold Time) — that you have done the work
 *   - his TRUST (rapport) — you cannot get persistent access from a man who doubts you.
 *     This also gives rapport a purpose above 88, where it previously went inert and the
 *     top 12 points of the bar were decoration.
 *   - what he has LET SLIP (roster entries from boil-overs) — that you know who they are
 *
 * A runaway production spike can satisfy the first on its own. It can do nothing about the
 * other two, which is the point.
 */
export const PHASE1_COMPLETION = {
  careerHoldTime: PHASE1_GATE,
  /** Out of RAPPORT.max. High, deliberately: this is the resource that cannot be bought. */
  rapport: 92,
  /** Distinct things he has let slip. There are 12 available. */
  rosterEntries: 8,
} as const;

/**
 * Fraction of the run-up after which the endgame announces itself.
 *
 * The spike stays — it is the genre's reward — but it should be FORESHADOWED. Crossing this
 * shifts the transcript's register and surfaces the final stretch, so the ending arrives as
 * an event rather than a bar quietly reaching 100%.
 */
export const ENDGAME_THRESHOLD = 0.62;

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
  /**
   * notes = floor(sqrt(THIS CALL's depth / divisor))
   *
   * THIS-RUN basis, not best-ever. The original keyed off `bestCallLifetime`, a running
   * max that never resets, and granted an ABSOLUTE payout each time rather than the
   * difference — so hanging up twice in a row paid twice for the same progress. A
   * playtester found it in about a minute.
   *
   * Two textbook fixes exist. Realm Grinder and Cookie Clicker keep a max/lifetime basis
   * and grant `total_owed - total_already_granted` (Cookie Clicker's stored
   * forfeited-cookies pool). Egg Inc, Clicker Heroes and Antimatter Dimensions instead
   * score THIS RUN only, which self-zeroes with no ratchet field at all.
   *
   * This-run wins here because of cadence: this reset happens ~30 times per phase, and a
   * max basis pays nothing on most of those unless each call beats the last, which is
   * punishing at that frequency. Hammering the button now pays 0 because you have wasted
   * no new time — no cooldown and no penalty needed.
   */
  divisor: 3_000,
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
   * NO minimum payout. A floor on a repeatable reset is always farmable — the previous
   * `minNotes: 1` guaranteed every spam-click minted a page, turning a leak into a tap.
   * The first reset feels rewarding instead because the ELIGIBILITY THRESHOLD is set
   * where the formula already pays well: sqrt(120000/12000) is about 3 pages, so the gate
   * is its own minimum reward.
   */
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
    cost: 2,
    globalMultiplier: 1.5,
  },
  {
    id: 'd.warmup',
    name: 'Pre-Written Confusion',
    effect: 'Begin each call with 10 Genuine Confusion.',
    flavor: 'You have the questions written down in advance now.',
    cost: 3,
    startingGenerators: { confusion: 10 },
  },
  {
    id: 'd.chair',
    name: 'A Better Chair',
    effect: '+25 maximum composure.',
    flavor: 'It was expensive. It was, on reflection, the correct decision.',
    cost: 4,
    composureBonus: 25,
  },
  {
    id: 'd.shorthand',
    name: 'Shorthand',
    effect: 'Notes earned ×1.5.',
    flavor: 'You have stopped writing full sentences. There is not time.',
    cost: 6,
    notesMultiplier: 1.5,
  },
  {
    id: 'd.rehearsed',
    name: 'Rehearsed Helplessness',
    effect: 'Manual stalls ×2.',
    flavor: 'You have practised sounding like this. It comes easily now, which you have chosen not to examine.',
    cost: 8,
    stallMultiplier: 2,
    requires: ['d.script'],
  },
  {
    id: 'd.roster',
    name: 'The Shift Roster',
    effect: 'Opportunity windows arrive twice as often.',
    flavor: 'You know when the floor manager takes his break. It is 3:15.',
    cost: 11,
    eventRateMultiplier: 2,
  },
  {
    id: 'd.routine',
    name: 'The Routine',
    effect: 'Re-buys your cheapest tactic on its own, every few seconds.',
    flavor: 'You no longer decide to do any of this. You have a way of doing it.',
    cost: 12,
    autoBuy: true,
    requires: ['d.rehearsed'],
  },
  {
    id: 'd.deadname',
    name: 'The Name He Uses',
    effect: 'Start every call with 35 rapport. All production ×1.6.',
    flavor: '"Brandon." He has been Brandon for four years. He answers to it before he thinks.',
    cost: 17,
    startingRapport: 35,
    globalMultiplier: 1.6,
    requires: ['d.callback'],
  },
  {
    id: 'd.toolkit',
    name: 'A Prepared Machine',
    effect: 'Begin each call with 15 Incorrect Password and 8 The Cat.',
    flavor: 'The virtual machine is already running. The cat is real.',
    cost: 23,
    startingGenerators: { wrongPassword: 15, catInterrupt: 8 },
    requires: ['d.warmup'],
  },
  {
    id: 'd.filing',
    name: 'A Filing System',
    effect: 'Notes earned ×2.',
    flavor: 'Sixty-one pages. Cross-referenced. You have started using tabs.',
    cost: 33,
    notesMultiplier: 2,
    requires: ['d.shorthand'],
  },
  {
    id: 'd.composure',
    name: 'Professional Detachment',
    effect: '+40 maximum composure. All production ×1.8.',
    flavor: 'It stopped being upsetting somewhere around the fourth call. You have not decided whether that is good.',
    cost: 50,
    composureBonus: 40,
    globalMultiplier: 1.8,
    requires: ['d.chair'],
  },
  {
    id: 'd.operation',
    name: 'The Shape Of It',
    effect: 'All production ×2.5.',
    flavor: 'It is not one man with a phone. You have drawn the org chart on the back of an envelope and it does not fit.',
    cost: 83,
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
