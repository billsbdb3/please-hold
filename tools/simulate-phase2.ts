/**
 * PHASE 2 SIMULATOR — the intrusion.
 *
 * Replaces the attention-allocation simulator wholesale. That one measured a player pointing a
 * finite pool at six passive streams; the phase is now a network of machines you act on, so the old
 * policy would have been measuring a game that no longer exists.
 *
 * The archetypes still exist for the same reason they always did: to answer questions balance
 * intuition cannot. Specifically —
 *
 *   optimal      plays well and prices suspicion
 *   reckless     ignores suspicion entirely; must finish SLOWER than optimal or heat is decorative
 *   active       a real attentive player
 *   casual       present some of the time
 *   neglectful   takes footholds and never acts; must still FINISH, and within a bounded multiple,
 *                or the active layer is not optional and the game has become a job
 *
 * Every one of those properties has failed at least once in this project's history, which is why
 * they are all asserted rather than assumed.
 */

import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { tick } from '../src/engine/sim';
import {
  enterPhase2, deriveP2, corroborateNext, buyTradecraft, availableTradecraft, intrusionRate,
} from '../src/engine/phase2';
import {
  act, accessOf, knownMachines, takeFoothold, viewMachines, heatOf,
} from '../src/engine/intrusion';
import { ACTIONS, MACHINE_BY_ID, type ActionId } from '../src/data/intrusion';
import { COVERAGE, HEAT, PHASE2_TARGET_MINUTES, TRADECRAFT, INTEL_KINDS } from '../src/data/phase2';
import { PHASE1_COMPLETION } from '../src/data/balance';
import { DT } from '../src/engine/loop';
import { nextRandom } from '../src/engine/rng';
import type { GameState, IntelKind } from '../src/engine/types';

export type P2Archetype = 'reckless' | 'optimal' | 'active' | 'casual' | 'neglectful';

interface P2Policy {
  /** Fraction of wall-clock the player is present. */
  presence: number;
  /** Seconds between reconsidering what to do. */
  reviewEverySeconds: number;
  /** Suspicion fraction above which they stop acting and let it cool. 1 = never stops. */
  heatCeiling: number;
  /** Probability of taking an available action when one is ready. 0 = never acts. */
  diligence: number;
  /** Spend this eagerly on footholds and tradecraft (0..1). */
  spend: number;
}

const POLICIES: Record<P2Archetype, P2Policy> = {
  reckless: { presence: 1, reviewEverySeconds: 2, heatCeiling: 1, diligence: 1, spend: 1 },
  optimal: { presence: 1, reviewEverySeconds: 2, heatCeiling: 0.55, diligence: 1, spend: 1 },
  active: { presence: 1, reviewEverySeconds: 6, heatCeiling: 0.6, diligence: 0.8, spend: 0.9 },
  casual: { presence: 0.6, reviewEverySeconds: 25, heatCeiling: 0.7, diligence: 0.5, spend: 0.7 },
  /** Takes ground and never acts on it. The floor the active layer must not punish. */
  neglectful: { presence: 1, reviewEverySeconds: 60, heatCeiling: 0.8, diligence: 0, spend: 0.8 },
};

export interface P2Result {
  archetype: P2Archetype;
  completed: boolean;
  minutes: number;
  /** Which requirement landed last, and therefore set the length. */
  binding: string;
  burns: number;
  peakHeat: number;
  /** Machines footholded, and of those, administrator taken. */
  footholds: number;
  admin: number;
  known: number;
  corroborated: number;
  tradecraft: number;
  /** Actions actually performed. */
  actions: number;
  /** Intel per second at the end — the number the player watches. */
  finalRate: number;
  /** Minutes coverage read a flat zero. */
  minutesAtZero: number;
  metAt: Record<string, number>;
}

const MAX_MINUTES = 600;

/** The state a player legitimately arrives in: Phase 1's gate, not a padded roster. */
function stateAtTransition(): GameState {
  const p = freshState();
  p.phase = 1;
  for (let i = 0; i < PHASE1_COMPLETION.rosterEntries; i++) {
    p.roster.push({
      id: `slip.${i}`, handle: `entry ${i}`, realName: null,
      role: 'dialer', recruitedByFalseAd: false, freed: false,
    });
  }
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };
  enterPhase2(s);
  return s;
}

/** Present at the keyboard? Deterministic, so a run is reproducible. */
function present(tickIndex: number, fraction: number): boolean {
  if (fraction >= 1) return true;
  const period = 600; // 30 seconds of ticks
  return (tickIndex % period) < period * fraction;
}

/**
 * Which requirement is furthest behind, so the policy chases the thing that actually gates it.
 * Coverage is a minimum, so anything else is wasted effort.
 */
function neediestKind(s: GameState): IntelKind {
  const d = deriveP2(s.p, s.t.burnedUntil);
  return INTEL_KINDS.reduce((worst, k) => (d.coverage[k] < d.coverage[worst] ? k : worst), INTEL_KINDS[0]);
}

/** Spend on ground and on tradecraft. Ground first: a machine pays for ever, an upgrade is a one-off. */
function spendIntel(s: GameState, policy: P2Policy): void {
  const p = s.p;
  const budget = p.intel * policy.spend;

  // The cheapest machine not yet held, preferring one that yields what is short.
  const want = neediestKind(s);
  const candidates = knownMachines(p)
    .filter((id) => accessOf(p, id) === 'none')
    .map((id) => MACHINE_BY_ID[id])
    .sort((a, b) => {
      const aw = (a.yields[want] ?? 0) > 0 ? 0 : 1;
      const bw = (b.yields[want] ?? 0) > 0 ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.footholdCost - b.footholdCost;
    });
  for (const m of candidates) {
    if (m.footholdCost <= budget) {
      if (takeFoothold(s, m.id)) return;
    }
  }

  for (const t of availableTradecraft(s)) {
    if (t.cost <= budget) {
      if (buyTradecraft(s, t.id)) return;
    }
  }

  // Corroboration is a hard requirement and nothing else buys it.
  const d = deriveP2(p, s.t.burnedUntil);
  if (p.corroborated.length < COVERAGE.corroborated && d.corroborateCost <= budget) {
    corroborateNext(s);
  }
}

/**
 * Choose one action and take it.
 *
 * Priority: escalate anything not yet administrator (it raises that box's income AND grows the map),
 * then work whichever machine best serves the requirement that is behind.
 */
function actOnce(s: GameState, policy: P2Policy): boolean {
  const p = s.p;
  if (p.heat / HEAT.max > policy.heatCeiling) return false;

  const views = viewMachines(s).filter((v) => v.access !== 'none');
  const want = neediestKind(s);

  // Escalation first, cheapest exposure first.
  const toEscalate = views
    .filter((v) => v.available.find((a) => a.def.id === 'escalate')?.ready)
    .sort((a, b) => a.def.exposure - b.def.exposure)[0];
  if (toEscalate) return act(s, toEscalate.def.id, 'escalate') !== null;

  // Then the best available action on the machine that helps most, priced by heat.
  let best: { machine: string; action: ActionId; score: number } | null = null;
  for (const v of views) {
    const yieldForWant = v.def.yields[want] ?? 0;
    for (const a of v.available) {
      if (!a.ready) continue;
      if (a.def.id === 'escalate') continue;
      const worth = (yieldForWant + 0.2) * actionWeightOf(a.def.id);
      const cost = policy.heatCeiling >= 1 ? 1 : heatOf(v.def, a.def.id) + 0.5;
      const score = worth / cost;
      if (!best || score > best.score) best = { machine: v.def.id, action: a.def.id, score };
    }
  }
  if (!best) return false;
  return act(s, best.machine, best.action) !== null;
}

/** Mirrors the engine's own action weighting, for the policy's scoring. */
function actionWeightOf(action: ActionId): number {
  switch (action) {
    case 'files': return 1.0;
    case 'screen': return 0.75;
    case 'webcam': return 0.5;
    case 'database': return 3.2;
    case 'sweep': return 0.3;
    default: return 0;
  }
}

export function runPhase2(archetype: P2Archetype, verbose = false): P2Result {
  const policy = POLICIES[archetype];
  const s = stateAtTransition();
  const p = s.p;

  let ms = 0;
  let peakHeat = 0;
  let actions = 0;
  let sinceReview = 0;
  let minutesAtZero = 0;
  let completed = false;
  let minutes = Infinity;
  const metAt: Record<string, number> = {};

  const maxTicks = (MAX_MINUTES * 60) / DT;
  for (let i = 0; i < maxTicks; i++) {
    ms += DT * 1000;
    const here = present(i, policy.presence);
    s.t.idle = !here;

    tick(s, DT);
    peakHeat = Math.max(peakHeat, p.heat);

    sinceReview += DT;
    if (here && sinceReview >= policy.reviewEverySeconds) {
      sinceReview = 0;
      spendIntel(s, policy);
      if (policy.diligence > 0) {
        // Take as many ready actions as the review allows; cooldowns do the limiting.
        for (let n = 0; n < 4; n++) {
          /*
           * The GAME's seeded RNG, not Math.random.
           *
           * Using Math.random here broke determinism and the regression gate caught it: two runs of
           * the same archetype differed by a minute. The whole value of this simulator is that the
           * same seed gives the same career, which is what lets a pacing change be attributed to
           * the change rather than to luck.
           */
          const roll = nextRandom(p.rngState);
          p.rngState = roll.state;
          if (roll.value > policy.diligence) break;
          if (!actOnce(s, policy)) break;
          actions++;
        }
      }
    }

    const d = deriveP2(p, s.t.burnedUntil);
    if (d.progress <= 0) minutesAtZero += DT / 60;
    for (const k of INTEL_KINDS) {
      if (d.coverage[k] >= 1 && metAt[k] === undefined) metAt[k] = ms / 60000;
    }
    if (d.identifiedFraction >= 1 && metAt.corroborated === undefined) {
      metAt.corroborated = ms / 60000;
    }

    if (!completed && d.progress >= 1) {
      completed = true;
      minutes = ms / 60000;
      if (verbose) console.log(`  completed at ${minutes.toFixed(1)}m after ${actions} actions`);
      break;
    }
  }

  const entries = Object.entries(metAt);
  return {
    archetype,
    completed,
    minutes,
    binding: entries.length === 5 ? entries.sort((a, b) => b[1] - a[1])[0][0] : 'incomplete',
    burns: p.burns,
    peakHeat,
    footholds: (p.footholds ?? []).length,
    admin: (p.admin ?? []).length,
    known: knownMachines(p).length,
    corroborated: p.corroborated.length,
    tradecraft: p.tradecraft.length,
    actions,
    finalRate: intrusionRate(p).total,
    minutesAtZero,
    metAt: { ...metAt },
  };
}

// ------------------------------------------------------------------------------------------- CLI

function main(): void {
  const results = (['reckless', 'optimal', 'active', 'casual', 'neglectful'] as P2Archetype[])
    .map((a) => runPhase2(a));

  console.log('| Archetype | Done | Binding | Burns | Peak | Machines | Admin | Acts | Rate | Corrob |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(
      `| ${r.archetype} | ${r.completed ? `${r.minutes.toFixed(0)} min` : 'never'} `
      + `| ${r.binding} | ${r.burns} | ${r.peakHeat.toFixed(0)} `
      + `| ${r.footholds}/${MACHINE_BY_ID ? Object.keys(MACHINE_BY_ID).length : 0} | ${r.admin} `
      + `| ${r.actions} | ${r.finalRate.toFixed(0)}/s | ${r.corroborated}/${COVERAGE.corroborated} |`,
    );
  }

  const active = results.find((r) => r.archetype === 'active')!;
  const ok = active.minutes >= PHASE2_TARGET_MINUTES.min && active.minutes <= PHASE2_TARGET_MINUTES.max;
  console.log(
    `\nactive archetype: ${active.minutes.toFixed(1)} min — `
    + `${ok ? 'IN WINDOW' : 'OUT OF WINDOW (the regression test will fail)'}`,
  );

  const reckless = results.find((r) => r.archetype === 'reckless')!;
  const optimal = results.find((r) => r.archetype === 'optimal')!;
  if (reckless.burns > optimal.burns * 2 && optimal.minutes < reckless.minutes) {
    console.log(`heat is a real constraint: reckless burned ${reckless.burns}x vs optimal ${optimal.burns}x`);
  } else {
    console.log(`WARNING: reckless ${reckless.minutes.toFixed(0)}m/${reckless.burns} burns vs `
      + `optimal ${optimal.minutes.toFixed(0)}m/${optimal.burns} — heat may be decorative`);
  }

  const neglectful = results.find((r) => r.archetype === 'neglectful')!;
  if (!neglectful.completed) {
    console.log('WARNING: a player who never acts cannot finish — the active layer is not optional');
  } else {
    console.log(`ignoring the actions entirely: ${neglectful.minutes.toFixed(0)} min `
      + `(${(neglectful.minutes / active.minutes).toFixed(2)}x active)`);
  }

  console.log(`\nACTIONS: ${TRADECRAFT.length} tradecraft, ${ACTIONS.length} action types`);
}

/*
 * Run when invoked directly. Guarded loosely on purpose: vite-node's argv shape differs from
 * node's, and a guard that is too clever silently prints nothing - which it did.
 */
const invoked = process.argv.some((a) => a.includes('simulate-phase2'));
if (invoked) main();
