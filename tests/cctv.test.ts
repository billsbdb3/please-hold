/**
 * CCTV data-layer tests.
 *
 * The rendering is a browser concern and lives in the component; what is testable
 * here is the invariant set the renderer depends on: stable unique ids, real
 * captions, a correct timestamp formatter, and — the important one — a
 * DETERMINISTIC scene stepper. Given a tick, a scene must always produce the same
 * state, with no Math.random anywhere, so the wall of monitors is reproducible and
 * cheap.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCENES, formatTimestamp, sceneById } from '../src/cctv/scenes';

describe('scene data', () => {
  it('has at least 10 cameras', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(10);
  });

  it('has unique scene ids', () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every scene has a non-empty caption and location', () => {
    for (const s of SCENES) {
      expect(s.caption.trim().length).toBeGreaterThan(0);
      expect(s.location.trim().length).toBeGreaterThan(0);
    }
  });

  it('captions stay in the flat register — no exclamation marks, no emoji', () => {
    // eslint-disable-next-line no-control-regex
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const s of SCENES) {
      expect(s.caption, s.id).not.toContain('!');
      expect(emoji.test(s.caption), s.id).toBe(false);
    }
  });

  it('includes one broken/black camera and one pointed at something useless', () => {
    expect(SCENES.some((s) => s.behaviour === 'dead')).toBe(true);
    const useless = SCENES.some((s) =>
      /CEILING|CAR PARK/.test(s.location),
    );
    expect(useless).toBe(true);
  });

  it('sceneById resolves a known id and rejects an unknown one', () => {
    expect(sceneById('01')?.location).toBe('CORRIDOR EAST');
    expect(sceneById('zz')).toBeUndefined();
  });

  it('a dead camera draws nothing', () => {
    const dead = SCENES.find((s) => s.behaviour === 'dead');
    expect(dead).toBeDefined();
    expect(dead!.describe(0)).toEqual([]);
    expect(dead!.describe(999)).toEqual([]);
  });
});

describe('deterministic scene stepper', () => {
  it('same (scene, tick) always yields the identical shape list', () => {
    for (const s of SCENES) {
      for (const tick of [0, 1, 7, 42, 1000]) {
        expect(s.describe(tick)).toEqual(s.describe(tick));
      }
    }
  });

  it('motion scenes actually change over ticks; static scenes do not', () => {
    for (const s of SCENES) {
      const frames = Array.from({ length: 24 }, (_, i) => JSON.stringify(s.describe(i)));
      const distinct = new Set(frames).size;
      if (s.behaviour === 'motion') {
        expect(distinct, `${s.id} should move`).toBeGreaterThan(1);
      } else {
        expect(distinct, `${s.id} should be still`).toBe(1);
      }
    }
  });

  it('produces the same frames across independent runs (reproducible)', () => {
    const first = SCENES.map((s) => JSON.stringify(s.describe(13)));
    const second = SCENES.map((s) => JSON.stringify(s.describe(13)));
    expect(first).toEqual(second);
  });
});

describe('timestamp formatter', () => {
  it('formats tick 0 as the start of the day', () => {
    expect(formatTimestamp(0)).toBe('2003-11-04  00:00:00');
  });

  it('advances one second per tick with zero padding', () => {
    expect(formatTimestamp(1)).toBe('2003-11-04  00:00:01');
    expect(formatTimestamp(59)).toBe('2003-11-04  00:00:59');
    expect(formatTimestamp(60)).toBe('2003-11-04  00:01:00');
    expect(formatTimestamp(3661)).toBe('2003-11-04  01:01:01');
  });

  it('wraps at 24h and never shows an implausible hour', () => {
    expect(formatTimestamp(86400)).toBe('2003-11-04  00:00:00');
    expect(formatTimestamp(86400 + 5)).toBe('2003-11-04  00:00:05');
  });

  it('handles negative ticks without a broken clock', () => {
    // Defensive: a negative tick must still land in [00:00:00, 23:59:59].
    expect(formatTimestamp(-1)).toBe('2003-11-04  23:59:59');
  });

  it('is a pure function — same tick, same string', () => {
    expect(formatTimestamp(500)).toBe(formatTimestamp(500));
  });
});

describe('no randomness in the data layer', () => {
  it('scenes.ts contains no Math.random call', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/cctv/scenes.ts', import.meta.url)),
      'utf8',
    );
    // Match an actual call, not the prose mention in the file's own docstring.
    expect(/Math\s*\.\s*random\s*\(/.test(src)).toBe(false);
  });
});
