/**
 * Phase 2 balance simulation.
 *
 * Same discipline as Phase 1's: import the real data, call the real tick, and include an
 * adversarial archetype. Phase 1 taught this the hard way — its polite-only policies measured
 * 95 minutes for a phase a determined player finished in 53, because no policy ever tried the
 * dominant strategy. So `reckless` is here from day one.
 *
 * The interesting question for an allocation phase is not "how fast can you click" but "does
 * the heat/attention tension have a stable answer". A policy that pins every stream at maximum
 * should get burned repeatedly and do WORSE than one that manages heat — if it does not, the
 * threat is decorative.
 */

import type { GameState, IntelKind } from '../src/engine/types';
import { freshState } from '../src/engine/state';
import { PHASE1_COMPLETION } from '../src/data/balance';
import { freshTransient } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { tick } from '../src/engine/sim';
import {
  enterPhase2, assignAttention, clearAttention, unlockStream,
  buyAttention, buyTradecraft, availableTradecraft, corroborateNext, deriveP2,
} from '../src/engine/phase2';
import { DT } from '../src/engine/loop';
import {
  STREAMS, HEAT, PHASE2_TARGET_MINUTES, INTEL_KINDS, COVERAGE, PHASE2_MILESTONES,
  TRADECRAFT_BY_ID,
} from '../src/data/phase2';
import { fmt } from '../src/engine/numbers';

export type P2Archetype = 'reckless' | 'optimal' | 'active' | 'casual';

interface P2Policy {
  /** Heat fraction above which the player backs off. 1 = never backs off. */
  heatCeiling: number;
  /** Seconds between reconsidering the allocation. */
  reviewEverySeconds: number;
  /** Fraction of wall-clock the player is present. */
  attentionFraction: number;
  /** Spend on tradecraft/streams/attention this eagerly (0..1 of available intel). */
  spendAggression: number;
}

const POLICIES: Record<P2Archetype, P2Policy> = {
  // Pins everything wide open and never backs off. Should get burned constantly.
  reckless: { heatCeiling: 1, reviewEverySeconds: 5, attentionFraction: 1, spendAggression: 1 },
  optimal: { heatCeiling: 0.55, reviewEverySeconds: 5, attentionFraction: 1, spendAggression: 1 },
  active: { heatCeiling: 0.6, reviewEverySeconds: 15, attentionFraction: 1, spendAggression: 0.85 },
  casual: { heatCeiling: 0.7, reviewEverySeconds: 45, attentionFraction: 0.6, spendAggression: 0.6 },
};

export interface P2Result {
  archetype: P2Archetype;
  completed: boolean;
  minutes: number;
  burns: number;
  corroborated: number;
  streams: number;
  tradecraft: number;
  attentionPool: number;
  coverage: Record<IntelKind, number>;
  /** Which requirement finished last — the one setting the phase's length. */
  binding: string;
  peakHeat: number;
  /**
   * Minutes during which overall coverage read exactly zero.
   *
   * The metric that was missing. Coverage is a MINIMUM over five requirements, so a single
   * kind with no available source pins the headline at 0% however well the rest is going -
   * and money's only real source was a 22,000 unlock, so it did. Every run reported
   * 'binding: money' and I read that as a balance detail; what it actually meant was that a
   * player could bank three kinds for half an hour and be told he had achieved nothing.
   */
  minutesAtZero: number;
  /** Minutes before the first coverage requirement produced anything at all, per kind. */
  firstProgressAt: Record<IntelKind, number>;
}

const MAX_MINUTES = 600;

/**
 * A Phase 1 save at the point of transition, so Phase 2 starts from a realistic position
 * rather than a blank slate: it needs the roster, which is what Phase 1's boil-overs built.
 */
function stateAtTransition(): GameState {
  const p = freshState();
  p.phase = 1;
  /**
   * EIGHT, not twelve. Phase 1's gate (PHASE1_COMPLETION.rosterEntries) requires 8, so 8 is
   * what a player can legitimately arrive with - and seeding 12 here is exactly what hid a
   * soft-lock: Phase 2 needs 12 corroborated, so an 8-entry arrival could never exceed 8/12
   * coverage and the phase was permanently uncompletable. The development shortcut padded to
   * 12 and the test helper built 12, so nothing contradicted the assumption.
   *
   * Simulating the WORST legal arrival is the only way this stays fixed: the remaining four
   * must be found on the cameras.
   */
  for (let i = 0; i < PHASE1_COMPLETION.rosterEntries; i++) {
    p.roster.push({
      id: `slip.${i}`,
      handle: `entry ${i}`,
      realName: null,
      role: 'dialer',
      recruitedByFalseAd: i % 3 === 1,
      freed: false,
    });
  }
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };
  enterPhase2(s);
  return s;
}

export function runPhase2(archetype: P2Archetype, verbose = false): P2Result {
  const policy = POLICIES[archetype];
  const s = stateAtTransition();
  const p = s.p;

  let ms = 0;
  let sinceReview = 0;
  let peakHeat = 0;
  let minutesAtZero = 0;
  const firstProgressAt: Record<string, number> = {};
  let completed = false;
  let minutes = Infinity;
  const metAt: Record<string, number> = {};

  const maxTicks = (MAX_MINUTES * 60) / DT;
  for (let i = 0; i < maxTicks; i++) {
    ms += DT * 1000;
    const present = pseudoPresent(i, policy.attentionFraction);
    s.t.idle = !present;

    tick(s, DT);
    peakHeat = Math.max(peakHeat, p.heat);

    sinceReview += DT;
    if (present && sinceReview >= policy.reviewEverySeconds) {
      sinceReview = 0;
      spend(s, policy);
      reallocate(s, policy);
    }

    // Record when each requirement is first satisfied.
    const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);

    // How long the player is shown a flat zero, and when each kind first moves.
    if (d.progress <= 0) minutesAtZero += DT / 60;
    for (const k of INTEL_KINDS) {
      if (p.intelByKind[k] > 0 && firstProgressAt[k] === undefined) firstProgressAt[k] = ms / 60000;
    }
    for (const k of INTEL_KINDS) {
      if (d.coverage[k] >= 1 && metAt[k] === undefined) metAt[k] = ms / 60000;
    }
    if (d.identifiedFraction >= 1 && metAt.corroborated === undefined) metAt.corroborated = ms / 60000;

    if (!completed && d.progress >= 1) {
      completed = true;
      minutes = ms / 60000;
      if (verbose) console.log(`  completed at ${minutes.toFixed(1)}m, burns=${p.burns}`);
      break;
    }
  }

  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  const entries = Object.entries(metAt);
  return {
    archetype,
    completed,
    minutes,
    burns: p.burns,
    corroborated: p.corroborated.length,
    streams: p.streams.length,
    tradecraft: p.tradecraft.length,
    attentionPool: d.pool,
    coverage: d.coverage,
    binding: entries.length === 5 ? entries.sort((a, b) => b[1] - a[1])[0][0] : 'incomplete',
    peakHeat,
    minutesAtZero,
    firstProgressAt: firstProgressAt as Record<IntelKind, number>,
  };
}

/** Deterministic presence, same approach as the Phase 1 simulator. */
function pseudoPresent(i: number, fraction: number): boolean {
  if (fraction >= 1) return true;
  const block = Math.floor(i / (120 / DT));
  const h = Math.sin(block * 12.9898) * 43758.5453;
  return h - Math.floor(h) < fraction;
}

/**
 * Buying policy: unlock streams first (they are the only way to reach a missing intel kind),
 * then tradecraft, then attention. That order matters — attention is worthless if you have
 * nowhere useful to point it.
 */
function spend(s: GameState, policy: P2Policy): void {
  const p = s.p;
  const budget = () => p.intel * policy.spendAggression;

  for (const st of STREAMS) {
    if (p.streams.includes(st.id)) continue;
    if (budget() >= st.unlockCost) unlockStream(s, st.id);
  }
  for (const t of availableTradecraft(s)) {
    if (budget() >= t.cost) buyTradecraft(s, t.id);
  }
  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  if (d.nextAttentionCost !== null && budget() >= d.nextAttentionCost) buyAttention(s);

  // Identify people whenever affordable: it is a hard coverage requirement, so deferring it
  // only moves the bottleneck later.
  for (let guard = 0; guard < 5; guard++) {
    if (!corroborateNext(s)) break;
  }
}

/**
 * Allocation policy.
 *
 * Points attention at whichever intel kind is furthest from its requirement, which is the
 * rational play given coverage is a minimum. Backs off entirely when heat crosses the
 * policy's ceiling — except `reckless`, which never does, and should therefore burn.
 */
function reallocate(s: GameState, policy: P2Policy): void {
  const p = s.p;
  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);

  clearAttention(s);

  /**
   * Heat budget: how much generation the decay can absorb indefinitely.
   *
   * This is the model correction that mattered. The first version simply dropped to two
   * attention on the coldest stream whenever heat crossed a ceiling, which is not a strategy
   * any player would use - and modelling careful play that badly made RECKLESSNESS measure
   * fastest (140 min against 288) and hid whether the mechanic worked at all.
   *
   * A real player finds a sustainable allocation and holds it, spending a little over budget
   * when a kind is badly behind. `heatCeiling` now scales how far over budget the archetype is
   * willing to run rather than acting as a panic switch.
   */
  const decayBudget = HEAT.decayPerSecond * decayMultiplierOf(p);
  const overdraft = policy.heatCeiling >= 1 ? Infinity : 1 + policy.heatCeiling;
  const heatAllowance = decayBudget * overdraft;

  // Kinds furthest from their requirement first: coverage is a minimum, so the weakest kind
  // is the only one that actually matters.
  const need = INTEL_KINDS.map((k) => ({ k, gap: 1 - d.coverage[k] })).sort((a, b) => b.gap - a.gap);

  let attentionLeft = d.pool;
  let heatUsed = 0;

  for (const { k, gap } of need) {
    if (attentionLeft <= 0) break;
    if (gap <= 0) continue;

    // Best value per unit of heat for this kind, which is what a heat budget makes the right
    // comparison - not raw yield.
    const candidates = STREAMS.filter(
      (st) => p.streams.includes(st.id) && !(s.t.burnedUntil[st.id] ?? 0) && st.yields[k],
    ).sort((a, b) => b.yields[k]! / b.heatPerAttention - a.yields[k]! / a.heatPerAttention);

    for (const st of candidates) {
      const room = st.maxAttention - (p.attention[st.id] ?? 0);
      for (let n = 0; n < room && attentionLeft > 0; n++) {
        if (heatUsed + st.heatPerAttention > heatAllowance) break;
        if (!assignAttention(s, st.id, 1)) break;
        heatUsed += st.heatPerAttention;
        attentionLeft--;
      }
    }
  }
}

/** Decay multiplier from tradecraft, mirroring the engine's own calculation. */
function decayMultiplierOf(p: GameState['p']): number {
  let mult = 1;
  for (const id of p.tradecraft) {
    const t = TRADECRAFT_BY_ID[id];
    if (t?.decayMultiplier) mult *= t.decayMultiplier;
  }
  return mult;
}

// ------------------------------------------------------------------------- CLI

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  console.log('\nPLEASE HOLD — Phase 2 (THE MAP) balance simulation');
  console.log(`Target for "active": ${PHASE2_TARGET_MINUTES.min}–${PHASE2_TARGET_MINUTES.max} min`);
  console.log(
    `Coverage needs: ${INTEL_KINDS.map((k) => `${k} ${fmt(COVERAGE.need[k])}`).join(' · ')} · ` +
    `${COVERAGE.corroborated} corroborated\n`,
  );

  const results = (['reckless', 'optimal', 'active', 'casual'] as P2Archetype[]).map((a) => {
    if (verbose) console.log(`--- ${a} ---`);
    return runPhase2(a, verbose);
  });

  console.log('| Archetype | Done | Binding | Burns | Peak heat | Streams | Tradecraft | Attention | Corroborated | 0% for | money from |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(
      `| ${r.archetype} | ${r.completed ? `${r.minutes.toFixed(0)} min` : 'never'} | ${r.binding} | ` +
      `${r.burns} | ${r.peakHeat.toFixed(0)} | ${r.streams}/${STREAMS.length} | ` +
      `${r.tradecraft}/8 | ${r.attentionPool} | ${r.corroborated}/${COVERAGE.corroborated} | `
      + `${r.minutesAtZero.toFixed(0)}m | ${(r.firstProgressAt.money ?? -1).toFixed(1)}m |`,
    );
  }

  const active = results.find((r) => r.archetype === 'active');
  if (active) {
    const ok =
      active.completed &&
      active.minutes >= PHASE2_TARGET_MINUTES.min &&
      active.minutes <= PHASE2_TARGET_MINUTES.max;
    console.log(
      `\nactive archetype: ${active.minutes.toFixed(1)} min — ` +
      (ok ? 'IN WINDOW' : 'OUT OF WINDOW (the regression test will fail)'),
    );
  }

  const reckless = results.find((r) => r.archetype === 'reckless');
  const optimal = results.find((r) => r.archetype === 'optimal');
  if (reckless && optimal) {
    console.log(
      reckless.burns > optimal.burns
        ? `heat is a real constraint: reckless burned ${reckless.burns}x vs optimal ${optimal.burns}x`
        : `WARNING: reckless burned ${reckless.burns}x vs optimal ${optimal.burns}x — heat may be decorative`,
    );
  }

  if (verbose) {
    console.log('\nMilestones (fractions of coverage):');
    for (const m of PHASE2_MILESTONES) console.log(`  ${m.at.toFixed(2)}  ${m.title}`);
  }
  console.log('');
}

if (!process.env.VITEST) main();
