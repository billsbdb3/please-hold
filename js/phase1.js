/**
 * Phase 1: The Call (v4 Full Rebalance)
 * 
 * TIME = QUEUE. No independent clock.
 * 200 queue positions, growth 1.06, base 200, pass2 x5.
 * Hold Pressure gates click→queue early (~6min).
 * Emotional Callus fixes WtL in late game.
 * Phone upgrades provide passive bonuses.
 * No WtL regen anywhere. No wtlMax increases.
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

  // === UPGRADES ===
  // Gates rebalanced for 200 queue positions.
  // No WtL regen. No wtlMax increases. All meaningful.
  const upgrades = [
    // --- Early game: patience-gated only (min 0-10) ---
    { id: 'u_snack', name: 'Snack Drawer', desc: 'Deep Breath costs 50% less', cost: 40, revealAt: 20,
      effect(s) { s.flags.deepBreathHalf = true; } },
    { id: 'u_tolerance', name: 'Hold Music Tolerance', desc: '+1 patience/click base', cost: 120, revealAt: 60,
      effect(s) { s.patiencePerClick += 1; } },
    { id: 'u_doodle2x', name: 'Colored Pencils', desc: 'Doodle Pads produce x2', cost: 250, revealAt: 130, revealAtGen: { id: 'gen_doodle', count: 5 },
      effect(s) { s.genMultipliers.gen_doodle *= 2; } },
    { id: 'u_chair', name: 'Comfortable Chair', desc: '+2 patience/click, WtL drain starts later', cost: 500, revealAt: 280,
      effect(s) { s.patiencePerClick += 2; },
      narrative: "You shift. The chair doesn't creak. Small victories." },
    { id: 'u_rhythm', name: 'Rhythmic Clicking', desc: 'Unlock click streak (fast clicks boost production)', cost: 900, revealAt: 500,
      effect(s) { s.flags.comboUnlocked = true; },
      narrative: "You find a rhythm. Click. Click. Click. The faster you go, the more the world gives back." },
    { id: 'u_holdpressure', name: 'Hold Pressure', desc: 'Clicking now pushes queue progress', cost: 600, revealAt: 400, revealAtQueue: 170,
      effect(s) { s.flags.holdPressure = true; },
      narrative: "Your persistence echoes through the system. Each click pushes the queue." },
    { id: 'u_fidget2x', name: 'Titanium Bearings', desc: 'Fidget Spinners produce x2', cost: 1500, revealAt: 900, revealAtGen: { id: 'gen_fidget', count: 5 },
      effect(s) { s.genMultipliers.gen_fidget *= 2; } },
    { id: 'u_caffeine', name: 'Caffeine IV Drip', desc: '+50% click power, halve WtL cost per click', cost: 3000, revealAt: 2000,
      effect(s) { s.patiencePerClick += 1; s.wtlPerClick = Math.max(0.25, s.wtlPerClick * 0.5); } },
    { id: 'u_auto2x', name: 'Parallel Lines', desc: 'Autodialers produce x2', cost: 6000, revealAt: 4000, revealAtGen: { id: 'gen_autodialer', count: 3 },
      effect(s) { s.genMultipliers.gen_autodialer *= 2; } },

    // --- Mid game: queue-gated (min 15-40) ---
    { id: 'u_speed2x', name: 'Overclocked Modem', desc: 'Speed Dialers produce x2', cost: 25000, revealAt: 15000, revealAtQueue: 130, revealAtGen: { id: 'gen_speeddialer', count: 3 },
      effect(s) { s.genMultipliers.gen_speeddialer *= 2; } },
    { id: 'u_duststart', name: 'Entropy Noticed', desc: 'Something is accumulating...', cost: 50000, revealAt: 50000, revealAtQueue: 120,
      effect(s) { s.dustPerSec = Balance.DUST.baseRate; s.flags.dustStarted = true; },
      narrative: "You glance down. There is a fine layer of dust on your arm. It wasn't there when you started this call." },
    { id: 'u_robo2x', name: 'Machine Learning', desc: 'Robo-Callers produce x2', cost: 150000, revealAt: 80000, revealAtQueue: 110, revealAtGen: { id: 'gen_robocaller', count: 2 },
      effect(s) { s.genMultipliers.gen_robocaller *= 2; } },
    { id: 'u_qfamiliar', name: 'Optimized Routing', desc: 'Queue drains 10% faster', cost: 200000, revealAt: 100000, revealAtQueue: 100,
      effect(s) { s.queueSpeedMult += 0.10; },
      narrative: "You've found a shortcut in the system. Barely noticeable, but it's there." },
    { id: 'u_muscle', name: 'Muscle Memory', desc: 'Click streak never decays', cost: 300000, revealAt: 150000, revealAtQueue: 85,
      effect(s) { s.flags.comboLocked = true; },
      narrative: "Your fingers remember. The rhythm is in your bones now. The streak... stays." },

    // --- Mid-late game (min 35-50) ---
    { id: 'u_shadow2x', name: 'Dark Network', desc: 'Shadow Call Centers produce x2', cost: 800000, revealAt: 500000, revealAtQueue: 65, revealAtGen: { id: 'gen_callcenter', count: 2 },
      effect(s) { s.genMultipliers.gen_callcenter *= 2; } },
    { id: 'u_callus', name: 'Emotional Callus', desc: 'Hold music drain reduced 75%', cost: 500000, revealAt: 400000, revealAtQueue: 60, revealAtActiveTime: 2400,
      effect(s) { s.flags.emotionalCallus = true; },
      narrative: "You've gone numb. The music still plays but it passes through you now." },
    { id: 'u_robo3x', name: 'Neural Network', desc: 'Robo-Callers produce x3', cost: 3000000, revealAt: 2000000, revealAtQueue: 45, revealAtGen: { id: 'gen_robocaller', count: 5 },
      effect(s) { s.genMultipliers.gen_robocaller *= 3; } },

    // --- Late game (min 50-68) ---
    { id: 'u_speed3x', name: 'Quantum Dialing', desc: 'Speed Dialers produce x3', cost: 8000000, revealAt: 5000000, revealAtQueue: 30, revealAtGen: { id: 'gen_speeddialer', count: 6 },
      effect(s) { s.genMultipliers.gen_speeddialer *= 3; } },
    { id: 'u_allboost', name: 'Resonance Cascade', desc: 'ALL coping mechanisms +50%', cost: 20000000, revealAt: 12000000, revealAtQueue: 18,
      effect(s) { s.globalGenMultiplier *= 1.5; },
      narrative: "Everything vibrates at the same frequency. The hold music. The dust. You." },
    { id: 'u_insider', name: 'Corporate Insider', desc: 'Clicking no longer costs WtL', cost: 50000000, revealAt: 30000000, revealAtQueue: 8,
      effect(s) { s.wtlPerClick = 0; s.flags.noWtlCost = true; },
      narrative: "You no longer feel the drain from clicking. But the hold music... it still wears on you." },

    // --- Time-gated: x2 ALL production (the ONLY global multipliers from upgrades) ---
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
   * Cascading PPS. Each tier boosts ALL below. CAPPED at 2.5x.
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
        total += g.baseProduction * g.owned * upgradeMult * nestedBoost[g.id];
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

  // === MILESTONES (adjusted for 200 positions) ===
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

  return {
    generators, upgrades, getGeneratorCost,
    calcGeneratorPPS, getNestedBoost, checkMilestones, QUEUE_START
  };
})();
