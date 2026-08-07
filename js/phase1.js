/**
 * Phase 1: The Call
 * ~1.5-2 hours of gameplay.
 *
 * SOFT CAPS: After 'softCapAt' units, growth rate doubles (prices spike dramatically).
 * Still purchasable, just painfully expensive — forces tier progression.
 *
 * COMBO: Not available at start. Unlocked by upgrade "Rhythmic Clicking".
 * Once unlocked, fast clicking builds a multiplier on patience/sec.
 *
 * QUEUE: 150 positions. Cost = 30 * 1.095^advances.
 * Total ~45M patience to clear. End-game pps ~8000-12000.
 * Final advances: 20-60s each (satisfying but not instant).
 */
const Phase1 = (function() {

  // === GENERATORS (column title: "Coping Mechanisms") ===
  // Soft cap: after softCapAt, growthRate doubles.
  // cost_next = baseCost * effectiveGrowth^owned
  const generators = [
    {
      id: 'gen_doodle', name: 'Doodle Pad', desc: 'Doodle to pass the time',
      baseCost: 15, growthRate: 1.18, baseProduction: 0.1,
      owned: 0, unlocked: true, unlocksAt: 0, softCapAt: 15,
    },
    {
      id: 'gen_fidget', name: 'Fidget Spinner', desc: 'Idle hands, idle minds',
      baseCost: 100, growthRate: 1.17, baseProduction: 0.5,
      owned: 0, unlocked: false, unlocksAt: 50, softCapAt: 15,
    },
    {
      id: 'gen_autodialer', name: 'Autodialer', desc: 'It redials for you. Endlessly.',
      baseCost: 600, growthRate: 1.16, baseProduction: 3.0,
      owned: 0, unlocked: false, unlocksAt: 400, softCapAt: 18,
    },
    {
      id: 'gen_speeddialer', name: 'Speed Dialer', desc: 'Faster. Angrier. More persistent.',
      baseCost: 4000, growthRate: 1.15, baseProduction: 15.0,
      owned: 0, unlocked: false, unlocksAt: 3000, softCapAt: 18,
    },
    {
      id: 'gen_robocaller', name: 'Robo-Caller', desc: 'An army of robotic patience.',
      baseCost: 30000, growthRate: 1.14, baseProduction: 80.0,
      owned: 0, unlocked: false, unlocksAt: 25000, softCapAt: 15,
    },
    {
      id: 'gen_callcenter', name: 'Shadow Call Center', desc: 'They hold for you. All of them.',
      baseCost: 250000, growthRate: 1.13, baseProduction: 500.0,
      owned: 0, unlocked: false, unlocksAt: 200000, softCapAt: 12,
    },
  ];

  // === UPGRADES ===
  const upgrades = [
    { id: 'u_snack', name: 'Snack Drawer', desc: 'Deep Breath: 3 patience → +12 WtL', cost: 50, currency: 'patience', revealAt: 25,
      effect(s) { s.refillCost = 3; s.refillAmount = 12; } },
    { id: 'u_tolerance', name: 'Hold Music Tolerance', desc: '+1 patience/click', cost: 150, currency: 'patience', revealAt: 75,
      effect(s) { s.patiencePerClick += 1; } },
    { id: 'u_doodle2x', name: 'Colored Pencils', desc: 'Doodle Pads produce x2', cost: 300, currency: 'patience', revealAt: 150,
      effect(s) { s.genMultipliers.gen_doodle *= 2; } },
    { id: 'u_chair', name: 'Comfortable Chair', desc: '+5 max WtL, +0.3 WtL regen/sec', cost: 600, currency: 'patience', revealAt: 350,
      effect(s) { s.wtlMax += 5; s.wtlRegen += 0.3; } },
    { id: 'u_rhythm', name: 'Rhythmic Clicking', desc: 'Unlocks click streak bonus (fast clicking boosts patience/sec)', cost: 1000, currency: 'patience', revealAt: 600,
      effect(s) { s.flags.comboUnlocked = true; },
      narrative: "You find a rhythm. Click. Click. Click. The faster you go, the more the world gives back." },
    { id: 'u_fidget2x', name: 'Titanium Bearings', desc: 'Fidget Spinners produce x2', cost: 1500, currency: 'patience', revealAt: 900,
      effect(s) { s.genMultipliers.gen_fidget *= 2; } },
    { id: 'u_caffeine', name: 'Caffeine IV Drip', desc: '+2 patience/click, halve WtL cost', cost: 3000, currency: 'patience', revealAt: 1800,
      effect(s) { s.patiencePerClick += 2; s.wtlPerClick = Math.max(0.5, s.wtlPerClick * 0.5); } },
    { id: 'u_auto2x', name: 'Parallel Lines', desc: 'Autodialers produce x2', cost: 6000, currency: 'patience', revealAt: 4000,
      effect(s) { s.genMultipliers.gen_autodialer *= 2; } },
    { id: 'u_allx2', name: 'Second Phone Line', desc: 'ALL coping mechanisms produce x2', cost: 18000, currency: 'patience', revealAt: 10000,
      effect(s) { s.globalGenMultiplier *= 2; } },
    { id: 'u_speed2x', name: 'Overclocked Modem', desc: 'Speed Dialers produce x3', cost: 50000, currency: 'patience', revealAt: 28000,
      effect(s) { s.genMultipliers.gen_speeddialer *= 3; } },
    { id: 'u_duststart', name: 'Entropy Noticed', desc: 'Something is accumulating...', cost: 100000, currency: 'patience', revealAt: 55000,
      effect(s) { s.dustPerSec = 1.0; s.flags.dustStarted = true; },
      narrative: "You glance down. There is a fine layer of dust on your arm. It wasn't there when you started this call. Was it? How long have you been sitting here?" },
    { id: 'u_timewarp1', name: 'Minutes Feel Like Hours', desc: 'Time perception shifts x10', cost: 200000, currency: 'patience', revealAt: 110000,
      effect(s) { s.timeMultiplier *= 10; },
      narrative: "Was that a minute? An hour? You can't tell anymore. The clock on the wall has stopped making sense." },
    { id: 'u_robo3x', name: 'Machine Learning', desc: 'Robo-Callers produce x3', cost: 350000, currency: 'patience', revealAt: 200000,
      effect(s) { s.genMultipliers.gen_robocaller *= 3; } },
    { id: 'u_timewarp2', name: 'Time Perception Decay', desc: 'Time slips further x10', cost: 600000, currency: 'patience', revealAt: 380000,
      effect(s) { s.timeMultiplier *= 10; },
      narrative: "Days? Weeks? The concept of 'today' has become philosophical. You're not sure it applies to you anymore." },
    { id: 'u_allx3', name: 'Conference Call', desc: 'ALL coping mechanisms produce x2', cost: 1500000, currency: 'patience', revealAt: 800000,
      effect(s) { s.globalGenMultiplier *= 2; } },
    { id: 'u_insider', name: 'Corporate Insider', desc: 'Clicking no longer costs WtL', cost: 4000000, currency: 'patience', revealAt: 2000000,
      effect(s) { s.wtlPerClick = 0; s.wtlRegen += 5; s.flags.noWtlCost = true; },
      narrative: "You no longer feel the drain. You and the hold music have reached an understanding." },
  ];

  // === QUEUE ===
  const QUEUE_START = 150;
  const QUEUE_BASE_COST = 30;
  const QUEUE_GROWTH = 1.095;

  function getAdvanceCost(advances) {
    return Math.floor(QUEUE_BASE_COST * Math.pow(QUEUE_GROWTH, advances));
  }

  function getGeneratorCost(gen) {
    let owned = gen.owned;
    // Soft cap: after threshold, growth becomes extreme (looks attainable, then nope)
    if (owned >= gen.softCapAt) {
      const base = gen.baseCost * Math.pow(gen.growthRate, gen.softCapAt);
      const excess = owned - gen.softCapAt;
      // Growth rate to the power of 4 for post-cap units
      const postCapGrowth = Math.pow(gen.growthRate, 4);
      return Math.floor(base * Math.pow(postCapGrowth, excess));
    }
    return Math.floor(gen.baseCost * Math.pow(gen.growthRate, owned));
  }

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

  // Milestones
  const milestones = [
    { at: 130, msg: '"Your call is important to us." You doubt this.' },
    { at: 120, msg: 'TRANSFERRED: Department of Alarm Clock Calibration.' },
    { at: 100, msg: '"A representative will be with you shortly." Shortly is relative.' },
    { at: 80, msg: 'A recorded voice apologizes. It is not sorry.' },
    { at: 60, msg: 'The hold music has changed. You liked the old one better. You hate yourself for this.' },
    { at: 40, msg: '"Your call is very important to us." The emphasis on "very" is suspicious.' },
    { at: 20, msg: 'You can feel it. The end is near. Probably.' },
    { at: 10, msg: 'Your queue position is: ten. You can taste it.' },
    { at: 5, msg: 'Single digits. This is real. This is happening.' },
    { at: 1, msg: 'Next in line.' },
  ];

  function checkMilestones(queue, triggered) {
    milestones.forEach(m => {
      if (queue <= m.at && !triggered.has(m.at)) {
        triggered.add(m.at);
        // Show as a milestone banner (handled by UI)
        UI.showMilestone(m.msg);
      }
    });
  }

  return {
    generators, upgrades, getAdvanceCost, getGeneratorCost,
    calcGeneratorPPS, checkMilestones, QUEUE_START, QUEUE_BASE_COST, QUEUE_GROWTH
  };
})();
