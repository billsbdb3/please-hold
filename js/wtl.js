/**
 * PLEASE HOLD - Will to Live (v6)
 * 
 * Graduated states: Calm → Frustrated → Furious → Breaking Point → Hanging Up
 * Each state modifies queue speed, click power, and generator output.
 * 
 * Drain scales with: time active + proximity to front of queue.
 * Deep Breath cost scales with effective PPS.
 * Hangup at <10% with 10-second countdown.
 */
const Wtl = (function() {

  /**
   * Get current WtL state based on percentage.
   * Returns: { name, min, queueMult, clickMult, genMult }
   */
  function getState() {
    const s = State.get();
    const pct = (s.wtl / Balance.WTL.max) * 100;
    const t = Balance.WTL.thresholds;

    if (pct >= t.calm.min) return { name: 'Calm', ...t.calm };
    if (pct >= t.frustrated.min) return { name: 'Frustrated', ...t.frustrated };
    if (pct >= t.furious.min) return { name: 'Furious', ...t.furious };
    if (pct >= t.breakingPoint.min) return { name: 'Breaking Point', ...t.breakingPoint };
    return { name: 'Hanging Up', ...t.hangingUp };
  }

  /**
   * Calculate current drain rate (per second).
   * Returns 0 if drain hasn't started yet.
   */
  function getDrain() {
    const s = State.get();
    const activeSeconds = s.activePlayTime;
    const drainStart = Balance.WTL.drainStart;

    if (activeSeconds <= drainStart) return 0;

    // Base drain
    let drain = Balance.WTL.baseDrain;

    // Position-based drain: closer to front = more anxious
    const progressRatio = 1 - (s.queue / Balance.QUEUE.startPosition);
    drain += Balance.WTL.positionDrainMax * Math.max(0, progressRatio);

    // Upgrade reductions (multiplicative)
    if (s.flags.chairBought) drain *= (1 - Balance.WTL.drainReductionChair);
    if (s.flags.emotionalCallus) drain *= (1 - Balance.WTL.drainReductionCallus);

    return drain;
  }

  /**
   * Apply drain and passive regen for a tick. Called from game loop.
   * Returns the new WtL state name if it changed, null otherwise.
   */
  function tick(dt) {
    const s = State.get();
    if (s.isIdle) return null;

    const prevState = getState().name;

    // Drain
    const drain = getDrain();
    if (drain > 0) {
      s.wtl = Math.max(0, s.wtl - drain * dt);
    }

    // Passive regen (tiny, always on)
    s.wtl = Math.min(Balance.WTL.max, s.wtl + Balance.WTL.passiveRegen * dt);

    // Check for state transition
    const newState = getState().name;
    if (newState !== prevState) return newState;
    return null;
  }

  /**
   * Update hangup countdown. Called from game loop.
   * Returns 'hangup' if player should hang up, null otherwise.
   */
  function checkHangup(dt) {
    const s = State.get();
    if (s.isIdle) return null;

    const pct = (s.wtl / Balance.WTL.max) * 100;

    if (pct < Balance.WTL.thresholds.hangingUp.min + 10) { // <10%
      if (!s.hangingUp) {
        s.hangingUp = true;
        s.hangupCountdown = Balance.WTL.hangupCountdown;
      }
      s.hangupCountdown -= dt;
      if (s.hangupCountdown <= 0) return 'hangup';
    } else {
      s.hangingUp = false;
      s.hangupCountdown = 0;
    }

    return null;
  }

  /**
   * Get Deep Breath cost (scales with effective PPS including combo).
   */
  function getRefillCost(effectivePPS) {
    const s = State.get();
    let cost = Math.max(Balance.WTL.refillMinCost, Math.floor(effectivePPS * Balance.WTL.refillPpsMult));
    if (s.flags.deepBreathHalf) cost = Math.floor(cost * 0.5);
    return cost;
  }

  /**
   * Perform Deep Breath. Returns true if successful.
   */
  function doRefill(effectivePPS) {
    const s = State.get();
    const cost = getRefillCost(effectivePPS);
    if (s.patience < cost) return false;

    s.patience -= cost;
    s.wtl = Math.min(Balance.WTL.max, s.wtl + Balance.WTL.refillAmount);
    return true;
  }

  /**
   * Apply click WtL cost.
   */
  function applyClickCost() {
    const s = State.get();
    if (!s.flags.noWtlCost) {
      s.wtl = Math.max(0, s.wtl - s.wtlPerClick);
    }
  }

  /**
   * Get WtL percentage (0-100).
   */
  function getPercent() {
    return (State.get().wtl / Balance.WTL.max) * 100;
  }

  return { getState, getDrain, tick, checkHangup, getRefillCost, doRefill, applyClickCost, getPercent };
})();
