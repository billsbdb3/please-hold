/**
 * Phase 1: The Call (v3 Redesign)
 * 
 * TIME = QUEUE. No independent clock.
 * Upgrades spread across 90 minutes via active time gates.
 * No x2-ALL except Time Blurs (3 total, 15 min apart).
 * Cascade capped at 2.5x. Soft cap growthRate^4.
 * Click value scales with pps (always 5% of 1 second).
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
  // Pacing: something new every 3-5 min across 90 min.
  // NO x2-ALL here. Time Blurs (in time-gated section) are the only globals.
  // Gates: revealAt (total patience earned), revealAtQueue, revealAtActiveTime
  const upgrades = [
    // --- Early game: patience-gated only (min 0-15) ---
    { id: 'u_snack', name: 'Snack Drawer', desc: 'Deep Breath: 3p → +12 WtL', cost: 40, revealAt: 20,
      effect(s) { s.refillCost = 3; s.refillAmount = 12; } },
    { id: 'u_tolerance', name: 'Hold Music Tolerance', desc: '+1 patience/click base', cost: 120, revealAt: 60,
      effect(s) { s.patiencePerClick += 1; } },
    { id: 'u_doodle2x', name: 'Colored Pencils', desc: 'Doodle Pads produce x2', cost: 250, revealAt: 130,
      effect(s) { s.genMultipliers.gen_doodle *= 2; } },
    { id: 'u_chair', name: 'Comfortable Chair', desc: '+5 max WtL, +0.3 WtL regen', cost: 500, revealAt: 280,
      effect(s) { s.wtlMax += 5; s.wtlRegen += 0.3; } },
    { id: 'u_rhythm', name: 'Rhythmic Clicking', desc: 'Unlock click streak (fast clicks boost production)', cost: 900, revealAt: 500,
      effect(s) { s.flags.comboUnlocked = true; },
      narrative: "You find a rhythm. Click. Click. Click. The faster you go, the more the world gives back." },
    { id: 'u_fidget2x', name: 'Titanium Bearings', desc: 'Fidget Spinners produce x2', cost: 1500, revealAt: 900,
      effect(s) { s.genMultipliers.gen_fidget *= 2; } },
    { id: 'u_caffeine', name: 'Caffeine IV Drip', desc: '+2 base click, halve WtL cost', cost: 3000, revealAt: 2000,
      effect(s) { s.patiencePerClick += 2; s.wtlPerClick = Math.max(0.25, s.wtlPerClick * 0.5); } },
    { id: 'u_auto2x', name: 'Parallel Lines', desc: 'Autodialers produce x2', cost: 6000, revealAt: 4000,
      effect(s) { s.genMultipliers.gen_autodialer *= 2; } },

    // --- Mid game: queue-gated (min 15-45) ---
    { id: 'u_speed2x', name: 'Overclocked Modem', desc: 'Speed Dialers produce x2', cost: 25000, revealAt: 15000, revealAtQueue: 100,
      effect(s) { s.genMultipliers.gen_speeddialer *= 2; } },
    { id: 'u_duststart', name: 'Entropy Noticed', desc: 'Something is accumulating...', cost: 50000, revealAt: 30000, revealAtQueue: 80,
      effect(s) { s.dustPerSec = Balance.DUST.baseRate; s.flags.dustStarted = true; },
      narrative: "You glance down. There is a fine layer of dust on your arm. It wasn't there when you started this call." },
    { id: 'u_robo2x', name: 'Machine Learning', desc: 'Robo-Callers produce x2', cost: 150000, revealAt: 80000, revealAtQueue: 60,
      effect(s) { s.genMultipliers.gen_robocaller *= 2; } },
    { id: 'u_muscle', name: 'Muscle Memory', desc: 'Click streak never decays', cost: 300000, revealAt: 150000, revealAtQueue: 50,
      effect(s) { s.flags.comboLocked = true; },
      narrative: "Your fingers remember. The rhythm is in your bones now. The streak... stays." },
    { id: 'u_qfamiliar', name: 'Queue Familiarity', desc: 'Rapid advances reduce next cost (max -25%)', cost: 200000, revealAt: 100000, revealAtQueue: 55,
      effect(s) { s.flags.queueFamiliarity = true; },
      narrative: "You know the patterns now. Each advance builds on the last." },
    { id: 'u_shadow2x', name: 'Dark Network', desc: 'Shadow Call Centers produce x2', cost: 800000, revealAt: 500000, revealAtQueue: 35,
      effect(s) { s.genMultipliers.gen_callcenter *= 2; } },
    { id: 'u_insider', name: 'Corporate Insider', desc: 'Clicking no longer costs WtL', cost: 2000000, revealAt: 1200000, revealAtQueue: 15,
      effect(s) { s.wtlPerClick = 0; s.flags.noWtlCost = true; },
      narrative: "You no longer feel the drain from clicking. But the hold music... it still wears on you." },

    // --- Time-gated: x2 ALL production (the ONLY global multipliers) ---
    { id: 'u_timewarp1', name: 'Time Blur I', desc: 'Everything accelerates. (ALL x2)', cost: 100000, revealAtActiveTime: 1800,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = 5; },
      narrative: "Was that a minute? An hour? The clock has stopped making sense." },
    { id: 'u_timewarp2', name: 'Time Blur II', desc: 'Reality bends. (ALL x2)', cost: 500000, revealAtActiveTime: 2700,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = 6; },
      narrative: "Days? Weeks? The concept of 'today' has become philosophical." },
    { id: 'u_timewarp3', name: 'Time Blur III', desc: 'Time is meaningless. (ALL x2)', cost: 2500000, revealAtActiveTime: 3600,
      effect(s) { s.globalGenMultiplier *= 2; s.comboCapMax = 8; },
      narrative: "You blink. Was that a week? The calendar is meaningless." },
  ];

  // === QUEUE ===
  const QUEUE_START = Balance.QUEUE.startPosition;

  function getAdvanceCost(advances) {
    const baseCost = Math.floor(Balance.QUEUE.baseCost * Math.pow(Balance.QUEUE.growthRate, advances));
    if (advances >= Balance.QUEUE.lateThreshold) {
      const depth = advances - Balance.QUEUE.lateThreshold;
      return Math.floor(baseCost * (1 + Math.pow(depth, Balance.QUEUE.lateExponent) / Balance.QUEUE.lateDivisor));
    }
    return baseCost;
  }

  function getGeneratorCost(gen) {
    const owned = gen.owned;
    if (owned >= gen.softCapAt) {
      const base = gen.baseCost * Math.pow(gen.growthRate, gen.softCapAt);
      const excess = owned - gen.softCapAt;
      const postCapGrowth = Math.pow(gen.growthRate, 4); // softer: ^4 instead of ^8
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

  // === MILESTONES ===
  const milestones = [
    { at: 130, msg: '"Your call is important to us." You doubt this.' },
    { at: 100, msg: '"A representative will be with you shortly." Shortly is relative.' },
    { at: 80, msg: 'A recorded voice apologizes. It is not sorry.' },
    { at: 60, msg: 'The hold music has changed. You liked the old one better.' },
    { at: 40, msg: '"Your call is very important to us." The emphasis on "very" is suspicious.' },
    { at: 20, msg: 'You can feel it. The end is near. Probably.' },
    { at: 10, msg: 'Single digits. This is real. This is happening.' },
    { at: 5, msg: 'Almost there. Almost.' },
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
    generators, upgrades, getAdvanceCost, getGeneratorCost,
    calcGeneratorPPS, getNestedBoost, checkMilestones, QUEUE_START
  };
})();
