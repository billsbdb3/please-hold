/**
 * Render-bridge snapshot tests.
 *
 * These exist because of a shipped bug that no other test could have caught. The UI
 * derived its values straight from the live state object:
 *
 *     const p = $derived.by(() => { void frame.n; return game.p; });
 *
 * `game.p` is mutated in place, so that returned the same reference every frame. Svelte
 * propagates a derived only when its value changes, which for an object means
 * referential equality — so the frame counter ticked, the derived re-ran, and the result
 * was discarded as unchanged. Every bound value in the game froze while the simulation
 * ran perfectly underneath.
 *
 * It was worse than a plain freeze: `Derived` is rebuilt by `derive()` each tick, so
 * `game.d` DID change identity and anything reading it kept updating. The live game
 * showed a working per-stall value beside dead counters, which is exactly the kind of
 * half-broken symptom that reads as "the game logic is wrong" and sends you looking in
 * the wrong file.
 *
 * The framework subtlety itself is not directly testable without a browser. What IS
 * testable is the invariant it violated, which is why the copying was pulled out into a
 * plain module: A SNAPSHOT MUST NEVER BE THE SAME REFERENCE TWICE.
 */

import { describe, it, expect } from 'vitest';
import { snapshot } from '../src/engine/snapshot';
import { freshState } from '../src/engine/state';
import { freshTransient, pushLog } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { tick, stall } from '../src/engine/sim';
import { DT } from '../src/engine/loop';
import type { GameState } from '../src/engine/types';

function newGame(): GameState {
  const p = freshState();
  return { p, d: derive(p), t: freshTransient(0) };
}

describe('snapshot identity', () => {
  /** THE regression test. If this fails, the UI is frozen again. */
  it('never returns the same object reference twice', () => {
    const game = newGame();
    const a = snapshot(game);
    const b = snapshot(game);

    expect(a).not.toBe(b);
    expect(a.p).not.toBe(b.p);
    expect(a.d).not.toBe(b.d);
    expect(a.t).not.toBe(b.t);
    expect(a.log).not.toBe(b.log);
  });

  it('never hands back the live objects themselves', () => {
    // Returning the live object is the precise mistake that froze the UI: Svelte cannot
    // detect a change in something it is holding by reference and watching mutate.
    const game = newGame();
    const s = snapshot(game);

    expect(s.p).not.toBe(game.p);
    expect(s.d).not.toBe(game.d);
    expect(s.t).not.toBe(game.t);
    expect(s.log).not.toBe(game.t.log);
  });
});

describe('snapshot content', () => {
  it('reflects values mutated since the previous snapshot', () => {
    const game = newGame();
    const before = snapshot(game);

    stall(game, 1000);
    for (let i = 0; i < 20; i++) tick(game, DT);

    const after = snapshot(game);
    expect(after.p.holdTime).toBeGreaterThan(before.p.holdTime);
    expect(after.p.totalStalls).toBeGreaterThan(before.p.totalStalls);
    // The old snapshot must not have been mutated retroactively — a copy, not a view.
    expect(before.p.totalStalls).toBe(0);
  });

  it('picks up appended log lines', () => {
    // `{#each}` needs a changed array reference to notice appended items, and pushLog
    // mutates the array in place, so the copy is what makes the transcript live.
    const game = newGame();
    const before = snapshot(game);
    pushLog(game, 'He has put you on hold.', 'call');
    const after = snapshot(game);

    expect(after.log.length).toBe(before.log.length + 1);
    expect(after.log[after.log.length - 1].text).toBe('He has put you on hold.');
  });

  it('tracks a value that goes down as well as up', () => {
    const game = newGame();
    game.p.composure = 50;
    const before = snapshot(game);
    game.p.composure = 20;
    const after = snapshot(game);

    expect(before.p.composure).toBe(50);
    expect(after.p.composure).toBe(20);
  });

  it('reflects a purchase, which is what the shop rows bind to', () => {
    const game = newGame();
    const before = snapshot(game);
    game.p.generators.confusion = 3;
    const after = snapshot(game);

    expect(before.p.generators.confusion).toBe(0);
    expect(after.p.generators.confusion).toBe(3);
  });

  it('reflects the transient event window the UI shows a deadline for', () => {
    const game = newGame();
    game.t.nextEventIn = 0;
    tick(game, DT);
    const s = snapshot(game);
    expect(s.t.event).not.toBeNull();
  });
});

/**
 * Phase 2 broke this invariant a second time — its component read `game.p` directly and the
 * whole console froze, showing a live camera wall beside an attention counter stuck on its
 * first value. The general rule was already tested; what was missing was coverage of the
 * COLLECTIONS a new phase adds, so the next phase cannot repeat it quietly.
 */
describe('phase 2 collections are copied, not shared', () => {
  it('gives every phase 2 collection a fresh reference', () => {
    const game = newGame();
    const a = snapshot(game);
    const b = snapshot(game);
    expect(a.p.attention).not.toBe(b.p.attention);
    expect(a.p.streams).not.toBe(b.p.streams);
    expect(a.p.intelByKind).not.toBe(b.p.intelByKind);
    expect(a.p.corroborated).not.toBe(b.p.corroborated);
    expect(a.p.tradecraft).not.toBe(b.p.tradecraft);
    expect(a.t.burnedUntil).not.toBe(b.t.burnedUntil);
  });

  it('does not alias the live state, so a later mutation cannot rewrite a taken snapshot', () => {
    const game = newGame();
    const before = snapshot(game);
    game.p.attention.cctv = 4;
    game.p.streams.push('ledger');
    game.p.intelByKind.people = 99;
    expect(before.p.attention.cctv).toBe(0);
    expect(before.p.streams).not.toContain('ledger');
    expect(before.p.intelByKind.people).toBe(0);
  });

  it('every persisted collection is covered here, so a new phase cannot add one quietly', () => {
    // Enumerating the collections means adding an uncopied one to Persisted fails THIS test
    // rather than showing up as a frozen panel weeks later.
    const game = newGame();
    const a = snapshot(game);
    const b = snapshot(game);
    // Via `unknown`: Persisted has no index signature, so a direct cast is rejected.
    const ap = a.p as unknown as Record<string, unknown>;
    const bp = b.p as unknown as Record<string, unknown>;
    const shared = Object.keys(ap).filter((k) => {
      const v = ap[k];
      return v !== null && typeof v === 'object' && ap[k] === bp[k];
    });
    expect(shared).toEqual([]);
  });
});
