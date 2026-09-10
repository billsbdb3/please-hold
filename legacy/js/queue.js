/**
 * PLEASE HOLD - Queue System (v6)
 * 
 * Handles: queue cost curve, auto-advance, pass tracking,
 * and Phase 1 completion check.
 * 
 * Phase 1 ends when:
 *   - Queue hits 0 on pass 2
 *   - All upgrades purchased
 *   - All dust collectors purchased
 */
const Queue = (function() {

  /**
   * Get cost for current queue position.
   */
  function getCost() {
    const s = State.get();
    let cost = Math.floor(Balance.QUEUE.baseCost * Math.pow(Balance.QUEUE.growthRate, (Balance.QUEUE.startPosition - s.queue)));
    if (s.queuePass === 2) cost = Math.floor(cost * Balance.QUEUE.pass2Mult);
    cost = Math.floor(cost * s.queueCostMult);
    return Math.max(1, cost);
  }

  /**
   * Advance the queue by accumulating progress from PPS.
   * Called each tick with effectivePPS (after all multipliers + degradation).
   * Returns an object describing what happened:
   *   { advanced: bool, newPosition: num, transferred: bool, completed: bool }
   */
  function tick(effectivePPS, dt) {
    const s = State.get();
    if (s.queue <= 0 && s.queuePass === 2) return { advanced: false };

    // Queue speed multipliers
    const wtlState = Wtl.getState();
    const phoneBonus = Phone.getBonus().queue;
    const effectiveSpeed = (s.queueSpeedMult + phoneBonus) * wtlState.queueMult;

    // Accumulate progress
    s.queueProgress += effectivePPS * effectiveSpeed * dt;

    // Check for advance
    const cost = getCost();
    if (s.queueProgress < cost) return { advanced: false };

    // Advance!
    s.queueProgress -= cost;
    s.queue--;
    s.queueAdvances++;

    // Queue hits 0
    if (s.queue <= 0) {
      if (s.queuePass === 1) {
        // Department transfer
        s.queuePass = 2;
        s.queue = Balance.QUEUE.transferPosition;
        s.queueProgress = 0;
        return { advanced: true, newPosition: s.queue, transferred: true };
      } else {
        // Pass 2 complete — check if Phase 1 is done
        s.queue = 0;
        return { advanced: true, newPosition: 0, completed: isPhase1Complete() };
      }
    }

    return { advanced: true, newPosition: s.queue };
  }

  /**
   * Add progress to queue (from clicking with Hold Pressure).
   */
  function addProgress(amount) {
    State.get().queueProgress += amount;
  }

  /**
   * Check full Phase 1 completion condition.
   */
  function isPhase1Complete() {
    const s = State.get();
    return s.queue <= 0
      && s.queuePass === 2
      && Upgrades.allPurchased()
      && Dust.allCollectorsPurchased();
  }

  /**
   * Check if queue position should be revealed.
   * Returns true if just revealed (first time).
   */
  function checkReveal() {
    const s = State.get();
    if (!s.queueRevealed && s.queue <= Balance.QUEUE.revealPosition) {
      s.queueRevealed = true;
      return true;
    }
    return false;
  }

  /**
   * Apply hangup penalty: lose 20% of positions cleared.
   */
  function applyHangupPenalty() {
    const s = State.get();
    const cleared = Balance.QUEUE.startPosition - s.queue;
    const penalty = Math.max(Balance.HANGUP.minPenalty, Math.floor(cleared * Balance.HANGUP.penaltyPercent));
    s.queue = Math.min(Balance.QUEUE.startPosition, s.queue + penalty);
    s.patience = 0;
    s.wtl = Balance.WTL.max;
    s.hangingUp = false;
    s.hangupCountdown = 0;
    return penalty;
  }

  /**
   * Map queue position to in-game time (for display).
   */
  function getInGameTime() {
    const s = State.get();
    if (s.queuePass === 2) {
      const progress = 1 - (s.queue / Balance.QUEUE.transferPosition);
      return Balance.TIME.nineYears + (Math.max(0, progress) * (Balance.TIME.tenYears - Balance.TIME.nineYears));
    }
    const progress = 1 - (s.queue / Balance.QUEUE.startPosition);
    const curved = Math.pow(progress, 2.5);
    return curved * Balance.TIME.nineYears;
  }

  /**
   * Get queue bar percentage (full at start, empty at 0).
   */
  function getBarPercent() {
    const s = State.get();
    const total = s.queuePass === 2 ? Balance.QUEUE.transferPosition : Balance.QUEUE.startPosition;
    return (s.queue / total) * 100;
  }

  /**
   * Get estimated time to next queue advance (seconds).
   */
  function getETA(effectivePPS) {
    const s = State.get();
    const cost = getCost();
    const remaining = cost - s.queueProgress;
    const wtlState = Wtl.getState();
    const phoneBonus = Phone.getBonus().queue;
    const speed = (s.queueSpeedMult + phoneBonus) * wtlState.queueMult;
    const rate = effectivePPS * speed;
    if (rate <= 0) return Infinity;
    return remaining / rate;
  }

  return { getCost, tick, addProgress, isPhase1Complete, checkReveal, applyHangupPenalty, getInGameTime, getBarPercent, getETA };
})();
