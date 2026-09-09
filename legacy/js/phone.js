/**
 * PLEASE HOLD - Phone Tier System (v6)
 * 
 * Phone upgrades are passive bonuses gated by queue position.
 * Phase 1 caps at Cordless Phone (tier 3).
 * Smartphone = Phase 2, Neural Link = Phase 3.
 */
const Phone = (function() {

  /**
   * Check if phone tier should upgrade based on current queue position.
   * Returns the new tier object if upgraded, null otherwise.
   */
  function checkTier() {
    const s = State.get();
    const tiers = Balance.PHONE;

    for (let i = tiers.length - 1; i >= 0; i--) {
      if (s.queue <= tiers[i].queueGate && s.phoneTier < i) {
        s.phoneTier = i;
        return tiers[i];
      }
    }
    return null;
  }

  /**
   * Get current phone bonus (production + queue speed).
   */
  function getBonus() {
    const tier = Balance.PHONE[State.get().phoneTier];
    return { prod: tier.prodBonus, queue: tier.queueBonus };
  }

  /**
   * Get current tier info for display.
   */
  function getCurrentTier() {
    return Balance.PHONE[State.get().phoneTier];
  }

  return { checkTier, getBonus, getCurrentTier };
})();
