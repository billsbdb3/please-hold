/**
 * Wall layout tests.
 *
 * These exist because the CCTV wall's layout was wrong twice, in ways a passing type check
 * and a clean build could not catch:
 *
 *  1. `minmax(200px, 1fr)` auto-fill packed nine tiny columns onto a desktop.
 *  2. Fixed-aspect cells under grid's default `align-items: stretch` resolved TALLER than
 *     their rows, overflowed, and the next row painted over them — which silently hid every
 *     caption except on the two cameras whose overflow sat beneath an empty column.
 *
 * Both were failures of arithmetic about boxes, so the arithmetic is now a pure function
 * with assertions on it. The CSS still cannot be unit-tested; the sizing decision can.
 */

import { describe, it, expect } from 'vitest';
import {
  bestColumns,
  columnsForTileWidth,
  heightFor,
  tileWidthFor,
  DEFAULT_METRICS,
} from '../src/cctv/layout';
import { SCENES } from '../src/cctv/scenes';

const M = DEFAULT_METRICS;

describe('tile geometry', () => {
  it('divides the container width across columns, allowing for gaps and padding', () => {
    // 1000 wide, 8 padding each side, 3 columns, 2 gaps of 8 => (1000-16-16)/3
    expect(tileWidthFor(3, { width: 1000, height: 800 }, M)).toBeCloseTo((1000 - 16 - 16) / 3, 6);
  });

  it('reports a taller total for fewer columns, since rows multiply', () => {
    const box = { width: 1600, height: 900 };
    expect(heightFor(14, 2, box, M)).toBeGreaterThan(heightFor(14, 5, box, M));
  });

  it('treats an impossible column count as unfittable rather than negative', () => {
    // More columns than the width can hold at all: tile width goes <= 0.
    expect(heightFor(14, 500, { width: 100, height: 100 }, M)).toBe(Infinity);
  });
});

describe('bestColumns — the "fit the page" decision', () => {
  /** THE regression test. Whatever it picks must actually fit vertically. */
  it('never returns a layout that overflows the box', () => {
    const boxes = [
      { width: 1600, height: 900 },
      { width: 1280, height: 800 },
      { width: 2560, height: 1400 },
      { width: 900, height: 1200 },
      { width: 600, height: 900 },
    ];
    for (const box of boxes) {
      const cols = bestColumns(SCENES.length, box, M);
      expect(
        heightFor(SCENES.length, cols, box, M),
        `${SCENES.length} cams in ${box.width}x${box.height} chose ${cols} cols`,
      ).toBeLessThanOrEqual(box.height + 0.5);
    }
  });

  it('picks the largest tile among the layouts that fit', () => {
    const box = { width: 1600, height: 900 };
    const chosen = bestColumns(14, box, M);
    const chosenTile = tileWidthFor(chosen, box, M);
    for (let c = 1; c <= 14; c++) {
      if (heightFor(14, c, box, M) <= box.height) {
        expect(tileWidthFor(c, box, M)).toBeLessThanOrEqual(chosenTile + 1e-6);
      }
    }
  });

  it('uses fewer columns — bigger tiles — as the container gets taller', () => {
    const wide = { width: 1600, height: 500 };
    const tall = { width: 1600, height: 1600 };
    expect(bestColumns(14, tall, M)).toBeLessThanOrEqual(bestColumns(14, wide, M));
  });

  it('degrades to a scrolling layout instead of a broken one when nothing fits', () => {
    // A container far too short for 14 tiles at any column count.
    const cols = bestColumns(14, { width: 1600, height: 80 }, M);
    expect(cols).toBeGreaterThanOrEqual(1);
    expect(cols).toBeLessThanOrEqual(14);
  });

  it('handles a single camera and an unmeasured box without dividing by zero', () => {
    expect(bestColumns(1, { width: 800, height: 600 }, M)).toBe(1);
    expect(bestColumns(14, { width: 0, height: 0 }, M)).toBeGreaterThan(0);
    expect(bestColumns(0, { width: 800, height: 600 }, M)).toBe(1);
  });
});

describe('columnsForTileWidth — the forced-size modes', () => {
  it('fits as many tiles of the requested width as the row allows', () => {
    // 1600 wide, 16 padding: (1584+8)/(420+8) = 3.7 => 3 columns
    expect(columnsForTileWidth(14, 420, { width: 1600, height: 900 }, M)).toBe(3);
  });

  it('always yields at least one column, however narrow the box', () => {
    expect(columnsForTileWidth(14, 620, { width: 300, height: 900 }, M)).toBe(1);
  });

  it('never returns more columns than there are cameras', () => {
    expect(columnsForTileWidth(3, 100, { width: 4000, height: 900 }, M)).toBe(3);
  });
});
