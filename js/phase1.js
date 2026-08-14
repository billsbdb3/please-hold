/**
 * Phase 1: The Call (FINAL v5)
 * 
 * TIME = QUEUE. No independent clock.
 * 200 queue positions, growth 1.06, base 200.
 * Milestone multipliers at 25/50/75/100 owned (rotating dominance).
 * No individual "Gen x2" upgrades — milestones handle that.
 * Combo always decays (Muscle Memory slows it, doesn't lock it).
 * Reversed pressure second pass.
 */
const Phase1 = (function() {

  // === GENERATORS ("Coping Mechanisms") ===
  // Cascade: each tier boosts ALL below. Capped at 2.5x total.
  const generators = [
    { id: 'gen_doodle', name: 'Doodle Pad', desc: 'Doodle to pass the time',
      baseCost: 15, growthRate: 1.15, baseProduction: 0.2,
      owned: 0, unlocked: true, unlocksAt: 0, softCapAt: 30, boostPercent: 0 },
    { id: 'gen_fidget', name: 'Fidget Spinner', desc: 'Idle hands, idle minds',
      baseCost: 100, growthRate: 1.14, baseProduction: 1.0,
      owned: 0, unlocked: false, unlocksAt: 80, softCapAt: 25, boostPercent: 0.004 },
    { id: 'gen_autodialer', name: 'Autodialer', desc: 'It redials for you. Endlessly.',
      baseCost: 800, growthRate: 1.13, baseProduction: 5.0,
      owned: 0, unlocked: false, unlocksAt: 600, softCapAt: 22, boostPercent: 0.008 },
    { id: 'gen_speeddialer', name: 'Speed Dialer', desc: 'Faster. Angrier. More persistent.',
      baseCost: 6000, growthRate: 1.12, baseProduction: 25.0,
      owned: 0, unlocked: false, unlocksAt: 5000, softCapAt: 18, boostPercent: 0.012 },
    { id: 'gen_robocaller', name: 'Robo-Caller', desc: 'An army of robotic patience.',
      baseCost: 50000, growthRate: 1.11, baseProduction: 120.0,
      owned: 0, unlocked: false, unlocksAt: 40000, softCapAt: 15, boostPercent: 0.016 },
    { id: 'gen_callcenter', name: 'Shadow Call Center', desc: 'They hold for you. All of them.',
      baseCost: 500000, growthRate: 1.10, baseProduction: 600.0,
      owned: 0, unlocked: false, unlocksAt: 350000, softCapAt: 12, boostPercent: 0.02 },
  ];

  // === UPGRADES (slimmed — no individual gen x2, milestones handle that) ===
  const upgrades = [
    // --- Early game (min 0-10) ---
    { id: 'u_snack', name: 'Snack Drawer', desc: 'Deep Breath costs 50% less', cost: 40, revealAt: 20,
      effect(s) { s.flags.deepBreathHalf = true; } },
    { id: 'u_tolerance', name: 'Hold Music Tolerance', desc: '+1 base click value', cost: 120, revealAt: 60,
      effect(s) { s.baseClickValue += 1; } },
    { id: 'u_chair', name: 'Comfortable Chair', desc: 'WtL drain reduced 25%', cost: 500, revealAt: 280,
      effect(s) { s.drainReduction = (s.drainReduction || 0) + 0.25; },
      narrative: "You shift. The chair doesn't creak. The hold music hurts a little less." },
    { id: 'u_rhythm', name: 'Rhythmic Clicking', desc: 'Unlock click streak (fast clicks boost production)', cost: 900, revealAt: 500,
      effect(s) { s.flags.comboUnlocked = true; },
      narrative: "You find a rhythm. Click. Click. Click. The faster you go, the more the world gives back." },
    { id: 'u_holdpressure', name: 'Hold Pressure', desc: 'Clicking now pushes queue progress', cost: 600, revealAt: 400, revealAtQueue: 170,
      effect(s) { s.flags.holdPressure = true; },
      narrative: "Your persistence echoes through the system. Each click pushes the queue." },
    { id: 'u_caffeine', name: 'Caffeine IV Drip', desc: 'Click value x1.5, WtL cost per click halved', cost: 3000, revealAt: 2000,
      effect(s) { s.clickValueMult *= 1.5; s.wtlPerClick *= 0.5; } },

    // --- Mid game (min 15-35) ---
    { id: 'u_duststart', name: 'Entropy Noticed', desc: 'Something is accumulating...', cost: 50000, revealAt: 50000, revealAtQueue: 120,
      effect(s) { s.dustPerSec = Balance.DUST.baseRate; s.flags.dustStarted = true; },
      narrative: "You glance down. There is a fine layer of dust on your arm. It wasn't there when you started this call." },
    { id: 'u_routing', name: 'Optimized Routing', desc: 'Queue drains 10% faster', cost: 200000, revealAt: 100000, revealAtQueue: 100,
      effect(s) { s.queueSpeedMult += 0.10; },
      narrative: "You've found a shortcut in the system. Barely noticeable, but it's there." },
    { id: 'u_muscle', name: 'Muscle Memory', desc: 'Combo decays 50% slower', cost: 300000, revealAt: 150000, revealAtQueue: 85,
      effect(s) { s.flags.muscleMemory = true; },
      narrative: "Your fingers remember. The rhythm is in your bones. The decay... slows." },

    // --- Mid-late game (min 35-50) ---
    { id: 'u_callus', name: 'Emotional Callus', desc: 'WtL drain reduced 50%', cost: 500000, revealAt: 400000, revealAtQueue: 60, revealAtActiveTime: 2400,
      effect(s) { s.flags.emotionalCallus = true; },
      narrative: "You've gone numb. The music still plays but it passes through you now." },

    // --- Late game (min 50+) ---
    { id: 'u_insider', name: 'Corporate Insider', desc: 'Clicking costs no WtL', cost: 50000000, revealAt: 30000000, revealAtQueue: 8,
      effect(s) { s.wtlPerClick = 0; s.flags.noWtlCost = true; },
      narrative: "You no longer feel the drain from clicking. But the hold music... it still wears on you." },

    // --- Time-gated: x2 ALL production ---
    { id: 'u_timewarp1', name: 'Time Blur I', desc: 'Everything accelerates. (ALL x2)', cost: 100000, revealAtActiveTime: 1800,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = Balance.TIME.comboCapAfterBlurI; },
      narrative: "Years. It's been years. The seasons outside the window have blurred into a single grey smear." },
    { id: 'u_timewarp2', name: 'Time Blur II', desc: 'Reality bends. (ALL x2)', cost: 500000, revealAtActiveTime: 2700,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = Balance.TIME.comboCapAfterBlurII; },
      narrative: "Half a decade on hold. You've aged. The phone hasn't. It mocks you with its patience." },
    { id: 'u_timewarp3', name: 'Time Blur III', desc: 'Time is meaningless. (ALL x2)', cost: 2500000, revealAtActiveTime: 3600,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = Balance.TIME.comboCapAfterBlurIII; },
      narrative: "Seven years. You've been holding longer than some marriages last. The dust agrees." },
  ];

  // === QUEUE ===
  const QUEUE_START = Balance.QUEUE.startPosition;

  function getGeneratorCost(gen) {
    const owned = gen.owned;
    if (owned >= gen.softCapAt) {
      const base = gen.baseCost * Math.pow(gen.growthRate, gen.softCapAt);
      const excess = owned - gen.softCapAt;
      const postCapGrowth = Math.pow(gen.growthRate, Balance.SOFT_CAP_EXPONENT);
      return Math.floor(base * Math.pow(postCapGrowth, excess));
    }
    return Math.floor(gen.baseCost * Math.pow(gen.growthRate, owned));
  }

  /**
   * Get milestone multiplier for a generator based on owned count.
   * x2 at every 25 owned (25, 50, 75, 100 = x2, x4, x8, x16).
   */
  function getMilestoneMultiplier(owned) {
    const milestones = Math.floor(owned / Balance.MILESTONE_INTERVAL);
    return Math.pow(2, milestones);
  }

  /**
   * Cascading PPS. Each tier boosts ALL below. CAPPED at 2.5x.
   * Now includes milestone multipliers.
   */
  function calcGeneratorPPS(state) {
    const nestedBoost = {};
    generators.forEach(g => { nestedBoost[g.id] = 1; });

    for (let i = generators.length - 1; i >= 1; i--) {
      const g = generators[i];
      if (g.owned > 0 && g.boostPercent > 0) {
        for (let j = 0; j < i; j++) {
          nestedBoost[generators[j].id] += g.owned * g.boostPercent;
        }
      }
    }

    // Cap cascade at 2.5x
    generators.forEach(g => {
      if (nestedBoost[g.id] > 2.5) nestedBoost[g.id] = 2.5;
    });

    let total = 0;
    generators.forEach(g => {
      if (g.owned > 0) {
        const upgradeMult = (state.genMultipliers[g.id] || 1) * (state.globalGenMultiplier || 1);
        const milestoneMult = getMilestoneMultiplier(g.owned);
        total += g.baseProduction * g.owned * upgradeMult * milestoneMult * nestedBoost[g.id];
      }
    });
    return total;
  }

  function getNestedBoost(genId) {
    const targetIdx = generators.findIndex(g => g.id === genId);
    if (targetIdx < 0) return 1;
    let boost = 1;
    for (let i = targetIdx + 1; i < generators.length; i++) {
      const g = generators[i];
      if (g.owned > 0 && g.boostPercent > 0) boost += g.owned * g.boostPercent;
    }
    return Math.min(2.5, boost);
  }

  // === MILESTONES (queue-position narrative) ===
  const milestones = [
    { at: 180, msg: '"Your call is important to us." You doubt this.' },
    { at: 150, msg: '"A representative will be with you shortly." Shortly is relative.' },
    { at: 120, msg: 'A recorded voice apologizes. It is not sorry.' },
    { at: 90, msg: 'The hold music has changed. You liked the old one better.' },
    { at: 60, msg: '"Your call is EXTREMELY important." The emphasis is suspicious.' },
    { at: 30, msg: 'You can feel it. The end is near. Probably.' },
    { at: 15, msg: 'The recording stutters. Almost.' },
    { at: 8, msg: 'Single digits. This is real. This is happening.' },
    { at: 3, msg: 'Almost there. Almost.' },
    { at: 1, msg: 'Next in line.' },
  ];

  function checkMilestones(queue, triggered) {
    milestones.forEach(m => {
      if (queue <= m.at && !triggered.has(m.at)) {
        triggered.add(m.at);
        UI.showMilestone(m.msg);
      }
    });
  }

  /**
   * Check if any generator just hit a milestone threshold.
   * Returns array of {gen, milestone} objects for logging/notification.
   */
  function checkGeneratorMilestones(state) {
    const fired = [];
    generators.forEach(g => {
      if (g.owned > 0 && g.owned % Balance.MILESTONE_INTERVAL === 0) {
        const milestoneNum = g.owned / Balance.MILESTONE_INTERVAL;
        const key = g.id + '_m' + milestoneNum;
        if (!state.triggeredGenMilestones.has(key)) {
          state.triggeredGenMilestones.add(key);
          fired.push({ gen: g, milestone: milestoneNum, mult: Math.pow(2, milestoneNum) });
        }
      }
    });
    return fired;
  }

  return {
    generators, upgrades, getGeneratorCost, getMilestoneMultiplier,
    calcGeneratorPPS, getNestedBoost, checkMilestones, checkGeneratorMilestones, QUEUE_START
  };
})();
