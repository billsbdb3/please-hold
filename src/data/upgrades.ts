/**
 * Phase 1 upgrades — an unlock GRAPH, not a ladder.
 *
 * The research is blunt about linear tiers: if the newest item is always the best
 * item, the player is not making decisions, they are reading a queue. So these are
 * gated on three different currencies — lifetime Hold Time, Rapport (which cannot
 * be bought), and real active time — and several are mutually exclusive branches.
 * The player has to choose what kind of mark they are being.
 *
 * Tone: every description is a flat statement of fact. See docs/DESIGN.md §9.
 * No exclamation marks. Nothing is pleased with itself.
 */

import type { GeneratorId } from '../engine/types';

export interface UpgradeDef {
  id: string;
  name: string;
  /** Plain-language mechanical effect. The player should never guess. */
  effect: string;
  /** The joke. One sentence. Never explains the effect. */
  flavor: string;
  cost: number;

  // --- Gates. All must pass. ---
  /** Lifetime Hold Time required. */
  requiresLifetime?: number;
  /** Rapport required — the gate that cannot be bought. */
  requiresRapport?: number;
  /** Seconds of ACTIVE play required. Rewards sitting with it. */
  requiresActiveTime?: number;
  /** Other upgrade ids that must already be owned (the DAG edges). */
  requires?: string[];
  /** Upgrades this locks out permanently. Mutually exclusive branches. */
  excludes?: string[];

  // --- Effects. All optional; all derived, never accumulated. ---
  globalMultiplier?: number;
  generatorMultipliers?: Partial<Record<GeneratorId, number>>;
  stallFlat?: number;
  stallMultiplier?: number;
  /**
   * Multiplies rapport gain.
   *
   * `u.sympathetic` advertised "Rapport gain ×2" from the day it was written and no such
   * field existed, so half of the game's first real branching choice silently did
   * nothing. Found by a player reading a label against a counter — which is the one class
   * of bug the balance simulator structurally cannot see, since it reads the fields and
   * never the prose.
   */
  rapportMultiplier?: number;
  composureDrainMultiplier?: number;
  /** Sets a one-off capability flag read by the sim. */
  grants?: 'comboUnlock' | 'comboLock' | 'freeStalls' | 'autoStall';
}

export const UPGRADES: UpgradeDef[] = [
  // ---------------------------------------------------------------- early
  {
    id: 'u.notepad',
    name: 'A Notepad',
    effect: 'Manual stalls +2 flat.',
    flavor: 'You write down everything he says. He finds this reassuring.',
    cost: 60,
    stallFlat: 2,
  },
  {
    id: 'u.rhythm',
    name: 'Conversational Rhythm',
    effect: 'Unlocks the combo meter on manual stalls.',
    flavor: 'Uh huh. Uh huh. Okay. Uh huh.',
    cost: 300,
    requiresLifetime: 500,
    grants: 'comboUnlock',
  },
  {
    id: 'u.tea',
    name: 'Making a Cup of Tea',
    effect: 'Composure drain −25%.',
    flavor: 'You have told him you will be right back. You take four minutes.',
    cost: 1_200,
    requiresLifetime: 2_500,
    composureDrainMultiplier: 0.75,
  },
  {
    id: 'u.landline',
    name: 'The Landline',
    effect: 'All production ×1.5.',
    flavor: 'It is attached to the wall. It cannot be moved. He must work around this.',
    cost: 4_000,
    requiresLifetime: 8_000,
    globalMultiplier: 1.5,
  },

  // ------------------------------------------------- the first real branch
  // Sympathetic vs Difficult. Both viable; they scale different things.
  {
    id: 'u.sympathetic',
    name: 'Be Sympathetic',
    effect: 'Rapport gain ×2. Manual stalls ×0.8.',
    flavor: 'You ask whether he has eaten. He pauses before answering.',
    cost: 12_000,
    requiresLifetime: 25_000,
    requiresRapport: 12,
    excludes: ['u.difficult'],
    stallMultiplier: 0.8,
    rapportMultiplier: 2,
  },
  {
    id: 'u.difficult',
    name: 'Be Difficult',
    effect: 'Manual stalls ×1.6. Composure drain +20%.',
    flavor: 'You have asked him to spell his employer. Twice.',
    cost: 6_000,
    requiresLifetime: 9_000,
    requiresRapport: 12,
    excludes: ['u.sympathetic'],
    stallMultiplier: 1.6,
    composureDrainMultiplier: 1.2,
  },

  // ---------------------------------------------------------------- middle
  {
    id: 'u.dialup',
    name: 'Describing Your Internet',
    effect: 'Genuine Confusion and Incorrect Password ×2.',
    flavor: 'You explain that the internet is slower on Thursdays. He accepts this.',
    cost: 60_000,
    requiresLifetime: 120_000,
    generatorMultipliers: { confusion: 2, wrongPassword: 2 },
  },
  {
    id: 'u.holdmusic',
    name: 'Putting Him On Hold',
    effect: 'All production ×1.6. Composure recovers while he holds.',
    flavor: 'He has been on hold for six minutes. You are listening to the same music he is.',
    cost: 250_000,
    requiresLifetime: 20_000_000,
    requiresRapport: 25,
    globalMultiplier: 1.6,
  },
  {
    id: 'u.muscle',
    name: 'Practised Confusion',
    effect: 'The combo meter no longer decays.',
    flavor: 'You have said "which one is the browser" so many times it is now true.',
    cost: 9_000_000,
    requiresLifetime: 40_000_000,
    requires: ['u.rhythm'],
    grants: 'comboLock',
  },
  {
    id: 'u.speaker2',
    name: 'The Cat, Again',
    effect: 'The Cat ×2.5.',
    flavor: 'It is a different cat. He does not know that.',
    cost: 2_200_000,
    requiresLifetime: 55_250_000,
    generatorMultipliers: { catInterrupt: 2.5 },
  },

  // -------------------------------------------------- real-time gated pair
  // These reward having actually sat with the game, not just having numbers.
  {
    id: 'u.patience1',
    name: 'Losing Track of Time',
    effect: 'All production ×3.',
    flavor: 'It has been forty minutes. Neither of you has mentioned this.',
    cost: 7_000_000,
    requiresActiveTime: 40 * 60,
    globalMultiplier: 3,
  },
  {
    id: 'u.patience2',
    name: 'The Shift Change',
    effect: 'All production ×1.8.',
    flavor: 'A different voice has taken over. He has not been briefed. You start again.',
    cost: 900_000,
    requiresActiveTime: 70 * 60,
    requires: ['u.patience1'],
    globalMultiplier: 1.8,
  },

  // ----------------------------------------------------------- late phase 1
  {
    id: 'u.insider',
    name: 'His Extension Number',
    effect: 'Manual stalls cost no composure.',
    flavor: 'He gave it to you so you could ask for him directly. You will.',
    cost: 4_000_000,
    requiresLifetime: 600_000,
    requiresRapport: 55,
    grants: 'freeStalls',
  },
  {
    id: 'u.nephew',
    name: 'Your Nephew Has Questions',
    effect: 'Your Nephew ×2.5. All production ×1.25.',
    flavor: 'He is nine. He has asked what a registry is. The call is now educational.',
    cost: 4_000_000,
    requiresLifetime: 2_000_000,
    generatorMultipliers: { relative: 2.5 },
    globalMultiplier: 1.25,
  },
  {
    id: 'u.recorder',
    name: 'Recording The Call',
    effect: 'All production x1.5. Required for the evidence package.',
    flavor: 'One-party consent. You checked. You checked first.',
    cost: 12_000_000,
    requiresLifetime: 55_250_000,
    requiresRapport: 70,
    globalMultiplier: 1.5,
  },

  // ============================================================================
  // The long tail.
  //
  // The first version of this tree had 16 entries and the simulator showed the
  // economy flatlining at minute 45 with nothing left to buy - the single most
  // common way an incremental dies. These exist so a purchase is always within
  // reach, and they are gated across all three currencies (lifetime, rapport and
  // real active time) so the reach is never in the same direction twice.
  // ============================================================================

  {
    id: 'u.glasses',
    name: 'Finding Your Glasses',
    effect: 'Genuine Confusion x3.',
    flavor: 'They were on your head. You tell him this. He says nothing.',
    cost: 320_000,
    requiresLifetime: 450_000,
    generatorMultipliers: { confusion: 3 },
  },
  {
    id: 'u.hold2',
    name: 'Asking Him To Hold Again',
    effect: 'All production x1.4.',
    flavor: 'He agrees. He has been trained to agree.',
    cost: 500_000,
    requiresLifetime: 700_000,
    requires: ['u.holdmusic'],
    globalMultiplier: 1.4,
  },
  {
    id: 'u.capslock',
    name: 'Caps Lock',
    effect: 'Incorrect Password x3.',
    flavor: 'It was on the whole time. Neither of you thought to check.',
    cost: 1_100_000,
    requiresLifetime: 1_400_000,
    generatorMultipliers: { wrongPassword: 3 },
  },
  {
    id: 'u.doorbell',
    name: 'The Doorbell',
    effect: 'All production x1.5.',
    flavor: 'It is a delivery. It is not for you. You explain this to him at length.',
    cost: 2_600_000,
    requiresLifetime: 3_200_000,
    globalMultiplier: 1.5,
  },
  {
    id: 'u.kettle',
    name: 'The Kettle Again',
    effect: 'Composure drain -20%.',
    flavor: 'He asks if you are still there. You are. You are making tea.',
    cost: 4_800_000,
    requiresLifetime: 6_000_000,
    requires: ['u.tea'],
    composureDrainMultiplier: 0.8,
  },
  {
    id: 'u.wrongbank',
    name: 'The Wrong Bank',
    effect: 'All production x1.6.',
    flavor: 'You have given him details for a bank you have never used. He is verifying them.',
    cost: 2_400_000,
    requiresLifetime: 12_000_000,
    requiresRapport: 40,
    globalMultiplier: 1.6,
  },
  {
    id: 'u.catnap',
    name: 'The Cat Is Asleep On It',
    effect: 'The Cat x3.',
    flavor: 'On the router. You cannot move her. You will not move her.',
    cost: 3_200_000,
    requiresLifetime: 18_000_000,
    requires: ['u.speaker2'],
    generatorMultipliers: { catInterrupt: 3 },
  },
  {
    id: 'u.hardofhearing',
    name: 'Mishearing Him',
    effect: 'Speakerphone x3.',
    flavor: 'Every letter has to be given as a word now. He has started saying "Charlie".',
    cost: 5_000_000,
    requiresLifetime: 28_000_000,
    generatorMultipliers: { speakerphone: 3 },
  },
  {
    id: 'u.ipadlocked',
    name: 'The iPad Is Locked',
    effect: 'The iPad x3.',
    flavor: 'It belongs to a grandchild. The passcode is a birthday. It is not this birthday.',
    cost: 9_000_000,
    requiresLifetime: 55_000_000,
    generatorMultipliers: { secondDevice: 3 },
  },
  {
    id: 'u.speakerloud',
    name: 'Turning It Up',
    effect: 'Manual stalls x1.8.',
    flavor: 'Now the whole room can hear him. Your nephew has opinions.',
    cost: 16_000_000,
    requiresLifetime: 55_250_000,
    stallMultiplier: 1.8,
  },
  {
    id: 'u.composure2',
    name: 'Emotional Callus',
    effect: 'Composure drain -35%.',
    flavor: 'It used to make your hands shake. It does not now.',
    cost: 27_000_000,
    requiresLifetime: 55_250_000,
    requires: ['u.kettle'],
    composureDrainMultiplier: 0.65,
  },

  {
    id: 'u.patience3',
    name: 'The Second Shift Change',
    effect: 'All production x2.',
    flavor: 'The first voice is back. He does not remember you. You remind him.',
    cost: 22_000_000,
    requiresActiveTime: 100 * 60,
    requires: ['u.patience2'],
    globalMultiplier: 2,
  },
  {
    id: 'u.rhythm2',
    name: 'Perfect Rhythm',
    effect: 'Manual stalls x2.2.',
    flavor: 'Uh huh. Right. Okay. And then? Uh huh.',
    cost: 31_000_000,
    requiresLifetime: 55_250_000,
    requires: ['u.muscle'],
    stallMultiplier: 2.2,
  },

  {
    id: 'u.supervisor',
    name: 'Asking For His Supervisor',
    effect: 'All production x2.2.',
    flavor: 'The supervisor is also called Brandon. You note this down.',
    cost: 38_000_000,
    requiresLifetime: 55_250_000,
    requiresRapport: 80,
    globalMultiplier: 2.2,
  },

  {
    id: 'u.extension',
    name: 'The Extension List',
    effect: 'All production x2.5.',
    flavor: 'Two hundred and six numbers. You have started dialling them in order.',
    cost: 52_000_000,
    requiresLifetime: 55_250_000,
    requiresRapport: 88,
    requires: ['u.supervisor'],
    globalMultiplier: 2.5,
  },
];

// Upgrades for the Phase 2 reserved tiers (Call Waiting, Her Laptop Too, Thirty Years
// Of Statements) were removed alongside them; see PHASE2_RESERVED_GENERATORS.

export const UPGRADES_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);

/**
 * Whether an upgrade is currently offered. Bought and excluded upgrades are
 * filtered out by the caller; this answers "have the gates opened".
 */
export function isAvailable(
  u: UpgradeDef,
  opts: { lifetime: number; rapport: number; activeTime: number; owned: Set<string> },
): boolean {
  if (opts.owned.has(u.id)) return false;
  // A locked-out branch: if anything we exclude is already owned, we are gone.
  if (u.excludes?.some((id) => opts.owned.has(id))) return false;
  if (u.requires?.some((id) => !opts.owned.has(id))) return false;
  if (u.requiresLifetime && opts.lifetime < u.requiresLifetime) return false;
  if (u.requiresRapport && opts.rapport < u.requiresRapport) return false;
  if (u.requiresActiveTime && opts.activeTime < u.requiresActiveTime) return false;
  return true;
}
