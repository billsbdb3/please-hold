/**
 * Phase 2 (THE MAP) tests.
 *
 * The design assertions are the important ones here, not the arithmetic. Phase 2's whole
 * premise is that ALLOCATION under a threat is interesting, and that premise is falsifiable:
 * if ignoring heat is as good as managing it, the phase is a shopping list with a decorative
 * meter. The simulator caught exactly that three times during construction —
 *
 *   - heat generation was an order of magnitude below decay, so heat never rose at all;
 *   - with burns as the only penalty, never backing off finished in 140 min against 288;
 *   - and modelling careful play as "drop to nothing when hot" made it look even worse.
 *
 * So `heat is a real constraint` and `managing heat beats ignoring it` are tests, permanently.
 */

import { describe, it, expect } from 'vitest';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { tick } from '../src/engine/sim';
import {
  enterPhase2, assignAttention, clearAttention, unlockStream, buyAttention,
  buyTradecraft, corroborateNext, deriveP2, attentionPool,
} from '../src/engine/phase2';
import { DT } from '../src/engine/loop';
import {
  STREAMS, STREAM_BY_ID, HEAT, COVERAGE, ATTENTION, INTEL_KINDS,
  PHASE2_TARGET_MINUTES, TRADECRAFT,
  IDENTIFY,
} from '../src/data/phase2';
import { PHASE1_COMPLETION } from '../src/data/balance';
import { runPhase2 } from '../tools/simulate-phase2';
import type { GameState } from '../src/engine/types';

function atPhase2(rosterCount = 12): GameState {
  const p = freshState();
  for (let i = 0; i < rosterCount; i++) {
    p.roster.push({
      id: `slip.${i}`, handle: `entry ${i}`, realName: null,
      role: 'dialer', recruitedByFalseAd: false, freed: false,
    });
  }
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };
  enterPhase2(s);
  return s;
}

describe('the transition retires phase 1', () => {
  it('moves to phase 2 and grants the cameras', () => {
    const s = atPhase2();
    expect(s.p.phase).toBe(2);
    expect(s.p.streams).toContain('cctv');
    expect(s.p.heat).toBe(0);
  });

  it('stops generating Hold Time entirely', () => {
    // The Paperclips move: phase 1's verb and economy do not persist as a background trickle,
    // they cease. If hold time still accrued, phase 2 would be phase 1 with extra panels.
    const s = atPhase2();
    s.p.generators.confusion = 50;
    s.d = derive(s.p);
    const before = s.p.holdTime;
    for (let i = 0; i < Math.ceil(30 / DT); i++) tick(s, DT);
    expect(s.p.holdTime).toBe(before);
  });

  it('keeps the roster, which is the bridge between the phases', () => {
    const s = atPhase2(9);
    expect(s.p.roster.length).toBe(9);
  });
});

describe('attention is genuinely scarce', () => {
  it('cannot assign more than the pool', () => {
    const s = atPhase2();
    clearAttention(s);
    const pool = attentionPool(s.p);
    let placed = 0;
    // cctv absorbs 6, the pool starts at 3 — so the pool binds, not the stream.
    for (let i = 0; i < 10; i++) if (assignAttention(s, 'cctv', 1)) placed++;
    expect(placed).toBe(Math.min(pool, STREAM_BY_ID.cctv.maxAttention));
  });

  it('cannot exceed a stream ceiling even with attention to spare', () => {
    const s = atPhase2();
    s.p.attentionBought = ATTENTION.max;
    clearAttention(s);
    let placed = 0;
    for (let i = 0; i < 20; i++) if (assignAttention(s, 'cctv', 1)) placed++;
    expect(placed).toBe(STREAM_BY_ID.cctv.maxAttention);
  });

  it('refuses attention on a stream that has not been unlocked', () => {
    const s = atPhase2();
    expect(s.p.streams).not.toContain('ledger');
    expect(assignAttention(s, 'ledger', 1)).toBe(false);
  });

  it('the pool is capped however much is bought', () => {
    const s = atPhase2();
    s.p.attentionBought = 999;
    expect(attentionPool(s.p)).toBeLessThanOrEqual(ATTENTION.max);
  });
});

describe('heat is a real constraint', () => {
  it('rises when watching something dangerous', () => {
    const s = atPhase2();
    s.p.intel = 1e9;
    unlockStream(s, 'ledger');
    clearAttention(s);
    s.p.attentionBought = ATTENTION.max;
    for (let i = 0; i < 4; i++) assignAttention(s, 'ledger', 1);
    for (let i = 0; i < Math.ceil(20 / DT); i++) tick(s, DT);
    expect(s.p.heat).toBeGreaterThan(0);
  });

  it('decays back to nothing when you stop looking', () => {
    const s = atPhase2();
    s.p.heat = 50;
    clearAttention(s);
    for (let i = 0; i < Math.ceil(200 / DT); i++) tick(s, DT);
    expect(s.p.heat).toBe(0);
  });

  it('suppresses yields as it rises, so running hot is directly less productive', () => {
    // The load-bearing part of the threat. Without it, burns alone were too cheap and never
    // backing off measured FASTER than managing heat.
    const cold = atPhase2();
    const hot = atPhase2();
    hot.p.heat = HEAT.max;
    for (const s of [cold, hot]) {
      clearAttention(s);
      s.p.attentionBought = 6;
      for (let i = 0; i < 4; i++) assignAttention(s, 'cctv', 1);
    }
    const coldRate = deriveP2(cold.p, {}).totalRate;
    const hotRate = deriveP2(hot.p, {}).totalRate;
    expect(hotRate).toBeLessThan(coldRate);
    expect(hotRate / coldRate).toBeCloseTo(1 - HEAT.yieldPenaltyAtMax, 2);
  });

  it('burns the stream you were watching hardest, and escalates', () => {
    const s = atPhase2();
    s.p.intel = 1e9;
    unlockStream(s, 'ledger');
    clearAttention(s);
    s.p.attentionBought = ATTENTION.max;
    // A genuinely hot allocation: the ledger generates well over the decay budget, so heat
    // actually holds at maximum. Forcing the number while watching something cool would just
    // decay back below the threshold before the check — the tick applies the rate first.
    assignAttention(s, 'cctv', 1);
    for (let i = 0; i < 4; i++) assignAttention(s, 'ledger', 1);

    s.p.heat = HEAT.max;
    tick(s, DT);

    expect(s.p.burns).toBe(1);
    // Took away the thing being relied on, not an arbitrary stream.
    expect(s.t.burnedUntil.ledger).toBeGreaterThan(0);
    const first = s.t.burnedUntil.ledger!;

    // A second burn must cost more than the first, or recklessness pays a flat toll.
    delete s.t.burnedUntil.ledger;
    for (let i = 0; i < 4; i++) assignAttention(s, 'ledger', 1);
    s.p.heat = HEAT.max;
    tick(s, DT);
    expect(s.p.burns).toBe(2);
    expect(s.t.burnedUntil.ledger!).toBeGreaterThan(first);
  });

  it('a burned stream produces nothing, then comes back on its own', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 1);
    s.t.burnedUntil.cctv = 5;
    expect(deriveP2(s.p, s.t.burnedUntil).totalRate).toBe(0);
    for (let i = 0; i < Math.ceil(6 / DT); i++) tick(s, DT);
    expect(s.t.burnedUntil.cctv).toBeUndefined();
  });
});

describe('coverage cannot be carried by one stream', () => {
  it('is the minimum across kinds, not a sum', () => {
    const s = atPhase2();
    // Max out one kind entirely and leave the rest at nothing.
    s.p.intelByKind.people = COVERAGE.need.people * 10;
    s.p.corroborated = s.p.roster.map((r) => r.id);
    const d = deriveP2(s.p, {});
    expect(d.coverage.people).toBe(1);
    expect(d.progress).toBe(0);
  });

  it('completes only when every requirement is met', () => {
    const s = atPhase2();
    for (const k of INTEL_KINDS) s.p.intelByKind[k] = COVERAGE.need[k];
    s.p.corroborated = s.p.roster.slice(0, COVERAGE.corroborated).map((r) => r.id);
    expect(deriveP2(s.p, {}).progress).toBe(1);
  });

  it('requires more corroborated people than phase 1 hands you for free', () => {
    // Requiring 10 when an attentive phase 1 arrives with 12 made the requirement inert.
    expect(COVERAGE.corroborated).toBeGreaterThanOrEqual(12);
  });
});

describe('spending', () => {
  it('unlocks a stream and refuses when short', () => {
    const s = atPhase2();
    s.p.intel = STREAM_BY_ID.recordings.unlockCost - 1;
    expect(unlockStream(s, 'recordings')).toBe(false);
    s.p.intel = STREAM_BY_ID.recordings.unlockCost;
    expect(unlockStream(s, 'recordings')).toBe(true);
    expect(unlockStream(s, 'recordings')).toBe(false); // already owned
  });

  it('buys attention up to the cap, and the cost rises', () => {
    const s = atPhase2();
    s.p.intel = 1e9;
    const first = deriveP2(s.p, {}).nextAttentionCost!;
    buyAttention(s);
    const second = deriveP2(s.p, {}).nextAttentionCost!;
    expect(second).toBeGreaterThan(first);
  });

  it('respects tradecraft prerequisites', () => {
    const s = atPhase2();
    s.p.intel = 1e9;
    const gated = TRADECRAFT.find((t) => t.requires?.length)!;
    expect(buyTradecraft(s, gated.id)).toBe(false);
    for (const r of gated.requires!) buyTradecraft(s, r);
    expect(buyTradecraft(s, gated.id)).toBe(true);
  });

  it('identifies people from the roster, and runs out when the roster does', () => {
    const s = atPhase2(2);
    s.p.intel = 1e9;
    expect(corroborateNext(s)).toBe(true);
    expect(corroborateNext(s)).toBe(true);
    expect(corroborateNext(s)).toBe(false);
    expect(s.p.corroborated.length).toBe(2);
  });
});

describe('phase 2 pacing', () => {
  it('the active archetype finishes inside the target window', () => {
    const r = runPhase2('active');
    expect(r.completed).toBe(true);
    expect(r.minutes).toBeGreaterThanOrEqual(PHASE2_TARGET_MINUTES.min);
    expect(r.minutes).toBeLessThanOrEqual(PHASE2_TARGET_MINUTES.max);
  });

  /**
   * THE DESIGN ASSERTION. If ignoring heat is as good as managing it, the threat is
   * decorative and the phase is a shopping list. This failed three times during construction.
   */
  it('managing heat beats ignoring it', () => {
    const reckless = runPhase2('reckless');
    const optimal = runPhase2('optimal');
    expect(reckless.burns).toBeGreaterThan(optimal.burns * 3);
    expect(optimal.minutes).toBeLessThan(reckless.minutes);
  });

  it('every stream and the whole tradecraft tree is reachable', () => {
    // Phase 1 shipped content priced above its own gate twice. Same check here.
    const r = runPhase2('active');
    expect(r.streams).toBe(STREAMS.length);
    expect(r.tradecraft).toBeGreaterThanOrEqual(TRADECRAFT.length - 1);
  });

  it('is deterministic', () => {
    expect(runPhase2('active').minutes).toBeCloseTo(runPhase2('active').minutes, 10);
  });
});

/**
 * Every coverage requirement must be PRODUCIBLE EARLY.
 *
 * Money's only real source was a 22,000 unlock, so it began roughly 35 minutes after the
 * other three kinds. Because coverage is a minimum, that pinned the headline at 0% for the
 * whole of that stretch: a player 24 minutes in had banked people, structure and evidence and
 * was told, accurately, that he had achieved nothing. He described it as slow as balls, which
 * was the correct review.
 *
 * The simulator had been reporting `binding: money` in every single run since the first one.
 * It was the right signal and I read it as a tuning detail rather than a supply gap, so these
 * assert the structural property directly instead of relying on me to interpret a table.
 */
describe('every coverage requirement has an early source', () => {
  it('gives each intel kind a source among the cheapest streams', () => {
    const cheap = STREAMS.filter((s) => s.unlockCost <= 1_500);
    for (const k of INTEL_KINDS) {
      const sources = cheap.filter((s) => s.yields[k]);
      expect(sources.length, `no cheap source of ${k}`).toBeGreaterThan(0);
    }
  });

  it('never leaves a kind gated behind a late unlock', () => {
    // The specific shape of the bug: a kind whose cheapest source costs more than an early
    // player can plausibly bank.
    for (const k of INTEL_KINDS) {
      const cheapest = Math.min(...STREAMS.filter((s) => s.yields[k]).map((s) => s.unlockCost));
      expect(cheapest, `${k} is gated behind a ${cheapest} unlock`).toBeLessThanOrEqual(1_500);
    }
  });

  it('does not show a flat zero for long', () => {
    const r = runPhase2('active');
    // Some zero is fine — the first intel takes a moment to arrive. Half an hour is not.
    expect(r.minutesAtZero).toBeLessThan(8);
  });

  it('starts every kind moving within the first few minutes', () => {
    const r = runPhase2('active');
    for (const k of INTEL_KINDS) {
      expect(r.firstProgressAt[k], `${k} produced nothing early`).toBeLessThan(10);
    }
  });

  it('names the requirement that is holding coverage back', () => {
    const s = atPhase2();
    for (const k of INTEL_KINDS) s.p.intelByKind[k] = COVERAGE.need[k];
    s.p.intelByKind.money = 0;
    s.p.corroborated = s.p.roster.slice(0, COVERAGE.corroborated).map((r) => r.id);
    expect(deriveP2(s.p, {}).bindingLabel).toBe('money');
  });
});

/**
 * An upgrade must be buyable while the thing it modifies is still happening.
 *
 * Cross-Referencing discounts corroboration by 30% and cost 2,200. That is fine arithmetic -
 * bought at once it saves 4,322 - but corroborating costs 220 x 1.28^n, so no single
 * corroboration exceeds 2,200 until the ELEVENTH of twelve. Buying the cheapest thing on
 * screen is the obvious play, so a playtester drip-spent through the entire roster and
 * finished corroborating before he could afford the discount. The upgrade was never
 * unreachable; it was permanently out-competed by the very thing it discounts.
 *
 * This is the third upgrade in this project to promise something it could not deliver, after
 * two in Phase 1 priced above their own gate. So the property gets a test rather than another
 * round of me checking by eye.
 */
describe('cost-reduction upgrades can actually repay themselves', () => {
  const corrCost = (n: number) =>
    Math.floor(IDENTIFY.costBase * Math.pow(IDENTIFY.costGrowth, n));

  function remainingSpend(from: number): number {
    let t = 0;
    for (let i = from; i < COVERAGE.corroborated; i++) t += corrCost(i);
    return t;
  }

  it('Cross-Referencing repays its cost from every purchase point', () => {
    const xref = TRADECRAFT.find((t) => t.id === 't.notes')!;
    for (let n = 0; n < COVERAGE.corroborated; n++) {
      const saved = remainingSpend(n) * (xref.identifyDiscount ?? 0);
      expect(saved, `buying it with ${COVERAGE.corroborated - n} slips left loses intel`)
        .toBeGreaterThan(xref.cost);
    }
  });

  it('prices it below a mid-run corroboration, so it can be banked while most remain', () => {
    // The affordability half of the trap: if it costs more than the corroborations competing
    // with it, a player spending as he goes never accumulates it.
    const xref = TRADECRAFT.find((t) => t.id === 't.notes')!;
    const half = Math.floor(COVERAGE.corroborated / 2);
    expect(xref.cost).toBeLessThan(corrCost(half + 1));
  });

  it('leaves the total corroboration bill large enough for a discount to matter', () => {
    const xref = TRADECRAFT.find((t) => t.id === 't.notes')!;
    expect(remainingSpend(0) * (xref.identifyDiscount ?? 0)).toBeGreaterThan(xref.cost * 2);
  });
});

/**
 * THE SOFT-LOCK.
 *
 * Phase 1's gate asks for 8 roster entries. Phase 2 asks for 12 CORROBORATED, drawn only from
 * the roster. So a player who finished Phase 1 at its gate entered a Phase 2 whose coverage
 * could never exceed 8/12 — uncompletable, permanently, with no feedback saying so.
 *
 * It survived every measurement because all three of my harnesses agreed with each other and
 * all three were wrong: the development shortcut pads the roster to 12, the test helper above
 * builds 12, and the simulator seeded 12. Nothing simulated the WORST LEGAL ARRIVAL.
 *
 * The fix is that the shortfall is found on the cameras, which also gives The Camera Bank the
 * one thing it lacked — a job no other stream can do. It was the worst stream by intel per
 * attention point and therefore correct to ignore.
 */
describe('arriving with the minimum roster is not a dead end', () => {
  it('phase 1 lets you through with fewer entries than phase 2 requires', () => {
    // The precondition for the bug. Keeping it asserted means closing the gap by RAISING the
    // phase 1 gate would also be noticed, rather than silently making this test vacuous.
    expect(PHASE1_COMPLETION.rosterEntries).toBeLessThan(COVERAGE.corroborated);
  });

  it('completes from the worst legal arrival', () => {
    // The simulator now seeds PHASE1_COMPLETION.rosterEntries, not 12.
    const r = runPhase2('active');
    expect(r.completed).toBe(true);
    expect(r.corroborated).toBe(COVERAGE.corroborated);
  });

  it('turns up new faces while the cameras are watched', () => {
    const s = atPhase2(8);
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    const before = s.p.roster.length;
    for (let i = 0; i < Math.ceil(400 / DT); i++) tick(s, DT);
    expect(s.p.roster.length).toBeGreaterThan(before);
    expect(s.p.roster.some((r) => r.fromCamera)).toBe(true);
  });

  it('turns up nobody when the cameras are not watched', () => {
    // The whole point: this is the Camera Bank's job, not a passive trickle.
    const s = atPhase2(8);
    clearAttention(s);
    const before = s.p.roster.length;
    for (let i = 0; i < Math.ceil(400 / DT); i++) tick(s, DT);
    expect(s.p.roster.length).toBe(before);
  });

  it('turns up nobody while the cameras are dark', () => {
    const s = atPhase2(8);
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    s.t.burnedUntil.cctv = 999;
    const before = s.p.roster.length;
    for (let i = 0; i < Math.ceil(400 / DT); i++) tick(s, DT);
    expect(s.p.roster.length).toBe(before);
  });

  it('never corroborates past the requirement', () => {
    // Uncapped, this was a money pit: costs grow at 1.28^n and the roster can now reach 26,
    // so the simulator corroborated all 26 and added two hours to the phase.
    const s = atPhase2(26);
    s.p.intel = 1e12;
    for (let i = 0; i < 40; i++) corroborateNext(s);
    expect(s.p.corroborated.length).toBe(COVERAGE.corroborated);
  });
});
