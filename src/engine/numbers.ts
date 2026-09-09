/**
 * Number formatting.
 *
 * Two jobs. First, the ordinary one: keep large numbers legible for eight hours.
 * Second, a narrative one — the notation itself is a difficulty signal. Phases 1
 * and 2 stay inside the letter band (K/M/B/T), and Phase 3's climax is the only
 * place the game tips into scientific notation. The player should feel the moment
 * the numbers stop being human-sized. See docs/DESIGN.md §5.
 */

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T',
  'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc',
];

/** Above this, switch to scientific. Deliberately just past the letter table. */
const SCIENTIFIC_AT = 1e51;

export function fmt(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 0) return '-' + fmt(-n, decimals);
  if (n === 0) return '0';

  // Small numbers read better with a little precision than with none.
  if (n < 1) return n.toFixed(Math.min(decimals + 1, 3));
  if (n < 1000) {
    // Integers stay integers. 47 should not render as "47.00".
    return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
  }

  if (n >= SCIENTIFIC_AT) {
    const exp = Math.floor(Math.log10(n));
    const mantissa = n / Math.pow(10, exp);
    return `${mantissa.toFixed(3)}e${exp}`;
  }

  const tier = Math.floor(Math.log10(n) / 3);
  const suffix = SUFFIXES[tier];
  if (!suffix) {
    const exp = Math.floor(Math.log10(n));
    return `${(n / Math.pow(10, exp)).toFixed(3)}e${exp}`;
  }
  const scaled = n / Math.pow(1000, tier);
  // 4-significant-figure feel: 1.234K, 12.34K, 123.4K
  const dp = scaled >= 100 ? 1 : scaled >= 10 ? 2 : decimals;
  return `${scaled.toFixed(dp)}${suffix}`;
}

/** Per-second rates. Reads better with a fixed decimal at small magnitudes. */
export function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (n < 10) return n.toFixed(2);
  return fmt(n);
}

/**
 * Duration as wasted time. This is the Phase 1 currency, so it is also the joke:
 * the number the player is optimising is "how much of a stranger's day is gone".
 * Reads as `4h 12m 06s`.
 */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;

  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(mins)}m`;
  if (hours > 0) return `${hours}h ${pad(mins)}m ${pad(secs)}s`;
  return `${mins}m ${pad(secs)}s`;
}

/**
 * Long spans, for the parts of the game that measure time in institutional units.
 * "3 business days" is funnier than "72 hours" and is also how the world works.
 */
export function fmtBusinessTime(seconds: number): string {
  const businessDays = seconds / (8 * 3600);
  if (businessDays < 1) return `${Math.ceil(seconds / 3600)} business hours`;
  const d = Math.ceil(businessDays);
  return `${d} business day${d === 1 ? '' : 's'}`;
}

/** Percentages, clamped, for the meter labels. */
export function fmtPct(fraction: number, decimals = 0): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(Math.max(0, Math.min(1, fraction)) * 100).toFixed(decimals)}%`;
}
