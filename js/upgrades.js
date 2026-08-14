/**
 * PLEASE HOLD - Upgrades (v6)
 * 
 * Mechanical upgrades only. No per-generator x2 (milestones handle that).
 * Each upgrade has: id, name, desc, cost, reveal conditions, effect function, optional narrative.
 */
const Upgrades = (function() {

  const DEFS = [
    // --- Early game (min 0-10) ---
    { id: 'u_snack', name: 'Snack Drawer', desc: 'Deep Breath costs 50% less',
      cost: 40, revealAt: 20,
      effect(s) { s.flags.deepBreathHalf = true; } },

    { id: 'u_tolerance', name: 'Hold Music Tolerance', desc: '+1 base click value',
      cost: 120, revealAt: 60,
      effect(s) { /* clickValueMult stays, we just bump the base via state */ } },

    { id: 'u_chair', name: 'Comfortable Chair', desc: 'WtL drain reduced 25%',
      cost: 500, revealAt: 280,
      effect(s) { s.flags.chairBought = true; },
      narrative: "You shift. The chair doesn't creak. The hold music hurts a little less." },

    { id: 'u_rhythm', name: 'Rhythmic Clicking', desc: 'Unlock click streak (fast clicks boost production)',
      cost: 900, revealAt: 500,
      effect(s) { s.flags.comboUnlocked = true; },
      narrative: "You find a rhythm. Click. Click. Click. The faster you go, the more the world gives back." },

    { id: 'u_holdpressure', name: 'Hold Pressure', desc: 'Clicking now pushes queue progress',
      cost: 600, revealAt: 400, revealAtQueue: 170,
      effect(s) { s.flags.holdPressure = true; },
      narrative: "Your persistence echoes through the system. Each click pushes the queue." },

    { id: 'u_caffeine', name: 'Caffeine IV Drip', desc: 'Click value x1.5, WtL cost per click halved',
      cost: 3000, revealAt: 2000,
      effect(s) { s.clickValueMult *= 1.5; s.wtlPerClick *= 0.5; } },

    // --- Mid game (min 15-35) ---
    { id: 'u_entropy', name: 'Entropy Noticed', desc: 'Something is accumulating...',
      cost: 50000, revealAt: 50000, revealAtQueue: 120,
      effect(s) { s.flags.dustStarted = true; s.dustPerSec = Balance.DUST.baseRate; },
      narrative: "You glance down. There is a fine layer of dust on your arm. It wasn't there when you started this call." },

    { id: 'u_routing', name: 'Optimized Routing', desc: 'Queue drains 10% faster',
      cost: 200000, revealAt: 100000, revealAtQueue: 100,
      effect(s) { s.queueSpeedMult += 0.10; },
      narrative: "You've found a shortcut in the system. Barely noticeable, but it's there." },

    { id: 'u_muscle', name: 'Muscle Memory', desc: 'Combo decays 50% slower',
      cost: 300000, revealAt: 150000, revealAtQueue: 85,
      effect(s) { s.flags.muscleMemory = true; },
      narrative: "Your fingers remember. The rhythm is in your bones. The decay... slows." },

    // --- Mid-late game (min 35-50) ---
    { id: 'u_callus', name: 'Emotional Callus', desc: 'WtL drain reduced 50%',
      cost: 500000, revealAt: 400000, revealAtQueue: 60, revealAtActiveTime: 2400,
      effect(s) { s.flags.emotionalCallus = true; },
      narrative: "You've gone numb. The music still plays but it passes through you now." },

    // --- Late game ---
    { id: 'u_insider', name: 'Corporate Insider', desc: 'Clicking costs no WtL',
      cost: 50000000, revealAt: 30000000, revealAtQueue: 8,
      effect(s) { s.wtlPerClick = 0; s.flags.noWtlCost = true; },
      narrative: "You no longer feel the drain. But the hold music... it still wears on you." },

    // --- Time-gated: x2 ALL production ---
    { id: 'u_blur1', name: 'Time Blur I', desc: 'Everything accelerates. (ALL x2)',
      cost: 100000, revealAtActiveTime: 1800,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = 5; },
      narrative: "Years. It's been years. The seasons outside have blurred into a single grey smear." },

    { id: 'u_blur2', name: 'Time Blur II', desc: 'Reality bends. (ALL x2)',
      cost: 500000, revealAtActiveTime: 2700,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = 6; },
      narrative: "Half a decade on hold. You've aged. The phone hasn't. It mocks you with its patience." },

    { id: 'u_blur3', name: 'Time Blur III', desc: 'Time is meaningless. (ALL x2)',
      cost: 2500000, revealAtActiveTime: 3600,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = 8; },
      narrative: "Seven years. You've been holding longer than some marriages last. The dust agrees." },
  ];

  /**
   * Get all upgrade definitions.
   */
  function getDefs() {
    return DEFS;
  }

  /**
   * Get upgrades that should be visible (meet reveal conditions, not yet purchased).
   */
  function getVisible() {
    const s = State.get();
    return DEFS.filter(u => {
      if (s.boughtUpgrades.includes(u.id)) return false;
      if (u.revealAt && s.maxPatience < u.revealAt) return false;
      if (u.revealAtQueue && s.queue > u.revealAtQueue) return false;
      if (u.revealAtActiveTime && s.activePlayTime < u.revealAtActiveTime) return false;
      return true;
    });
  }

  /**
   * Purchase an upgrade. Returns true if successful.
   * Applies effect to state. Does NOT handle UI.
   */
  function buy(id) {
    const s = State.get();
    const u = DEFS.find(d => d.id === id);
    if (!u) return false;
    if (s.boughtUpgrades.includes(id)) return false;
    if (s.patience < u.cost) return false;

    s.patience -= u.cost;
    s.boughtUpgrades.push(id);
    u.effect(s);
    return true;
  }

  /**
   * Get an upgrade def by ID.
   */
  function getById(id) {
    return DEFS.find(d => d.id === id);
  }

  /**
   * Check if all upgrades have been purchased.
   */
  function allPurchased() {
    return State.get().boughtUpgrades.length >= DEFS.length;
  }

  /**
   * Re-apply all purchased upgrade effects (for save restore).
   */
  function reapplyAll() {
    const s = State.get();
    s.boughtUpgrades.forEach(id => {
      const u = DEFS.find(d => d.id === id);
      if (u) u.effect(s);
    });
  }

  return { getDefs, getVisible, buy, getById, allPurchased, reapplyAll };
})();
