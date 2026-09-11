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
} from '../src/engine/phase2';
import { DT } from '../src/engine/loop';
import { LOOK_CLOSER, FATIGUE } from '../src/data/phase2events';
import { STREAM_BY_ID, ATTENTION } from '../src/data/phase2';
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
