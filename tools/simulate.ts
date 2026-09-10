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
 * ONE stepping function, deliberately. An earlier version of this file had a separate
 * loop for the summary report and for the growth curve, and they drifted immediately:
 * the curve claimed the gate fell at minute 105 while the report measured 173. Two
 * loops modelling one game is the precise mistake that made the previous build's
 * balance untrustworthy, so `run()` below is the only place the game is stepped and
 * both outputs are derived from it.
 *
 * Usage:  npm run sim
 *         npm run sim -- --archetype=active --verbose
 *         npm run sim -- --curve
 */

import type { GameState, GeneratorId, ActiveEvent } from '../src/engine/types';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive, costOf, maxAffordable, maxComposure } from '../src/engine/derive';
import {
  tick, stall, buyGenerator, buyUpgrade, availableUpgrades,
  redial, canRedial, buyDossier, availableDossier, catchEvent,
  takeBreath, canTakeBreath, switchPersona, availablePersonas,
  phase1Complete, phase1Progress,
} from '../src/engine/sim';
import { DT } from '../src/engine/loop';
import {
  GENERATORS, PHASE1_MILESTONES, PHASE1_GATE, PHASE1_TARGET_MINUTES, DOSSIER,
} from '../src/data/balance';
import { UPGRADES } from '../src/data/upgrades';
import { fmt, fmtDuration } from '../src/engine/numbers';

export type Archetype = 'idle' | 'casual' | 'active' | 'optimal' | 'exploiter';

interface Policy {
  /** Stalls per second the player attempts. */
  stallsPerSecond: number;
  /** Seconds between shopping trips. */
  shopEverySeconds: number;
  /** Fraction of the session the player is present at all. */
  attentionFraction: number;
  /** Probability of noticing and catching an opportunity window. Rolled ONCE per window. */
  eventCatchRate: number;
  /**
   * Redial when banking Notes would raise the total by at least this fraction. The
   * standard prestige heuristic: reset when the payout is a significant multiple of
   * what you hold, not on a fixed timer.
   */
  redialGainThreshold: number;
  /**
   * Take a breath below this fraction of max composure. Modelling this matters: the
   * action spends the primary currency, so a simulator that never uses it measures a
   * cheaper game than anyone actually plays.
   */
  breathBelow: number;
  /**
   * How the player weights a voice: stall value versus how furious it makes him. An
   * engaged player chases boil-overs; a casual one takes the persona that banks the most
   * time and stops thinking about it.
   */
  rageWeight: number;
  /**
   * Redial the instant it is eligible, ignoring whether the payout is worthwhile.
   *
   * This models the DOMINANT STRATEGY, and it exists because its absence hid a real
   * problem: every other policy waits for `gain >= notes * threshold`, which is what a
   * reasonable player does — so the suite measured 95 minutes for a phase a human who
   * found the spam line finished in 53. Notes pay sqrt(depth), and a square root is
   * concave, so many shallow calls out-earn one deep call. A simulator that only models
   * polite play cannot see that.
   */
  spamRedial: boolean;
}

const POLICIES: Record<Archetype, Policy> = {
  idle: {
    stallsPerSecond: 0.1, shopEverySeconds: 120, attentionFraction: 0.2,
    eventCatchRate: 0.05, redialGainThreshold: 1.5, breathBelow: 0.25, rageWeight: 0.2, spamRedial: false,
  },
  casual: {
    stallsPerSecond: 0.7, shopEverySeconds: 30, attentionFraction: 0.6,
    eventCatchRate: 0.35, redialGainThreshold: 0.75, breathBelow: 0.3, rageWeight: 0.4, spamRedial: false,
  },
  active: {
    stallsPerSecond: 3.2, shopEverySeconds: 12, attentionFraction: 1.0,
    eventCatchRate: 0.8, redialGainThreshold: 0.6, breathBelow: 0.35, rageWeight: 1.0, spamRedial: false,
  },
  // The theoretical floor: perfect payback-ordered purchasing, max click rate,
  // never misses a window, redials the moment it is worth it.
  optimal: {
    stallsPerSecond: 8, shopEverySeconds: 4, attentionFraction: 1.0,
    eventCatchRate: 1.0, redialGainThreshold: 0.35, breathBelow: 0.4, rageWeight: 1.2, spamRedial: false,
  },
  /**
   * The adversarial archetype: plays hard AND redials the moment it is legal. This is the
   * lower bound on how fast a determined player can finish, and the number that must stay
   * inside the target window - not just the well-behaved one.
   */
  exploiter: {
    stallsPerSecond: 8, shopEverySeconds: 4, attentionFraction: 1.0,
    eventCatchRate: 1.0, redialGainThreshold: 0, breathBelow: 0.4, rageWeight: 1.2,
    spamRedial: true,
  },
};

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
  /** Highest count ever owned of each tier, across every call in the run. */
  peakOwned: Record<GeneratorId, number>;
  /** Minutes the player was actually AT the keyboard. The felt duration. */
  presentMinutes: number;
  /** Minutes elapsed before the first redial — how long the loop stays hidden. */
  minutesToFirstRedial: number;
  /** Mean minutes per call. Short calls mean the ladder never gets climbed. */
  meanCallMinutes: number;
  /** Career total at the moment of the first redial. */
  careerAtFirstRedial: number;
  /** Minutes spent with composure at zero — a proxy for "was this miserable". */
  brokenMinutes: number;
  redials: number;
  notesLifetime: number;
  dossierBought: number;
  eventsCaught: number;
  eventsMissed: number;
  /** Times he lost his temper. */
  boilOvers: number;
  /** Distinct things he let slip. */
  rosterEntries: number;
  /** Rapport at the end, against the 92 needed. */
  finalRapport: number;
  /** Minute the dossier was completed, or Infinity. Paces the prestige tree honestly. */
  dossierCompleteMinute: number;
  /** Which condition was satisfied LAST — the one actually setting phase length. */
  bindingCondition: 'time' | 'trust' | 'slips' | 'none';
  /** The voice in use at the end of the run. */
  finalPersona: string;
  /** [minute, careerTotal, rate] samples, when requested. */
  samples: Array<[number, number, number]>;
  /** Longest stretch with no affordable purchase — the dead-time detector. */
  longestStallMinutes: number;
}

/** Hard stop so a broken economy fails loudly instead of hanging CI. */
const MAX_SIM_MINUTES = 900;

interface RunOpts {
  verbose?: boolean;
  /** Sample the curve every N minutes. 0 disables sampling. */
  sampleEvery?: number;
  /** Keep running past the gate, for curve inspection. */
  runPastGate?: boolean;
  maxMinutes?: number;
}

/** THE stepping function. Everything else reports on what this returns. */
export function run(archetype: Archetype, opts: RunOpts = {}): SimResult {
  const policy = POLICIES[archetype];
  const p = freshState();
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };

  const milestoneMinutes: Record<string, number> = {};
  const samples: Array<[number, number, number]> = [];
  const sampleEvery = opts.sampleEvery ?? 0;

  let virtualMs = 0;
  let stallCredit = 0;
  let sinceShop = 0;
  let brokenSeconds = 0;
  let completed = false;
  let minutesToGate = Infinity;
  let lastSeenEvent: ActiveEvent | null = null;
  let nextSample = sampleEvery;
  let secondsSincePurchase = 0;
  let longestStallSeconds = 0;
  const peakOwned = {} as Record<GeneratorId, number>;
  for (const g of GENERATORS) peakOwned[g.id] = 0;
  let presentSeconds = 0;
  let minutesToFirstRedial = Infinity;
  let careerAtFirstRedial = 0;
  let dossierCompleteMinute = Infinity;
  const metAt: Record<string, number> = {};

  const maxTicks = ((opts.maxMinutes ?? MAX_SIM_MINUTES) * 60) / DT;

  for (let i = 0; i < maxTicks; i++) {
    virtualMs += DT * 1000;

    // Attention model: the player is only present for part of the wall clock. While
    // absent they are idle, which is a real state in the sim, not a pause.
    const present = pseudoPresent(i, policy.attentionFraction);
    s.t.idle = !present;
    if (present) s.t.lastInteractionAt = virtualMs;

    tick(s, DT);

    if (p.composure <= 0) brokenSeconds += DT;
    if (present) presentSeconds += DT;
    secondsSincePurchase += DT;

    // --- Stalling ---
    if (present && policy.stallsPerSecond > 0) {
      stallCredit += policy.stallsPerSecond * DT;
      while (stallCredit >= 1) {
        stall(s, virtualMs);
        stallCredit -= 1;
        // The cooldown is enforced inside stall(); advance the virtual clock so a
        // high requested rate is capped by it exactly as in a browser.
        virtualMs += 1;
      }
    }

    // --- Voice selection ---
    // Re-evaluated on the shopping cadence rather than per tick: a player picks a
    // character and stays in it for a while, because switching costs composure.
    if (present && sinceShop === 0) {
      const best = availablePersonas(s)
        .map((x) => ({
          x,
          score:
            x.stallMultiplier +
            x.rageMultiplier * policy.rageWeight -
            x.drainMultiplier * 1.5 +
            x.rapportMultiplier * 0.4,
        }))
        .sort((a, b) => b.score - a.score)[0];
      if (best && best.x.id !== p.persona) switchPersona(s, best.x.id);
    }

    // --- Composure management ---
    if (present && p.composure < maxComposure(p) * policy.breathBelow && canTakeBreath(s)) {
      takeBreath(s);
    }

    // --- Opportunity windows: decide ONCE per window, on the tick it opens ---
    if (present && s.t.event && s.t.event !== lastSeenEvent) {
      lastSeenEvent = s.t.event;
      if (deterministicRoll(i) < policy.eventCatchRate) catchEvent(s);
    }

    // --- Shopping ---
    sinceShop += DT;
    if (present && sinceShop >= policy.shopEverySeconds) {
      sinceShop = 0;
      if (shop(s, archetype === 'optimal')) {
        longestStallSeconds = Math.max(longestStallSeconds, secondsSincePurchase);
        secondsSincePurchase = 0;
      }
    }

    // --- Redial decision ---
    if (present && canRedial(s)) {
      const gain = s.d.notesOnRedial;
      // Never trade a whole call for a single page: require a payout that can
      // actually buy something, as well as being a real gain on what is held.
      const worthIt = policy.spamRedial
        ? gain > 0
        : gain >= 2 && gain >= Math.max(2, p.notes * policy.redialGainThreshold);
      if (worthIt) {
        if (p.redials === 0) {
          minutesToFirstRedial = virtualMs / 60000;
          careerAtFirstRedial = p.holdTimeCareer;
        }
        redial(s);
        // Spend immediately; an unspent prestige currency is just a number, and the
        // dossier is the thing that makes the next call shorter.
        spendNotes(s);
        secondsSincePurchase = 0;
      }
    }

    for (const g of GENERATORS) {
      const owned = p.generators[g.id] ?? 0;
      if (owned > peakOwned[g.id]) peakOwned[g.id] = owned;
    }

    // --- Milestone timings ---
    for (const m of PHASE1_MILESTONES) {
      if (p.milestones.includes(m.id) && milestoneMinutes[m.id] === undefined) {
        milestoneMinutes[m.id] = virtualMs / 60000;
        if (opts.verbose) {
          console.log(
            `  ${(virtualMs / 60000).toFixed(1).padStart(6)}m  ${m.title.padEnd(20)} ` +
            `career=${fmt(p.holdTimeCareer).padStart(10)} rate=${fmt(s.d.hps)}/s ` +
            `redials=${p.redials}`,
          );
        }
      }
    }

    if (sampleEvery > 0 && virtualMs / 60000 >= nextSample) {
      samples.push([virtualMs / 60000, p.holdTimeCareer, s.d.hps]);
      nextSample += sampleEvery;
    }

    if (dossierCompleteMinute === Infinity && p.dossier.length >= DOSSIER.length) {
      dossierCompleteMinute = virtualMs / 60000;
    }
    // Record when each condition is first satisfied, so the report can name which one is
    // actually setting the phase's length rather than leaving it to be inferred.
    const prog = phase1Progress(p);
    if (prog.time >= 1 && metAt.time === undefined) metAt.time = virtualMs / 60000;
    if (prog.trust >= 1 && metAt.trust === undefined) metAt.trust = virtualMs / 60000;
    if (prog.slips >= 1 && metAt.slips === undefined) metAt.slips = virtualMs / 60000;

    if (!completed && phase1Complete(p)) {
      completed = true;
      minutesToGate = virtualMs / 60000;
      if (!opts.runPastGate) break;
    }
  }

  return {
    archetype,
    completed,
    minutesToGate,
    milestoneMinutes,
    finalHps: s.d.hps,
    totalStalls: p.totalStalls,
    upgradesBought: p.upgrades.length,
    generatorsOwned: { ...p.generators },
    peakOwned,
    presentMinutes: presentSeconds / 60,
    minutesToFirstRedial,
    meanCallMinutes: p.redials > 0 ? (virtualMs / 60000) / (p.redials + 1) : virtualMs / 60000,
    careerAtFirstRedial,
    brokenMinutes: brokenSeconds / 60,
    redials: p.redials,
    notesLifetime: p.notesLifetime,
    dossierBought: p.dossier.length,
    eventsCaught: s.t.eventsCaught,
    eventsMissed: s.t.eventsMissed,
    boilOvers: p.boilOvers,
    rosterEntries: p.roster.length,
    finalRapport: p.rapport,
    dossierCompleteMinute,
    bindingCondition: (() => {
      const entries = Object.entries(metAt) as Array<['time' | 'trust' | 'slips', number]>;
      if (entries.length < 3) return 'none';
      return entries.sort((a, b) => b[1] - a[1])[0][0];
    })(),
    finalPersona: p.persona,
    samples,
    longestStallMinutes: longestStallSeconds / 60,
  };
}

/** Back-compat alias used by the test suite. */
export function simulate(archetype: Archetype, verbose = false): SimResult {
  return run(archetype, { verbose });
}

/**
 * Deterministic pseudo-random in [0,1) from a tick index. A balance tool that
 * returns a different answer per run cannot gate a build, so nothing here uses
 * Math.random.
 */
function deterministicRoll(i: number): number {
  const h = Math.sin(i * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Deterministic stand-in for "is the player at the keyboard". Blocks of ~2 minutes
 * present/absent, so idle periods have a realistic shape rather than flickering every
 * tick.
 */
function pseudoPresent(tickIndex: number, fraction: number): boolean {
  if (fraction >= 1) return true;
  const block = Math.floor(tickIndex / (120 / DT));
  const h = Math.sin(block * 12.9898) * 43758.5453;
  return (h - Math.floor(h)) < fraction;
}

/**
 * Spend Notes on the dossier, cheapest-available first. Cheapest-first is correct for
 * a prestige tree whose entries are all permanent: there is no wrong purchase, only a
 * slower one, so banking for an expensive node while affordable ones sit unbought is
 * strictly worse.
 */
function spendNotes(s: GameState): void {
  for (let guard = 0; guard < 40; guard++) {
    const options = availableDossier(s)
      .filter((d) => d.cost <= s.p.notes)
      .sort((a, b) => a.cost - b.cost);
    if (options.length === 0) return;
    if (!buyDossier(s, options[0].id)) return;
  }
}

/**
 * Purchasing policy. Returns true if anything was bought, which feeds the dead-time
 * detector.
 *
 * `optimal` buys strictly by payback time — cost divided by the marginal production
 * the purchase adds — the genre's known-best greedy heuristic, giving the lower bound
 * on phase duration. Everyone else buys the most expensive thing they can afford,
 * which is what people actually do.
 */
function shop(s: GameState, optimal: boolean): boolean {
  let bought = false;

  // Upgrades first: one-time, and almost always better value than another unit.
  for (const u of availableUpgrades(s)) {
    if (u.cost <= s.p.holdTime && buyUpgrade(s, u.id)) bought = true;
  }

  if (optimal) {
    for (let guard = 0; guard < 300; guard++) {
      let best: GeneratorId | null = null;
      let bestPayback = Infinity;
      for (const g of GENERATORS) {
        if (s.p.holdTimeCareer < g.unlocksAt) continue;
        const owned = s.p.generators[g.id] ?? 0;
        const cost = costOf(g.id, owned);
        if (cost > s.p.holdTime) continue;
        const gain = marginalGain(s, g.id);
        if (gain <= 0) continue;
        const payback = cost / gain;
        if (payback < bestPayback) { bestPayback = payback; best = g.id; }
      }
      if (!best) break;
      if (buyGenerator(s, best, 1) === 0) break;
      bought = true;
    }
    return bought;
  }

  for (let i = GENERATORS.length - 1; i >= 0; i--) {
    const g = GENERATORS[i];
    if (s.p.holdTimeCareer < g.unlocksAt) continue;
    const owned = s.p.generators[g.id] ?? 0;
    const affordable = maxAffordable(g.id, owned, s.p.holdTime);
    if (affordable > 0) {
      // Spend most of the balance but keep a reserve, as a human would.
      if (buyGenerator(s, g.id, Math.max(1, Math.floor(affordable * 0.7))) > 0) bought = true;
      return bought;
    }
  }
  return bought;
}

/** Actual marginal rate from one more unit — measured, not modelled. */
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
    const r = run(a, { sampleEvery: 5, runPastGate: true, maxMinutes: 150 });
    console.log(`\nGrowth curve — ${a} archetype (gate at ${fmt(PHASE1_GATE)})\n`);
    console.log('| minute | career total | rate/s |');
    console.log('|---|---|---|');
    for (const [m, career, hps] of r.samples) {
      const marker = career >= PHASE1_GATE ? ' **' : '';
      console.log(`| ${m.toFixed(0)}${marker} | ${fmt(career)} | ${fmt(hps)} |`);
    }
    console.log(`\ngate reached at ${r.minutesToGate.toFixed(1)} min\n`);
    return;
  }

  const archetypes: Archetype[] = only
    ? [only]
    : ['exploiter', 'optimal', 'active', 'casual', 'idle'];

  console.log('\nPLEASE HOLD — Phase 1 balance simulation');
  console.log(`Target window for "active": ${PHASE1_TARGET_MINUTES.min}–${PHASE1_TARGET_MINUTES.max} min`);
  console.log(`Gate: ${fmt(PHASE1_GATE)} career Hold Time`);
  console.log(`Content: ${GENERATORS.length} tiers, ${UPGRADES.length} upgrades, ${DOSSIER.length} dossier\n`);

  const results: SimResult[] = [];
  for (const a of archetypes) {
    if (verbose) console.log(`--- ${a} ---`);
    results.push(run(a, { verbose }));
  }

  console.log('| Archetype | Done | Binding | Redials | Dossier | Rages | Roster | Rapport |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const gate = r.completed ? `${r.minutesToGate.toFixed(0)} min` : 'never';
    const dossier = r.dossierCompleteMinute === Infinity
      ? `${r.dossierBought}/${DOSSIER.length}`
      : `all @ ${r.dossierCompleteMinute.toFixed(0)}m`;
    console.log(
      `| ${r.archetype} | ${gate} | ${r.bindingCondition} | ${r.redials} | ` +
      `${dossier} | ${r.boilOvers} | ${r.rosterEntries}/8 | ${r.finalRapport.toFixed(0)}/92 |`,
    );
  }

  const neverBought = GENERATORS.filter((g) =>
    results.every((r) => (r.peakOwned[g.id] ?? 0) === 0),
  );
  if (neverBought.length > 0) {
    console.log(
      `\nDEAD CONTENT — never bought by any archetype: ` +
      neverBought.map((g) => g.name).join(', '),
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

  if (verbose && results[0]) {
    console.log('\nMilestone timings for', results[0].archetype);
    for (const m of PHASE1_MILESTONES) {
      const t = results[0].milestoneMinutes[m.id];
      console.log(`  ${m.title.padEnd(22)} ${t === undefined ? 'never' : fmtDuration(t * 60)}`);
    }
  }
  console.log('');
}

// Run the CLI unless we are being imported by the test suite, which wants only
// `run()` / `simulate()` and would otherwise print a report on every import.
if (!process.env.VITEST) main();
