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
import type { DossierDef } from '../data/balance';
import {
  GENERATORS, GENERATOR_BY_ID, SOFT_CAP_EXPONENT, CASCADE_CAP,
  STALL, COMPOSURE, PHASE1_MILESTONES, DOSSIER_BY_ID, REDIAL,
  PERSONA_BY_ID, PERSONAS, RAGE,
} from '../data/balance';
import { UPGRADES_BY_ID } from '../data/upgrades';

/** Composure band boundaries scale with the dossier's max, so bands stay proportional. */
function bandThreshold(min: number, max: number): number {
  return (min / COMPOSURE.max) * max;
}

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

/**
 * Which composure band we are in. Bands are ordered high -> low.
 *
 * Thresholds are proportional to the player's CURRENT maximum, not absolute. The
 * dossier can raise max composure to 165, and with absolute thresholds "Breaking"
 * would then be unreachable — the tradeoff bands would quietly stop existing for
 * anyone who had invested in them, which is the opposite of the intent.
 */
export function bandFor(composure: number, max: number = COMPOSURE.max): ComposureBand {
  for (const b of COMPOSURE.bands) {
    if (composure >= bandThreshold(b.min, max)) return b as unknown as ComposureBand;
  }
  return COMPOSURE.bands[COMPOSURE.bands.length - 1] as unknown as ComposureBand;
}

export function derive(p: Persisted): Derived {
  const fired = new Set(p.milestones);

  // --- Permanent dossier effects. Bought with Notes; survive every redial. ---
  let dossierMultiplier = 1;
  let dossierStallMultiplier = 1;
  let notesMultiplier = 1;
  for (const id of p.dossier) {
    const dd = DOSSIER_BY_ID[id];
    if (!dd) continue;
    if (dd.globalMultiplier) dossierMultiplier *= dd.globalMultiplier;
    if (dd.stallMultiplier) dossierStallMultiplier *= dd.stallMultiplier;
    if (dd.notesMultiplier) notesMultiplier *= dd.notesMultiplier;
  }

  // --- Global multiplier: recomputed from the bought-id set, every time. ---
  let globalMultiplier = dossierMultiplier;
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

  // --- The voice currently being done ---
  // Fall back rather than throw: a save can name a persona this build does not have.
  const persona = PERSONA_BY_ID[p.persona] ?? PERSONAS[0];

  // --- Composure band and its tradeoffs ---
  const band = bandFor(p.composure, maxComposure(p));

  // --- Manual stall value ---
  // Scales with passive rate so clicking never becomes irrelevant, and with the
  // composure band so running hot is a real (costly) strategy.
  let stallBase = STALL.baseValue + hps * STALL.hpsScale;
  for (const id of p.upgrades) {
    const u = UPGRADES_BY_ID[id];
    if (u?.stallFlat) stallBase += u.stallFlat;
    if (u?.stallMultiplier) stallBase *= u.stallMultiplier;
  }
  stallBase *= dossierStallMultiplier * persona.stallMultiplier;
  const stallValue = stallBase * p.combo * band.stallMultiplier;

  // --- Rapport multiplier ---
  let rapportMultiplier = persona.rapportMultiplier;
  for (const id of p.upgrades) {
    const u = UPGRADES_BY_ID[id];
    if (u?.rapportMultiplier) rapportMultiplier *= u.rapportMultiplier;
  }

  // --- Composure drain ---
  let composureDrain = 0;
  if (p.activeElapsed > COMPOSURE.drainStartsAt) {
    const minutesOver = (p.activeElapsed - COMPOSURE.drainStartsAt) / 60;
    composureDrain = COMPOSURE.baseDrain + minutesOver * COMPOSURE.fatigueDrainPerMinute;
    for (const id of p.upgrades) {
      const u = UPGRADES_BY_ID[id];
      if (u?.composureDrainMultiplier) composureDrain *= u.composureDrainMultiplier;
    }
    composureDrain *= persona.drainMultiplier;
    composureDrain = Math.min(composureDrain, COMPOSURE.maxDrain);
  }
  // An enraged scammer is an abusive one, so provoking him costs you something. This sits
  // OUTSIDE the maxDrain clamp deliberately: rage is a choice, and its cost should be
  // felt rather than absorbed by a ceiling tuned for ordinary fatigue.
  composureDrain += (p.rage / RAGE.max) * RAGE.drainAtMaxRage;

  return {
    hps,
    perGenerator,
    globalMultiplier,
    generatorMultiplier,
    stallValue,
    rapportMultiplier,
    ragePerStall: RAGE.perStall * persona.rageMultiplier,
    persona,
    composureDrain,
    band,
    nextCost,
    notesOnRedial: notesFor(p, notesMultiplier),
    dossierMultiplier,
  };
}

/**
 * Notes banked by redialling now — a CUMULATIVE grant.
 *
 * `total owed = floor(sqrt(CAREER time wasted / divisor) × dossier bonus)`, and a redial pays
 * `total owed − already granted`. This is Cookie Clicker's bookkeeping exactly: a root of a
 * LIFETIME figure, granted cumulatively, so
 *
 * Career total rather than deepest-call, deliberately. Keying on best-call depth measured
 * catastrophically: an idle player's single multi-hour call earned 1.04M Notes while an
 * active player redialling often earned 152, because frequent redials keep any one call
 * shallow. That inverts the whole incentive — it pays you for NOT playing. Career total
 * rises with play regardless of how you slice it into calls, so
 *
 *   - a repeat redial with no new depth pays exactly 0, by construction;
 *   - the only way to earn is to push a call DEEPER than any before it;
 *   - no cooldown, floor or anti-spam guard is required anywhere.
 *
 * The square root still does its usual job of compressing an unbounded currency into a
 * spendable one: four times the career for twice the pages.
 *
 * The dossier's Notes multiplier applies to the INCREMENT, never the running total, so
 * buying it cannot retroactively re-pay everything you have already banked.
 */
export function notesFor(p: Persisted, notesMultiplier = 1): number {
  // Career total: every second wasted across every call, which never resets.
  const career = p.holdTimeCareer;
  if (Math.max(p.bestCallLifetime, p.holdTimeLifetime) < REDIAL.minLifetimeToRedial) return 0;
  if (notesMultiplier === 1) {
    // Resolve the dossier's own Notes bonus when the caller has not passed it in.
    for (const id of p.dossier) {
      const dd = DOSSIER_BY_ID[id];
      if (dd?.notesMultiplier) notesMultiplier *= dd.notesMultiplier;
    }
  }
  // The ratchet tracks UNMULTIPLIED progress, and the dossier's Notes bonus applies only to
  // the INCREMENT. Multiplying the cumulative total instead pays a retroactive lump on all
  // past progress the moment the bonus is bought - measured as a casual player earning
  // 76,000 Notes against an active player's 152, purely from owning a x2.
  const baseOwed = Math.floor(Math.sqrt(career / REDIAL.divisor));
  const newGround = Math.max(0, baseOwed - p.redialNotesGranted);
  return Math.floor(newGround * notesMultiplier);
}

/** Max composure including permanent dossier bonuses. */
export function maxComposure(p: Persisted): number {
  let max: number = COMPOSURE.max;
  for (const id of p.dossier) {
    const dd = DOSSIER_BY_ID[id];
    if (dd?.composureBonus) max += dd.composureBonus;
  }
  return max;
}

/** Whether a dossier upgrade can be bought right now. */
export function dossierAvailable(p: Persisted, d: DossierDef): boolean {
  if (p.dossier.includes(d.id)) return false;
  if (d.requires?.some((id) => !p.dossier.includes(id))) return false;
  return true;
}

/**
 * Whether a generator tier is known yet.
 *
 * Keyed on the CAREER total, not this call's. Discovery is permanent: a redial wipes
 * what you own, never what you have learned exists. Gating this on per-call progress
 * made the top three tiers unreachable the moment redialling started, because no
 * single call ever climbed that high again.
 */
export function isUnlocked(p: Persisted, id: GeneratorId): boolean {
  return p.holdTimeCareer >= GENERATOR_BY_ID[id].unlocksAt;
}

/** True when the player has bought the upgrade. */
export function has(p: Persisted, id: string): boolean {
  return p.upgrades.includes(id);
}
