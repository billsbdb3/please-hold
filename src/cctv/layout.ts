/**
 * Wall layout maths.
 *
 * Pure, and separated from the component deliberately: this is the part that was wrong
 * twice. Fixed pixel tile widths cannot express "fit the page" at an arbitrary window
 * size, and a `minmax(...)` auto-fill grid cannot either — it only knows about width, so
 * with a fixed aspect ratio it silently overflowed vertically and the rows collided.
 *
 * Being a function of numbers rather than CSS, it can be tested.
 */

export interface WallBox {
  /** Container width in CSS px. */
  width: number;
  /** Container height in CSS px. */
  height: number;
}

export interface WallMetrics {
  gap: number;
  padding: number;
  /** Tile width / height. 4:3 for CCTV. */
  aspect: number;
}

export const DEFAULT_METRICS: WallMetrics = { gap: 8, padding: 8, aspect: 4 / 3 };

/** Tile width implied by a given column count. */
export function tileWidthFor(cols: number, box: WallBox, m: WallMetrics = DEFAULT_METRICS): number {
  if (cols < 1) return 0;
  return (box.width - m.padding * 2 - m.gap * (cols - 1)) / cols;
}

/** Total height a grid of `count` items in `cols` columns would occupy. */
export function heightFor(
  count: number,
  cols: number,
  box: WallBox,
  m: WallMetrics = DEFAULT_METRICS,
): number {
  const rows = Math.ceil(count / Math.max(cols, 1));
  const tileW = tileWidthFor(cols, box, m);
  if (tileW <= 0) return Infinity;
  return rows * (tileW / m.aspect) + m.gap * (rows - 1) + m.padding * 2;
}

/**
 * The column count that fits every tile in the box at the LARGEST possible tile size.
 *
 * Fewer columns means bigger tiles but more rows, so the two constraints pull against each
 * other; this walks every candidate and keeps the biggest tile that still fits vertically.
 *
 * When nothing fits — a container too short for even the smallest sensible layout — it
 * returns the count that best matches the box's proportions and lets the wall scroll.
 * Scrolling is an acceptable outcome; overlapping is not.
 */
export function bestColumns(
  count: number,
  box: WallBox,
  m: WallMetrics = DEFAULT_METRICS,
): number {
  if (count <= 0) return 1;
  if (box.width <= 0 || box.height <= 0) return Math.min(count, 4);

  let best = 0;
  let bestTile = 0;
  for (let cols = 1; cols <= count; cols++) {
    const tileW = tileWidthFor(cols, box, m);
    if (tileW <= 0) continue;
    if (heightFor(count, cols, box, m) <= box.height && tileW > bestTile) {
      bestTile = tileW;
      best = cols;
    }
  }
  if (best > 0) return best;

  // Nothing fits. Approximate a square-ish arrangement for the box's proportions, which
  // minimises how far it overflows.
  const ratio = box.width / box.height;
  return Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * ratio))));
}

/** Column count for a forced tile width, clamped to something sane. */
export function columnsForTileWidth(
  count: number,
  tileWidth: number,
  box: WallBox,
  m: WallMetrics = DEFAULT_METRICS,
): number {
  if (box.width <= 0 || tileWidth <= 0) return Math.min(count, 4);
  const usable = box.width - m.padding * 2;
  return Math.max(1, Math.min(count, Math.floor((usable + m.gap) / (tileWidth + m.gap))));
}
