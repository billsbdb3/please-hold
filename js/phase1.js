/**
 * Phase 1: The Call
 * ~1.5-2 hours of gameplay.
 *
 * PACING MATH:
 * Queue: 150 positions. Cost = 30 * 1.09^advances.
 * At advance 50: cost = ~1,298. At advance 100: cost = ~56,191. At advance 149: cost = ~2,034,582.
 * Total cost to clear all 150: ~22.5 million patience.
 * Target end-game pps: ~3000-5000. Final advances take 5-10s each (satisfying acceleration).
 *
 * Generator caps prevent trivial stacking of low-tier items.
 * Each tier unlocks progressively and has a max of 10-15 units.
 */
const Phase1 = (function() {

  // === GENERATORS ===
  // cost_next = baseCost * growthRate^owned
  // Hard cap on each generator to prevent infinite low-tier stacking.
  const generators = [
    {
      id: 'gen_doodle', name: 'Doodle Pad', desc: 'Doodle to pass the time',
      baseCost: 15, growthRate: 1.18, baseProduction: 0.1,
      owned: 0, unlocked: true, unlocksAt: 0, maxOwned: 12,
    },
    {
      id: 'gen_fidget', name: 'Fidget Spinner', desc: 'Idle hands, idle minds',
      baseCost: 100, growthRate: 1.17, baseProduction: 0.5,
      owned: 0, unlocked: false, unlocksAt: 50, maxOwned: 12,
    },
    {
      id: 'gen_autodialer', name: 'Autodialer', desc: 'It redials for you. Endlessly.',
      baseCost: 600, growthRate: 1.16, baseProduction: 3.0,
      owned: 0, unlocked: false, unlocksAt: 400, maxOwned: 15,
    },
    {
      id: 'gen_speeddialer', name: 'Speed Dialer', desc: 'Faster. Angrier. More persistent.',
      baseCost: 4000, growthRate: 1.15, baseProduction: 15.0,
      owned: 0, unlocked: false, unlocksAt: 3000, maxOwned: 15,
    },
    {
      id: 'gen_robocaller', name: 'Robo-Caller', desc: 'An army of robotic patience.',
      baseCost: 25000, growthRate: 1.14, baseProduction: 80.0,
      owned: 0, unlocked: false, unlocksAt: 20000, maxOwned: 12,
    },
    {
      id: 'gen_callcenter', name: 'Shadow Call Center', desc: 'They hold for you. All of them.',
      baseCost: 200000, growthRate: 1.13, baseProduction: 500.0,
      owned: 0, unlocked: false, unlocksAt: 150000, maxOwned: 10,
    },
  ];

  // === UPGRADES ===
  const upgrades = [
    // Early survival
    { id: 'u_snack', name: 'Snack Drawer', desc: 'Deep Breath: 3 patience → +12 WtL', cost: 50, currency: 'patience', revealAt: 25,
      effect(s) { s.refillCost = 3; s.refillAmount = 12; } },
    { id: 'u_tolerance', name: 'Hold Music Tolerance', desc: '+1 patience/click', cost: 150, currency: 'patience', revealAt: 75,
      effect(s) { s.patiencePerClick += 1; } },
    // Generator multipliers
    { id: 'u_doodle2x', name: 'Colored Pencils', desc: 'Doodle Pads produce x2', cost: 300, currency: 'patience', revealAt: 150,
      effect(s) { s.genMultipliers.gen_doodle *= 2; } },
    { id: 'u_chair', name: 'Comfortable Chair', desc: '+5 max WtL, +0.3 WtL regen/sec', cost: 600, currency: 'patience', revealAt: 350,
      effect(s) { s.wtlMax += 5; s.wtlRegen += 0.3; } },
    { id: 'u_fidget2x', name: 'Titanium Bearings', desc: 'Fidget Spinners produce x2', cost: 1200, currency: 'patience', revealAt: 700,
      effect(s) { s.genMultipliers.gen_fidget *= 2; } },
    { id: 'u_caffeine', name: 'Caffeine IV Drip', desc: '+2 patience/click, halve WtL cost', cost: 2500, currency: 'patience', revealAt: 1500,
      effect(s) { s.patiencePerClick += 2; s.wtlPerClick = Math.max(0.5, s.wtlPerClick * 0.5); } },
    { id: 'u_auto2x', name: 'Parallel Lines', desc: 'Autodialers produce x2', cost: 5000, currency: 'patience', revealAt: 3500,
      effect(s) { s.genMultipliers.gen_autodialer *= 2; } },
    { id: 'u_allx2', name: 'Second Phone Line', desc: 'ALL generators produce x2', cost: 15000, currency: 'patience', revealAt: 8000,
      effect(s) { s.globalGenMultiplier *= 2; } },
    { id: 'u_speed2x', name: 'Overclocked Modem', desc: 'Speed Dialers produce x3', cost: 40000, currency: 'patience', revealAt: 20000,
      effect(s) { s.genMultipliers.gen_speeddialer *= 3; } },
    { id: 'u_duststart', name: 'Entropy Noticed', desc: 'You notice the dust forming around you...', cost: 80000, currency: 'patience', revealAt: 45000,
      effect(s) { s.dustPerSec = 0.5; s.flags.dustStarted = true; },
      narrative: "You glance down. There is a fine layer of dust on your arm. It wasn't there when you started this call. Was it? How long have you been sitting here?" },
    { id: 'u_robo3x', name: 'Machine Learning', desc: 'Robo-Callers produce x3', cost: 200000, currency: 'patience', revealAt: 100000,
      effect(s) { s.genMultipliers.gen_robocaller *= 3; } },
    { id: 'u_timewarp', name: 'Time Perception Decay', desc: 'In-game time accelerates x60', cost: 500000, currency: 'patience', revealAt: 250000,
      effect(s) { s.timeMultiplier *= 60; },
      narrative: "The minutes begin to blur. You're not sure when the last hour ended and this one began. The clock seems wrong. Everything seems wrong." },
    { id: 'u_allx3', name: 'Conference Call', desc: 'ALL generators produce x3', cost: 1200000, currency: 'patience', revealAt: 600000,
      effect(s) { s.globalGenMultiplier *= 3; } },
    { id: 'u_insider', name: 'Corporate Insider', desc: 'Clicking costs 0 WtL. Deep Breath repurposed.', cost: 3000000, currency: 'patience', revealAt: 1500000,
      effect(s) { s.wtlPerClick = 0; s.wtlRegen += 5; s.flags.noWtlCost = true; },
      narrative: "You no longer feel the drain. You are beyond fatigue. You and the hold music have reached an understanding." },
  ];

  // === QUEUE ===
  const QUEUE_START = 150;
  const QUEUE_BASE_COST = 30;
  const QUEUE_GROWTH = 1.09;

  function getAdvanceCost(advances) {
    return Math.floor(QUEUE_BASE_COST * Math.pow(QUEUE_GROWTH, advances));
  }

  function getGeneratorCost(gen) {
    return Math.floor(gen.baseCost * Math.pow(gen.growthRate, gen.owned));
  }

  function isGeneratorCapped(gen) {
    return gen.owned >= gen.maxOwned;
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
    { at: 130, msg: '"Your call is important to us." You doubt this.', flavor: true },
    { at: 120, msg: 'TRANSFERRED: Department of Alarm Clock Calibration.', flavor: true },
    { at: 100, msg: '"A representative will be with you shortly." Shortly is a relative term.', flavor: true },
    { at: 80, msg: 'A recorded voice apologizes. It is not sorry.', flavor: true },
    { at: 60, msg: 'The hold music has changed. You liked the old one better. You hate yourself for this.', flavor: true },
    { at: 40, msg: '"Your call is very important to us." The emphasis on "very" is new. Suspicious.', flavor: true },
    { at: 20, msg: 'You can feel it. The end is near. Probably.', flavor: true },
    { at: 10, msg: 'Your queue position is: ten. You can taste it.', flavor: true },
    { at: 5, msg: 'Single digits. This is real. This is happening.', flavor: true },
    { at: 1, msg: 'Next in line.', flavor: true },
  ];

  function checkMilestones(queue, triggered) {
    milestones.forEach(m => {
      if (queue <= m.at && !triggered.has(m.at)) {
        triggered.add(m.at);
        UI.addLog('★ ' + m.msg);
        // Show in flavor box prominently
        const flavorEl = document.getElementById('flavor-text');
        if (flavorEl) {
          flavorEl.textContent = m.msg;
          flavorEl.style.color = '#c4a35a';
          setTimeout(() => { flavorEl.style.color = ''; }, 8000);
        }
      }
    });
  }

  return {
    generators, upgrades, getAdvanceCost, getGeneratorCost, isGeneratorCapped,
    calcGeneratorPPS, checkMilestones, QUEUE_START, QUEUE_BASE_COST, QUEUE_GROWTH
  };
})();
