/**
 * The initial fact set, and the save schema version.
 *
 * `freshState()` is the single definition of "a new game". `save.ts` also uses it
 * as the default-value source when migrating a save that predates a field, so it
 * must always return a complete, valid `Persisted`.
 */

import type { Persisted, GeneratorId } from './types';

/**
 * Bump on any breaking change to `Persisted`, and add the matching migration in
 * save.ts. Version 2 was the first Payback build; version 3 adds the redial soft
 * reset (Notes + dossier) and three more generator tiers. Version 1 was the vanilla
 * v7 build, whose saves are deliberately discarded.
 */
export const CURRENT_VERSION = 6;

export const GENERATOR_IDS: GeneratorId[] = [
  'confusion',
  'wrongPassword',
  'catInterrupt',
  'speakerphone',
  'secondDevice',
  'relative',
  'otherLine',
  'neighbour',
  'filingCabinet',
];

export function freshState(): Persisted {
  const generators = {} as Record<GeneratorId, number>;
  for (const id of GENERATOR_IDS) generators[id] = 0;

  return {
    version: CURRENT_VERSION,
    phase: 1,

    holdTime: 0,
    holdTimeLifetime: 0,
    holdTimeCareer: 0,
    intel: 0,
    intelLifetime: 0,
    attention: { cctv: 0, recordings: 0, switchboard: 0, crm: 0, whatsapp: 0, ledger: 0 },
    streams: [],
    intelByKind: { people: 0, structure: 0, money: 0, evidence: 0 },
    corroborated: [],
    tradecraft: [],
    attentionBought: 0,
    phase2Elapsed: 0,
    burns: 0,
    evidence: 0,
    evidenceLifetime: 0,

    rapport: 0,
    coverage: 0,
    credibility: 0,

    // You start composed. It does not last.
    composure: 100,
    rage: 0,
    // Doris is the voice you start with. She is the most believable and the least
    // infuriating, which is the correct place to begin.
    persona: 'doris',
    boilOvers: 0,
    // A FIXED default seed, so tests and the simulator are deterministic without having to
    // remember to pin one. The store overrides it for a real new career.
    rngState: 0x9e3779b9 | 0,
    slipBag: [],
    boilBag: [],
    faceProgress: 0,

    heat: 0,
    warning: 0,

    generators,
    upgrades: [],
    milestones: [],

    totalStalls: 0,
    combo: 1,

    elapsed: 0,
    activeElapsed: 0,
    lastSeenAt: Date.now(),

    notes: 0,
    notesLifetime: 0,
    redials: 0,
    dossier: [],
    bestCallLifetime: 0,
    redialNotesGranted: 0,

    roster: [],
    beatsSeen: [],
  };
}
