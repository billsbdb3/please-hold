#!/usr/bin/env node
/**
 * PLEASE HOLD - Phase 1 Simulator
 * Runs the game loop mathematically without a browser.
 * Simulates different player types and outputs timing data.
 *
 * Usage: node tools/simulate.js [--player active|casual|idle]
 *
 * Matches game logic in: main.js, phase1.js, dust.js
 * Key systems: nested generators, active session time, Queue Familiarity,
 * dust time cap x30, base dust 0.2/s.
 */

// === GAME CONSTANTS (mirrors phase1.js) ===
const GENERATORS = [
  { id: 'doodle', name: 'Doodle Pad', baseCost: 15, growthRate: 1.18, baseProduction: 0.1, softCapAt: 25, owned: 0, boostPercent: 0 },
  { id: 'fidget', name: 'Fidget Spinner', baseCost: 100, growthRate: 1.17, baseProduction: 0.35, softCapAt: 25, unlocksAt: 50, owned: 0, boostPercent: 0.005 },
  { id: 'autodialer', name: 'Autodialer', baseCost: 600, growthRate: 1.16, baseProduction: 2.0, softCapAt: 22, unlocksAt: 400, owned: 0, boostPercent: 0.01 },
  { id: 'speeddialer', name: 'Speed Dialer', baseCost: 5000, growthRate: 1.15, baseProduction: 10.0, softCapAt: 20, unlocksAt: 4000, owned: 0, boostPercent: 0.02 },
  { id: 'robocaller', name: 'Robo-Caller', baseCost: 40000, growthRate: 1.14, baseProduction: 50.0, softCapAt: 15, unlocksAt: 30000, owned: 0, boostPercent: 0.03 },
  { id: 'callcenter', name: 'Shadow Call Center', baseCost: 350000, growthRate: 1.13, baseProduction: 300.0, softCapAt: 12, unlocksAt: 250000, owned: 0, boostPercent: 0.05 },
];

const UPGRADES = [
  { id: 'snack', name: 'Snack Drawer', cost: 50, revealAt: 25, effect: 'refill' },
  { id: 'tolerance', name: 'Hold Music Tolerance', cost: 150, revealAt: 75, effect: 'click+1' },
  { id: 'doodle2x', name: 'Colored Pencils', cost: 300, revealAt: 150, effect: 'doodle_x2' },
  { id: 'chair', name: 'Comfortable Chair', cost: 600, revealAt: 350, effect: 'chair' },
  { id: 'rhythm', name: 'Rhythmic Clicking', cost: 1000, revealAt: 600, effect: 'combo' },
  { id: 'fidget2x', name: 'Titanium Bearings', cost: 1500, revealAt: 900, effect: 'fidget_x2' },
  { id: 'caffeine', name: 'Caffeine IV Drip', cost: 3000, revealAt: 1800, effect: 'caffeine' },
  { id: 'auto2x', name: 'Parallel Lines', cost: 6000, revealAt: 4000, effect: 'auto_x2' },
  { id: 'allx2', name: 'Second Phone Line', cost: 18000, revealAt: 10000, effect: 'all_x2' },
  { id: 'speed3x', name: 'Overclocked Modem', cost: 50000, revealAt: 28000, effect: 'speed_x3' },
  { id: 'dust', name: 'Entropy Noticed', cost: 100000, revealAt: 55000, effect: 'dust_start' },
  { id: 'time1', name: 'Time Blur I', cost: 200000, revealAt: 110000, effect: 'time_x10' },
  { id: 'robo3x', name: 'Machine Learning', cost: 350000, revealAt: 200000, effect: 'robo_x3' },
  { id: 'muscle', name: 'Muscle Memory', cost: 750000, revealAt: 500000, effect: 'combo_lock' },
  { id: 'time2', name: 'Time Blur II', cost: 600000, revealAt: 380000, effect: 'time_x10' },
  { id: 'qfamiliar', name: 'Queue Familiarity', cost: 500000, revealAt: 300000, effect: 'queue_familiar' },
  { id: 'allx2b', name: 'Conference Call', cost: 1500000, revealAt: 800000, effect: 'all_x2' },
  { id: 'time3', name: 'Time Blur III', cost: 2500000, revealAt: 1200000, effect: 'time_x12' },
  { id: 'insider', name: 'Corporate Insider', cost: 4000000, revealAt: 2000000, effect: 'insider' },
];

const DUST_COLLECTORS = [
  { id: 'cloth', name: 'Microfiber Cloth', cost: 300, effect: 'gen_x1.1' },
  { id: 'mask', name: 'Dust Mask', cost: 800, effect: 'wtl_regen_0.3' },
  { id: 'filter', name: 'Air Filter', cost: 2000, effect: 'gen_x1.25' },
  { id: 'broom', name: 'Industrial Broom', cost: 4000, effect: 'dust+0.5' },
  { id: 'map', name: 'Phone Tree Map', cost: 7000, effect: 'queue_x0.85' },
  { id: 'vacuum', name: 'Robotic Vacuum', cost: 12000, effect: 'gen_x1.5_wtl_0.5' },
  { id: 'hepa', name: 'HEPA System', cost: 20000, effect: 'dust+1_wtl+5' },
  { id: 'static', name: 'Static Collector', cost: 32000, effect: 'gen_x2' },
  { id: 'direct', name: 'Executive Direct Line', cost: 50000, effect: 'queue_x0.7' },
  { id: 'industrial', name: 'Industrial Extraction', cost: 75000, effect: 'dust+3_wtl+1' },
  { id: 'singularity', name: 'Dust Singularity', cost: 120000, effect: 'gen_x3' },
];

const QUEUE_START = 150;
const QUEUE_BASE_COST = 30;
const QUEUE_GROWTH = 1.095;
const DUST_TIME_CAP = 30; // x30 max time mult for dust
const IDLE_THRESHOLD = 60; // seconds before idle

// === STATE ===
let state = {};

function resetState() {
  state = {
    patience: 0,
    maxPatience: 0,
    dust: 0,
    maxDust: 0,
    wtl: 15,
    wtlMax: 15,
    wtlPerClick: 1,
    wtlRegen: 0,
    patiencePerClick: 1,
    patiencePerSec: 0,
    dustPerSec: 0,
    dustMultiplier: 1,
    timeMultiplier: 1,
    globalGenMult: 1,
    genMults: { doodle: 1, fidget: 1, autodialer: 1, speeddialer: 1, robocaller: 1, callcenter: 1 },
    queueCostMult: 1,
    queue: QUEUE_START,
    queueAdvances: 0,
    combo: 1,
    comboUnlocked: false,
    comboLocked: false,
    refillCost: 5,
    refillAmount: 12,
    dustStarted: false,
    noWtlCost: false,
    // Timing: active session time (not wall clock)
    realSeconds: 0,
    activePlayTime: 0, // only increments when not idle
    inGameSeconds: 0,
    totalClicks: 0,
    hangups: 0,
    boughtUpgrades: new Set(),
    boughtCollectors: new Set(),
    // Queue Familiarity (purchased upgrade, not auto)
    queueFamiliarityUnlocked: false,
    queueFamiliarityDiscount: 0,
    lastAdvanceTime: 0,
  };
  GENERATORS.forEach(g => { g.owned = 0; });
}

// === CASCADING GENERATOR PPS (mirrors phase1.js calcGeneratorPPS) ===
function calcPPS() {
  // Calculate cascading boosts: each tier boosts ALL tiers below
  const nestedBoost = {};
  GENERATORS.forEach(g => { nestedBoost[g.id] = 1; });

  for (let i = GENERATORS.length - 1; i >= 1; i--) {
    const g = GENERATORS[i];
    if (g.owned > 0 && g.boostPercent > 0) {
      for (let j = 0; j < i; j++) {
        nestedBoost[GENERATORS[j].id] += g.owned * g.boostPercent;
      }
    }
  }

  let total = state.patiencePerSec;
  GENERATORS.forEach(g => {
    if (g.owned > 0) {
      const mult = (state.genMults[g.id] || 1) * state.globalGenMult;
      const nested = nestedBoost[g.id] || 1;
      total += g.baseProduction * g.owned * mult * nested;
    }
  });
  return total;
}

// === COST FUNCTIONS ===
function getGenCost(gen) {
  const owned = gen.owned;
  if (owned >= gen.softCapAt) {
    const base = gen.baseCost * Math.pow(gen.growthRate, gen.softCapAt);
    const excess = owned - gen.softCapAt;
    const postCapGrowth = Math.pow(gen.growthRate, 8);
    return Math.floor(base * Math.pow(postCapGrowth, excess));
  }
  return Math.floor(gen.baseCost * Math.pow(gen.growthRate, owned));
}

function getAdvanceCost() {
  const discount = (state.queueFamiliarityUnlocked && state.queueFamiliarityDiscount > 0) ? state.queueFamiliarityDiscount : 0;
  const baseCost = QUEUE_BASE_COST * Math.pow(QUEUE_GROWTH, state.queueAdvances);
  // Super-exponential for last 30 positions (advances 120+)
  let cost = baseCost;
  if (state.queueAdvances >= 120) {
    const depth = state.queueAdvances - 120;
    const lateMultiplier = 1 + Math.pow(depth, 1.5) / 20;
    cost = baseCost * lateMultiplier;
  }
  return Math.floor(cost * state.queueCostMult * (1 - discount));
}

function calcDustTimeFactor() {
  if (state.maxDust <= 10) return 1;
  return Math.min(50000, 1 + Math.pow(Math.log10(state.maxDust + 1), 2) * 10);
}

// === UPGRADE EFFECTS ===
function applyUpgrade(u) {
  switch (u.effect) {
    case 'refill': state.refillCost = 3; state.refillAmount = 12; break;
    case 'click+1': state.patiencePerClick += 1; break;
    case 'doodle_x2': state.genMults.doodle *= 2; break;
    case 'chair': state.wtlMax += 5; state.wtlRegen += 0.3; break;
    case 'combo': state.comboUnlocked = true; break;
    case 'fidget_x2': state.genMults.fidget *= 2; break;
    case 'caffeine': state.patiencePerClick += 2; state.wtlPerClick = Math.max(0.5, state.wtlPerClick * 0.5); break;
    case 'auto_x2': state.genMults.autodialer *= 2; break;
    case 'all_x2': state.globalGenMult *= 2; break;
    case 'speed_x3': state.genMults.speeddialer *= 3; break;
    case 'dust_start': state.dustPerSec = 0.2; state.dustStarted = true; break;
    case 'time_x10': state.timeMultiplier *= 10; break;
    case 'time_x12': state.timeMultiplier *= 12; break;
    case 'robo_x3': state.genMults.robocaller *= 3; break;
    case 'combo_lock': state.comboLocked = true; break;
    case 'queue_familiar': state.queueFamiliarityUnlocked = true; break;
    case 'insider': state.wtlPerClick = 0; state.noWtlCost = true; break;
  }
}

function applyCollector(c) {
  switch (c.effect) {
    case 'gen_x1.1': state.globalGenMult *= 1.1; break;
    case 'wtl_regen_0.3': state.wtlRegen += 0.3; break;
    case 'gen_x1.25': state.globalGenMult *= 1.25; break;
    case 'dust+0.5': state.dustPerSec += 0.5; break;
    case 'queue_x0.85': state.queueCostMult *= 0.85; break;
    case 'gen_x1.5_wtl_0.5': state.globalGenMult *= 1.5; state.wtlRegen += 0.5; break;
    case 'dust+1_wtl+5': state.dustPerSec += 1; state.wtlMax += 5; break;
    case 'gen_x2': state.globalGenMult *= 2; break;
    case 'queue_x0.7': state.queueCostMult *= 0.7; break;
    case 'dust+3_wtl+1': state.dustPerSec += 3; state.wtlRegen += 1; break;
    case 'gen_x3': state.globalGenMult *= 3; break;
  }
}

// === SIMULATION ===
function simulate(playerType = 'active') {
  resetState();

  const TICK_RATE = 0.1; // 100ms ticks
  const MAX_REAL_SECONDS = 7200; // 2 hour max

  // Player behavior params
  let clicksPerSec, thinkingTime, restChance;
  if (playerType === 'active') {
    // Organic play: ~1.85 clicks/sec average, with thinking pauses
    clicksPerSec = 1.85;
    thinkingTime = 4; // seconds of "thinking" between purchase decisions
    restChance = 0.02; // 2% chance per second of a 5-10s rest
  } else if (playerType === 'casual') {
    clicksPerSec = 1.5;
    thinkingTime = 6;
    restChance = 0.04;
  } else { // idle
    clicksPerSec = 1.0;
    thinkingTime = 10;
    restChance = 0.08;
  }

  let clickAccum = 0;
  let lastLogTime = 0;
  let restingUntil = 0; // simulates player looking away briefly
  let thinkingUntil = 0; // simulates player deciding what to buy
  let lastPurchaseTime = 0;
  const LOG_INTERVAL = 60;

  console.log(`\n=== SIMULATION: ${playerType} player ===`);
  console.log(`Click rate: ${clicksPerSec}/s | Think time: ${thinkingTime}s between purchases`);
  console.log('');

  while (state.realSeconds < MAX_REAL_SECONDS && state.queue > 0) {
    const dt = TICK_RATE;
    state.realSeconds += dt;
    state.activePlayTime += dt; // Sim is always "active" (no AFK periods simulated)

    const activeMinutes = state.activePlayTime / 60;

    // --- Time ---
    if (state.dust > state.maxDust) state.maxDust = state.dust;
    const dustTimeFactor = calcDustTimeFactor();
    const effectiveTimeMult = state.timeMultiplier * dustTimeFactor;
    state.inGameSeconds += dt * effectiveTimeMult;

    // --- WtL Passive Drain (uses activePlayTime) ---
    if (activeMinutes > 5) {
      const baseDrain = 0.15 * Math.log2(activeMinutes - 4);
      const lateDrain = activeMinutes > 30 ? (activeMinutes - 30) * 0.02 : 0;
      const drainRate = Math.min(1.5, baseDrain + lateDrain);
      state.wtl = Math.max(0, state.wtl - drainRate * dt);
    }

    // --- WtL Regen ---
    if (state.wtlRegen > 0) {
      state.wtl = Math.min(state.wtlMax, state.wtl + state.wtlRegen * dt);
    }

    // --- Hangup ---
    if (state.wtl < 0.1) {
      state.hangups++;
      const penalty = Math.min(8, Math.floor(state.queueAdvances * 0.04) + 2);
      state.queue = Math.min(QUEUE_START, state.queue + penalty);
      state.patience = 0;
      state.wtl = state.wtlMax;
      console.log(`  [${activeMinutes.toFixed(1)}m] HANGUP #${state.hangups} | queue back to #${state.queue}`);
      continue;
    }

    // --- Player rest periods (simulates looking at phone, reading text) ---
    if (state.realSeconds < restingUntil) {
      // Player is resting — no clicks, combo decays (unless locked)
      if (state.combo > 1 && !state.comboLocked) {
        state.combo = Math.max(1, state.combo - 0.4 * dt);
      }
    } else {
      // Random chance to start resting
      if (Math.random() < restChance * dt) {
        restingUntil = state.realSeconds + 5 + Math.random() * 5; // 5-10s rest
      }

      // --- Clicking ---
      if (state.wtl >= state.wtlPerClick || state.noWtlCost) {
        const clicksFloat = clicksPerSec * dt;
        clickAccum += clicksFloat;
        const clicks = Math.floor(clickAccum);
        clickAccum -= clicks;
        for (let i = 0; i < clicks; i++) {
          if (!state.noWtlCost && state.wtl < state.wtlPerClick) break;
          state.patience += state.patiencePerClick;
          if (!state.noWtlCost) state.wtl -= state.wtlPerClick;
          state.totalClicks++;
          if (state.comboUnlocked) {
            state.combo = Math.min(4, state.combo + 0.3);
          }
        }
      }

      // --- Combo Decay (when not actively clicking) ---
      // Combo decays slightly between click bursts
    }

    // --- Deep Breath (random threshold 1-5, like real player) ---
    if (!state._deepBreathThreshold || state.wtl >= state.wtlMax) {
      state._deepBreathThreshold = 1 + Math.random() * 4;
    }
    if (state.wtl <= state._deepBreathThreshold && state.patience >= state.refillCost) {
      state.patience -= state.refillCost;
      state.wtl = Math.min(state.wtlMax, state.wtl + state.refillAmount);
      state._deepBreathThreshold = 1 + Math.random() * 4;
    }

    // --- PPS (with combo) ---
    let pps = calcPPS();
    pps *= state.combo;
    state.patience += pps * dt;
    if (state.patience > state.maxPatience) state.maxPatience = state.patience;

    // --- Dust ---
    if (state.dustStarted) {
      const dustTimeCap = Math.min(DUST_TIME_CAP, effectiveTimeMult);
      const ppsBonus = calcPPS() * 0.0001;
      const totalDustRate = (state.dustPerSec + ppsBonus) * state.dustMultiplier;
      state.dust += totalDustRate * dt * dustTimeCap;
    }

    // --- AI Purchase Logic (with thinking time) ---
    if (state.realSeconds >= thinkingUntil) {
      const bought = buyBestUpgrade() || buyBestGenerator() || buyBestCollector() || tryAdvanceQueue();
      if (bought) {
        // Add thinking delay after each purchase
        thinkingUntil = state.realSeconds + thinkingTime * (0.5 + Math.random());
        lastPurchaseTime = state.realSeconds;
      }
    }

    // --- Queue Familiarity decay (15s timeout) ---
    if (state.queueFamiliarityUnlocked && state.queueFamiliarityDiscount > 0) {
      if (state.realSeconds - state.lastAdvanceTime > 15) {
        state.queueFamiliarityDiscount = Math.max(0, state.queueFamiliarityDiscount - 0.03 * dt);
      }
    }

    // --- Periodic Log ---
    if (state.realSeconds - lastLogTime >= LOG_INTERVAL) {
      lastLogTime = state.realSeconds;
      const ppsNow = calcPPS() * state.combo;
      console.log(`  [${activeMinutes.toFixed(0)}m] queue:#${state.queue} | pps:${ppsNow.toFixed(0)} | patience:${Math.floor(state.patience)} | dust:${state.dust.toFixed(0)} | wtl:${state.wtl.toFixed(1)}/${state.wtlMax} | inGame:${formatTime(state.inGameSeconds)} | clicks:${state.totalClicks} | hangups:${state.hangups}`);
    }
  }

  // Final summary
  const finalMinutes = (state.realSeconds / 60).toFixed(1);
  console.log('');
  console.log(`=== RESULT ===`);
  console.log(`  Phase 1 completed: ${state.queue <= 0 ? 'YES' : 'NO (timed out)'}`);
  console.log(`  Real time: ${finalMinutes} minutes`);
  console.log(`  Active play time: ${(state.activePlayTime / 60).toFixed(1)} minutes`);
  console.log(`  In-game time: ${formatTime(state.inGameSeconds)}`);
  console.log(`  Total clicks: ${state.totalClicks}`);
  console.log(`  Hangups: ${state.hangups}`);
  console.log(`  Final PPS: ${calcPPS().toFixed(0)}`);
  console.log(`  Final dust: ${state.dust.toFixed(0)} particles`);
  console.log(`  Upgrades bought: ${state.boughtUpgrades.size}/${UPGRADES.length}`);
  console.log(`  Collectors bought: ${state.boughtCollectors.size}/${DUST_COLLECTORS.length}`);
  console.log('');
}

// === AI PURCHASE LOGIC ===
function buyBestUpgrade() {
  for (const u of UPGRADES) {
    if (state.boughtUpgrades.has(u.id)) continue;
    if (state.maxPatience < u.revealAt) continue;
    if (state.patience >= u.cost) {
      state.patience -= u.cost;
      state.boughtUpgrades.add(u.id);
      applyUpgrade(u);
      const mins = (state.activePlayTime / 60).toFixed(1);
      console.log(`  [${mins}m] UPGRADE: ${u.name} | cost:${u.cost} | pps:${calcPPS().toFixed(1)}`);
      return true;
    }
  }
  return false;
}

function buyBestGenerator() {
  // Find generator with best production/cost ratio
  let best = null, bestRatio = 0;
  for (const g of GENERATORS) {
    if (g.unlocksAt && state.maxPatience < g.unlocksAt) continue;
    const cost = getGenCost(g);
    if (state.patience < cost) continue;
    const mult = (state.genMults[g.id] || 1) * state.globalGenMult;
    const production = g.baseProduction * mult;
    const ratio = production / cost;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = g;
    }
  }
  if (best) {
    const cost = getGenCost(best);
    state.patience -= cost;
    best.owned++;
    return true;
  }
  return false;
}

function buyBestCollector() {
  for (const c of DUST_COLLECTORS) {
    if (state.boughtCollectors.has(c.id)) continue;
    if (state.dust >= c.cost) {
      state.dust -= c.cost;
      state.boughtCollectors.add(c.id);
      applyCollector(c);
      const mins = (state.activePlayTime / 60).toFixed(1);
      console.log(`  [${mins}m] DUST COLLECTOR: ${c.name} | cost:${c.cost} | dustPerSec:${state.dustPerSec.toFixed(1)}`);
      return true;
    }
  }
  return false;
}

function tryAdvanceQueue() {
  const cost = getAdvanceCost();
  // Only advance if we can afford it and have decent surplus (don't deplete)
  if (state.patience >= cost * 1.5 && state.queue > 0) {
    state.patience -= cost;
    state.queue--;
    state.queueAdvances++;
    // Queue Familiarity: build discount on rapid advances
    if (state.queueFamiliarityUnlocked) {
      state.queueFamiliarityDiscount = Math.min(0.25, state.queueFamiliarityDiscount + 0.02);
      state.lastAdvanceTime = state.realSeconds;
    }
    return true;
  }
  return false;
}

// === HELPERS ===
function formatTime(seconds) {
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return (seconds / 3600).toFixed(1) + 'h';
  if (seconds < 86400 * 30) return (seconds / 86400).toFixed(1) + 'd';
  if (seconds < 86400 * 365) return (seconds / (86400 * 30)).toFixed(1) + 'mo';
  return (seconds / (86400 * 365)).toFixed(1) + 'y';
}

// === RUN ===
const playerArg = process.argv.find(a => a.startsWith('--player='));
const playerType = playerArg ? playerArg.split('=')[1] : 'active';

simulate(playerType);
