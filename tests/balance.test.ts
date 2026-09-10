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
import {
  derive, costOf, costOfN, maxAffordable, effectiveOwned, notesFor, maxComposure,
} from '../src/engine/derive';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { tick, redial, canRedial, buyDossier, catchEvent } from '../src/engine/sim';
import { DT } from '../src/engine/loop';
import {
  GENERATORS, PHASE1_TARGET_MINUTES, PHASE1_GATE, DOSSIER, REDIAL,
} from '../src/data/balance';
import { UPGRADES } from '../src/data/upgrades';
import type { GameState } from '../src/engine/types';

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

  /**
   * Casual play must stay within a sane multiple of engaged play.
   *
   * This measured 2.9x wall-clock (282 min against 102) before the pacing pass and had
   * no test, so nothing would have caught it drifting further. The fix that mattered
   * was automation — a low-attention player loses almost nothing to being absent, since
   * generators run while idle, and almost everything to not BUYING while absent.
   *
   * Present-minutes is the fairer of the two comparisons: wall-clock counts time the
   * casual player was not even at the keyboard.
   */
  it('casual play stays within a reasonable multiple of active play', () => {
    const active = simulate('active');
    const casual = simulate('casual');

    expect(casual.completed).toBe(true);
    // Felt duration: time actually spent at the keyboard.
    expect(casual.presentMinutes / active.presentMinutes).toBeLessThan(2.2);
    // Wall-clock, which legitimately includes absence.
    expect(casual.minutesToGate / active.minutesToGate).toBeLessThan(3);
  });

  /**
   * The redial loop must be discoverable early, for EVERYONE.
   *
   * `minLifetimeToRedial` was an absolute 1e6, which made the gate regressive: engaged
   * players met the loop at minute 14, casual at 34, barely-attentive not until 103 —
   * so the slower you played, the longer you were locked out of the one mechanic that
   * makes playing faster. "Prestige too late" is a named top-five killer of the genre.
   */
  it('the redial loop is reachable early by engaged and casual players alike', () => {
    expect(simulate('active').minutesToFirstRedial).toBeLessThan(10);
    expect(simulate('casual').minutesToFirstRedial).toBeLessThan(25);
  });

  it('an eligible redial always pays at least one page', () => {
    // Unlocking a mechanic that then visibly does nothing is worse than leaving it
    // locked, so the payout is floored.
    const p = freshState();
    p.bestCallLifetime = REDIAL.minLifetimeToRedial;
    expect(notesFor(p)).toBeGreaterThanOrEqual(1);
  });

  it('the dossier is paced to complete near the end of the phase, not early', () => {
    // At one point the tree cost 577 against ~1,957 Notes earned, so it finished around
    // the one-third mark and the prestige currency stopped meaning anything.
    const totalCost = DOSSIER.reduce((sum, d) => sum + d.cost, 0);
    const earned = simulate('active').notesLifetime;
    expect(earned).toBeGreaterThan(totalCost * 0.8);
    expect(earned).toBeLessThan(totalCost * 2.5);
  });
});

describe('phase 1 pacing across archetypes', () => {
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

  it('the multiplier budget including the dossier stays bounded', () => {
    // The dossier adds a second, permanent multiplier chain on top of the in-call
    // one. Budgeting only the in-call chain would miss it entirely.
    const p = freshState();
    p.upgrades = UPGRADES.map((u) => u.id);
    p.dossier = DOSSIER.map((d) => d.id);
    p.milestones = [
      'p1.contact', 'p1.remote', 'p1.screenshare',
      'p1.quota', 'p1.persistent', 'p1.switchboard',
    ];
    expect(Math.log10(derive(p).globalMultiplier)).toBeLessThan(6);
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
    expect(r.upgradesBought).toBeGreaterThanOrEqual(6);
  });

  it('no generator tier is dead content', () => {
    // The simulator once showed three tiers that NO archetype ever bought a single
    // unit of: they were unlocked but permanently unaffordable, because generator cost
    // comes out of banked Hold Time and a redial zeroes it. They were moved to
    // PHASE2_RESERVED_GENERATORS. This test is what stops that shipping again.
    const runs = (['optimal', 'active', 'casual', 'idle'] as const).map((a) => simulate(a));
    for (const g of GENERATORS) {
      const peak = Math.max(...runs.map((r) => r.peakOwned[g.id] ?? 0));
      expect(peak, `${g.name} was never bought by any archetype`).toBeGreaterThan(0);
    }
  });

  it('no dead time: an active player always has something to buy', () => {
    // The dead-time detector. The pre-expansion build flatlined at minute 45 with
    // nothing affordable for the remaining hour, which the research names as the
    // single most common way an incremental dies. Five minutes is a generous ceiling
    // on the longest gap between purchases.
    const r = simulate('active');
    expect(r.longestStallMinutes).toBeLessThan(5);
  });
});

describe('redial (the soft reset)', () => {
  it('an active player redials repeatedly and fills the dossier', () => {
    const r = simulate('active');
    expect(r.redials).toBeGreaterThan(5);
    expect(r.dossierBought).toBeGreaterThan(6);
  });

  it('redialling is refused before the minimum has been reached', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    expect(canRedial(s)).toBe(false);
    expect(redial(s)).toBe(0);
    expect(p.redials).toBe(0);
  });

  it('a redial banks Notes, clears the call, and keeps the career total', () => {
    const p = freshState();
    p.holdTime = 500_000;
    p.holdTimeLifetime = 40_000_000;
    p.holdTimeCareer = 40_000_000;
    p.bestCallLifetime = 40_000_000;
    p.generators.confusion = 40;
    p.upgrades = ['u.notepad', 'u.landline'];
    p.milestones = ['p1.contact', 'p1.remote'];
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };

    const gained = redial(s);

    expect(gained).toBeGreaterThan(0);
    expect(p.notes).toBe(gained);
    expect(p.redials).toBe(1);
    // The call is gone...
    expect(p.holdTime).toBe(0);
    expect(p.holdTimeLifetime).toBe(0);
    expect(p.upgrades).toEqual([]);
    expect(p.generators.confusion).toBe(0);
    // ...but the career and the narrative are not. You do not re-watch the beats.
    expect(p.holdTimeCareer).toBe(40_000_000);
    expect(p.milestones).toEqual(['p1.contact', 'p1.remote']);
    expect(p.bestCallLifetime).toBe(40_000_000);
  });

  it('Notes use a root, so doubling the payout costs 4x the progress', () => {
    const a = freshState();
    a.bestCallLifetime = 100_000_000;
    const b = freshState();
    b.bestCallLifetime = 400_000_000;
    // sqrt: 4x the input for 2x the output.
    expect(notesFor(b) / notesFor(a)).toBeCloseTo(2, 1);
  });

  it('dossier purchases persist across a redial and grant a head start', () => {
    const p = freshState();
    p.notes = 100;
    p.bestCallLifetime = 50_000_000;
    p.holdTimeCareer = 50_000_000;
    p.holdTimeLifetime = 50_000_000;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };

    expect(buyDossier(s, 'd.callback')).toBe(true);
    expect(buyDossier(s, 'd.warmup')).toBe(true);

    redial(s);

    // Survived the reset...
    expect(p.dossier).toContain('d.callback');
    expect(p.dossier).toContain('d.warmup');
    // ...and the head-start is applied to the new call.
    expect(p.rapport).toBeGreaterThanOrEqual(15);
    expect(p.generators.confusion).toBe(10);
  });

  it('a dossier upgrade cannot be bought twice or without its prerequisite', () => {
    const p = freshState();
    p.notes = 10_000;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    expect(buyDossier(s, 'd.rehearsed')).toBe(false); // needs d.script
    expect(buyDossier(s, 'd.script')).toBe(true);
    expect(buyDossier(s, 'd.script')).toBe(false); // already owned
    expect(buyDossier(s, 'd.rehearsed')).toBe(true);
  });

  it('every dossier prerequisite exists', () => {
    const ids = new Set(DOSSIER.map((d) => d.id));
    for (const dd of DOSSIER) {
      for (const req of dd.requires ?? []) expect(ids.has(req)).toBe(true);
    }
  });

  it('composure bands stay reachable when the dossier raises the maximum', () => {
    // With absolute thresholds, a player who bought +65 max composure could never
    // reach the "Breaking" band again, silently deleting the tradeoff they had
    // invested in. Bands are proportional for this reason.
    const p = freshState();
    p.dossier = ['d.chair', 'd.composure'];
    const max = maxComposure(p);
    expect(max).toBeGreaterThan(100);
    p.composure = max * 0.05;
    expect(derive(p).band.id).toBe('breaking');
    p.composure = max;
    expect(derive(p).band.id).toBe('steady');
  });
});

describe('The Routine (auto-buy)', () => {
  it('buys nothing until the dossier entry is owned', () => {
    const p = freshState();
    p.holdTime = 10_000;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    for (let i = 0; i < Math.ceil(20 / DT); i++) tick(s, DT);
    expect(p.generators.confusion).toBe(0);
  });

  it('re-buys the cheapest tactic once earned', () => {
    const p = freshState();
    p.holdTime = 10_000;
    p.dossier = ['d.routine'];
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    for (let i = 0; i < Math.ceil(20 / DT); i++) tick(s, DT);
    expect(p.generators.confusion).toBeGreaterThan(0);
  });

  it('never spends more than is banked', () => {
    const p = freshState();
    p.holdTime = 12;
    p.dossier = ['d.routine'];
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    for (let i = 0; i < Math.ceil(60 / DT); i++) tick(s, DT);
    expect(p.holdTime).toBeGreaterThanOrEqual(0);
  });
});

describe('opportunity events', () => {
  it('a window opens, expires, and costs nothing when missed', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    s.t.nextEventIn = 0;
    tick(s, DT);
    expect(s.t.event).not.toBeNull();

    const careerBefore = p.holdTimeCareer;
    // Let it expire untouched.
    for (let i = 0; i < 400; i++) tick(s, DT);
    expect(s.t.eventsMissed).toBeGreaterThan(0);
    // Missing it must not subtract anything. There is no penalty branch by design.
    expect(p.holdTimeCareer).toBeGreaterThanOrEqual(careerBefore);
  });

  it('catching a window grants a timed production burst', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    s.t.nextEventIn = 0;
    tick(s, DT);
    const mult = catchEvent(s);
    expect(mult).toBeGreaterThan(1);
    expect(s.t.burstMultiplier).toBe(mult);
    expect(s.t.burstFor).toBeGreaterThan(0);
    expect(s.t.event).toBeNull();

    // The burst decays and then clears itself.
    for (let i = 0; i < Math.ceil(30 / DT); i++) tick(s, DT);
    expect(s.t.burstFor).toBe(0);
    expect(s.t.burstMultiplier).toBe(1);
  });

  it('catching nothing is harmless', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    expect(catchEvent(s)).toBe(0);
  });

  it('windows do not open while the player is away', () => {
    // Firing an event into an empty room would only manufacture a miss.
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    s.t.idle = true;
    s.t.nextEventIn = 0;
    for (let i = 0; i < 100; i++) tick(s, DT);
    expect(s.t.event).toBeNull();
    expect(s.t.eventsMissed).toBe(0);
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
    // Ceiling raised from 3 when the tree grew from 16 to 30 upgrades. The binding
    // constraint is the measured phase duration above, which sits at 102 min; this is
    // the guard against a runaway chain, and the first build blew it by ~1e5.
    const decades = Math.log10(derive(p).globalMultiplier);
    expect(decades).toBeLessThan(5);
  });
});
