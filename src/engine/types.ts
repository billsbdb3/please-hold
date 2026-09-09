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

export type PhaseId = 1 | 2 | 3;

/** Ids are string literals so a typo is a compile error rather than a dead upgrade. */
export type GeneratorId =
  // Phase 1 — stalling tactics. Each wastes the scammer's time passively.
  | 'confusion'      // "I'm not sure which window you mean."
  | 'wrongPassword'  // Typing it incorrectly, sincerely.
  | 'catInterrupt'   // The cat is on the desk now.
  | 'speakerphone'   // Muffled. They ask you to repeat everything.
  | 'secondDevice'   // "Should I use the iPad instead?"
  | 'relative';      // Putting your nephew on. He also has questions.

export type UpgradeId = string;

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
  /** Lifetime total, never spent. Drives milestone gates. */
  holdTimeLifetime: number;

  /** Phase 2 primary. */
  intel: number;
  intelLifetime: number;

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
  role: 'dialer' | 'closer' | 'verifier' | 'manager' | 'it' | 'owner';
  /**
   * Set on some entries from the very first phase, but not surfaced in the UI
   * until Twist 2. The flag is honest from the start; only the presentation
   * changes. That is what makes the reveal earned rather than a retcon.
   */
  recruitedByFalseAd: boolean;
  freed: boolean;
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
  /** Composure drain per second at the current moment. */
  composureDrain: number;
  /** Which composure band the player is in, and its tradeoffs. */
  band: ComposureBand;
  /** Cost of the next unit of each generator. */
  nextCost: Record<GeneratorId, number>;
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
  /** Set for one frame when the scammer hangs up, so the UI can react. */
  callEnded: boolean;
  /** Set once the phase-1 gate is met. The player presses to proceed. */
  phaseGateReached: boolean;
  /** Set for one frame on return from idle, so the UI can offer a summary. */
  returnedFromIdle: boolean;
  /** Monotonic id source for log lines and popups. */
  nextId: number;
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
