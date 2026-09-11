/**
 * Game state types.
 *
 * THE LOAD-BEARING RULE OF THIS FILE
 * ---------------------------------
 * The old build's worst bug (audit #1, `state.js:133-160` + `main.js:33`) was that
 * it persisted DERIVED values — the accumulated upgrade multipliers — and then also
 * re-applied every upgrade's `*=` effect on load. Every reload doubled all twelve
 * numeric upgrades. Three Time Blurs became ×64, and a long-lived save eventually
 * reached Infinity and then NaN.
 *
 * The fix is not a patch, it is a rule:
 *
 *      PERSISTED STATE CONTAINS ONLY FACTS.
 *      EVERY MULTIPLIER IS DERIVED FROM THOSE FACTS, EVERY TICK.
 *
 * A fact is something the player did: how many of a thing they own, which upgrade
 * ids they bought, how many seconds have elapsed. Facts are idempotent under
 * reload. A multiplier is a conclusion drawn from facts, and is never stored.
 *
 * `Persisted` below is exactly the fact set. `Derived` is recomputed and is
 * deliberately not part of the save envelope. If you find yourself wanting to add
 * a multiplier to `Persisted`, you are about to reintroduce bug #1.
 */

import type { PersonaDef } from '../data/balance';

/**
 * Phase 2 surveillance streams.
 *
 * The verb changes from STALL to ALLOCATE. Clicking is RETIRED — Phase 1's entire skill is
 * taken away, per the Paperclips model (docs/DESIGN.md §3). Instead you have a finite pool
 * of attention and more places to point it than you can cover, so every second is a choice
 * about what you are willing to stop watching.
 */
export type StreamId =
  | 'cctv'        // The camera bank. Cheap, slow, and where the people are.
  | 'recordings'  // The call archive. Names and scripts.
  | 'switchboard' // The PBX. Who calls whom, and when.
  | 'crm'         // The dialler console. Lead lists and quotas.
  | 'whatsapp'    // The group chats. Where they say the incriminating parts.
  | 'ledger';     // The shared spreadsheet and the mule accounts. The money.

/**
 * What a stream yields. Coverage requires ALL FOUR, so no single stream can finish the
 * phase — the allocation problem is the phase.
 */
export type IntelKind =
  | 'people'    // Who works there.
  | 'structure' // Who reports to whom, shifts, the floor.
  | 'money'     // Where it goes.
  | 'evidence'; // What would stand up: recordings, confessions, chains of custody.

export type PhaseId = 1 | 2 | 3;

/** Ids are string literals so a typo is a compile error rather than a dead upgrade. */
export type GeneratorId =
  // Phase 1 — stalling tactics. Each wastes the scammer's time passively.
  | 'confusion'      // "I'm not sure which window you mean."
  | 'wrongPassword'  // Typing it incorrectly, sincerely.
  | 'catInterrupt'   // The cat is on the desk now.
  | 'speakerphone'   // Muffled. They ask you to repeat everything.
  | 'secondDevice'   // "Should I use the iPad instead?"
  | 'relative'       // Putting your nephew on. He also has questions.
  | 'otherLine'      // A second call is coming in. It is also him.
  | 'neighbour'      // She has come round. Her problem is unrelated.
  | 'filingCabinet'; // Account numbers from 1987, read aloud, in full.

export type UpgradeId = string;
/** Dossier upgrades are bought with Notes and survive a redial. */
export type DossierId = string;

/**
 * FACTS ONLY. This is the shape that gets serialised.
 * Adding a field here means writing a migration (see save.ts).
 */
export interface Persisted {
  /** Save schema version. Bump on any breaking shape change. */
  version: number;

  phase: PhaseId;

  // --- Primary currencies. Plain numbers until Phase 3 needs break_infinity. ---
  /** Phase 1 primary: seconds of the scammer's time wasted. */
  holdTime: number;
  /** Total for THIS CALL. Reset by a redial. Drives tier unlocks and upgrade gates. */
  holdTimeLifetime: number;
  /**
   * Career total across every call. NEVER reset. Drives narrative milestones and the
   * phase gate — progress through the story is not undone by hanging up.
   */
  holdTimeCareer: number;

  /** Phase 2 primary. */
  intel: number;
  intelLifetime: number;

  // --- Phase 2: allocation ---
  /**
   * Attention assigned to each stream. The sum may not exceed the attention POOL, which is
   * what makes this a decision rather than a shopping list.
   */
  attention: Record<StreamId, number>;
  /** Streams unlocked so far. CCTV is free; the rest are bought with Intel. */
  streams: StreamId[];
  /** Intel banked per kind. Coverage needs all four, so one stream cannot finish the phase. */
  intelByKind: Record<IntelKind, number>;
  /** Roster ids whose real name has been resolved, which is what Coverage counts. */
  corroborated: string[];
  /** Phase 2 upgrade ids ("tradecraft"). */
  tradecraft: string[];
  /** Attention points bought with Intel, on top of the base pool. */
  attentionBought: number;
  /** Seconds spent in Phase 2, for its own pacing. */
  phase2Elapsed: number;
  /** Times they have noticed you and shut a stream down. */
  burns: number;

  /** Phase 3 primary. */
  evidence: number;
  evidenceLifetime: number;

  // --- Meta-resource gates (the Paperclips "Trust" lesson) ---
  /** How much the scammer believes you. Gates access, cannot be bought. */
  rapport: number;
  /** Fraction of the operation mapped, 0..1. Phase 2 gate. */
  coverage: number;
  /** Whether institutions believe you. Phase 3 gate. */
  credibility: number;

  // --- Threat resources ---
  /** 0..100. Drains while in character. At zero, the call ends. */
  composure: number;
  /**
   * How furious he is, 0..100. The offensive counterpart to composure: composure is what
   * you protect, rage is what you inflict. At maximum he loses his temper and something
   * useful slips out.
   */
  rage: number;
  /** Which voice you are currently doing. */
  persona: string;
  /** Total times he has lost his temper. A stat, and a Phase 2 roster feed. */
  boilOvers: number;

  /**
   * Seeded RNG state, advanced in the tick path.
   *
   * Saved rather than global so a career is reproducible: the simulator pins a seed and stays
   * a valid regression gate, and offline catch-up replays exactly what playing would have
   * produced. See src/engine/rng.ts.
   */
  rngState: number;
  /** Remaining indices in the slip shuffle-bag, so no slip repeats before all are seen. */
  slipBag: number[];
  /** Remaining indices in the generic boil-over line bag. */
  boilBag: number[];
  /** Fractional progress toward the next new face on the cameras. */
  faceProgress: number;
  /**
   * Per-stream freshness, 0..1. Watching a stream lowers it; resting restores it.
   *
   * This is the fix for the phase's central fault: with constant yields the optimal allocation
   * converged in about fifteen minutes and the game then asked nothing for two hours. Freshness
   * makes the best allocation drift, so it has to be revisited.
   */
  freshness: Record<StreamId, number>;
  /** Consecutive-catch chain on camera events. Decays with time, never broken by a miss. */
  chain: number;
  /**
   * Camera events claimed.
   *
   * A statistic, and deliberately NOT paired with a count of misses. Cookie Clicker's author
   * removed his missed-cookies counter because it gave players anxiety; the counter was the
   * problem rather than the miss. Phase 1's own event system does count misses, for its
   * end-of-call summary, where a missed opportunity is part of how the call went.
   */
  cameraEventsCaught: number;
  /** Seconds remaining on a hot-lead yield surge. */
  hotLeadFor: number;

  /** Phase 2 threat: their suspicion. */
  heat: number;
  /** Phase 3 threat: the operation is aware and reacting. */
  warning: number;

  // --- Facts about what the player owns ---
  generators: Record<GeneratorId, number>;
  /** Bought upgrade ids. An array, not a Set — Sets do not survive JSON. */
  upgrades: UpgradeId[];
  /** Milestone ids already fired, so they fire exactly once. */
  milestones: string[];

  // --- Redial (the within-phase soft reset) ---
  /**
   * Notes: the prestige currency. Pages of the dossier you are building on this
   * operation. Earned by hanging up and calling back, and never lost.
   *
   * This exists because Phase 1's content supports ~35 minutes of first-call
   * progression against a 90-minute target, and a soft reset is the genre's
   * standard answer to that gap. It is also the one prestige mechanic that needs no
   * narrative justification at all: calling back repeatedly to build a file is
   * *literally what the job is*.
   */
  notes: number;
  notesLifetime: number;
  /** How many times you have hung up and called back. */
  redials: number;
  /** Dossier upgrade ids. Bought with Notes; survive every redial. */
  dossier: DossierId[];
  /** Best lifetime Hold Time reached on any single call, for the Notes formula. */
  bestCallLifetime: number;
  /**
   * Notes already granted BY REDIALS (boil-over pages are not counted here).
   *
   * The ratchet that makes the payout cumulative. Without it the formula paid an absolute
   * amount every time, so hanging up twice in a row paid twice for one call's progress -
   * a player found that in about a minute, and the adversarial simulator archetype then
   * farmed 268,000 Notes across 14,154 redials.
   */
  redialNotesGranted: number;

  // --- Click state ---
  totalStalls: number;
  /** Combo multiplier. A fact (it decays in real time), not a derived value. */
  combo: number;

  // --- Time accounting ---
  /** Seconds of simulation actually run. Authoritative in-game clock. */
  elapsed: number;
  /** Seconds the player was actively interacting. Gates real-time upgrades. */
  activeElapsed: number;
  /** Wall-clock ms of last save. Used to compute offline time on load. */
  lastSeenAt: number;

  // --- Narrative bookkeeping ---
  /**
   * The roster. Accumulates quietly from Phase 1 and is presented as a bare
   * number ("Operators Identified") until Twist 2 reformats it into people.
   * See docs/DESIGN.md §7.
   */
  roster: RosterEntry[];
  /** Ids of narrative beats already shown, so a reload does not replay them. */
  beatsSeen: string[];
}

export interface RosterEntry {
  id: string;
  handle: string;
  realName: string | null;
  role: 'dialer' | 'closer' | 'verifier' | 'manager' | 'it' | 'trainer' | 'owner';
  /**
   * Set on some entries from the very first phase, but not surfaced in the UI
   * until Twist 2. The flag is honest from the start; only the presentation
   * changes. That is what makes the reveal earned rather than a retcon.
   */
  recruitedByFalseAd: boolean;
  freed: boolean;
  /** True when this entry was found on the cameras in Phase 2 rather than said on the call. */
  fromCamera?: boolean;
}

/**
 * DERIVED. Recomputed from `Persisted` every tick. Never serialised.
 * If it can be calculated, it lives here.
 */
export interface Derived {
  /** Hold Time per second, after every multiplier. */
  hps: number;
  /** Per-generator effective output, for the UI's "this is why" tooltips. */
  perGenerator: Record<GeneratorId, number>;
  /** Product of all upgrade multipliers. Recomputed, never accumulated. */
  globalMultiplier: number;
  /** Per-generator multiplier from upgrades + milestones + tier cascade. */
  generatorMultiplier: Record<GeneratorId, number>;
  /** Value of a single manual stall, including combo. */
  stallValue: number;
  /** Multiplier on all rapport gain, from upgrades. */
  rapportMultiplier: number;
  /** Composure drain per second at the current moment, including the rage penalty. */
  composureDrain: number;
  /** Rage gained per manual stall, after the persona multiplier. */
  ragePerStall: number;
  /** The persona currently active, resolved. */
  persona: PersonaDef;
  /** Which composure band the player is in, and its tradeoffs. */
  band: ComposureBand;
  /** Cost of the next unit of each generator. */
  nextCost: Record<GeneratorId, number>;
  /** Notes the player would bank by redialling right now. Drives the decision. */
  notesOnRedial: number;
  /** Permanent multiplier from the dossier, shown so the reset reads as a gain. */
  dossierMultiplier: number;
}

export interface ComposureBand {
  id: 'steady' | 'strained' | 'slipping' | 'breaking';
  label: string;
  /** Low composure RAISES stall value — desperation is productive. */
  stallMultiplier: number;
  /** ...and LOWERS rapport gain. That is the actual tradeoff. */
  rapportMultiplier: number;
}

/** The full runtime state: facts plus this tick's conclusions. */
export interface GameState {
  p: Persisted;
  d: Derived;
  /** Transient, never saved: UI-only signals that die with the session. */
  t: Transient;
}

export interface Transient {
  /** Log lines, newest last. Capped; see log.ts. */
  log: LogLine[];
  /** Set when the player interacts, read by the idle detector. */
  lastInteractionAt: number;
  idle: boolean;
  /** Seconds since the last manual stall, for combo decay. */
  sinceStall: number;
  /** Floating "+N" popups awaiting render. */
  popups: Popup[];
  /** Non-null while a modal narrative beat is on screen. */
  activeBeat: string | null;

  /** ms timestamp of the last registered stall, for the cooldown. */
  lastStallAt: number;
  /** Seconds spent continuously at critical composure. Drives the countdown. */
  criticalFor: number;
  /**
   * Seconds remaining on the "the line went dead" banner, 0 when none.
   *
   * This was a bare boolean that `loseTheCall` set to true and NOTHING ever set back
   * to false — while the Stall button was disabled on it. So the first time composure
   * bottomed out, the game's only verb went permanently dead and a redial did not help,
   * because redial never touched this field either. A countdown cannot get stuck on.
   */
  callEndedFor: number;
  /** Seconds until the breath action can be used again. */
  breathCooldown: number;
  /** Set once the phase-1 gate is met. The player presses to proceed. */
  phaseGateReached: boolean;
  /** Set once the endgame has announced itself, so it announces exactly once. */
  endgameAnnounced: boolean;
  /** Set for one frame on return from idle, so the UI can offer a summary. */
  returnedFromIdle: boolean;
  /** Monotonic id source for log lines and popups. */
  nextId: number;

  // --- Phase 2 ---
  /** Seconds left on each burned stream. Transient: a burn should not survive a reload. */
  burnedUntil: Partial<Record<StreamId, number>>;
  /** Last tick's Phase 2 derivation. Recomputed, never persisted. */
  p2: Phase2DerivedLike | null;
  /**
   * The camera currently showing something, if any.
   *
   * Transient by choice: a lit feed is a live moment, and restoring one from a save would mean
   * a window that had already expired while the tab was shut. Reloading simply means waiting
   * for the next one.
   */
  /**
   * Moments currently live, at most one per stream.
   *
   * Was a single global slot, which is why a six-stream operations console felt empty. Several
   * things happening at once on different streams is what a control room is.
   */
  liveEvents: LiveCameraEvent[];
  /** Seconds until the next camera event may spawn. */
  eventTimer: number;
  /** Per-stream cooldown on looking closer. Transient: a cooldown should not survive a reload. */
  closerCooldown: Partial<Record<StreamId, number>>;
  /** The last resolved event's text, kept briefly for the panel. */
  lastEventNote: string | null;

  // --- Opportunity events ---
  /**
   * The active event, if any. A short window the player can catch for a burst.
   * This is the active-play reward that does not punish idle play: missing one
   * costs nothing, catching one is a bonus.
   */
  event: ActiveEvent | null;
  /** Seconds until the next event window opens. */
  nextEventIn: number;
  /** Seconds remaining on the current production burst, 0 when none. */
  burstFor: number;
  /** Multiplier applied while `burstFor` is running. */
  burstMultiplier: number;
  /** Events caught and missed, for the end-of-call summary. */
  eventsCaught: number;
  eventsMissed: number;
  /** Seconds since the auto-buyer last fired. */
  sinceAutoBuy: number;
}

export interface ActiveEvent {
  id: string;
  /** The prompt shown on the button. Always a flat statement. */
  label: string;
  /** Seconds left to click it. */
  expiresIn: number;
  /** Production multiplier granted on catch. */
  multiplier: number;
  /** Seconds the burst lasts. */
  duration: number;
}

/**
 * Structural mirror of engine/phase2.ts's Phase2Derived. Declared here rather than imported
 * to keep types.ts free of engine imports — the same reason Derived lives here at all.
 */
export interface Phase2DerivedLike {
  pool: number;
  heatYieldMultiplier: number;
  assigned: number;
  intelRate: Record<IntelKind, number>;
  totalRate: number;
  heatRate: number;
  coverage: Record<IntelKind, number>;
  identifiedFraction: number;
  progress: number;
  bindingLabel: string;
  chainMultiplier: number;
  hotLead: boolean;
  nextAttentionCost: number | null;
  corroborateCost: number;
  burned: StreamId[];
}

export interface LogLine {
  id: number;
  text: string;
  kind: 'system' | 'call' | 'intel' | 'threat' | 'beat';
  at: number;
  /** Set when the same line repeats, so it renders as "xN" instead of duplicating. */
  repeat?: number;
}

export interface Popup {
  id: number;
  text: string;
  at: number;
}

/** A camera event currently on screen, waiting to be noticed. */
export interface LiveCameraEvent {
  /**
   * Which stream produced it.
   *
   * Events were camera-only, and a player with one attention point spare for the cameras saw two
   * moments in twenty-two minutes. Any watched stream can produce one now, so this says where to
   * light up and which verb to use.
   */
  stream: StreamId;
  /** Index into that stream's event list. */
  index: number;
  /** Which camera, 0-based, when the stream is the wall. Ignored otherwise. */
  camera: number;
  /** Seconds left to claim it. */
  remaining: number;
  /** Total window, so the UI can draw a depleting bar. */
  window: number;
}
