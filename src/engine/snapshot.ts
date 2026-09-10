/**
 * UI snapshots.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The first version of the render bridge did this:
 *
 *     const p = $derived.by(() => { void frame.n; return game.p; });
 *
 * ...and the entire UI was dead. Clicking worked, the simulation ran, the imperative
 * "+1" popup appeared — and not one bound value ever changed.
 *
 * `game.p` is a single object mutated in place, so that derived returned an IDENTICAL
 * reference on every frame. Svelte propagates a derived only when its value actually
 * changes, and for an object that means referential equality. So the frame counter
 * incremented, the derived re-ran, and Svelte discarded the result as unchanged. Every
 * template expression reading `p` never re-evaluated.
 *
 * It was also a partially-working bug, which is the worst kind: `Derived` is rebuilt
 * from scratch by `derive()` on every tick, so `game.d` DID get a fresh reference and
 * anything reading it updated normally. The result was a console showing a live
 * per-stall value next to frozen counters.
 *
 * The fix is to hand the UI a NEW object each frame. That lives here, in a plain
 * module with no framework in it, so the invariant that was violated — "a snapshot is
 * never the same reference twice" — is a thing a test can assert. See
 * tests/snapshot.test.ts.
 */

import type { GameState, Persisted, Derived, Transient, LogLine } from './types';

export interface Snapshot {
  p: Persisted;
  d: Derived;
  t: Transient;
  log: LogLine[];
}

/**
 * Copy the live state into fresh objects.
 *
 * The nested collections are copied too, not just the top level. A purely shallow copy
 * renders correctly — every template expression reaches nested values through the new
 * top-level object, so it re-evaluates either way — but it leaves a trap: two snapshots
 * would share one `generators` object, so anything comparing a previous snapshot against
 * a current one would see no difference in nested data and silently conclude nothing had
 * changed. A test caught exactly that. These collections are tiny (six generator counts,
 * a handful of short id arrays), so at 15 Hz the copying cost is noise.
 *
 * `log` needs the same treatment for a more visible reason: `{#each}` requires a changed
 * array reference to notice appended lines, and pushLog mutates the array in place.
 */
export function snapshot(game: GameState): Snapshot {
  const p = game.p;
  return {
    p: {
      ...p,
      generators: { ...p.generators },
      upgrades: p.upgrades.slice(),
      milestones: p.milestones.slice(),
      dossier: p.dossier.slice(),
      beatsSeen: p.beatsSeen.slice(),
      roster: p.roster.slice(),
      // Phase 2's collections need the same treatment for the same reason. Phase 2 shipped
      // with its component reading `game.p` directly and froze exactly as described above —
      // a camera wall updating live next to an attention counter stuck on its first value.
      attention: { ...p.attention },
      streams: p.streams.slice(),
      intelByKind: { ...p.intelByKind },
      corroborated: p.corroborated.slice(),
      tradecraft: p.tradecraft.slice(),
    },
    // Derived is rebuilt from scratch every tick, so a shallow copy is already a
    // point-in-time value; its nested records are never mutated after construction.
    d: { ...game.d },
    t: { ...game.t, popups: game.t.popups.slice(), burnedUntil: { ...game.t.burnedUntil } },
    log: game.t.log.slice(),
  };
}
