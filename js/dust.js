/**
 * PLEASE HOLD - Dust System (v6)
 * 
 * Dust is a THREAT. It accumulates over time and DEGRADES generator production.
 * Dust collectors raise the degradation threshold, protecting your coping mechanisms.
 * 
 * Core formula:
 *   degradation = min(maxDegradation, dust / (dust + threshold))
 *   threshold = baseThreshold + (collectorsOwned × thresholdPerCollector)
 *   effectivePPS = basePPS × (1 - degradation)
 * 
 * Without collectors: at 1000 dust, 50% production loss.
 * With all 14 collectors: threshold = 15000, at 1000 dust only 6% loss.
 * 
 * Collectors cost DUST to buy (you spend accumulated dust to install them).
 */
const Dust = (function() {

  /**
   * Calculate dust accumulation rate per second.
   * Formula: sqrt(maxPatience) × scaleFactor × (collectorBoost ^ collectorsOwned)
   * Each collector you buy makes dust accumulate FASTER (amplifier feedback loop).
   * This naturally scales with player progression.
   */
  function getRate() {
    const s = State.get();
    if (!s.flags.dustStarted) return 0;

    const base = Math.sqrt(s.maxPatience) * Balance.DUST.scaleFactor;
    const collectorMult = Math.pow(Balance.DUST.collectorBoost, s.collectorsOwned.length);
    return base * collectorMult;
  }

  /**
   * Get current degradation threshold.
   * Higher threshold = dust has less impact on production.
   */
  function getThreshold() {
    const s = State.get();
    const collectorCount = s.collectorsOwned.length;
    return Balance.DUST.baseThreshold + (collectorCount * Balance.DUST.thresholdPerCollector);
  }

  /**
   * Calculate current production degradation (0 to maxDegradation).
   * This is the fraction of production LOST to dust.
   *   effectivePPS = basePPS × (1 - getDegradation())
   */
  function getDegradation() {
    const s = State.get();
    if (s.dust <= 0) return 0;

    const threshold = getThreshold();
    const rawDegradation = s.dust / (s.dust + threshold);
    return Math.min(Balance.DUST.maxDegradation, rawDegradation);
  }

  /**
   * Accumulate dust for a tick. Called from game loop.
   */
  function accumulate(dt) {
    const s = State.get();
    if (!s.flags.dustStarted) return;
    s.dust += getRate() * dt;
  }

  /**
   * Get collector definitions from Balance.
   */
  function getCollectors() {
    return Balance.COLLECTORS;
  }

  /**
   * Check if a specific collector has been purchased.
   */
  function isCollectorOwned(id) {
    return State.get().collectorsOwned.includes(id);
  }

  /**
   * Purchase a collector. Spends dust. Returns true if successful.
   */
  function buyCollector(id) {
    const s = State.get();
    const collector = Balance.COLLECTORS.find(c => c.id === id);
    if (!collector) return false;
    if (s.collectorsOwned.includes(id)) return false;
    if (s.dust < collector.cost) return false;

    s.dust -= collector.cost;
    s.collectorsOwned.push(id);
    return true;
  }

  /**
   * Check if ALL collectors have been purchased.
   */
  function allCollectorsPurchased() {
    return State.get().collectorsOwned.length >= Balance.COLLECTORS.length;
  }

  /**
   * Get the number of collectors owned.
   */
  function getOwnedCount() {
    return State.get().collectorsOwned.length;
  }

  /**
   * Get dust overlay opacity (for visual effect).
   */
  function getOverlayOpacity() {
    const s = State.get();
    if (s.dust <= 0) return 0;
    return Math.min(Balance.DUST.overlayMax, s.dust / Balance.DUST.overlayDivisor);
  }

  return {
    getRate, getThreshold, getDegradation, accumulate,
    getCollectors, isCollectorOwned, buyCollector,
    allCollectorsPurchased, getOwnedCount, getOverlayOpacity,
  };
})();
