/**
 * The soundboard.
 *
 * Phase 1's personas were a passive multiplier chosen once. The practice the game is about is not
 * PICKING a voice but WORKING one, which is what Scammer Payback's own fan-made soundboard exists
 * for. The mechanic is taken; the audio and the lines are theirs and are not.
 *
 * The property that makes this a decision rather than a second stall button is the REPETITION
 * PENALTY: a line he has just heard is worth a fraction and annoys him in the way that does not
 * help. Without that, the optimal play is to find the best line and press it forever, and the board
 * is a stall button with extra steps. So that is the test that matters most here.
 */

import { describe, it, expect } from 'vitest';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { playLine, stall, switchPersona } from '../src/engine/sim';
import { BOARD, BOARD_LINES, boardFor } from '../src/data/soundboard';
import { PERSONAS, RAGE, RAPPORT, PHASE1_TARGET_MINUTES } from '../src/data/balance';
import { simulate } from '../tools/simulate';
import type { GameState } from '../src/engine/types';

function game(): GameState {
  const p = freshState();
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };
  s.d = derive(p);
  return s;
}

/** Play a line with a clock far enough ahead to clear the shared stall cooldown. */
let clock = 0;
function play(s: GameState, id: string): number {
  clock += 5000;
  return playLine(s, id, clock);
}

describe('the board itself', () => {
  it('gives every persona a board', () => {
    for (const persona of PERSONAS) {
      expect(boardFor(persona.id).length, `${persona.id} has no lines`).toBeGreaterThanOrEqual(4);
    }
  });

  it('offers a real spread of choices on each board, not five of the same', () => {
    // The point of the board is that the lines differ. If every line on a board had the same
    // profile it would be a stall button with a menu.
    for (const persona of PERSONAS) {
      const lines = boardFor(persona.id);
      expect(Math.max(...lines.map((l) => l.rapport)) - Math.min(...lines.map((l) => l.rapport)))
        .toBeGreaterThan(0.5);
      expect(Math.max(...lines.map((l) => l.rage)) - Math.min(...lines.map((l) => l.rage)))
        .toBeGreaterThan(0.8);
      expect(Math.max(...lines.map((l) => l.stall)) - Math.min(...lines.map((l) => l.stall)))
        .toBeGreaterThan(0.4);
    }
  });

  it('has a rapport line and a temper line on every board', () => {
    // The central tension: rapport is the gate you cannot buy, and temper is how the roster fills.
    // Every persona must be able to play both sides of it.
    for (const persona of PERSONAS) {
      const lines = boardFor(persona.id);
      expect(lines.some((l) => l.rapport >= 1.4), `${persona.id} cannot build rapport`).toBe(true);
      expect(lines.some((l) => l.rage >= 1.8), `${persona.id} cannot wind him up`).toBe(true);
    }
  });

  it('has unique ids and keeps to the house style', () => {
    expect(new Set(BOARD_LINES.map((l) => l.id)).size).toBe(BOARD_LINES.length);
    for (const l of BOARD_LINES) {
      // DESIGN.md §9: no exclamation marks, ever.
      expect(l.text, l.id).not.toContain('!');
      expect(l.effect, l.id).not.toContain('!');
    }
  });
});

describe('playing a line', () => {
  it('pays out and logs what it did', () => {
    const s = game();
    const before = s.p.holdTime;
    expect(play(s, 'doris.tv')).toBeGreaterThan(0);
    expect(s.p.holdTime).toBeGreaterThan(before);
    expect(s.t.log.some((l) => l.text.includes('Is this about the television'))).toBe(true);
  });

  it('refuses a line belonging to another persona', () => {
    const s = game();
    expect(s.p.persona).toBe('doris');
    expect(play(s, 'nigel.hold')).toBe(0);
  });

  it('refuses while that line is on cooldown', () => {
    const s = game();
    expect(play(s, 'doris.glasses')).toBeGreaterThan(0);
    expect(play(s, 'doris.glasses')).toBe(0);
  });

  it('shapes what the stall buys', () => {
    // A rapport line and a temper line must produce visibly different outcomes from the same base.
    const warm = game();
    const hot = game();
    play(warm, 'doris.tv'); // rapport 1.6, rage 0.5
    play(hot, 'doris.silence'); // rapport 0.3, rage 2.6
    expect(warm.p.rapport).toBeGreaterThan(hot.p.rapport);
    expect(hot.p.rage).toBeGreaterThan(warm.p.rage);
  });

  it('never pushes rapport or rage past their caps', () => {
    const s = game();
    s.p.rapport = RAPPORT.max;
    s.p.rage = RAGE.max;
    play(s, 'doris.tv');
    expect(s.p.rapport).toBeLessThanOrEqual(RAPPORT.max);
    expect(s.p.rage).toBeLessThanOrEqual(RAGE.max);
  });
});

describe('he remembers what you just said', () => {
  it('remembers only the last few lines', () => {
    const s = game();
    for (const id of ['doris.tv', 'doris.glasses', 'doris.spell', 'doris.grandson']) play(s, id);
    expect(s.t.recentLines.length).toBe(BOARD.memory);
    // The first thing said has been forgotten, so the board cycles rather than dead-ends.
    expect(s.t.recentLines).not.toContain('doris.tv');
  });

  /**
   * THE TEST THAT MATTERS. Without a repetition penalty the optimal play is to find the best line
   * and press it, and the whole board collapses into one button.
   */
  it('pays much less for a line he has just heard', () => {
    const fresh = game();
    const repeat = game();

    // Same line, but the repeat has said it recently.
    play(repeat, 'doris.glasses');
    repeat.t.lineCooldown = {}; // clear the per-line cooldown, keep the memory
    const a = play(fresh, 'doris.glasses');
    const b = play(repeat, 'doris.glasses');

    expect(b).toBeLessThan(a);
    expect(b / a).toBeCloseTo(BOARD.repeatPenalty, 1);
  });

  it('and it annoys him more', () => {
    const fresh = game();
    const repeat = game();
    play(repeat, 'doris.spell');
    repeat.t.lineCooldown = {};
    const rageBefore = repeat.p.rage;
    play(fresh, 'doris.spell');
    play(repeat, 'doris.spell');
    expect(repeat.p.rage - rageBefore).toBeGreaterThan(fresh.p.rage);
  });

  it('says so in the log, rather than silently paying less', () => {
    const s = game();
    play(s, 'doris.tv');
    s.t.lineCooldown = {};
    play(s, 'doris.tv');
    expect(s.t.log.some((l) => l.text.includes('heard this one'))).toBe(true);
  });
});

describe('the board does not break phase 1', () => {
  it('switching persona switches the board', () => {
    const s = game();
    s.p.rapport = RAPPORT.max;
    s.p.holdTimeCareer = 1e12;
    s.d = derive(s.p);
    const before = boardFor(s.p.persona)[0].id;
    if (switchPersona(s, 'nigel')) {
      expect(boardFor(s.p.persona)[0].id).not.toBe(before);
    }
  });

  it('still respects the shared stall cooldown', () => {
    // The board sits on top of `stall`, so it must not become a way around its rate limit.
    const s = game();
    const at = 100_000;
    expect(playLine(s, 'doris.tv', at)).toBeGreaterThan(0);
    expect(playLine(s, 'doris.spell', at + 1)).toBe(0);
  });

  it('leaves the pacing inside its window', () => {
    // The simulator plays the board now, so this is a real check on the new verb.
    const r = simulate('active');
    expect(r.minutesToGate).toBeGreaterThanOrEqual(PHASE1_TARGET_MINUTES.min);
    expect(r.minutesToGate).toBeLessThanOrEqual(PHASE1_TARGET_MINUTES.max);
  });

  it('a player who only presses stall still progresses', () => {
    // The board must be an enrichment, not a tax on anyone who ignores it.
    const s = game();
    const before = s.p.holdTime;
    for (let i = 0; i < 5; i++) stall(s, 200_000 + i * 5000);
    expect(s.p.holdTime).toBeGreaterThan(before);
  });
});

/**
 * THE BOARD MUST ACTUALLY DO SOMETHING.
 *
 * It shipped doing nothing at all. `stall` rate-limits on `nowMs - lastStallAt`; the Stall button
 * passed `Date.now()` (~1.79e12) and the soundboard passed `performance.now()` (~3e4). So once
 * anything had touched `lastStallAt`, every board click computed a hugely negative elapsed time,
 * failed the cooldown check and returned zero — forever, and silently, because the only feedback
 * was on the success path. The report was 'theres zero indication i am clicking the buttons',
 * which was literally true.
 *
 * Every test above passed throughout, because they all use one clock. The bug lived entirely in
 * the disagreement between two call sites, which is why this one tests the CONTRACT rather than
 * the function: any two things that share the rate limit must share an epoch.
 */
describe('the stall rate limit has one clock', () => {
  it('lets a board line follow a stall on the same clock', () => {
    const s = game();
    const t0 = Date.now();
    expect(stall(s, t0)).toBeGreaterThan(0);
    // A moment later, on the SAME epoch, the board must work.
    expect(playLine(s, 'doris.tv', t0 + 5000)).toBeGreaterThan(0);
  });

  it('is broken by mixing epochs, which is what shipped', () => {
    // Kept as an explicit demonstration: this is the shape of the failure, so that anyone who
    // reintroduces a second clock sees precisely what it costs.
    const s = game();
    const epoch = Date.now();
    stall(s, epoch);
    const sincePageLoad = 30_000;
    expect(playLine(s, 'doris.tv', sincePageLoad)).toBe(0);
  });

  it('recovers on the next tick rather than jamming permanently', () => {
    const s = game();
    const t0 = Date.now();
    playLine(s, 'doris.tv', t0);
    // Refused immediately (shared cooldown), then allowed once it has passed.
    expect(playLine(s, 'doris.spell', t0 + 1)).toBe(0);
    expect(playLine(s, 'doris.spell', t0 + 5000)).toBeGreaterThan(0);
  });
});

/**
 * A line moves three things, so its feedback must name all three.
 *
 * The popup reported one bare number and a playtester asked exactly the right question: '145 of
 * what? 145 temper? 145 time?'. It was hold time, but nothing on screen said so, and a board whose
 * whole point is that lines differ in WHAT they buy cannot report a single unlabelled figure.
 */
describe('what a line did is reported in units', () => {
  it('records all three effects, not just the hold time', () => {
    const s = game();
    play(s, 'nigel.hold'); // wrong persona; nothing should be recorded
    expect(s.t.lastLineResult).toBeNull();

    play(s, 'doris.spell'); // rapport 0.6, rage 2.1 — a temper line
    const r = s.t.lastLineResult!;
    expect(r.id).toBe('doris.spell');
    expect(r.held).toBeGreaterThan(0);
    expect(r.rage).toBeGreaterThan(0);
  });

  it('reports the hold time it actually returned', () => {
    const s = game();
    const returned = play(s, 'doris.glasses');
    expect(s.t.lastLineResult!.held).toBeCloseTo(returned, 6);
  });

  it('shows a rapport line and a temper line as different shapes', () => {
    // The numbers the player sees must reflect the choice they made.
    const warm = game();
    const hot = game();
    play(warm, 'doris.tv');
    play(hot, 'doris.spell');
    const w = warm.t.lastLineResult!;
    const h = hot.t.lastLineResult!;
    expect(w.rapport).toBeGreaterThan(h.rapport);
    expect(h.rage).toBeGreaterThan(w.rage);
  });

  it('is not left stale by a refused click', () => {
    // A refusal must not leave the previous line's numbers on screen as if they were new.
    const s = game();
    const at = 500_000;
    expect(playLine(s, 'doris.tv', at)).toBeGreaterThan(0);
    const first = s.t.lastLineResult;
    expect(playLine(s, 'doris.spell', at + 1)).toBe(0); // shared cooldown
    expect(s.t.lastLineResult).toBe(first);
  });
});

/**
 * A LINE MUST STAY WORTH PLAYING.
 *
 * A playtester producing 400 a second was handed 145 by a board line and said, correctly, that it
 * was 'mere peanuts'. A flat click value in a game whose passive income grows without bound stops
 * being worth touching the moment the generators pass it — the oldest trap in the genre, and the
 * player is right to stop playing at that point.
 *
 * The payout is now the larger of the flat stall and a slice of the player's OWN production, so it
 * stays relevant at every scale without ever becoming a windfall.
 */
describe('a line scales with production', () => {
  it('pays more to a bigger operation', () => {
    const small = game();
    const large = game();
    large.p.generators.confusion = 200;
    large.d = derive(large.p);
    expect(large.d.hps).toBeGreaterThan(small.d.hps * 10);

    const a = play(small, 'doris.glasses');
    const b = play(large, 'doris.glasses');
    expect(b).toBeGreaterThan(a * 5);
  });

  it('is worth a meaningful slice of a second of production', () => {
    const s = game();
    s.p.generators.confusion = 200;
    s.d = derive(s.p);
    const line = BOARD_LINES.find((l) => l.id === 'doris.glasses')!;
    const got = play(s, 'doris.glasses');
    expect(got).toBeGreaterThanOrEqual(s.d.hps * BOARD.productionSeconds * line.stall * 0.99);
  });

  it('does not fall below the flat stall in the early game', () => {
    // Production is near zero at the start; the board must never pay less than the button it is
    // built on, or the fix would have traded one dead mechanic for another.
    const s = game();
    const got = play(s, 'doris.glasses');
    expect(got).toBeGreaterThanOrEqual(s.d.stallValue * 0.99);
  });

  it('and does not distort the phase it was tuned for', () => {
    // Reads the declared window rather than hard-coding it: the target itself moved once the board
    // became a real mechanic, and a test that pins yesterday's number blocks a deliberate change
    // while still not catching an accidental one.
    const r = simulate('active');
    expect(r.minutesToGate).toBeGreaterThanOrEqual(PHASE1_TARGET_MINUTES.min);
    expect(r.minutesToGate).toBeLessThanOrEqual(PHASE1_TARGET_MINUTES.max);
  });
});
