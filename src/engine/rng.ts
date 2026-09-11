/**
 * Seeded pseudo-randomness.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT `Math.random`
 * ----------------------------------------------
 * The game needs variety: what he lets slip when he loses his temper must not be the same
 * list in the same order in every playthrough. The original draw was `SLIPS[roster.length]`,
 * which is not merely repetitive — it is IDENTICAL in every career anyone will ever play, and
 * once the twelve are spent it falls to `BOIL_OVER_LINES[boilOvers % length]`, a literal loop.
 *
 * `Math.random` would fix the variety and break something more valuable. Two invariants
 * depend on the simulation being deterministic:
 *
 *  1. The headless balance simulator imports the real `tick()` and is the regression gate for
 *     pacing. With an unseeded RNG in the tick path, the measured duration becomes a different
 *     number every run and the gate stops being able to fail.
 *  2. Offline catch-up replays elapsed time in fixed steps and must produce exactly what
 *     playing through it would have.
 *
 * So randomness is a piece of SAVED STATE, advanced explicitly. Same seed, same career. The
 * simulator pins a seed; a real new game takes one from the clock.
 *
 * mulberry32: small, fast, and good enough for picking a line of dialogue. It is not
 * cryptographic and nothing here wants it to be.
 */

/** One step of mulberry32. Returns the next state and a float in [0, 1). */
export function nextRandom(state: number): { state: number; value: number } {
  let s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: s, value };
}

/** An integer in [0, n). */
export function nextInt(state: number, n: number): { state: number; value: number } {
  const r = nextRandom(state);
  return { state: r.state, value: Math.floor(r.value * n) };
}

/**
 * Fisher-Yates, returning a NEW array. Used to fill a bag, so order is decided once per
 * refill rather than per draw.
 */
export function shuffled<T>(items: readonly T[], state: number): { state: number; value: T[] } {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextInt(s, i + 1);
    s = r.state;
    const j = r.value;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { state: s, value: out };
}

/**
 * Draw from a shuffle BAG rather than sampling independently.
 *
 * Independent sampling would let the same line appear twice running, which reads as a bug
 * even though it is correct probability — the player concludes the game is repeating itself,
 * which is the exact complaint this is here to fix. A bag guarantees every entry appears once
 * before any appears twice, and reshuffles when it empties.
 *
 * Returns the drawn index, the remaining bag, and the advanced RNG state.
 */
export function drawFromBag(
  bag: readonly number[],
  poolSize: number,
  state: number,
): { state: number; bag: number[]; value: number } {
  let s = state;
  let remaining = bag.slice();

  if (remaining.length === 0) {
    const all = Array.from({ length: poolSize }, (_, i) => i);
    const r = shuffled(all, s);
    s = r.state;
    remaining = r.value;
  }

  const value = remaining.pop()!;
  return { state: s, bag: remaining, value };
}

/** A seed for a brand-new career. Only ever called outside the tick path. */
export function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
}
