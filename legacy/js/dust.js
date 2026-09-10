/**
 * PLEASE HOLD - Dust System (v6)
 * 
 * Dust accumulates as a currency/threat. You SPEND dust to buy collectors.
 * Collectors raise the degradation THRESHOLD (makes dust hurt less).
 * Dust never goes down on its own — only by spending on collectors.
 * 
 * degradation = dust / (dust + threshold)
 * threshold = baseThreshold + (collectorsOwned × thresholdPerCollector)
 * 
 * Narrative: dust builds up, collectors are adaptations (sealed bearings,
 * dust covers, etc.) that let your mechanisms tolerate the dust.
 */
const Dust = (function() {

  /**
   * Calculate dust accumulation rate per second.
   * Formula: effectivePPS × dustFactor (proportional to production)
   * @param {number} effectivePPS - passed from main loop to avoid circular dep
   */
  function getRate(effectivePPS) {
    const s = State.get();
    if (!s.flags.dustStarted) return 0;
    return (effectivePPS || 0) * Balance.DUST.dustFactor;
  }

  /**
   * Accumulate dust for a tick. No cap — dust grows freely.
   * @param {number} dt - seconds elapsed
   * @param {number} effectivePPS - current effective PPS from main loop
   */
  function accumulate(dt, effectivePPS) {
    const s = State.get();
    if (!s.flags.dustStarted) return;
    s.dust += getRate(effectivePPS) * dt;
  }

  /**
   * Get current degradation threshold.
   * Higher threshold = dust hurts less.
   */
  function getThreshold() {
    const s = State.get();
    const collectorCount = s.collectorsOwned.length;
    return Balance.DUST.baseThreshold + (collectorCount * Balance.DUST.thresholdPerCollector);
  }

  /**
   * Calculate current production degradation (0 to maxDegradation).
   * WtL reduces effective degradation — high willpower resists the dust.
   * Formula: rawDegrade × (1 - wtlPercent × wtlResistance)
   */
  function getDegradation() {
    const s = State.get();
    if (s.dust <= 0) return 0;
    const threshold = getThreshold();
    const rawDegradation = Math.min(Balance.DUST.maxDegradation, s.dust / (s.dust + threshold));
    // WtL resistance: at 100% WtL, degradation is halved
    const wtlPercent = s.wtl / Balance.WTL.max;
    const resistance = wtlPercent * Balance.DUST.wtlResistance;
    return rawDegradation * (1 - resistance);
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
    getRate, accumulate, getThreshold, getDegradation,
    getCollectors, isCollectorOwned, buyCollector,
    allCollectorsPurchased, getOwnedCount, getOverlayOpacity,
  };
})();
