/**
 * Big number formatting utilities.
 * Converts raw numbers into human-readable strings at various scales.
 */
const NumberFormat = (function() {
  const SUFFIXES = [
    '', 'thousand', 'million', 'billion', 'trillion', 'quadrillion',
    'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion',
    'decillion', 'undecillion', 'duodecillion', 'tredecillion',
    'quattuordecillion', 'quindecillion', 'sexdecillion', 'septendecillion'
  ];

  const TIME_UNITS = [
    { unit: 'second', seconds: 1 },
    { unit: 'minute', seconds: 60 },
    { unit: 'hour', seconds: 3600 },
    { unit: 'day', seconds: 86400 },
    { unit: 'week', seconds: 604800 },
    { unit: 'month', seconds: 2592000 },
    { unit: 'year', seconds: 31536000 },
    { unit: 'decade', seconds: 315360000 },
    { unit: 'century', seconds: 3153600000 },
    { unit: 'millennium', seconds: 31536000000 },
    { unit: 'epoch', seconds: 315360000000 },
    { unit: 'eon', seconds: 3153600000000 },
  ];

  /**
   * Format a number with appropriate suffix.
   * 1234 -> "1,234"
   * 1234567 -> "1.23 million"
   * 1.5e15 -> "1.50 quadrillion"
   */
  function format(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    if (n < 0) return '-' + format(-n);
    if (n < 100000) return Math.floor(n).toLocaleString();

    const tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIXES.length) {
      return n.toExponential(2);
    }
    if (tier <= 1) return Math.floor(n).toLocaleString();

    const divisor = Math.pow(10, tier * 3);
    const value = n / divisor;
    return value.toFixed(2) + ' ' + SUFFIXES[tier];
  }

  /**
   * Format a number compactly (for tight UI spaces).
   * 1234 -> "1.2K"
   * 1234567 -> "1.2M"
   */
  function compact(n) {
    if (n < 1000) return Math.floor(n).toString();
    if (n < 1e6) return (n / 1e3).toFixed(1) + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(1) + 'M';
    if (n < 1e12) return (n / 1e9).toFixed(1) + 'B';
    if (n < 1e15) return (n / 1e12).toFixed(1) + 'T';
    return n.toExponential(1);
  }

  /**
   * Format in-game elapsed time (subjective hold time).
   * Takes in-game seconds and returns human string.
   */
  function formatHoldTime(inGameSeconds) {
    if (inGameSeconds < 60) return Math.floor(inGameSeconds) + ' seconds';
    if (inGameSeconds < 3600) return Math.floor(inGameSeconds / 60) + ' minutes';
    if (inGameSeconds < 86400) {
      const h = Math.floor(inGameSeconds / 3600);
      const m = Math.floor((inGameSeconds % 3600) / 60);
      return h + 'h ' + m + 'm';
    }

    // Find the largest fitting unit
    for (let i = TIME_UNITS.length - 1; i >= 0; i--) {
      if (inGameSeconds >= TIME_UNITS[i].seconds) {
        const val = inGameSeconds / TIME_UNITS[i].seconds;
        if (val >= 100) return format(Math.floor(val)) + ' ' + TIME_UNITS[i].unit + 's';
        if (val >= 10) return val.toFixed(1) + ' ' + TIME_UNITS[i].unit + 's';
        return val.toFixed(2) + ' ' + TIME_UNITS[i].unit + 's';
      }
    }
    return Math.floor(inGameSeconds) + ' seconds';
  }

  /**
   * Format real elapsed time (for internal stats).
   */
  function formatRealTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
    return m + 'm ' + s + 's';
  }

  /**
   * Format dust with thematic unit progression.
   * particles → dust bunnies → drifts → layers → strata
   */
  function formatDust(particles) {
    if (particles < 1000) return Math.floor(particles) + ' particles';
    if (particles < 1000000) {
      const bunnies = particles / 1000;
      return bunnies.toFixed(1) + ' dust bunnies';
    }
    if (particles < 1000000000) {
      const drifts = particles / 1000000;
      return drifts.toFixed(2) + ' drifts';
    }
    if (particles < 1000000000000) {
      const layers = particles / 1000000000;
      return layers.toFixed(2) + ' layers';
    }
    const strata = particles / 1000000000000;
    if (strata < 1000) return strata.toFixed(2) + ' strata';
    return format(strata) + ' strata';
  }

  return { format, compact, formatHoldTime, formatRealTime, formatDust };
})();
