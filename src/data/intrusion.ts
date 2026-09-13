/**
 * PHASE 2 — THE INTRUSION.
 *
 * WHY THIS REPLACES THE STREAMS
 * -----------------------------
 * Phase 2 was six surveillance streams and a pool of attention to spread across them. Four
 * separate tuning passes failed to make it interesting, and a playtester's verdict never moved:
 * too slow, not enough to do. The fourth failure is the evidence — when a mechanic resists four
 * honest attempts at balance, the balance is not the problem.
 *
 * The problem was the VERB. Allocation is a passive verb: you point attention at something and
 * numbers accrue. Everything I added afterwards — fatigue, looking closer, the chain, more events —
 * was activity bolted onto a passive core, which is why each one helped only marginally.
 *
 * What this is actually about, in the player's words: "with scammer payback, we are looking through
 * files, gaining access to servers, revealing webcams on laptops, etc". None of that is
 * allocation. It is a sequence of ACTS on specific machines, each with a concrete result.
 *
 * SO: MACHINES AND ACTIONS.
 *
 * You are on their network. You have a foothold on one machine. Every action is a deliberate act
 * against a named box with a named outcome — you open a folder and there is a spreadsheet; you turn
 * on a webcam and there is a face; you escalate and there is another machine behind this one. Heat
 * rises per ACTION rather than per second, so risk is a decision you make each time rather than a
 * tax on existing.
 *
 * WHAT THIS KEEPS. Coverage stays a minimum over four intel kinds plus corroboration, because that
 * gate works and it is what makes the phase about breadth. The roster bridge from Phase 1 stays.
 * Tradecraft stays. The camera wall stays — it is what the recorder's screens LOOK like, which is a
 * better reason for it to exist than being one stream among six.
 */

import type { IntelKind } from '../engine/types';

/** What you can be on a machine. Each level opens different actions. */
export type Access = 'none' | 'user' | 'admin';

export type ActionId =
  | 'files'
  | 'screen'
  | 'webcam'
  | 'database'
  | 'escalate'
  | 'sweep';

export interface ActionDef {
  id: ActionId;
  /** Imperative, as a button. */
  label: string;
  /** What it does, said plainly. */
  blurb: string;
  /** Access needed on the machine. */
  needs: Access;
  /** Seconds before this action may be repeated on the SAME machine. */
  cooldown: number;
  /** Heat added, before the machine's own exposure. */
  heat: number;
}

/**
 * The six things you can do.
 *
 * Deliberately few and deliberately different. Six actions across a dozen machines is seventy-odd
 * distinct things to try, where six streams was six sliders — and each of these produces a
 * different KIND of result, which is what the old board of lines never managed.
 */
export const ACTIONS: ActionDef[] = [
  {
    id: 'files',
    label: 'Open the files',
    blurb: 'Whatever is on the desktop and in the folders somebody has not tidied.',
    needs: 'user',
    cooldown: 9,
    heat: 1.5,
  },
  {
    id: 'screen',
    label: 'Watch the screen',
    blurb: 'What is in front of them right now, while they are using it.',
    needs: 'user',
    cooldown: 7,
    heat: 2.5,
  },
  {
    id: 'webcam',
    label: 'Turn the camera on',
    blurb: 'The light comes on when you do this. Some of them notice.',
    needs: 'user',
    cooldown: 22,
    heat: 7,
  },
  {
    id: 'database',
    label: 'Copy the records',
    blurb: 'Bulk. Slow, loud, and worth more than anything else on the machine.',
    needs: 'admin',
    cooldown: 26,
    heat: 9,
  },
  {
    id: 'escalate',
    label: 'Take administrator',
    blurb: 'Their password is on four systems. This is how you reach the next machine.',
    needs: 'user',
    cooldown: 30,
    heat: 6,
  },
  {
    id: 'sweep',
    label: 'Look around quietly',
    blurb: 'Nothing in particular. Cheap, safe, and occasionally something.',
    needs: 'user',
    cooldown: 4,
    heat: 0.4,
  },
];

export const ACTION_BY_ID: Record<ActionId, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a]),
) as Record<ActionId, ActionDef>;

export interface MachineDef {
  id: string;
  /** Hostname, as it appears on their network. */
  host: string;
  /** Whose it is, in plain words. */
  who: string;
  /** One dry line about the machine. */
  note: string;
  /** What this box is worth per action, by kind. Absent kinds yield nothing here. */
  yields: Partial<Record<IntelKind, number>>;
  /** Multiplies every action's heat. A manager's laptop is watched; a store-room PC is not. */
  exposure: number;
  /** Machines this one reveals when you take administrator on it. */
  reveals: string[];
  /** True if somebody is sitting at it — a webcam here is a face, and a risk. */
  occupied: boolean;
  /** Cost in intel to establish a foothold, once revealed. 0 for the starting machine. */
  footholdCost: number;
}

/**
 * Their network.
 *
 * A chain rather than a list: you start on one badly-secured desktop and every machine you take
 * administrator on names two or three more. That is the growth curve — not a number rising, but a
 * map filling in, which is the thing an intrusion actually feels like.
 */
export const MACHINES: MachineDef[] = [
  {
    id: 'm.pod3',
    host: 'DESKTOP-4471QK',
    who: 'a dialler, pod 3',
    note: 'The machine you came in on. The password was on a sticky note in shot.',
    yields: { people: 1.0, structure: 0.6 },
    exposure: 0.8,
    reveals: ['m.pod7', 'm.fileserver'],
    occupied: true,
    footholdCost: 0,
  },
  {
    id: 'm.pod7',
    host: 'DESKTOP-4471RB',
    who: 'a dialler, pod 7',
    note: 'Identical to the last one, including the password.',
    yields: { people: 1.2, structure: 0.7, evidence: 0.4 },
    exposure: 0.8,
    reveals: ['m.trainer', 'm.nvr'],
    occupied: true,
    footholdCost: 260,
  },
  {
    id: 'm.fileserver',
    host: 'SRV-FILE01',
    who: 'the shared drive',
    note: 'One folder is called IMPORTANT DO NOT DELETE (2).',
    yields: { structure: 2.2, evidence: 1.4 },
    exposure: 0.5,
    reveals: ['m.payroll', 'm.crm'],
    occupied: false,
    footholdCost: 900,
  },
  {
    id: 'm.trainer',
    host: 'DESKTOP-TRAIN2',
    who: 'the trainer',
    note: 'The script is on the desktop. So are four earlier versions of the script.',
    yields: { structure: 1.8, people: 1.4 },
    exposure: 0.9,
    reveals: ['m.floor'],
    occupied: true,
    footholdCost: 1_400,
  },
  {
    id: 'm.nvr',
    host: 'NVR-CAM-01',
    who: 'the camera recorder',
    note: 'Fourteen channels. The default password was never changed, which is how this works.',
    yields: { people: 2.0, structure: 1.0 },
    exposure: 0.4,
    reveals: ['m.floor'],
    occupied: false,
    footholdCost: 1_900,
  },
  {
    id: 'm.crm',
    host: 'SRV-DIAL01',
    who: 'the dialler server',
    note: 'Lead lists, a rebuttal tree, and a leaderboard nobody wants to be bottom of.',
    yields: { structure: 2.4, money: 1.2, people: 1.0 },
    exposure: 0.9,
    reveals: ['m.verifier'],
    occupied: false,
    footholdCost: 3_200,
  },
  {
    id: 'm.floor',
    host: 'LAPTOP-FLOOR',
    who: 'the floor manager',
    note: 'He walks the floor with it. It is never locked, because he is never away from it.',
    yields: { people: 2.2, structure: 2.0, evidence: 1.2 },
    exposure: 1.4,
    reveals: ['m.payroll', 'm.owner'],
    occupied: true,
    footholdCost: 5_000,
  },
  {
    id: 'm.verifier',
    host: 'DESKTOP-VER01',
    who: 'the verifier, by the window',
    note: 'Card numbers are read aloud at this desk, then typed here.',
    yields: { evidence: 3.0, money: 2.0 },
    exposure: 1.2,
    reveals: ['m.payroll'],
    occupied: true,
    footholdCost: 7_500,
  },
  {
    id: 'm.payroll',
    host: 'SRV-ACCT01',
    who: 'the accounts machine',
    note: 'A spreadsheet somebody keeps very neatly. A tab named MULES.',
    yields: { money: 3.6, evidence: 1.8 },
    exposure: 1.1,
    reveals: ['m.owner'],
    occupied: false,
    footholdCost: 12_000,
  },
  {
    id: 'm.owner',
    host: 'LAPTOP-AS',
    who: 'the man they call the boss',
    note: 'Not on any rota. Signed in from a hotel twice this month.',
    yields: { money: 3.0, evidence: 3.4, people: 2.0, structure: 1.6 },
    exposure: 1.8,
    reveals: [],
    occupied: true,
    footholdCost: 22_000,
  },
];

export const MACHINE_BY_ID: Record<string, MachineDef> = Object.fromEntries(
  MACHINES.map((m) => [m.id, m]),
);

/** The machine you arrive on. */
export const ENTRY_MACHINE = 'm.pod3';

export const INTRUSION = {
  /**
   * Multiplier on an action's yield, by how much access you have.
   *
   * Escalating is worth doing for its own sake, not only to reach the next machine.
   */
  accessMultiplier: { none: 0, user: 1, admin: 1.7 } as Record<Access, number>,
  /**
   * A webcam on an OCCUPIED machine is how you turn up a face — a new roster entry, which is what
   * corroboration consumes. It is also the single most likely thing to get you noticed.
   */
  webcamFaceChance: 0.55,
  webcamOccupiedHeat: 2.2,
  /**
   * Per-second income from a machine, per point of what it holds.
   *
   * This is now the phase's whole growth curve: more machines and more administrator means a higher
   * rate, and the player can point at the reason. The attention pool used to do this job, which is
   * why the two systems felt disconnected - the thing being acted on was not the thing paying.
   */
  ratePerSecond: 1.35,
  /**
   * An action's haul, in SECONDS of that machine's own production.
   *
   * Denominated this way so an action is always worth taking and never a windfall - the same
   * guardrail the soundboard and the camera events use. It also answers 'what will the actions do
   * besides raise suspicion' honestly: a burst of what that box is worth, plus whatever it turns up.
   */
  actionSeconds: 15,
  /** A sweep sometimes turns up nothing at all. */
  sweepDudChance: 0.35,

  /**
   * Seconds of holding a machine before it quietly reveals one of its neighbours.
   *
   * IDLE HAS TO STAY VIABLE. Without this, discovery came only from escalating, so a player who
   * never acted was stuck on one box for ever and the simulator's `neglectful` archetype could not
   * finish at all - the active layer had become mandatory rather than rewarded. Now simply being on
   * a machine eventually shows you what is next to it; escalating does it at once and pays more
   * besides. Slow enough that acting is clearly better, generous enough that absence is not a wall.
   */
  passiveRevealSeconds: 150,

  /**
   * What being noticed costs, now that it costs something real.
   *
   * Heat had NO consequence after the streams stopped mattering: `burnAStream` darkened a stream
   * nothing depended on, so every archetype recorded zero burns and reckless play beat careful play
   * by twenty-six minutes. A burn now takes the most exposed machine you hold offline and strips
   * administrator from it - they notice, and they reimage the box. Escalating again is the way back.
   */
  burnSecondsBase: 55,
  burnSecondsPerPrevious: 22,
  /*
   * Capped low enough that recklessness is SLOW rather than impossible. At 240 a player who was
   * noticed a thousand times could never finish at all, and an unwinnable state is worse design
   * than a punishing one - the player should be able to see they are losing and change.
   */
  burnSecondsMax: 120,
};
