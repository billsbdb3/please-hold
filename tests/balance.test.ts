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
import { simulate, type Archetype, type SimResult } from '../tools/simulate';
import {
  derive, costOf, costOfN, maxAffordable, effectiveOwned, notesFor, maxComposure,
} from '../src/engine/derive';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import {
  tick, stall, redial, canRedial, buyDossier, catchEvent,
  takeBreath, canTakeBreath, switchPersona, availablePersonas,
} from '../src/engine/sim';
import { DT } from '../src/engine/loop';
import {
  GENERATORS, PHASE1_TARGET_MINUTES, PHASE1_GATE, DOSSIER, REDIAL, COMPOSURE,
  PERSONAS, PERSONA_SWITCH_COST, RAGE,
} from '../src/data/balance';
import { UPGRADES } from '../src/data/upgrades';
import type { GameState } from '../src/engine/types';

/**
 * Memoised simulation results.
 *
 * The suite asked for ~20 full phase simulations to answer questions about only four
 * distinct runs, which made the balance file the slowest thing in CI (20.9s on a GitHub
 * runner against 8.8s locally) and pushed the four-archetype dead-content test past
 * vitest's default 5s timeout — a failure that had nothing to do with the assertion.
 *
 * Caching is sound precisely because `run()` is deterministic: no Math.random, no wall
 * clock, fixed timestep. There is a test below that proves it, and that test
 * deliberately calls the RAW `simulate` twice, because a memoised version of it would be
 * vacuously true.
 */
const simCache = new Map<Archetype, SimResult>();
function sim(a: Archetype): SimResult {
  const hit = simCache.get(a);
  if (hit) return hit;
  const result = simulate(a);
  simCache.set(a, result);
  return result;
}

describe('phase 1 duration', () => {
  it('the active archetype finishes inside the target window', () => {
    const r = sim('active');
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
    const optimal = sim('optimal');
    const active = sim('active');
    const casual = sim('casual');

    expect(optimal.minutesToGate).toBeLessThanOrEqual(active.minutesToGate);
    expect(active.minutesToGate).toBeLessThanOrEqual(casual.minutesToGate);
  });

  it('a barely-attentive player still finishes eventually', () => {
    // An idle game that pays a low-attention player nothing is not an idle game.
    const idle = sim('idle');
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
    const active = sim('active');
    const casual = sim('casual');

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
    expect(sim('active').minutesToFirstRedial).toBeLessThan(10);
    expect(sim('casual').minutesToFirstRedial).toBeLessThan(25);
  });

  it('the eligibility threshold is itself a worthwhile first payout', () => {
    // There is deliberately NO minimum-payout floor: a floor on a repeatable reset is
    // farmable, which is exactly how the original became a Notes fountain. Instead the
    // threshold sits where the formula already pays properly, so the gate IS the reward.
    const p = freshState();
    p.holdTimeLifetime = REDIAL.minLifetimeToRedial;
    expect(notesFor(p)).toBeGreaterThanOrEqual(3);
  });

  it('hammering the redial button pays nothing the second time', () => {
    // THE EXPLOIT REGRESSION TEST. The payout used to key off bestCallLifetime, a running
    // max that never resets, and granted an absolute amount rather than a difference - so
    // hanging up twice in a row paid twice for one call's progress.
    const p = freshState();
    p.holdTimeLifetime = 5_000_000;
    p.holdTime = 5_000_000;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };

    const first = redial(s);
    expect(first).toBeGreaterThan(0);

    // Immediately again, having wasted no new time.
    s.d = derive(p);
    expect(canRedial(s)).toBe(false);
    expect(redial(s)).toBe(0);
    expect(p.notes).toBe(first);
  });

  it('the dossier is paced to complete near the end of the phase, not early', () => {
    // At one point the tree cost 577 against ~1,957 Notes earned, so it finished around
    // the one-third mark and the prestige currency stopped meaning anything.
    const totalCost = DOSSIER.reduce((sum, d) => sum + d.cost, 0);
    const earned = sim('active').notesLifetime;
    expect(earned).toBeGreaterThan(totalCost * 0.8);
    expect(earned).toBeLessThan(totalCost * 2.5);
  });
});

describe('phase 1 pacing across archetypes', () => {
  it('is deterministic — the same archetype twice gives the same answer', () => {
    // A balance tool that returns a different number each run cannot gate a build.
    // Deliberately the RAW simulate, not the memoised `sim`: comparing a cached result
    // against itself would pass without testing anything.
    const a = simulate('active');
    const b = simulate('active');
    expect(a.minutesToGate).toBeCloseTo(b.minutesToGate, 10);
    expect(a.totalStalls).toBe(b.totalStalls);
  });

  it('does not leave the player permanently broken', () => {
    // Some time at zero composure is the intended cost of running hot. Most of the
    // phase spent there would mean the drain has outrun every counter.
    const r = sim('active');
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
    const r = sim('active');
    expect(r.upgradesBought).toBeGreaterThanOrEqual(6);
  });

  it('no generator tier is dead content', () => {
    // The simulator once showed three tiers that NO archetype ever bought a single
    // unit of: they were unlocked but permanently unaffordable, because generator cost
    // comes out of banked Hold Time and a redial zeroes it. They were moved to
    // PHASE2_RESERVED_GENERATORS. This test is what stops that shipping again.
    const runs = (['optimal', 'active', 'casual', 'idle'] as const).map((a) => sim(a));
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
    const r = sim('active');
    expect(r.longestStallMinutes).toBeLessThan(5);
  });
});

describe('redial (the soft reset)', () => {
  it('an active player redials repeatedly and fills the dossier', () => {
    const r = sim('active');
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
    a.holdTimeLifetime = 10_000_000;
    const b = freshState();
    b.holdTimeLifetime = 40_000_000;
    // sqrt: 4x the depth for 2x the payout.
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

describe('losing the call', () => {
  /**
   * THE SOFT-LOCK REGRESSION TEST.
   *
   * `loseTheCall` set a boolean `callEnded` that NOTHING ever cleared, while the Stall
   * button was disabled on it. So the first time composure bottomed out, the game's only
   * verb went dead permanently — and a redial did not help, because redial never touched
   * the field either. The player was left with a greyed-out button and no way back.
   *
   * The field is now a countdown, which cannot get stuck on.
   */
  function driveToCallDrop(s: GameState): void {
    // Long enough on the line that the drain is running, then bottom out composure.
    s.p.activeElapsed = 3_000;
    s.p.composure = 1;
    for (let i = 0; i < Math.ceil((COMPOSURE.criticalGraceSeconds + 2) / DT); i++) {
      tick(s, DT);
    }
  }

  it('drops the call once composure stays critical past the grace period', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    driveToCallDrop(s);
    expect(s.t.callEndedFor).toBeGreaterThan(0);
  });

  it('the player can still stall immediately after the call drops', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    driveToCallDrop(s);

    const before = p.holdTimeCareer;
    const gained = stall(s, 10_000);
    expect(gained).toBeGreaterThan(0);
    expect(p.holdTimeCareer).toBeGreaterThan(before);
  });

  it('the drop notice clears itself', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    driveToCallDrop(s);
    expect(s.t.callEndedFor).toBeGreaterThan(0);

    // Composure was restored by the drop, so this does not immediately re-trigger.
    for (let i = 0; i < Math.ceil((COMPOSURE.dropNoticeSeconds + 1) / DT); i++) {
      tick(s, DT);
    }
    expect(s.t.callEndedFor).toBe(0);
  });

  it('restores composure rather than leaving the player at zero', () => {
    // Dropping the call into an unrecoverable state would just drop it again a second
    // later, forever.
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    driveToCallDrop(s);
    expect(s.p.composure).toBeGreaterThan(maxComposure(s.p) * 0.4);
  });

  it('keeps every upgrade, generator and the career total', () => {
    const p = freshState();
    p.generators.confusion = 20;
    p.upgrades = ['u.notepad', 'u.landline'];
    p.holdTimeCareer = 5_000_000;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    driveToCallDrop(s);

    expect(p.generators.confusion).toBe(20);
    expect(p.upgrades).toEqual(['u.notepad', 'u.landline']);
    expect(p.holdTimeCareer).toBeGreaterThanOrEqual(5_000_000);
  });
});

describe('taking a breath (the counter to composure drain)', () => {
  it('spends Hold Time and restores composure', () => {
    const p = freshState();
    p.composure = 20;
    p.holdTime = 10_000;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };

    const before = p.holdTime;
    expect(takeBreath(s)).toBe(true);
    expect(p.composure).toBeGreaterThan(20);
    expect(p.holdTime).toBeLessThan(before);
  });

  it('is refused when it cannot be afforded', () => {
    const p = freshState();
    p.composure = 20;
    p.holdTime = 0;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    expect(canTakeBreath(s)).toBe(false);
    expect(takeBreath(s)).toBe(false);
  });

  it('is refused at full composure, so it cannot be used to burn currency', () => {
    const p = freshState();
    p.holdTime = 10_000;
    p.composure = maxComposure(p);
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    expect(canTakeBreath(s)).toBe(false);
  });

  it('cannot be spammed', () => {
    const p = freshState();
    p.composure = 10;
    p.holdTime = 1_000_000;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    expect(takeBreath(s)).toBe(true);
    expect(takeBreath(s)).toBe(false);

    for (let i = 0; i < Math.ceil((COMPOSURE.breath.cooldownSeconds + 1) / DT); i++) {
      tick(s, DT);
    }
    s.p.composure = 10;
    expect(canTakeBreath(s)).toBe(true);
  });

  it('never pushes composure above the maximum', () => {
    const p = freshState();
    p.holdTime = 1_000_000;
    p.composure = maxComposure(p) - 1;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    takeBreath(s);
    expect(p.composure).toBeLessThanOrEqual(maxComposure(p));
  });
});

describe('personas (the voice changer)', () => {
  it('starts on Doris and offers only unlocked voices', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    expect(p.persona).toBe('doris');
    expect(availablePersonas(s).map((x) => x.id)).toEqual(['doris']);

    p.holdTimeCareer = 500_000;
    expect(availablePersonas(s).map((x) => x.id)).toContain('teenager');
  });

  it('switching costs composure and applies the new multipliers', () => {
    const p = freshState();
    p.holdTimeCareer = 50_000_000;
    p.generators.confusion = 10;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };

    const composureBefore = p.composure;
    const stallBefore = s.d.stallValue;
    expect(switchPersona(s, 'pemberton')).toBe(true);

    expect(p.persona).toBe('pemberton');
    expect(p.composure).toBe(composureBefore - PERSONA_SWITCH_COST);
    // Mr Pemberton reads reference numbers back digit by digit, so he wastes more time.
    expect(s.d.stallValue).toBeGreaterThan(stallBefore);
  });

  it('refuses a locked voice, the current voice, and a switch you cannot afford', () => {
    const p = freshState();
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    expect(switchPersona(s, 'sincere')).toBe(false); // locked
    expect(switchPersona(s, 'doris')).toBe(false);   // already live
    expect(switchPersona(s, 'nope')).toBe(false);    // not a voice

    p.holdTimeCareer = 50_000_000;
    p.composure = 1;
    expect(switchPersona(s, 'pemberton')).toBe(false); // cannot pay
  });

  it('an unknown persona in a save does not leave the player voiceless', () => {
    // A hand-edited save, or one written by a newer build, must not crash derivation.
    const p = freshState();
    p.persona = 'a-voice-that-does-not-exist';
    expect(() => derive(p)).not.toThrow();
    expect(derive(p).persona.id).toBe('doris');
  });

  it('no voice is dead on arrival', () => {
    /**
     * A voice is dead content if another voice that is available NO LATER beats it on every
     * axis — then there is never a moment where picking it is right.
     *
     * The unlock comparison is the whole point. A late voice being strictly better than the
     * starting one is ordinary progression (A Very Sincere Man does supersede Doris, at 25M
     * career). A voice dominated by something you already had is a wasted slot.
     */
    for (const a of PERSONAS) {
      const dominator = PERSONAS.find(
        (b) =>
          b.id !== a.id &&
          b.unlocksAt <= a.unlocksAt &&
          b.stallMultiplier >= a.stallMultiplier &&
          b.rageMultiplier >= a.rageMultiplier &&
          b.rapportMultiplier >= a.rapportMultiplier &&
          b.drainMultiplier <= a.drainMultiplier,
      );
      expect(
        dominator?.name,
        `${a.name} is dominated on every axis by ${dominator?.name}, which unlocks no later`,
      ).toBeUndefined();
    }
  });

  it('every voice leads on something among the voices available when it unlocks', () => {
    /**
     * The positive form of the dominance test, and the comparison has to be against the
     * voices you ACTUALLY HAVE at that point. A global "best at something" test is wrong:
     * Nigel leads no axis across all six, but at 40K career he is the only alternative to
     * Doris and beats her on both stall and temper, which is exactly his job.
     */
    for (const a of PERSONAS) {
      const availableThen = PERSONAS.filter((b) => b.unlocksAt <= a.unlocksAt);
      const leads =
        a.stallMultiplier === Math.max(...availableThen.map((x) => x.stallMultiplier)) ||
        a.rageMultiplier === Math.max(...availableThen.map((x) => x.rageMultiplier)) ||
        a.rapportMultiplier === Math.max(...availableThen.map((x) => x.rapportMultiplier)) ||
        a.drainMultiplier === Math.min(...availableThen.map((x) => x.drainMultiplier));
      expect(leads, `${a.name} leads on no axis at the point it unlocks`).toBe(true);
    }
  });
});

describe('rage (his temper)', () => {
  it('builds from stalling and is amplified by the voice', () => {
    const quiet = freshState();
    const loud = freshState();
    loud.holdTimeCareer = 50_000_000;
    loud.persona = 'deborah';

    const q: GameState = { p: quiet, d: derive(quiet), t: freshTransient(0) };
    const l: GameState = { p: loud, d: derive(loud), t: freshTransient(0) };

    stall(q, 1000);
    stall(l, 1000);
    // Deborah wants a purchase order number. Doris is merely confused.
    expect(loud.rage).toBeGreaterThan(quiet.rage);
  });

  it('boils over at maximum, granting a page, a burst and a transcript line', () => {
    const p = freshState();
    p.rage = RAGE.max;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    const logBefore = s.t.log.length;

    tick(s, DT);

    expect(p.boilOvers).toBe(1);
    expect(p.notes).toBe(RAGE.boilOverNotes);
    expect(p.rage).toBeCloseTo(RAGE.resetTo, 5);
    expect(s.t.burstFor).toBeGreaterThan(0);
    expect(s.t.log.length).toBeGreaterThan(logBefore);
  });

  it('raises composure drain, so you cannot pin it at maximum and walk away', () => {
    const calm = freshState();
    calm.activeElapsed = 3_000;
    const furious = freshState();
    furious.activeElapsed = 3_000;
    furious.rage = RAGE.max;

    expect(derive(furious).composureDrain).toBeGreaterThan(derive(calm).composureDrain);
  });

  it('does not decay while the player is away', () => {
    // A man left on hold stews. This also keeps the boil-over reachable for a
    // low-attention player, who otherwise never saw the payoff at all.
    const p = freshState();
    p.rage = 50;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    s.t.idle = true;
    s.t.sinceStall = 999;
    for (let i = 0; i < Math.ceil(30 / DT); i++) tick(s, DT);
    expect(p.rage).toBeGreaterThanOrEqual(50);
  });

  it('mostly carries across a redial', () => {
    // Zeroing it silently suppressed the whole mechanic for frequent redialers.
    const p = freshState();
    p.rage = 80;
    p.holdTime = 5_000_000;
    p.holdTimeLifetime = 5_000_000;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    redial(s);
    expect(p.rage).toBeCloseTo(80 * RAGE.carriedAcrossRedial, 5);
  });

  it('never exceeds its maximum', () => {
    const p = freshState();
    p.holdTimeCareer = 50_000_000;
    p.persona = 'deborah';
    p.rage = RAGE.max - 0.01;
    const s: GameState = { p, d: derive(p), t: freshTransient(0) };
    for (let i = 0; i < 50; i++) stall(s, 1000 + i * 200);
    expect(p.rage).toBeLessThanOrEqual(RAGE.max);
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

describe('upgrade labels tell the truth', () => {
  /**
   * Five upgrades shipped claiming multipliers their code did not apply (The Landline said
   * x2 and granted x1.5), and one - u.sympathetic - advertised "Rapport gain x2" with no
   * such field existing at all. The balance simulator reads the FIELDS and never the
   * prose, so no numeric test could ever have caught it; a player reading a label against
   * a counter did.
   *
   * This parses the human-readable effect string and asserts every factor it names is
   * actually applied somewhere in the definition.
   */
  it('every factor named in an effect string is applied by its fields', () => {
    const offenders: string[] = [];
    for (const u of UPGRADES) {
      const claimed = [...u.effect.matchAll(/[×x]\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      if (claimed.length === 0) continue;
      const applied: number[] = [];
      if (u.globalMultiplier) applied.push(u.globalMultiplier);
      if (u.stallMultiplier) applied.push(u.stallMultiplier);
      if (u.rapportMultiplier) applied.push(u.rapportMultiplier);
      for (const v of Object.values(u.generatorMultipliers ?? {})) {
        if (typeof v === 'number') applied.push(v);
      }
      for (const c of claimed) {
        if (!applied.includes(c)) {
          offenders.push(`${u.id}: effect claims x${c}, fields apply [${applied.join(', ')}]`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('a stated percentage drain reduction matches its multiplier', () => {
    for (const u of UPGRADES) {
      const m = u.effect.match(/drain\s*[-−]\s*(\d+)%/);
      if (!m || !u.composureDrainMultiplier) continue;
      expect(u.composureDrainMultiplier).toBeCloseTo(1 - Number(m[1]) / 100, 5);
    }
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
