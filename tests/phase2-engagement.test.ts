/**
 * Phase 2's engagement layer: attention fatigue, camera events, and the chain.
 *
 * WHAT THESE TESTS ARE ACTUALLY PROTECTING
 * ----------------------------------------
 * Phase 2 shipped at ~0.13 player decisions per minute against Phase 1's ~1.5, and a playtester
 * called it boring, which it was. This layer raises that density — and the danger in raising it
 * is overshooting into an obligation. The research is unambiguous: an active layer over an idle
 * economy must be a MULTIPLIER ON TOP, with engaged play roughly 1.3-2x faster, never 10x. Cookie
 * Clicker's author removed his missed-cookies counter because it gave players anxiety, and a
 * player rewrote that game's source because its active/idle gap had grown too wide.
 *
 * So the load-bearing test in this file is not that the events work. It is `the neglectful
 * archetype`: a simulated player who never claims an event and never rotates attention must
 * still FINISH, and within a bounded multiple of a player who does everything. If that test ever
 * fails, the layer has stopped being optional and the game has become a job.
 */

import { describe, it, expect } from 'vitest';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { tick } from '../src/engine/sim';
import {
  enterPhase2, assignAttention, clearAttention, unlockStream,
  claimCameraEvent, freshnessOf, deriveP2, burnAStream,
  availableTradecraft, buyTradecraft,
} from '../src/engine/phase2';
import { DT } from '../src/engine/loop';
import { CAMERA_EVENTS, CAMERA_EVENT, CHAIN, FATIGUE, TIER_UNLOCK } from '../src/data/phase2events';
import { STREAMS, PHASE2_TARGET_MINUTES } from '../src/data/phase2';
import { runPhase2 } from '../tools/simulate-phase2';
import type { GameState } from '../src/engine/types';

function atPhase2(roster = 12): GameState {
  const p = freshState();
  for (let i = 0; i < roster; i++) {
    p.roster.push({
      id: `slip.${i}`, handle: `entry ${i}`, realName: null,
      role: 'dialer', recruitedByFalseAd: false, freed: false,
    });
  }
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };
  enterPhase2(s);
  // A pool big enough to actually fill the wall. assignAttention is all-or-nothing, so asking
  // for 4 points against the starting pool of 3 assigns ZERO — which silently made every event
  // test watch nothing at all.
  s.p.attentionBought = 6;
  return s;
}

/** Run until an event is on screen, or give up. */
function runToEvent(s: GameState, maxSeconds = 3000): boolean {
  for (let i = 0; i < Math.ceil(maxSeconds / DT); i++) {
    tick(s, DT);
    if (s.t.liveEvents.length > 0) return true;
  }
  return false;
}

describe('attention fatigue', () => {
  it('goes stale on a stream you keep watching', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    for (let i = 0; i < Math.ceil(60 / DT); i++) tick(s, DT);
    expect(freshnessOf(s.p, 'cctv')).toBeLessThan(1);
  });

  it('recovers on a stream you leave alone', () => {
    const s = atPhase2();
    s.p.freshness.cctv = FATIGUE.floor;
    clearAttention(s);
    for (let i = 0; i < Math.ceil(60 / DT); i++) tick(s, DT);
    expect(freshnessOf(s.p, 'cctv')).toBeGreaterThan(FATIGUE.floor);
  });

  it('never drops below the floor', () => {
    // The floor is what keeps a stale stream WORTH watching. Without it a player who ignores
    // rotation is punished rather than merely out-performed.
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 6);
    for (let i = 0; i < Math.ceil(3000 / DT); i++) tick(s, DT);
    expect(freshnessOf(s.p, 'cctv')).toBeCloseTo(FATIGUE.floor, 5);
  });

  it('actually reduces what a stale stream yields', () => {
    const fresh = atPhase2();
    const stale = atPhase2();
    for (const s of [fresh, stale]) {
      clearAttention(s);
      assignAttention(s, 'cctv', 3);
    }
    stale.p.freshness.cctv = FATIGUE.floor;
    expect(deriveP2(stale.p, {}).totalRate).toBeLessThan(deriveP2(fresh.p, {}).totalRate);
  });

  it('makes rotation beat parking', () => {
    // The point of the whole mechanic: the best allocation drifts, so it has to be revisited.
    // Two streams, same total attention: one parked, one alternated.
    const parked = atPhase2();
    const rotated = atPhase2();
    for (const s of [parked, rotated]) {
      s.p.intel = 1e9;
      unlockStream(s, 'recordings');
      clearAttention(s);
    }
    assignAttention(parked, 'cctv', 4);
    assignAttention(rotated, 'cctv', 4);

    for (let block = 0; block < 8; block++) {
      for (let i = 0; i < Math.ceil(45 / DT); i++) {
        tick(parked, DT);
        tick(rotated, DT);
      }
      clearAttention(rotated);
      assignAttention(rotated, block % 2 === 0 ? 'recordings' : 'cctv', 4);
    }
    expect(rotated.p.intelLifetime).toBeGreaterThan(parked.p.intelLifetime);
  });
});

describe('camera events', () => {
  it('never fire while the cameras are not being watched', () => {
    // This self-gating is what finally gives The Camera Bank a reason to exist: at 1.40 intel
    // per attention point it was the worst stream in the game and correct to ignore.
    const s = atPhase2();
    clearAttention(s);
    expect(runToEvent(s, 2000)).toBe(false);
  });

  it('fire while the cameras are watched', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 4);
    expect(runToEvent(s)).toBe(true);
  });

  it('never fire while the cameras are dark', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 4);
    s.t.burnedUntil.cctv = 99999;
    expect(runToEvent(s, 2000)).toBe(false);
  });

  it('light exactly one feed at a time, on a camera that exists', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 4);
    expect(runToEvent(s)).toBe(true);
    expect(s.t.liveEvents[0]!.camera).toBeGreaterThanOrEqual(0);
    expect(s.t.liveEvents[0]!.camera).toBeLessThan(14);
    expect(s.t.liveEvents[0]!.index).toBeLessThan(CAMERA_EVENTS.length);
  });

  it('give a window long enough not to be a reflex test', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 4);
    runToEvent(s);
    expect(s.t.liveEvents[0]!.window).toBeGreaterThanOrEqual(10);
  });

  it('pay intel when claimed', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 4);
    runToEvent(s);
    const before = s.p.intel;
    expect(claimCameraEvent(s)).toBe(true);
    expect(s.p.intel).toBeGreaterThan(before);
    expect(s.t.liveEvents.length).toBe(0);
  });

  it('refuse a claim when there is nothing lit', () => {
    const s = atPhase2();
    expect(claimCameraEvent(s)).toBe(false);
  });

  it('cost nothing at all when missed', () => {
    // THE contract. A miss must not take anything, and nothing counts misses: Cookie Clicker's
    // author removed his missed-cookies counter because the counter, not the miss, caused the
    // anxiety.
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 4);
    expect(runToEvent(s)).toBe(true);
    const intel = s.p.intel;
    const chain = s.p.chain;
    const wait = s.t.liveEvents[0]!.window + 2;
    for (let i = 0; i < Math.ceil(wait / DT); i++) tick(s, DT);
    expect(s.t.liveEvents.length).toBe(0);
    expect(s.p.intel).toBeGreaterThanOrEqual(intel);
    expect(s.p.chain).toBeLessThanOrEqual(chain + 0.001);
    expect(s.p as unknown as Record<string, unknown>).not.toHaveProperty('eventsMissedOnCamera');
  });

  it('caps a single claim, so one catch is never a windfall', () => {
    const s = atPhase2();
    s.p.chain = CHAIN.max;
    clearAttention(s);
    assignAttention(s, 'cctv', 4);
    runToEvent(s);
    const rate = deriveP2(s.p, s.t.burnedUntil).totalRate;
    const before = s.p.intel;
    claimCameraEvent(s);
    const gained = s.p.intel - before;
    // Allow the flat early-game floor, then hold the seconds-of-production ceiling.
    // Small tolerance: the rate is sampled a tick before the claim recomputes it.
    const ceiling = Math.max(CAMERA_EVENT.payoutFlat, rate * CAMERA_EVENT.payoutSecondsMax) * 1.02 + 1;
    expect(gained).toBeLessThanOrEqual(ceiling);
  });

  it('gates the uncomfortable material behind progress', () => {
    // The human-tier lines carry Twist 2's groundwork, so they must not appear in minute one.
    expect(TIER_UNLOCK.human).toBeGreaterThan(0.4);
    expect(TIER_UNLOCK.mundane).toBe(0);
  });

  it('keeps every line to the house style', () => {
    for (const e of CAMERA_EVENTS) expect(e.line, e.line).not.toContain('!');
  });

  it('has enough lines that repeats are not the experience', () => {
    expect(CAMERA_EVENTS.length).toBeGreaterThanOrEqual(45);
    expect(new Set(CAMERA_EVENTS.map((e) => e.line)).size).toBe(CAMERA_EVENTS.length);
  });

  it('credits the kinds the observation is about', () => {
    for (const e of CAMERA_EVENTS) expect(e.kinds.length).toBeGreaterThan(0);
  });
});

describe('the chain', () => {
  it('builds on a catch and is capped', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 4);
    for (let n = 0; n < 12; n++) {
      if (!runToEvent(s)) break;
      claimCameraEvent(s);
    }
    expect(s.p.chain).toBeGreaterThan(0);
    expect(s.p.chain).toBeLessThanOrEqual(CHAIN.max);
  });

  it('decays rather than breaking, so absence is not punished', () => {
    const s = atPhase2();
    s.p.chain = 4;
    clearAttention(s);
    for (let i = 0; i < Math.ceil(120 / DT); i++) tick(s, DT);
    expect(s.p.chain).toBeLessThan(4);
    expect(s.p.chain).toBeGreaterThan(0);
  });

  it('is reset by a burn, which is the one thing that really costs it', () => {
    const s = atPhase2();
    s.p.chain = 6;
    clearAttention(s);
    assignAttention(s, 'cctv', 2);
    burnAStream(s);
    expect(s.p.chain).toBe(0);
  });

  it('raises every yield while it is running', () => {
    const cold = atPhase2();
    const hot = atPhase2();
    for (const s of [cold, hot]) {
      clearAttention(s);
      assignAttention(s, 'cctv', 3);
    }
    hot.p.chain = CHAIN.max;
    expect(deriveP2(hot.p, {}).totalRate).toBeGreaterThan(deriveP2(cold.p, {}).totalRate);
  });
});

describe('the engagement layer stays OPTIONAL', () => {
  /**
   * The most important test in this file.
   *
   * `neglectful` never claims an event and never rotates attention. If it cannot finish, or
   * finishes far slower than a player doing everything, then this layer is not a bonus — it is
   * the game, and ignoring it is a punishment rather than a slower route.
   */
  it('lets a player who ignores all of it finish', () => {
    const r = runPhase2('neglectful');
    expect(r.completed).toBe(true);
  });

  it('keeps engaged play a modest multiple, not an order of magnitude', () => {
    const engaged = runPhase2('active');
    const ignoring = runPhase2('neglectful');
    const ratio = ignoring.minutes / engaged.minutes;
    // 11-active-play-layers.md: ~1.3-2x. The upper bound is the one that matters; below the
    // range merely means the layer is generous rather than coercive.
    expect(ratio).toBeGreaterThan(1.05);
    expect(ratio).toBeLessThan(2.2);
  });

  it('sells an exit from watching the wall', () => {
    // Every successful incremental eventually retires its own busywork. Without this the optimal
    // late play is to watch the cameras continuously, which is how an optional bonus becomes an
    // obligation.
    const s = atPhase2();
    s.p.intel = 1e9;
    for (let i = 0; i < 6; i++) {
      for (const t of availableTradecraft(s)) buyTradecraft(s, t.id);
    }
    expect(s.p.tradecraft).toContain('t.analyst');
    expect(s.p.tradecraft).toContain('t.desk');
  });

  it('keeps the phase inside its target after all of this', () => {
    const r = runPhase2('active');
    expect(r.minutes).toBeGreaterThanOrEqual(PHASE2_TARGET_MINUTES.min);
    expect(r.minutes).toBeLessThanOrEqual(PHASE2_TARGET_MINUTES.max);
  });

  it('still reaches every stream', () => {
    expect(runPhase2('active').streams).toBe(STREAMS.length);
  });
});

