/**
 * Balance regression gate.
 *
 * This is the test the old build needed most. Its balance was hand-tuned across seven
 * revisions with no automated check, so the documented design and the shipped
 * numbers drifted apart in 34 of 40 parameters and nobody noticed.
 *
 * These tests fail the build when the economy's SHAPE changes, not merely when a
 * number changes. A coefficient edit that quietly turns a 35-minute phase into a
 * 4-minute one now breaks CI.
 */

import { describe, it, expect } from 'vitest';
import { simulate } from '../tools/simulate';
import { derive, costOf, costOfN, maxAffordable, effectiveOwned } from '../src/engine/derive';
import { freshState } from '../src/engine/state';
import { GENERATORS, PHASE1_TARGET_MINUTES, PHASE1_GATE } from '../src/data/balance';
import { UPGRADES } from '../src/data/upgrades';

describe('phase 1 duration', () => {
  it('the active archetype finishes inside the target window', () => {
    const r = simulate('active');
    expect(r.completed).toBe(true);
    expect(r.minutesToGate).toBeGreaterThanOrEqual(PHASE1_TARGET_MINUTES.min);
    expect(r.minutesToGate).toBeLessThanOrEqual(PHASE1_TARGET_MINUTES.max);
  });

  /**
   * Archetype ordering must be monotonic. If a more attentive player is ever SLOWER,
   * some incentive is inverted — which is a design bug that is otherwise very hard to
   * notice by playing.
   */
  it('more attention is never slower', () => {
    const optimal = simulate('optimal');
    const active = simulate('active');
    const casual = simulate('casual');

    expect(optimal.minutesToGate).toBeLessThanOrEqual(active.minutesToGate);
    expect(active.minutesToGate).toBeLessThanOrEqual(casual.minutesToGate);
  });

  it('a barely-attentive player still finishes eventually', () => {
    // An idle game that pays a low-attention player nothing is not an idle game.
    const idle = simulate('idle');
    expect(idle.completed).toBe(true);
  });

  it('is deterministic — the same archetype twice gives the same answer', () => {
    // A balance tool that returns a different number each run cannot gate a build.
    const a = simulate('active');
    const b = simulate('active');
    expect(a.minutesToGate).toBeCloseTo(b.minutesToGate, 10);
    expect(a.totalStalls).toBe(b.totalStalls);
  });

  it('does not leave the player permanently broken', () => {
    // Some time at zero composure is the intended cost of running hot. Most of the
    // phase spent there would mean the drain has outrun every counter.
    const r = simulate('active');
    expect(r.brokenMinutes).toBeLessThan(r.minutesToGate * 0.25);
  });
});

describe('content reachability', () => {
  it('every generator tier unlocks before the phase gate', () => {
    // The first tuning pass shipped two tiers whose unlock threshold sat ABOVE the
    // gate, so they could never appear. This is that bug, caught mechanically.
    for (const g of GENERATORS) {
      expect(g.unlocksAt).toBeLessThan(PHASE1_GATE);
    }
  });

  it('no upgrade costs more than the phase gate', () => {
    for (const u of UPGRADES) {
      expect(u.cost).toBeLessThanOrEqual(PHASE1_GATE);
    }
  });

  it('every upgrade prerequisite exists', () => {
    const ids = new Set(UPGRADES.map((u) => u.id));
    for (const u of UPGRADES) {
      for (const req of u.requires ?? []) expect(ids.has(req)).toBe(true);
      for (const ex of u.excludes ?? []) expect(ids.has(ex)).toBe(true);
    }
  });

  it('mutual exclusions are symmetric', () => {
    // A one-sided exclusion means the branch can be bypassed by buying in one order.
    const byId = new Map(UPGRADES.map((u) => [u.id, u]));
    for (const u of UPGRADES) {
      for (const ex of u.excludes ?? []) {
        expect(byId.get(ex)?.excludes ?? []).toContain(u.id);
      }
    }
  });

  it('the active player reaches most of the upgrade tree', () => {
    const r = simulate('active');
    expect(r.upgradesBought).toBeGreaterThanOrEqual(Math.floor(UPGRADES.length * 0.5));
  });
});

describe('cost and production maths', () => {
  it('buying N at once matches buying one at a time', () => {
    // The closed form is an optimisation; if it disagrees with the loop it is a
    // silent overcharge or a free lunch.
    const id = GENERATORS[0].id;
    for (const [owned, n] of [[0, 1], [0, 10], [7, 5], [30, 12]] as const) {
      let iterative = 0;
      for (let i = 0; i < n; i++) iterative += costOf(id, owned + i);
      expect(costOfN(id, owned, n)).toBeCloseTo(iterative, 4);
    }
  });

  it('maxAffordable never overspends', () => {
    const id = GENERATORS[1].id;
    for (const budget of [0, 100, 5_000, 250_000, 9_000_000]) {
      const n = maxAffordable(id, 3, budget);
      expect(costOfN(id, 3, n)).toBeLessThanOrEqual(budget + 1e-6);
      // ...and is genuinely maximal: one more must not be affordable.
      if (n > 0) expect(costOfN(id, 3, n + 1)).toBeGreaterThan(budget);
    }
  });

  it('the softcap dampens but never reverses', () => {
    const cap = 20;
    let previous = 0;
    for (let owned = 0; owned <= 200; owned += 5) {
      const eff = effectiveOwned(owned, cap);
      // Monotonic: buying more must never produce less. A softcap that reverses
      // punishes the player for playing.
      expect(eff).toBeGreaterThanOrEqual(previous);
      // ...and past the cap it must be strictly less than linear.
      if (owned > cap) expect(eff).toBeLessThan(owned);
      previous = eff;
    }
  });

  it('produces nothing at all from a fresh state', () => {
    const d = derive(freshState());
    expect(d.hps).toBe(0);
    expect(d.globalMultiplier).toBe(1);
    // The first click has to be worth something, or there is no way to start.
    expect(d.stallValue).toBeGreaterThan(0);
  });

  it('multiplier budget stays inside its decade allowance', () => {
    // Research 07 §4.3: budget multipliers in log space. Phase 1's allowance is 6
    // decades TOTAL including base accumulation, so the multiplier chain alone must
    // stay well under that. The first build blew this by ~1e5 and the phase
    // collapsed to two minutes.
    const p = freshState();
    p.upgrades = UPGRADES.map((u) => u.id);
    p.milestones = ['p1.contact', 'p1.remote', 'p1.screenshare', 'p1.quota', 'p1.persistent', 'p1.switchboard'];
    const decades = Math.log10(derive(p).globalMultiplier);
    expect(decades).toBeLessThan(3);
  });
});
