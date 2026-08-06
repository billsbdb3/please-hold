/**
 * Phase 1: The Call
 * ~1.5-2 hours of gameplay.
 *
 * DESIGN:
 * Two systems work together:
 * 1. GENERATORS (repeatable purchases) - buy more to increase patience/sec
 *    Each generator has: base cost, cost growth (1.15 per owned), base production
 * 2. UPGRADES (one-time purchases) - multiply generators, unlock new mechanics
 *
 * The player alternates between buying generators (steady income growth)
 * and saving for upgrades (multiplicative jumps). No dead zones because
 * generators always have a "next one" to save for.
 *
 * Queue: 150 positions. Cost = 25 * 1.065^advances.
 * Total cost to clear: ~600K patience. At target end-game pps (~300),
 * final advances take ~30-60s each. Feels fast at the end (acceleration).
 */
const Phase1 = (function() {

  // === GENERATORS (repeatable purchases) ===
  // cost_next = baseCost * growthRate^owned
  const generators = [
    {
      id: 'gen_doodle',
      name: 'Doodle Pad',
      desc: 'Doodle to pass the time',
      baseCost: 10,
      growthRate: 1.15,
      baseProduction: 0.2, // patience/sec per unit
      owned: 0,
      unlocked: true,
      unlocksAt: 0, // always available
    },
    {
      id: 'gen_fidget',
      name: 'Fidget Spinner',
      desc: 'Idle hands, idle minds',
      baseCost: 60,
      growthRate: 1.15,
      baseProduction: 1.0,
      owned: 0,
      unlocked: false,
      unlocksAt: 15, // unlocks at 15 total patience earned (maxPatience)
    },
    {
      id: 'gen_autodialer',
      name: 'Autodialer',
      desc: 'It redials for you. Endlessly.',
      baseCost: 300,
      growthRate: 1.14,
      baseProduction: 5.0,
      owned: 0,
      unlocked: false,
      unlocksAt: 200,
    },
    {
      id: 'gen_speeddialer',
      name: 'Speed Dialer',
      desc: 'Faster. Angrier. More persistent.',
      baseCost: 1500,
      growthRate: 1.13,
      baseProduction: 20.0,
      owned: 0,
      unlocked: false,
      unlocksAt: 1500,
    },
    {
      id: 'gen_robocaller',
      name: 'Robo-Caller',
      desc: 'An army of robotic patience.',
      baseCost: 8000,
      growthRate: 1.12,
      baseProduction: 75.0,
      owned: 0,
      unlocked: false,
      unlocksAt: 8000,
    },
    {
      id: 'gen_callcenter',
      name: 'Shadow Call Center',
      desc: 'They hold for you. All of them.',
      baseCost: 50000,
      growthRate: 1.11,
      baseProduction: 300.0,
      owned: 0,
      unlocked: false,
      unlocksAt: 50000,
    },
  ];

  // === UPGRADES (one-time purchases) ===
  // These multiply generator output or provide unique effects
  const upgrades = [
    // Early survival
    { id: 'u_snack', name: 'Snack Drawer', desc: 'Deep Breath: 3 patience → +12 WtL', cost: 30, currency: 'patience', revealAt: 15,
      effect(s) { s.refillCost = 3; s.refillAmount = 12; } },
    { id: 'u_tolerance', name: 'Hold Music Tolerance', desc: '+1 patience/click', cost: 80, currency: 'patience', revealAt: 40,
      effect(s) { s.patiencePerClick += 1; } },
    // Generator multipliers (x2 to specific generators)
    { id: 'u_doodle2x', name: 'Colored Pencils', desc: 'Doodle Pads produce x2', cost: 120, currency: 'patience', revealAt: 60,
      effect(s) { s.genMultipliers.gen_doodle *= 2; } },
    { id: 'u_chair', name: 'Comfortable Chair', desc: '+5 max WtL, +0.3 WtL regen/sec', cost: 250, currency: 'patience', revealAt: 120,
      effect(s) { s.wtlMax += 5; s.wtlRegen += 0.3; } },
    { id: 'u_fidget2x', name: 'Titanium Bearings', desc: 'Fidget Spinners produce x2', cost: 500, currency: 'patience', revealAt: 300,
      effect(s) { s.genMultipliers.gen_fidget *= 2; } },
    { id: 'u_caffeine', name: 'Caffeine IV Drip', desc: '+2 patience/click, halve WtL cost', cost: 1000, currency: 'patience', revealAt: 500,
      effect(s) { s.patiencePerClick += 2; s.wtlPerClick = Math.max(0.5, s.wtlPerClick * 0.5); } },
    { id: 'u_auto2x', name: 'Parallel Lines', desc: 'Autodialers produce x2', cost: 2500, currency: 'patience', revealAt: 1500,
      effect(s) { s.genMultipliers.gen_autodialer *= 2; } },
    { id: 'u_allx2', name: 'Second Phone Line', desc: 'ALL generators produce x2', cost: 6000, currency: 'patience', revealAt: 3500,
      effect(s) { s.globalGenMultiplier *= 2; } },
    { id: 'u_speed2x', name: 'Overclocked Modem', desc: 'Speed Dialers produce x2', cost: 12000, currency: 'patience', revealAt: 7000,
      effect(s) { s.genMultipliers.gen_speeddialer *= 2; } },
    { id: 'u_duststart', name: 'Entropy Noticed', desc: 'Dust begins accumulating (0.3/sec)', cost: 20000, currency: 'patience', revealAt: 12000,
      effect(s) { s.dustPerSec = 0.3; s.flags.dustStarted = true; } },
    { id: 'u_robo2x', name: 'Machine Learning', desc: 'Robo-Callers produce x3', cost: 40000, currency: 'patience', revealAt: 25000,
      effect(s) { s.genMultipliers.gen_robocaller *= 3; } },
    { id: 'u_timewarp', name: 'Time Perception Decay', desc: 'In-game time accelerates x60', cost: 80000, currency: 'patience', revealAt: 45000,
      effect(s) { s.timeMultiplier *= 60; } },
    { id: 'u_allx3', name: 'Conference Call', desc: 'ALL generators produce x3', cost: 150000, currency: 'patience', revealAt: 80000,
      effect(s) { s.globalGenMultiplier *= 3; } },
    { id: 'u_insider', name: 'Corporate Insider', desc: 'Clicking costs 0 WtL. +WtL regen.', cost: 300000, currency: 'patience', revealAt: 150000,
      effect(s) { s.wtlPerClick = 0; s.wtlRegen += 2; s.flags.noWtlCost = true; } },
  ];

  // === QUEUE ===
  const QUEUE_START = 150;
  const QUEUE_BASE_COST = 25;
  const QUEUE_GROWTH = 1.065;

  function getAdvanceCost(advances) {
    return Math.floor(QUEUE_BASE_COST * Math.pow(QUEUE_GROWTH, advances));
  }

  function getGeneratorCost(gen) {
    return Math.floor(gen.baseCost * Math.pow(gen.growthRate, gen.owned));
  }

  // Calculate total patience/sec from generators
  function calcGeneratorPPS(state) {
    let total = 0;
    generators.forEach(g => {
      if (g.owned > 0) {
        const mult = (state.genMultipliers[g.id] || 1) * (state.globalGenMultiplier || 1);
        total += g.baseProduction * g.owned * mult;
      }
    });
    return total;
  }

  // Milestone messages
  const milestones = [
    { at: 130, msg: '"Your call is important to us." You doubt this.' },
    { at: 120, msg: 'You have been transferred to the Department of Alarm Clock Calibration.' },
    { at: 100, msg: '"A representative will be with you shortly." Shortly is relative.' },
    { at: 80, msg: 'A recorded voice apologizes. It is not sorry.' },
    { at: 60, msg: 'The hold music has changed. You liked the old one better. You hate yourself for this.' },
    { at: 40, msg: '"Your call is very important to us." The emphasis on "very" is new. Suspicious.' },
    { at: 20, msg: 'You can feel it. The end is near. Probably.' },
    { at: 10, msg: 'Your queue position is: ten. You can taste it.' },
    { at: 5, msg: 'Single digits. This is real. This is happening.' },
    { at: 1, msg: 'Next in line.' },
  ];

  function checkMilestones(queue, triggered) {
    milestones.forEach(m => {
      if (queue <= m.at && !triggered.has(m.at)) {
        triggered.add(m.at);
        UI.addLog(m.msg);
      }
    });
  }

  return {
    generators, upgrades, getAdvanceCost, getGeneratorCost, calcGeneratorPPS,
    checkMilestones, QUEUE_START, QUEUE_BASE_COST, QUEUE_GROWTH
  };
})();
