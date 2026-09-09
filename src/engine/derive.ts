/**
 * Derivation: facts -> conclusions. PURE.
 *
 * This function is the reason bug #1 cannot come back. Multipliers are computed
 * from scratch here on every tick, from the persisted fact set alone. There is no
 * accumulation, no `*=` against a stored value, and nothing to re-apply on load.
 * Run it twice and you get the same answer; that is the whole point.
 *
 * It is also pure so the headless balance simulator can call it directly. The old
 * build's simulators each reimplemented the multiplier chain by hand and drifted
 * from the game they were supposed to be measuring.
 */

import type { Persisted, Derived, GeneratorId, ComposureBand } from './types';
import {
  GENERATORS, GENERATOR_BY_ID, SOFT_CAP_EXPONENT, CASCADE_CAP,
  STALL, COMPOSURE, PHASE1_MILESTONES,
} from '../data/balance';
import { UPGRADES_BY_ID } from '../data/upgrades';

/** Cost of the next unit: baseCost · growth^owned. */
export function costOf(id: GeneratorId, owned: number): number {
  const def = GENERATOR_BY_ID[id];
  return def.baseCost * Math.pow(def.growth, owned);
}

/**
 * Cost of buying `n` more, closed form (geometric series).
 * baseCost · growth^owned · (growth^n − 1)/(growth − 1)
 * Used by the bulk-buy controls; looping would be O(n) for no reason.
 */
export function costOfN(id: GeneratorId, owned: number, n: number): number {
  const def = GENERATOR_BY_ID[id];
  if (n <= 0) return 0;
  const r = def.growth;
  return def.baseCost * Math.pow(r, owned) * (Math.pow(r, n) - 1) / (r - 1);
}

/**
 * How many can be afforded with `budget`, closed form.
 * floor( log_r( budget·(r−1) / (baseCost·r^owned) + 1 ) )
 */
export function maxAffordable(id: GeneratorId, owned: number, budget: number): number {
  const def = GENERATOR_BY_ID[id];
  const r = def.growth;
  const first = def.baseCost * Math.pow(r, owned);
  if (budget < first) return 0;
  const n = Math.log(budget * (r - 1) / first + 1) / Math.log(r);
  return Math.max(0, Math.floor(n));
}

/**
 * Effective unit count after the softcap. Below the threshold this is identity;
 * above it, the excess is raised to SOFT_CAP_EXPONENT (<1) so returns diminish
 * smoothly instead of stopping dead. A hard cap makes players feel punished for
 * buying; a soft one makes them feel the next tier is more interesting.
 */
export function effectiveOwned(owned: number, softCapAt: number): number {
  if (owned <= softCapAt) return owned;
  return softCapAt + Math.pow(owned - softCapAt, SOFT_CAP_EXPONENT);
}

/** Which composure band we are in. Bands are ordered high -> low. */
export function bandFor(composure: number): ComposureBand {
  for (const b of COMPOSURE.bands) {
    if (composure >= b.min) return b as unknown as ComposureBand;
  }
  return COMPOSURE.bands[COMPOSURE.bands.length - 1] as unknown as ComposureBand;
}

export function derive(p: Persisted): Derived {
  const fired = new Set(p.milestones);

  // --- Global multiplier: recomputed from the bought-id set, every time. ---
  let globalMultiplier = 1;
  for (const id of p.upgrades) {
    const u = UPGRADES_BY_ID[id];
    if (u?.globalMultiplier) globalMultiplier *= u.globalMultiplier;
  }
  // Milestones contribute their multipliers the same way — from the fired set.
  for (const m of PHASE1_MILESTONES) {
    if (fired.has(m.id) && m.multiplier !== 1) globalMultiplier *= m.multiplier;
  }

  // --- Per-generator multipliers from upgrades ---
  const generatorMultiplier = {} as Record<GeneratorId, number>;
  for (const g of GENERATORS) generatorMultiplier[g.id] = 1;
  for (const id of p.upgrades) {
    const u = UPGRADES_BY_ID[id];
    if (!u?.generatorMultipliers) continue;
    for (const [gid, mult] of Object.entries(u.generatorMultipliers)) {
      generatorMultiplier[gid as GeneratorId] *= mult;
    }
  }

  // --- Cascade: each tier boosts every tier below it. ---
  // Computed as a per-target bonus so it stays legible in tooltips.
  const cascade = {} as Record<GeneratorId, number>;
  for (let i = 0; i < GENERATORS.length; i++) {
    const target = GENERATORS[i];
    let bonus = 1;
    for (let j = i + 1; j < GENERATORS.length; j++) {
      const higher = GENERATORS[j];
      const owned = p.generators[higher.id] ?? 0;
      bonus += owned * higher.cascadeBoost;
    }
    cascade[target.id] = Math.min(bonus, CASCADE_CAP);
  }

  // --- Per-generator output and total ---
  const perGenerator = {} as Record<GeneratorId, number>;
  const nextCost = {} as Record<GeneratorId, number>;
  let hps = 0;
  for (const g of GENERATORS) {
    const owned = p.generators[g.id] ?? 0;
    nextCost[g.id] = costOf(g.id, owned);
    const eff = effectiveOwned(owned, g.softCapAt);
    const out =
      g.baseProduction * eff * generatorMultiplier[g.id] * cascade[g.id] * globalMultiplier;
    perGenerator[g.id] = out;
    hps += out;
  }

  // --- Composure band and its tradeoffs ---
  const band = bandFor(p.composure);

  // --- Manual stall value ---
  // Scales with passive rate so clicking never becomes irrelevant, and with the
  // composure band so running hot is a real (costly) strategy.
  let stallBase = STALL.baseValue + hps * STALL.hpsScale;
  for (const id of p.upgrades) {
    const u = UPGRADES_BY_ID[id];
    if (u?.stallFlat) stallBase += u.stallFlat;
    if (u?.stallMultiplier) stallBase *= u.stallMultiplier;
  }
  const stallValue = stallBase * p.combo * band.stallMultiplier;

  // --- Composure drain ---
  let composureDrain = 0;
  if (p.activeElapsed > COMPOSURE.drainStartsAt) {
    const minutesOver = (p.activeElapsed - COMPOSURE.drainStartsAt) / 60;
    composureDrain = COMPOSURE.baseDrain + minutesOver * COMPOSURE.fatigueDrainPerMinute;
    for (const id of p.upgrades) {
      const u = UPGRADES_BY_ID[id];
      if (u?.composureDrainMultiplier) composureDrain *= u.composureDrainMultiplier;
    }
    composureDrain = Math.min(composureDrain, COMPOSURE.maxDrain);
  }

  return {
    hps,
    perGenerator,
    globalMultiplier,
    generatorMultiplier,
    stallValue,
    composureDrain,
    band,
    nextCost,
  };
}

/** Whether a generator tier should be visible at all yet. */
export function isUnlocked(p: Persisted, id: GeneratorId): boolean {
  return p.holdTimeLifetime >= GENERATOR_BY_ID[id].unlocksAt;
}

/** True when the player has bought the upgrade. */
export function has(p: Persisted, id: string): boolean {
  return p.upgrades.includes(id);
}
