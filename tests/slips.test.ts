/**
 * What he lets slip when he loses his temper.
 *
 * The original draw was `SLIPS[p.roster.length]` — not merely repetitive but IDENTICAL in
 * every career anyone would ever play: Brandon, then the shift pattern, then Sir Andrew, in
 * that order, always. Once the twelve were spent it fell to
 * `BOIL_OVER_LINES[p.boilOvers % length]`, a literal loop of ten lines.
 *
 * These tests hold three properties that pull against each other:
 *   - VARIETY: careers differ from each other, and nothing repeats until the pool is spent.
 *   - DETERMINISM: a given seed always produces the same career, because the balance simulator
 *     imports the real tick() and is the pacing regression gate. An unseeded RNG in the tick
 *     path would make its measurement a different number every run.
 *   - VOLUME: the pool stays big enough that variety is real rather than theoretical.
 */

import { describe, it, expect } from 'vitest';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { boilOver } from '../src/engine/sim';
import { SLIPS, BOIL_OVER_LINES } from '../src/data/balance';
import { drawFromBag, shuffled, nextRandom } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';

function gameWithSeed(seed: number): GameState {
  const p = freshState();
  p.rngState = seed;
  return { p, d: derive(p), t: freshTransient(0) };
}

/** Lose his temper n times and report the roster handles, in order. */
function slipsFrom(seed: number, n: number): string[] {
  const s = gameWithSeed(seed);
  for (let i = 0; i < n; i++) boilOver(s);
  return s.p.roster.map((r) => r.handle);
}

describe('the slip pool', () => {
  it('is large enough for variety to be real', () => {
    // Twelve was the whole pool. A dozen entries cannot feel random however well they are drawn.
    expect(SLIPS.length).toBeGreaterThanOrEqual(40);
    expect(BOIL_OVER_LINES.length).toBeGreaterThanOrEqual(18);
  });

  it('has no duplicate entries', () => {
    expect(new Set(SLIPS.map((s) => s.entry)).size).toBe(SLIPS.length);
  });

  it('covers every role on the org chart', () => {
    const roles = new Set(SLIPS.map((s) => s.role));
    for (const r of ['dialer', 'closer', 'verifier', 'manager', 'it', 'owner']) {
      expect(roles.has(r as never), `no slip about the ${r}`).toBe(true);
    }
  });

  it('marks the recruited ones as data rather than by position', () => {
    // Was `slipIndex % 3 === 1`, which marked whichever slip landed in that slot — meaningless
    // once the draw is random, and never honest even before. Twist 2 reads this field.
    expect(SLIPS.filter((s) => s.falseAd).length).toBeGreaterThan(4);
  });

  it('keeps every line to the house style', () => {
    // docs/DESIGN.md §9: no exclamation marks, ever.
    for (const s of SLIPS) {
      expect(s.line, s.entry).not.toContain('!');
      expect(s.entry).not.toContain('!');
    }
    for (const l of BOIL_OVER_LINES) expect(l).not.toContain('!');
  });
});

describe('drawing slips', () => {
  it('never repeats a slip within one career', () => {
    const drawn = slipsFrom(12345, SLIPS.length);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('gives two careers different slips, in a different order', () => {
    const a = slipsFrom(1, 10);
    const b = slipsFrom(2, 10);
    expect(a).not.toEqual(b);
    // And not merely reordered late — the opening should differ, which is what a player notices.
    expect(a[0]).not.toBe(b[0]);
  });

  it('is deterministic for a given seed', () => {
    // The property the balance simulator depends on.
    expect(slipsFrom(99, 8)).toEqual(slipsFrom(99, 8));
  });

  it('falls back to generic shouting once every slip is spent, without cycling', () => {
    const s = gameWithSeed(7);
    for (let i = 0; i < SLIPS.length + 6; i++) boilOver(s);
    expect(s.p.roster.length).toBe(SLIPS.length);
    // It kept going rather than throwing or re-recording.
    expect(s.p.boilOvers).toBe(SLIPS.length + 6);
  });
});

describe('the shuffle bag', () => {
  it('empties before it repeats', () => {
    let bag: number[] = [];
    let state = 42;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = drawFromBag(bag, 6, state);
      state = r.state;
      bag = r.bag;
      seen.push(r.value);
    }
    expect(new Set(seen).size).toBe(6);
  });

  it('refills automatically', () => {
    let bag: number[] = [];
    let state = 42;
    for (let i = 0; i < 30; i++) {
      const r = drawFromBag(bag, 4, state);
      state = r.state;
      bag = r.bag;
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(4);
    }
  });

  it('shuffles without losing or duplicating anything', () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const out = shuffled(items, 123).value;
    expect(out.slice().sort((a, b) => a - b)).toEqual(items);
  });

  it('produces values in [0,1) and advances its state', () => {
    let state = 1;
    for (let i = 0; i < 500; i++) {
      const r = nextRandom(state);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      expect(r.state).not.toBe(state);
      state = r.state;
    }
  });
});
