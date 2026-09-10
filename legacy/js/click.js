/**
 * PLEASE HOLD - Click System (v6)
 * 
 * Handles: click value calculation, combo state, Hold Pressure queue push.
 * Combo ALWAYS decays (Muscle Memory slows it, never locks it).
 */
const Click = (function() {

  /**
   * Get current click value (patience earned per click).
   * Formula: (baseValue + effectivePPS × ppsScale) × clickValueMult × wtlClickMult
   */
  function getValue(effectivePPS) {
    const s = State.get();
    const wtlState = Wtl.getState();
    const base = Balance.CLICK.baseValue + (s.clickBaseBonus || 0) + (effectivePPS * Balance.CLICK.ppsScale);
    return base * s.clickValueMult * wtlState.clickMult;
  }

  /**
   * Get queue push amount per click (Hold Pressure).
   * Formula: effectivePPS × queuePushScale × wtlClickMult
   */
  function getQueuePush(effectivePPS) {
    const s = State.get();
    if (!s.flags.holdPressure) return 0;
    const wtlState = Wtl.getState();
    return effectivePPS * Balance.CLICK.queuePushScale * wtlState.clickMult;
  }

  /**
   * Perform a click. Returns { value, queuePush } or null if on cooldown.
   * Does NOT handle UI — caller does that.
   */
  function doClick(effectivePPS, now) {
    const s = State.get();

    // Cooldown check
    if (now - s._lastClickTime < Balance.CLICK.cooldown) return null;
    s._lastClickTime = now;

    // Calculate rewards
    const value = getValue(effectivePPS);
    const queuePush = getQueuePush(effectivePPS);

    // Apply
    s.patience += value;
    s.maxPatience += value;
    s.totalClicks++;
    Wtl.applyClickCost();
    if (queuePush > 0) Queue.addProgress(queuePush);

    // Combo
    if (s.flags.comboUnlocked) {
      s._lastComboClick = now;
      s.combo = Math.min(s.comboCapMax, s.combo + Balance.CLICK.comboGain);
    }

    return { value, queuePush };
  }

  /**
   * Decay combo. Called every tick.
   * Combo always decays after delay. Muscle Memory halves decay rate.
   */
  function decayCombo(dt, now) {
    const s = State.get();
    if (!s.flags.comboUnlocked) return;
    if (s.combo <= 1) return;
    if (now - s._lastComboClick < Balance.CLICK.comboDecayDelay) return;

    let decay = Balance.CLICK.comboDecay;
    if (s.flags.muscleMemory) decay *= Balance.CLICK.comboDecaySlowMult;
    s.combo = Math.max(1, s.combo - decay * dt);
  }

  /**
   * Get current combo value.
   */
  function getCombo() {
    return State.get().combo;
  }

  return { getValue, getQueuePush, doClick, decayCombo, getCombo };
})();
