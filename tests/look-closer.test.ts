/**
 * Looking closer — the verb Phase 2 was missing.
 *
 * A playtester eleven minutes into the phase had 385 intel and NOTHING he could afford: his words
 * were "now im just waiting for 1.5k to get another thing to do at once". Allocation stabilises,
 * and after that the phase was several minutes of watching bars fill.
 *
 * The danger in adding an always-available action is turning an idle game into a clicker, so these
 * tests hold the properties that stop it: it costs freshness, it is bounded by a cooldown, it only
 * pays what the stream it reads actually produces, and its maximum possible contribution stays
 * inside the guardrail that idle play must remain viable.
 */

import { describe, it, expect } from 'vitest';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { tick } from '../src/engine/sim';
import {
  enterPhase2, assignAttention, clearAttention, unlockStream, lookCloser, freshnessOf, deriveP2,
  buyAttention, buyTradecraft, attentionPool,
} from '../src/engine/phase2';
import { DT } from '../src/engine/loop';
import { LOOK_CLOSER, FATIGUE } from '../src/data/phase2events';
import { STREAM_BY_ID, ATTENTION, STREAMS, TRADECRAFT } from '../src/data/phase2';
import { runPhase2 } from '../tools/simulate-phase2';
import type { GameState } from '../src/engine/types';

function atPhase2(): GameState {
  const p = freshState();
  for (let i = 0; i < 12; i++) {
    p.roster.push({
      id: `slip.${i}`, handle: `entry ${i}`, realName: null,
      role: 'dialer', recruitedByFalseAd: false, freed: false,
    });
  }
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };
  enterPhase2(s);
  return s;
}

describe('the opening is not starved', () => {
  it('starts with enough attention to watch several streams', () => {
    // Three points against six streams left no spare capacity to rotate with, so fatigue - the
    // phase's main decision - could not be played at all.
    expect(ATTENTION.base).toBeGreaterThanOrEqual(5);
  });

  it('prices the first extra attention point within a few minutes of play', () => {
    // 1,500 was about ten minutes of saving for a barely perceptible change.
    expect(deriveP2(atPhase2().p, {}).nextAttentionCost!).toBeLessThanOrEqual(600);
  });

  it('always leaves something worth buying early on', () => {
    // The actual complaint: at 385 intel, eleven minutes in, nothing was affordable.
    const s = atPhase2();
    s.p.intel = 385;
    const d = deriveP2(s.p, {});
    const affordable = [
      d.nextAttentionCost !== null && d.nextAttentionCost <= 385,
      d.corroborateCost <= 385,
      Object.values(STREAM_BY_ID).some((st) => st.unlockCost > 0 && st.unlockCost <= 385
        && !s.p.streams.includes(st.id)),
    ];
    expect(affordable.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });
});

describe('looking closer', () => {
  it('pays out on a watched stream', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    const before = s.p.intel;
    expect(lookCloser(s, 'cctv')).toBe(true);
    expect(s.p.intel).toBeGreaterThan(before);
  });

  it('refuses on a stream nobody is watching', () => {
    const s = atPhase2();
    clearAttention(s);
    expect(lookCloser(s, 'cctv')).toBe(false);
  });

  it('refuses on a stream that is dark', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    s.t.burnedUntil.cctv = 99;
    expect(lookCloser(s, 'cctv')).toBe(false);
  });

  it('refuses while on cooldown, and recovers', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    expect(lookCloser(s, 'cctv')).toBe(true);
    expect(lookCloser(s, 'cctv')).toBe(false);
    for (let i = 0; i < Math.ceil((LOOK_CLOSER.cooldown + 1) / DT); i++) tick(s, DT);
    expect(lookCloser(s, 'cctv')).toBe(true);
  });

  it('costs the stream its freshness, so hammering it is self-limiting', () => {
    // The property that makes this a tradeoff rather than a clicker.
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    const before = freshnessOf(s.p, 'cctv');
    lookCloser(s, 'cctv');
    expect(freshnessOf(s.p, 'cctv')).toBeLessThan(before);
  });

  it('never pushes freshness below the floor', () => {
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    s.p.freshness.cctv = FATIGUE.floor;
    lookCloser(s, 'cctv');
    expect(freshnessOf(s.p, 'cctv')).toBeGreaterThanOrEqual(FATIGUE.floor);
  });

  it('only pays what that stream produces', () => {
    // Reading the cameras must not be a way to farm money: the cameras do not know about money.
    const s = atPhase2();
    clearAttention(s);
    assignAttention(s, 'cctv', 3);
    const money = s.p.intelByKind.money;
    lookCloser(s, 'cctv');
    expect(s.p.intelByKind.money).toBe(money);
    expect(s.p.intelByKind.people).toBeGreaterThan(0);
  });

  it('is bounded so it cannot become the whole economy', () => {
    // Derived from the guardrail rather than chosen by feel: at most seconds/cooldown of extra
    // income, which has to stay well under the 1.3-2x engaged-versus-idle band.
    expect(LOOK_CLOSER.seconds / LOOK_CLOSER.cooldown).toBeLessThanOrEqual(0.5);
  });

  it('scales with the attention on the stream, so allocation still matters', () => {
    const low = atPhase2();
    const high = atPhase2();
    for (const s of [low, high]) {
      s.p.intel = 1e9;
      unlockStream(s, 'recordings');
      clearAttention(s);
    }
    assignAttention(low, 'recordings', 1);
    assignAttention(high, 'recordings', 4);
    const a = low.p.intel;
    const b = high.p.intel;
    lookCloser(low, 'recordings');
    lookCloser(high, 'recordings');
    expect(high.p.intel - b).toBeGreaterThan(low.p.intel - a);
  });
});

describe('it stays optional', () => {
  it('a player who never looks closer still finishes', () => {
    const r = runPhase2('neglectful');
    expect(r.completed).toBe(true);
  });

  it('and is not left far behind', () => {
    const engaged = runPhase2('active');
    const ignoring = runPhase2('neglectful');
    expect(ignoring.minutes / engaged.minutes).toBeLessThan(2.2);
  });
});

/**
 * THE ATTENTION CAP MUST NOT SELL A NO-OP.
 *
 * `attentionPool` is `min(max, base + bought + tradecraftBonus)`, but the sell check asked only
 * `base + bought >= max` and ignored the bonus. A player holding both attention upgrades (+5) sat
 * at a fully capped 14/14 while the game went on offering another point for 20,110 intel that
 * could not possibly do anything. He found it and asked the obvious question: "why can i still buy
 * more things to look at?"
 *
 * Of all the dead-content bugs this project has produced, selling a no-op is the worst: the others
 * wasted a slot, this one took the resource.
 */
describe('the attention cap', () => {
  it('stops offering once the pool is actually full', () => {
    const s = atPhase2();
    s.p.intel = 1e9;
    s.p.attentionBought = 999; // however it got there
    expect(deriveP2(s.p, {}).nextAttentionCost).toBeNull();
  });

  it('caps what you BUY, and lets tradecraft go above that', () => {
    /*
     * This assertion originally read `pool === ATTENTION.max`, which was written for the buggy
     * model where the cap swallowed the tradecraft bonuses too. That is precisely how the second
     * half of the fault survived the first fix: the test agreed with the bug.
     *
     * The corrected contract is that the ceiling constrains PURCHASED points, and the upgrades are
     * how you exceed what intel alone can buy.
     */
    const s = atPhase2();
    s.p.intel = 1e12;
    for (const id of ['t.vm', 't.analyst', 't.attention1', 't.attention2']) buyTradecraft(s, id);
    const bonus = TRADECRAFT.filter((t) => s.p.tradecraft.includes(t.id))
      .reduce((n, t) => n + (t.attentionBonus ?? 0), 0);

    let guard = 0;
    while (deriveP2(s.p, {}).nextAttentionCost !== null && guard++ < 400) buyAttention(s);

    expect(attentionPool(s.p)).toBe(ATTENTION.max + bonus);
    // And having reached the purchase ceiling, nothing further may be sold.
    expect(deriveP2(s.p, {}).nextAttentionCost).toBeNull();
    const before = s.p.intel;
    expect(buyAttention(s)).toBe(false);
    expect(s.p.intel).toBe(before);
  });

  it('leaves the pool smaller than the building, so you still cannot watch everything', () => {
    // The tension is meant to survive the fix: total stream capacity must exceed the cap.
    const capacity = STREAMS.reduce((n, st) => n + st.maxAttention, 0);
    expect(capacity).toBeGreaterThan(ATTENTION.max);
  });

  it('is large enough to cover four streams at once', () => {
    // 14 against 28 points of capacity was a trap: a player spread across the three cheap streams
    // had nothing left for the ledger, and the ledger is the only real source of money - which is
    // a hard coverage requirement.
    const cheapestFour = STREAMS.slice()
      .sort((a, b) => a.maxAttention - b.maxAttention)
      .slice(0, 4)
      .reduce((n, st) => n + st.maxAttention, 0);
    expect(ATTENTION.max).toBeGreaterThanOrEqual(cheapestFour);
  });
});

/**
 * NOTHING MAY BE SOLD THAT CANNOT TAKE EFFECT.
 *
 * A playtester found the game offering another attention point for 20,110 intel while his pool sat
 * fully capped at 14/14, and asked the obvious question. Fixing that exposed the SAME fault from
 * the other side: an attention-bonus upgrade could be bought against a capped pool and silently do
 * nothing, because the cap was applied to bought points and bonuses together.
 *
 * These guard the class rather than the two instances. Every purchasable thing gets asked the same
 * question: at your cap, does buying this change anything?
 */
describe('no purchase may be a no-op', () => {
  /** Buy raw attention until the game stops offering it. */
  function maxOutPurchasedAttention(s: GameState): void {
    let guard = 0;
    while (deriveP2(s.p, {}).nextAttentionCost !== null && guard++ < 400) buyAttention(s);
  }

  it('stops selling raw attention at the cap', () => {
    const s = atPhase2();
    s.p.intel = 1e12;
    maxOutPurchasedAttention(s);
    expect(deriveP2(s.p, {}).nextAttentionCost).toBeNull();
    const before = s.p.intel;
    expect(buyAttention(s)).toBe(false);
    expect(s.p.intel).toBe(before);
  });

  it('lets every attention upgrade still do something at that cap', () => {
    // The mirror of the reported bug. The cap applies to what you BUY; tradecraft goes above it.
    const withBonus = TRADECRAFT.filter((t) => (t.attentionBonus ?? 0) > 0);
    expect(withBonus.length).toBeGreaterThan(0);
    for (const t of withBonus) {
      const s = atPhase2();
      s.p.intel = 1e12;
      maxOutPurchasedAttention(s);
      for (const req of t.requires ?? []) buyTradecraft(s, req);
      const before = attentionPool(s.p);
      expect(buyTradecraft(s, t.id), `${t.id} could not be bought`).toBe(true);
      expect(attentionPool(s.p), `${t.id} granted nothing at the cap`).toBe(
        before + (t.attentionBonus ?? 0),
      );
    }
  });

  it('still cannot let you watch the whole building', () => {
    // The fix must not dissolve the premise: even at the cap plus every bonus, the streams can
    // absorb more attention than you will ever have.
    const everyBonus = TRADECRAFT.reduce((n, t) => n + (t.attentionBonus ?? 0), 0);
    const capacity = STREAMS.reduce((n, st) => n + st.maxAttention, 0);
    expect(ATTENTION.max + everyBonus).toBeLessThan(capacity);
  });

  it('refuses to sell a stream twice, or a tradecraft twice', () => {
    const s = atPhase2();
    s.p.intel = 1e12;
    expect(unlockStream(s, 'ledger')).toBe(true);
    expect(unlockStream(s, 'ledger')).toBe(false);
    expect(buyTradecraft(s, 't.vm')).toBe(true);
    expect(buyTradecraft(s, 't.vm')).toBe(false);
  });
});
