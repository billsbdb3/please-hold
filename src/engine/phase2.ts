/**
 * PHASE 2 simulation — allocation, heat, coverage.
 *
 * Pure of DOM and of wall-clock, like the Phase 1 core, so the headless balance simulator
 * exercises exactly the code the browser runs. That property is what made the Phase 1
 * adversarial archetype able to find a 53-minute route through a 95-minute design, and it is
 * worth preserving.
 *
 * The phase's shape, and why:
 *
 *   Attention is finite and the streams together can absorb far more than you have. Heat
 *   rises from WHAT YOU WATCH rather than from the clock, so the threat is a consequence of
 *   your own choices; the counter — moving attention somewhere safer — is instant and free,
 *   which keeps it tense rather than unwinnable (research 07 §7).
 *
 *   Coverage is the MINIMUM of four independent intel kinds, not a sum. Phase 1 gated on one
 *   accumulator and a production spike walked straight through it; a minimum cannot be
 *   carried by a single runaway stream.
 */

import type { GameState, StreamId, IntelKind } from './types';
import {
  STREAMS, STREAM_BY_ID, ATTENTION, HEAT, COVERAGE, IDENTIFY,
  TRADECRAFT, TRADECRAFT_BY_ID, INTEL_KINDS, PHASE2_MILESTONES,
} from '../data/phase2';
import { pushLog } from './log';

// ------------------------------------------------------------------ derivation

export interface Phase2Derived {
  /** Total attention available. */
  pool: number;
  /** Yield multiplier from current heat, 1 down to (1 - yieldPenaltyAtMax). */
  heatYieldMultiplier: number;
  /** Attention currently assigned. */
  assigned: number;
  /** Intel per second, by kind, after every multiplier. */
  intelRate: Record<IntelKind, number>;
  /** Total intel per second, for the headline figure. */
  totalRate: number;
  /** Net heat per second: generation minus decay. Negative means cooling. */
  heatRate: number;
  /** Coverage per kind, 0..1, and the overall minimum. */
  coverage: Record<IntelKind, number>;
  /** Fraction of roster entries identified, 0..1. */
  identifiedFraction: number;
  /** Overall progress: the WORST of the five requirements. */
  progress: number;
  /** Cost of the next attention point, or null at the cap. */
  nextAttentionCost: number | null;
  /** Cost of identifying the next person. */
  identifyCost: number;
  /** Streams currently dark because they were burned. */
  burned: StreamId[];
}

function multipliers(p: GameState['p']) {
  let yieldMult = 1;
  let heatMult = 1;
  let decayMult = 1;
  let attentionBonus = 0;
  let identifyDiscount = 0;
  for (const id of p.tradecraft) {
    const t = TRADECRAFT_BY_ID[id];
    if (!t) continue;
    if (t.yieldMultiplier) yieldMult *= t.yieldMultiplier;
    if (t.heatMultiplier) heatMult *= t.heatMultiplier;
    if (t.decayMultiplier) decayMult *= t.decayMultiplier;
    if (t.attentionBonus) attentionBonus += t.attentionBonus;
    if (t.identifyDiscount) identifyDiscount = 1 - (1 - identifyDiscount) * (1 - t.identifyDiscount);
  }
  return { yieldMult, heatMult, decayMult, attentionBonus, identifyDiscount };
}

/** Attention pool: base, plus purchased points, plus tradecraft bonuses. */
export function attentionPool(p: GameState['p']): number {
  const { attentionBonus } = multipliers(p);
  return Math.min(ATTENTION.max, ATTENTION.base + p.attentionBought + attentionBonus);
}

export function deriveP2(p: GameState['p'], burnedUntil: Partial<Record<StreamId, number>>): Phase2Derived {
  const m = multipliers(p);
  const pool = attentionPool(p);

  // A suspicious floor is a careful floor: high heat suppresses what you can learn. This is
  // what makes moderate heat optimal rather than maximum heat.
  const heatYieldMultiplier = 1 - (p.heat / HEAT.max) * HEAT.yieldPenaltyAtMax;

  const intelRate = { people: 0, structure: 0, money: 0, evidence: 0 } as Record<IntelKind, number>;
  let heatGen = 0;
  let assigned = 0;
  const burned: StreamId[] = [];

  for (const s of STREAMS) {
    if (!p.streams.includes(s.id)) continue;
    const dark = (burnedUntil[s.id] ?? 0) > 0;
    if (dark) burned.push(s.id);

    // Attention beyond a stream's ceiling is wasted, and still counts against the pool —
    // over-committing is a real mistake the player can make and see.
    const a = Math.min(p.attention[s.id] ?? 0, s.maxAttention);
    assigned += p.attention[s.id] ?? 0;
    if (dark || a <= 0) continue;

    for (const kind of INTEL_KINDS) {
      const y = s.yields[kind];
      if (y) intelRate[kind] += y * a * m.yieldMult * heatYieldMultiplier;
    }
    heatGen += s.heatPerAttention * a * m.heatMult;
  }

  const coverage = {} as Record<IntelKind, number>;
  for (const kind of INTEL_KINDS) {
    coverage[kind] = Math.min(1, p.intelByKind[kind] / COVERAGE.need[kind]);
  }
  const identifiedFraction = Math.min(1, p.identified.length / COVERAGE.identified);

  return {
    pool,
    heatYieldMultiplier,
    assigned,
    intelRate,
    totalRate: INTEL_KINDS.reduce((sum, k) => sum + intelRate[k], 0),
    heatRate: heatGen - HEAT.decayPerSecond * m.decayMult,
    coverage,
    identifiedFraction,
    // The worst requirement, so nothing can be carried by a single stream.
    progress: Math.min(identifiedFraction, ...INTEL_KINDS.map((k) => coverage[k])),
    nextAttentionCost:
      ATTENTION.base + p.attentionBought >= ATTENTION.max
        ? null
        : Math.floor(ATTENTION.costBase * Math.pow(ATTENTION.costGrowth, p.attentionBought)),
    identifyCost: Math.floor(
      IDENTIFY.costBase * Math.pow(IDENTIFY.costGrowth, p.identified.length) * (1 - m.identifyDiscount),
    ),
    burned,
  };
}

// ------------------------------------------------------------------------ tick

export function tickPhase2(s: GameState, dt: number): void {
  const p = s.p;
  p.phase2Elapsed += dt;

  // Burned streams come back on their own.
  for (const id of Object.keys(s.t.burnedUntil) as StreamId[]) {
    const left = (s.t.burnedUntil[id] ?? 0) - dt;
    if (left <= 0) {
      delete s.t.burnedUntil[id];
      pushLog(s, `${STREAM_BY_ID[id].name} is back. Nobody mentioned it.`, 'intel');
    } else {
      s.t.burnedUntil[id] = left;
    }
  }

  const d = deriveP2(p, s.t.burnedUntil);
  s.t.p2 = d;

  // Intel accrues by kind; the plain `intel` total is what you spend.
  for (const kind of INTEL_KINDS) {
    const gained = d.intelRate[kind] * dt;
    p.intelByKind[kind] += gained;
    p.intel += gained;
    p.intelLifetime += gained;
  }

  // Heat.
  p.heat = Math.max(0, Math.min(HEAT.max, p.heat + d.heatRate * dt));
  if (p.heat >= HEAT.burnAt) burnAStream(s);

  checkPhase2Milestones(s);
}

/**
 * They notice, and shut down whatever you were looking at hardest.
 *
 * Burning the stream you had MOST attention on is the deliberate design: it takes away the
 * thing you were relying on, which forces a genuine reallocation rather than a shrug. It
 * costs no intel and no progress — the setback is time and inconvenience, because punishment
 * that destroys progress makes people stop playing (research 01, anti-patterns).
 */
function burnAStream(s: GameState): void {
  const p = s.p;
  const live = STREAMS.filter((x) => p.streams.includes(x.id) && !(s.t.burnedUntil[x.id] ?? 0));
  if (live.length === 0) {
    p.heat = HEAT.afterBurn;
    return;
  }
  const target = live.reduce((worst, x) =>
    (p.attention[x.id] ?? 0) > (p.attention[worst.id] ?? 0) ? x : worst,
  );

  // Escalating: the more often they have caught you, the longer they look.
  const dark = Math.min(
    HEAT.burnSecondsMax,
    HEAT.burnSeconds * (1 + p.burns * HEAT.burnEscalation),
  );
  s.t.burnedUntil[target.id] = dark;
  p.attention[target.id] = 0;
  p.heat = HEAT.afterBurn;
  p.burns++;
  pushLog(
    s,
    `Somebody has noticed. ${target.name} is dark for ${Math.round(dark)} seconds. ` +
    'A password has been changed, unhelpfully well.',
    'threat',
  );
}

function checkPhase2Milestones(s: GameState): void {
  const p = s.p;
  const progress = s.t.p2?.progress ?? 0;
  for (const m of PHASE2_MILESTONES) {
    if (p.milestones.includes(m.id)) continue;
    if (progress < m.at) continue;
    p.milestones.push(m.id);
    pushLog(s, m.line, 'beat');
    if (m.beat && !p.beatsSeen.includes(m.beat)) {
      s.t.activeBeat = m.beat;
      p.beatsSeen.push(m.beat);
    }
  }
  if (progress >= 1 && p.phase === 2) s.t.phaseGateReached = true;
}

// --------------------------------------------------------------- player actions

/** Move attention onto a stream. Refuses past the pool or the stream's ceiling. */
export function assignAttention(s: GameState, id: StreamId, delta: number): boolean {
  const p = s.p;
  if (!p.streams.includes(id)) return false;
  const def = STREAM_BY_ID[id];
  const current = p.attention[id] ?? 0;
  const next = current + delta;
  if (next < 0) return false;
  if (next > def.maxAttention) return false;

  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  if (delta > 0 && d.assigned + delta > d.pool) return false;

  p.attention[id] = next;
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

/** Clear all attention — the panic button, and the answer to rising heat. */
export function clearAttention(s: GameState): void {
  for (const st of STREAMS) s.p.attention[st.id] = 0;
  s.t.p2 = deriveP2(s.p, s.t.burnedUntil);
}

export function unlockStream(s: GameState, id: StreamId): boolean {
  const p = s.p;
  if (p.streams.includes(id)) return false;
  const def = STREAM_BY_ID[id];
  if (p.intel < def.unlockCost) return false;
  p.intel -= def.unlockCost;
  p.streams.push(id);
  pushLog(s, def.flavor, 'intel');
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

export function buyAttention(s: GameState): boolean {
  const p = s.p;
  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  if (d.nextAttentionCost === null || p.intel < d.nextAttentionCost) return false;
  p.intel -= d.nextAttentionCost;
  p.attentionBought++;
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

export function buyTradecraft(s: GameState, id: string): boolean {
  const p = s.p;
  const t = TRADECRAFT_BY_ID[id];
  if (!t || p.tradecraft.includes(id)) return false;
  if (t.requires?.some((r) => !p.tradecraft.includes(r))) return false;
  if (p.intel < t.cost) return false;
  p.intel -= t.cost;
  p.tradecraft.push(id);
  pushLog(s, t.flavor, 'intel');
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

export function availableTradecraft(s: GameState) {
  return TRADECRAFT.filter(
    (t) =>
      !s.p.tradecraft.includes(t.id) &&
      !t.requires?.some((r) => !s.p.tradecraft.includes(r)),
  );
}

/**
 * Put a real name to someone on the roster.
 *
 * This is where Phase 1's boil-overs pay off: the roster was built by making him lose his
 * temper, and now each entry is a person to be identified. Coverage requires ten, so the
 * work done in Phase 1 is load-bearing here rather than decorative.
 */
export function identifyNext(s: GameState): boolean {
  const p = s.p;
  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  const target = p.roster.find((r) => !p.identified.includes(r.id));
  if (!target) return false;
  if (p.intel < d.identifyCost) return false;

  p.intel -= d.identifyCost;
  p.identified.push(target.id);
  // Spend from the kinds that identification draws on, so it competes with coverage.
  for (const kind of IDENTIFY.kinds) {
    p.intelByKind[kind] = Math.max(0, p.intelByKind[kind] - d.identifyCost / IDENTIFY.kinds.length);
  }
  pushLog(s, `${target.handle} — identified.`, 'intel');
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

// ------------------------------------------------------------------- transition

/**
 * Enter Phase 2.
 *
 * Phase 1's state is kept, not discarded — the roster especially, which is the bridge — but
 * its VERB is gone. Hold Time stops being generated and the stalling economy is over, which
 * is the mechanic-replacement the design is built on rather than a layering-on of more.
 */
export function enterPhase2(s: GameState): void {
  const p = s.p;
  if (p.phase !== 1) return;
  p.phase = 2;
  p.heat = 0;
  p.intel = 0;
  s.t.phaseGateReached = false;
  s.t.burnedUntil = {};
  for (const st of STREAMS) p.attention[st.id] = 0;
  // You arrive with the cameras. Everything else is bought.
  if (!p.streams.includes('cctv')) p.streams.push('cctv');
  p.attention.cctv = Math.min(2, attentionPool(p));
  s.t.p2 = deriveP2(p, s.t.burnedUntil);

  pushLog(s, 'You are no longer on the phone. You are in the building, in the way that matters.', 'beat');
  pushLog(s, 'Fourteen cameras. Nobody has noticed the fifteenth viewer.', 'intel');
}

export { COVERAGE, HEAT, STREAMS, INTEL_KINDS };
