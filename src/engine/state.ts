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
 * save.ts. Version 2 is the first version of the Payback overhaul; version 1 was
 * the vanilla v7 build, whose saves are deliberately discarded.
 */
export const CURRENT_VERSION = 2;

export const GENERATOR_IDS: GeneratorId[] = [
  'confusion',
  'wrongPassword',
  'catInterrupt',
  'speakerphone',
  'secondDevice',
  'relative',
];

export function freshState(): Persisted {
  const generators = {} as Record<GeneratorId, number>;
  for (const id of GENERATOR_IDS) generators[id] = 0;

  return {
    version: CURRENT_VERSION,
    phase: 1,

    holdTime: 0,
    holdTimeLifetime: 0,
    intel: 0,
    intelLifetime: 0,
    evidence: 0,
    evidenceLifetime: 0,

    rapport: 0,
    coverage: 0,
    credibility: 0,

    // You start composed. It does not last.
    composure: 100,
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

    roster: [],
    beatsSeen: [],
  };
}
