/**
 * PLEASE HOLD - Dust System (v6)
 * 
 * Dust is a THREAT that accumulates and degrades production.
 * Collectors ACTIVELY REMOVE dust (they fight it, not just tolerate it).
 * 
 * Accumulation: sqrt(maxPatience) × scaleFactor (grows with progress)
 * Reduction: collectors × reductionBase × (1 + collectors × reductionScaling)
 * Net rate: accumulation - reduction (can be negative = dust decreasing)
 * 
 * Arc: losing (0-5 collectors) → holding (6-10) → winning (11-14)
 * Phase 2 setup: collectors explode, dust floods back.
 */
const Dust = (function() {

  /**
   * Calculate dust accumulation rate (how fast dust builds up).
   */
  function getAccumulationRate() {
    const s = State.get();
    if (!s.flags.dustStarted) return 0;
    return Math.sqrt(s.maxPatience) * Balance.DUST.scaleFactor;
  }

  /**
   * Calculate dust reduction rate (how fast collectors remove dust).
   * Each collector removes dust. More collectors = each works better (synergy).
   */
  function getReductionRate() {
    const owned = State.get().collectorsOwned.length;
    if (owned <= 0) return 0;
    return owned * Balance.DUST.reductionBase * (1 + owned * Balance.DUST.reductionScaling);
  }

  /**
   * Get net dust rate. Positive = accumulating, negative = being cleaned.
   */
  function getRate() {
    return getAccumulationRate() - getReductionRate();
  }

  /**
   * Accumulate (or reduce) dust for a tick. Floor at 0.
   */
  function accumulate(dt) {
    const s = State.get();
    if (!s.flags.dustStarted) return;
    s.dust = Math.max(0, s.dust + getRate() * dt);
  }

  /**
   * Get current degradation threshold.
   */
  function getThreshold() {
    const s = State.get();
    const collectorCount = s.collectorsOwned.length;
    return Balance.DUST.baseThreshold + (collectorCount * Balance.DUST.thresholdPerCollector);
  }

  /**
   * Calculate current production degradation (0 to maxDegradation).
   */
  function getDegradation() {
    const s = State.get();
    if (s.dust <= 0) return 0;
    const threshold = getThreshold();
    const rawDegradation = s.dust / (s.dust + threshold);
    return Math.min(Balance.DUST.maxDegradation, rawDegradation);
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
    getAccumulationRate, getReductionRate, getRate, accumulate,
    getThreshold, getDegradation,
    getCollectors, isCollectorOwned, buyCollector,
    allCollectorsPurchased, getOwnedCount, getOverlayOpacity,
  };
})();
