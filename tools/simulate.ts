/**
 * Headless balance simulator.
 *
 * The old build had two of these and neither worked: `simulate.js` never parsed its
 * `--player` flag (so all three archetypes printed identical output), and `sim_v7.js`
 * reported "Completed: YES" on a run that had actually stalled at queue #0 for an
 * hour. Worse, neither imported `balance.js` — they each reimplemented the economy,
 * so they were measuring games that did not exist.
 *
 * This one imports the real balance data and calls the real `tick()`. If it and the
 * browser ever disagree, that is a bug in one of them, not a modelling difference.
 *
 * Usage:  npm run sim
 *         npm run sim -- --archetype=active --verbose
 */

import type { GameState, GeneratorId } from '../src/engine/types';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive, costOf, maxAffordable } from '../src/engine/derive';
import { tick, stall, buyGenerator, buyUpgrade, availableUpgrades } from '../src/engine/sim';
import { DT } from '../src/engine/loop';
import {
  GENERATORS, PHASE1_MILESTONES, PHASE1_GATE, PHASE1_TARGET_MINUTES,
} from '../src/data/balance';
import { fmt, fmtDuration } from '../src/engine/numbers';

export type Archetype = 'idle' | 'casual' | 'active' | 'optimal';

interface Policy {
  /** Stalls per second the player attempts. */
  stallsPerSecond: number;
  /** Seconds between shopping trips. */
  shopEverySeconds: number;
  /** Fraction of the session the player is present at all. */
  attentionFraction: number;
}

const POLICIES: Record<Archetype, Policy> = {
  // Never clicks. Buys rarely. Should progress, slowly — a game that pays nothing
  // to an idle player is not an idle game.
  idle: { stallsPerSecond: 0.1, shopEverySeconds: 120, attentionFraction: 0.2 },
  casual: { stallsPerSecond: 0.7, shopEverySeconds: 45, attentionFraction: 0.6 },
  active: { stallsPerSecond: 3.2, shopEverySeconds: 12, attentionFraction: 1.0 },
  // The theoretical floor: perfect payback-ordered purchasing, max click rate.
  optimal: { stallsPerSecond: 8, shopEverySeconds: 4, attentionFraction: 1.0 },
};

/**
 * Curve mode: report lifetime Hold Time at each elapsed minute for one archetype.
 * This is how the phase gate gets chosen — run it, read off the lifetime value at
 * the target duration, and set PHASE1_GATE to that. Guessing the gate and then
 * tuning the economy to fit it is the loop the old build never escaped.
 */
export function curve(archetype: Archetype, minutes: number): Array<[number, number, number]> {
  const policy = POLICIES[archetype];
  const p = freshState();
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };
  const out: Array<[number, number, number]> = [];
  let virtualMs = 0, stallCredit = 0, sinceShop = 0, nextSample = 5;
  const maxTicks = (minutes * 60) / DT;
  for (let i = 0; i < maxTicks; i++) {
    virtualMs += DT * 1000;
    const present = pseudoPresent(i, policy.attentionFraction);
    s.t.idle = !present;
    if (present) s.t.lastInteractionAt = virtualMs;
    tick(s, DT);
    if (present && policy.stallsPerSecond > 0) {
      stallCredit += policy.stallsPerSecond * DT;
      while (stallCredit >= 1) { stall(s, virtualMs); stallCredit -= 1; virtualMs += 1; }
    }
    sinceShop += DT;
    if (present && sinceShop >= policy.shopEverySeconds) {
      sinceShop = 0; shop(s, archetype === 'optimal');
    }
    const mins = virtualMs / 60000;
    if (mins >= nextSample) { out.push([mins, s.p.holdTimeLifetime, s.d.hps]); nextSample += 5; }
  }
  return out;
}

export interface SimResult {
  archetype: Archetype;
  completed: boolean;
  /** Real minutes to reach the phase gate. Infinity if never reached. */
  minutesToGate: number;
  milestoneMinutes: Record<string, number>;
  finalHps: number;
  totalStalls: number;
  upgradesBought: number;
  generatorsOwned: Record<GeneratorId, number>;
  /** Minutes spent with composure at zero — a proxy for "was this miserable". */
  brokenMinutes: number;
}

/** Hard stop so a broken economy fails loudly instead of hanging CI. */
const MAX_SIM_MINUTES = 600;

export function simulate(archetype: Archetype, verbose = false): SimResult {
  const policy = POLICIES[archetype];
  const p = freshState();
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };

  const milestoneMinutes: Record<string, number> = {};
  let virtualMs = 0;
  let stallCredit = 0;
  let sinceShop = 0;
  let brokenSeconds = 0;
  let completed = false;

  const maxTicks = (MAX_SIM_MINUTES * 60) / DT;

  for (let i = 0; i < maxTicks; i++) {
    virtualMs += DT * 1000;

    // Attention model: the player is only present for part of the wall clock.
    // While absent they are idle, which is a real state in the sim, not a pause.
    const present = pseudoPresent(i, policy.attentionFraction);
    s.t.idle = !present;
    if (present) s.t.lastInteractionAt = virtualMs;

    tick(s, DT);

    if (s.p.composure <= 0) brokenSeconds += DT;

    // --- Stalling ---
    if (present && policy.stallsPerSecond > 0) {
      stallCredit += policy.stallsPerSecond * DT;
      while (stallCredit >= 1) {
        stall(s, virtualMs);
        stallCredit -= 1;
        // The cooldown is enforced inside stall(); advance the virtual clock so a
        // high requested rate is capped by it exactly as it would be in a browser.
        virtualMs += 1;
      }
    }

    // --- Shopping ---
    sinceShop += DT;
    if (present && sinceShop >= policy.shopEverySeconds) {
      sinceShop = 0;
      shop(s, archetype === 'optimal');
    }

    // --- Milestone timings ---
    for (const m of PHASE1_MILESTONES) {
      if (s.p.milestones.includes(m.id) && milestoneMinutes[m.id] === undefined) {
        milestoneMinutes[m.id] = virtualMs / 60000;
        if (verbose) {
          console.log(
            `  ${(virtualMs / 60000).toFixed(1).padStart(6)}m  ${m.title.padEnd(20)} ` +
            `lifetime=${fmt(s.p.holdTimeLifetime).padStart(9)} hps=${fmt(s.d.hps)}`,
          );
        }
      }
    }

    if (s.p.holdTimeLifetime >= PHASE1_GATE) {
      completed = true;
      break;
    }
  }

  return {
    archetype,
    completed,
    minutesToGate: completed ? virtualMs / 60000 : Infinity,
    milestoneMinutes,
    finalHps: s.d.hps,
    totalStalls: s.p.totalStalls,
    upgradesBought: s.p.upgrades.length,
    generatorsOwned: { ...s.p.generators },
    brokenMinutes: brokenSeconds / 60,
  };
}

/**
 * Deterministic stand-in for "is the player at the keyboard". A hash rather than
 * Math.random so a run is reproducible — a balance tool that gives a different
 * answer each invocation cannot gate a build.
 */
function pseudoPresent(tickIndex: number, fraction: number): boolean {
  if (fraction >= 1) return true;
  // Blocks of ~2 minutes present/absent, so idle periods are realistic in shape
  // rather than flickering every tick.
  const block = Math.floor(tickIndex / (120 / DT));
  const h = Math.sin(block * 12.9898) * 43758.5453;
  return (h - Math.floor(h)) < fraction;
}

/**
 * Purchasing policy.
 *
 * `optimal` buys strictly by payback time — cost divided by the marginal production
 * the purchase adds — which is the genre's known-best greedy heuristic and gives the
 * lower bound on phase duration. Everyone else buys the most expensive thing they
 * can afford, which is what people actually do.
 */
function shop(s: GameState, optimal: boolean): void {
  // Upgrades first: they are one-time and almost always better value than a unit.
  for (const u of availableUpgrades(s)) {
    if (u.cost <= s.p.holdTime) buyUpgrade(s, u.id);
  }

  if (optimal) {
    // Repeatedly buy the best payback until nothing is worth it.
    for (let guard = 0; guard < 200; guard++) {
      let best: GeneratorId | null = null;
      let bestPayback = Infinity;
      for (const g of GENERATORS) {
        if (s.p.holdTimeLifetime < g.unlocksAt) continue;
        const owned = s.p.generators[g.id] ?? 0;
        const cost = costOf(g.id, owned);
        if (cost > s.p.holdTime) continue;
        const gain = marginalGain(s, g.id);
        if (gain <= 0) continue;
        const payback = cost / gain;
        if (payback < bestPayback) {
          bestPayback = payback;
          best = g.id;
        }
      }
      if (!best) break;
      if (buyGenerator(s, best, 1) === 0) break;
    }
    return;
  }

  // Everyone else: highest unlocked tier they can afford, in bulk.
  for (let i = GENERATORS.length - 1; i >= 0; i--) {
    const g = GENERATORS[i];
    if (s.p.holdTimeLifetime < g.unlocksAt) continue;
    const owned = s.p.generators[g.id] ?? 0;
    const affordable = maxAffordable(g.id, owned, s.p.holdTime);
    if (affordable > 0) {
      // Spend most of the balance but keep a reserve, as a human would.
      buyGenerator(s, g.id, Math.max(1, Math.floor(affordable * 0.7)));
      return;
    }
  }
}

/** Actual marginal HPS from one more unit — measured, not modelled. */
function marginalGain(s: GameState, id: GeneratorId): number {
  const before = s.d.hps;
  s.p.generators[id] = (s.p.generators[id] ?? 0) + 1;
  const after = derive(s.p).hps;
  s.p.generators[id] = (s.p.generators[id] ?? 1) - 1;
  return after - before;
}

// ------------------------------------------------------------------------- CLI

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const only = args.find((a) => a.startsWith('--archetype='))?.split('=')[1] as
    | Archetype
    | undefined;

  if (args.includes('--curve')) {
    const a: Archetype = only ?? 'active';
    console.log(`\nGrowth curve — ${a} archetype\n`);
    console.log('| minute | lifetime | rate/s |');
    console.log('|---|---|---|');
    for (const [m, lifetime, hps] of curve(a, 150)) {
      console.log(`| ${m.toFixed(0)} | ${fmt(lifetime)} | ${fmt(hps)} |`);
    }
    console.log('');
    return;
  }

  const archetypes: Archetype[] = only ? [only] : ['optimal', 'active', 'casual', 'idle'];

  console.log('\nPLEASE HOLD — Phase 1 balance simulation');
  console.log(`Target window for "active": ${PHASE1_TARGET_MINUTES.min}–${PHASE1_TARGET_MINUTES.max} min`);
  console.log(`Gate: ${fmt(PHASE1_GATE)} lifetime Hold Time\n`);

  const results: SimResult[] = [];
  for (const a of archetypes) {
    if (verbose) console.log(`--- ${a} ---`);
    const r = simulate(a, verbose);
    results.push(r);
  }

  console.log('| Archetype | Gate | Stalls | Upgrades | Final rate | Broken |');
  console.log('|---|---|---|---|---|---|');
  for (const r of results) {
    const gate = r.completed ? `${r.minutesToGate.toFixed(0)} min` : 'never';
    console.log(
      `| ${r.archetype} | ${gate} | ${fmt(r.totalStalls)} | ${r.upgradesBought}/16 | ` +
      `${fmt(r.finalHps)}/s | ${r.brokenMinutes.toFixed(1)}m |`,
    );
  }

  const active = results.find((r) => r.archetype === 'active');
  if (active) {
    const inWindow =
      active.completed &&
      active.minutesToGate >= PHASE1_TARGET_MINUTES.min &&
      active.minutesToGate <= PHASE1_TARGET_MINUTES.max;
    console.log(
      `\nactive archetype: ${active.minutesToGate.toFixed(1)} min — ` +
      (inWindow ? 'IN WINDOW' : 'OUT OF WINDOW (the regression test will fail)'),
    );
  }

  if (verbose) {
    const r = results[0];
    console.log('\nMilestone timings for', r.archetype);
    for (const m of PHASE1_MILESTONES) {
      const t = r.milestoneMinutes[m.id];
      console.log(`  ${m.title.padEnd(22)} ${t === undefined ? 'never' : fmtDuration(t * 60)}`);
    }
  }
  console.log('');
}

// Run the CLI unless we are being imported by the test suite, which wants only
// `simulate()` and would otherwise print a report on every import.
if (!process.env.VITEST) main();
