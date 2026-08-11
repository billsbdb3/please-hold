#!/usr/bin/env node
/**
 * PLEASE HOLD - Phase 1 Simulator
 * Matches: queue-gated upgrades, time-gated Time Blurs, department transfer,
 * time freeze at 9 years, cascading boosts, pps-linked dust, combo cap boost.
 *
 * Usage: node tools/simulate.js [--player active|casual|idle]
 */

// === GENERATORS (cascading boost: each boosts ALL below) ===
const GENERATORS = [
  { id: 'doodle', name: 'Doodle Pad', baseCost: 15, growthRate: 1.18, baseProduction: 0.1, softCapAt: 25, owned: 0, boostPercent: 0 },
  { id: 'fidget', name: 'Fidget Spinner', baseCost: 100, growthRate: 1.17, baseProduction: 0.35, softCapAt: 25, unlocksAt: 50, owned: 0, boostPercent: 0.003 },
  { id: 'autodialer', name: 'Autodialer', baseCost: 600, growthRate: 1.16, baseProduction: 2.0, softCapAt: 22, unlocksAt: 400, owned: 0, boostPercent: 0.008 },
  { id: 'speeddialer', name: 'Speed Dialer', baseCost: 5000, growthRate: 1.15, baseProduction: 10.0, softCapAt: 20, unlocksAt: 4000, owned: 0, boostPercent: 0.015 },
  { id: 'robocaller', name: 'Robo-Caller', baseCost: 40000, growthRate: 1.14, baseProduction: 50.0, softCapAt: 15, unlocksAt: 30000, owned: 0, boostPercent: 0.02 },
  { id: 'callcenter', name: 'Shadow Call Center', baseCost: 350000, growthRate: 1.13, baseProduction: 300.0, softCapAt: 12, unlocksAt: 250000, owned: 0, boostPercent: 0.03 },
];

// === UPGRADES (with queue gates and time gates) ===
const UPGRADES = [
  { id: 'snack', name: 'Snack Drawer', cost: 50, revealAt: 25, effect: 'refill' },
  { id: 'tolerance', name: 'Hold Music Tolerance', cost: 150, revealAt: 75, effect: 'click+1' },
  { id: 'doodle2x', name: 'Colored Pencils', cost: 300, revealAt: 150, effect: 'doodle_x2' },
  { id: 'chair', name: 'Comfortable Chair', cost: 600, revealAt: 350, effect: 'chair' },
  { id: 'rhythm', name: 'Rhythmic Clicking', cost: 1000, revealAt: 600, effect: 'combo' },
  { id: 'fidget2x', name: 'Titanium Bearings', cost: 1500, revealAt: 900, effect: 'fidget_x2' },
  { id: 'caffeine', name: 'Caffeine IV Drip', cost: 3000, revealAt: 1800, effect: 'caffeine' },
  { id: 'auto2x', name: 'Parallel Lines', cost: 6000, revealAt: 4000, effect: 'auto_x2' },
  // Queue-gated
  { id: 'allx2', name: 'Second Phone Line', cost: 18000, revealAt: 10000, revealAtQueue: 120, effect: 'all_x2' },
  { id: 'speed3x', name: 'Overclocked Modem', cost: 50000, revealAt: 28000, revealAtQueue: 100, effect: 'speed_x3' },
  { id: 'dust', name: 'Entropy Noticed', cost: 100000, revealAt: 55000, revealAtQueue: 80, effect: 'dust_start' },
  { id: 'robo3x', name: 'Machine Learning', cost: 350000, revealAt: 200000, revealAtQueue: 60, effect: 'robo_x3' },
  { id: 'muscle', name: 'Muscle Memory', cost: 750000, revealAt: 500000, revealAtQueue: 60, effect: 'combo_lock' },
  { id: 'qfamiliar', name: 'Queue Familiarity', cost: 500000, revealAt: 300000, revealAtQueue: 50, effect: 'queue_familiar' },
  { id: 'allx2b', name: 'Conference Call', cost: 1500000, revealAt: 800000, revealAtQueue: 40, effect: 'all_x2' },
  { id: 'insider', name: 'Corporate Insider', cost: 4000000, revealAt: 2000000, revealAtQueue: 20, effect: 'insider' },
  // Time-gated
  { id: 'time1', name: 'Time Blur I', cost: 200000, revealAt: 110000, revealAtActiveTime: 1800, effect: 'time_x10_cap5' },
  { id: 'time2', name: 'Time Blur II', cost: 600000, revealAt: 380000, revealAtActiveTime: 2700, effect: 'time_x10_cap6' },
  { id: 'time3', name: 'Time Blur III', cost: 2500000, revealAt: 1200000, revealAtActiveTime: 3600, effect: 'time_x12_cap8' },
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
const DUST_TIME_CAP = 30;
const NINE_YEARS = 86400 * 365 * 9;
const TEN_YEARS = 86400 * 365 * 10;

// === STATE ===
let state = {};

function resetState() {
  state = {
    patience: 0, maxPatience: 0, dust: 0, maxDust: 0,
    wtl: 15, wtlMax: 15, wtlPerClick: 1, wtlRegen: 0,
    patiencePerClick: 1, patiencePerSec: 0,
    dustPerSec: 0, dustMultiplier: 1,
    timeMultiplier: 1, globalGenMult: 1,
    genMults: { doodle: 1, fidget: 1, autodialer: 1, speeddialer: 1, robocaller: 1, callcenter: 1 },
    queueCostMult: 1,
    queue: QUEUE_START, queueAdvances: 0,
    combo: 1, comboUnlocked: false, comboLocked: false, comboCapMax: 4,
    refillCost: 5, refillAmount: 12,
    dustStarted: false, noWtlCost: false,
    timeFrozen: false, departmentTransferred: false,
    queueFamiliarityUnlocked: false, queueFamiliarityDiscount: 0, lastAdvanceTime: 0,
    realSeconds: 0, activePlayTime: 0, inGameSeconds: 0,
    totalClicks: 0, hangups: 0,
    boughtUpgrades: new Set(), boughtCollectors: new Set(),
  };
  GENERATORS.forEach(g => { g.owned = 0; });
}

// === CASCADING PPS ===
function calcPPS() {
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
      total += g.baseProduction * g.owned * mult * (nestedBoost[g.id] || 1);
    }
  });
  return total;
}

// === COSTS ===
function getGenCost(gen) {
  if (gen.owned >= gen.softCapAt) {
    const base = gen.baseCost * Math.pow(gen.growthRate, gen.softCapAt);
    return Math.floor(base * Math.pow(Math.pow(gen.growthRate, 8), gen.owned - gen.softCapAt));
  }
  return Math.floor(gen.baseCost * Math.pow(gen.growthRate, gen.owned));
}

function getAdvanceCost() {
  const discount = (state.queueFamiliarityUnlocked && state.queueFamiliarityDiscount > 0) ? state.queueFamiliarityDiscount : 0;
  const baseCost = QUEUE_BASE_COST * Math.pow(QUEUE_GROWTH, state.queueAdvances);
  let cost = baseCost;
  if (state.queueAdvances >= 120) {
    const depth = state.queueAdvances - 120;
    cost = baseCost * (1 + Math.pow(depth, 1.8) / 12);
  }
  return Math.floor(cost * state.queueCostMult * (1 - discount));
}

function calcDustTimeFactor() {
  if (state.maxDust <= 10) return 1;
  return Math.min(50000, 1 + Math.pow(Math.log10(state.maxDust + 1), 2) * 10);
}

// === EFFECTS ===
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
    case 'time_x10_cap5': state.timeMultiplier *= 10; state.comboCapMax = 5; break;
    case 'time_x10_cap6': state.timeMultiplier *= 10; state.comboCapMax = 6; break;
    case 'time_x12_cap8': state.timeMultiplier *= 12; state.comboCapMax = 8; break;
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
  const TICK = 0.1, MAX_SEC = 7200;
  let clicksPerSec = playerType === 'active' ? 1.85 : playerType === 'casual' ? 1.5 : 1.0;
  let thinkTime = playerType === 'active' ? 4 : playerType === 'casual' ? 6 : 10;
  let restChance = playerType === 'active' ? 0.02 : 0.04;

  let clickAccum = 0, lastLogTime = 0, restingUntil = 0, thinkingUntil = 0;

  console.log(`\n=== SIMULATION: ${playerType} player ===`);
  console.log(`Queue-gated | Time-gated | Dept Transfer | Time Freeze at 9yr\n`);

  while (state.realSeconds < MAX_SEC && !(state.queue <= 0 && state.inGameSeconds >= TEN_YEARS)) {
    const dt = TICK;
    state.realSeconds += dt;
    state.activePlayTime += dt;
    const activeMin = state.activePlayTime / 60;

    // --- Time ---
    if (state.dust > state.maxDust) state.maxDust = state.dust;
    const dustTimeFactor = calcDustTimeFactor();
    const effectiveTimeMult = state.timeMultiplier * dustTimeFactor;

    // Time freeze check
    if (state.inGameSeconds >= NINE_YEARS && !state.timeFrozen) {
      state.timeFrozen = true;
      state.inGameSeconds = NINE_YEARS;
      console.log(`  [${activeMin.toFixed(0)}m] *** TIME FROZEN *** queue:#${state.queue} | pps:${calcPPS().toFixed(0)}`);
    }

    // Passive time accumulation (only if not frozen)
    if (!state.timeFrozen) {
      state.inGameSeconds += dt * effectiveTimeMult;
    }

    // --- WtL Drain ---
    if (activeMin > 5) {
      const baseDrain = 0.15 * Math.log2(activeMin - 4);
      const lateDrain = activeMin > 30 ? (activeMin - 30) * 0.02 : 0;
      state.wtl = Math.max(0, state.wtl - Math.min(1.5, baseDrain + lateDrain) * dt);
    }
    if (state.wtlRegen > 0) state.wtl = Math.min(state.wtlMax, state.wtl + state.wtlRegen * dt);

    // --- Hangup ---
    if (state.wtl < 0.1) {
      state.hangups++;
      const penalty = Math.min(8, Math.floor(state.queueAdvances * 0.04) + 2);
      state.queue = Math.min(QUEUE_START, state.queue + penalty);
      state.patience = 0; state.wtl = state.wtlMax;
      console.log(`  [${activeMin.toFixed(0)}m] HANGUP #${state.hangups}`);
      continue;
    }

    // --- Clicking ---
    if (state.realSeconds < restingUntil) {
      if (state.combo > 1 && !state.comboLocked) state.combo = Math.max(1, state.combo - 0.4 * dt);
    } else {
      if (Math.random() < restChance * dt) restingUntil = state.realSeconds + 5 + Math.random() * 5;
      if (state.wtl >= state.wtlPerClick || state.noWtlCost) {
        clickAccum += clicksPerSec * dt;
        const clicks = Math.floor(clickAccum); clickAccum -= clicks;
        for (let i = 0; i < clicks; i++) {
          if (!state.noWtlCost && state.wtl < state.wtlPerClick) break;
          state.patience += state.patiencePerClick;
          if (!state.noWtlCost) state.wtl -= state.wtlPerClick;
          state.totalClicks++;
          if (state.comboUnlocked) state.combo = Math.min(state.comboCapMax, state.combo + 0.3);
        }
      }
    }

    // --- Deep Breath ---
    if (!state._dbt || state.wtl >= state.wtlMax) state._dbt = 1 + Math.random() * 4;
    if (state.wtl <= state._dbt && state.patience >= state.refillCost) {
      state.patience -= state.refillCost; state.wtl = Math.min(state.wtlMax, state.wtl + state.refillAmount);
      state._dbt = 1 + Math.random() * 4;
    }

    // --- PPS ---
    let pps = calcPPS() * state.combo;
    state.patience += pps * dt;
    if (state.patience > state.maxPatience) state.maxPatience = state.patience;

    // --- Dust (not during freeze) ---
    if (state.dustStarted && !state.timeFrozen) {
      const dustTimeCap = Math.min(DUST_TIME_CAP, effectiveTimeMult);
      const ppsBonus = calcPPS() * 0.0001;
      state.dust += (state.dustPerSec + ppsBonus) * state.dustMultiplier * dt * dustTimeCap;
    }

    // --- AI Purchases (with thinking time, respects gates) ---
    if (state.realSeconds >= thinkingUntil) {
      const bought = buyBestUpgrade() || buyBestGenerator() || buyBestCollector() || tryAdvanceQueue();
      if (bought) thinkingUntil = state.realSeconds + thinkTime * (0.5 + Math.random());
    }

    // --- Queue Familiarity decay ---
    if (state.queueFamiliarityUnlocked && state.queueFamiliarityDiscount > 0) {
      if (state.realSeconds - state.lastAdvanceTime > 15) {
        state.queueFamiliarityDiscount = Math.max(0, state.queueFamiliarityDiscount - 0.03 * dt);
      }
    }

    // --- Log ---
    if (state.realSeconds - lastLogTime >= 60) {
      lastLogTime = state.realSeconds;
      console.log(`  [${activeMin.toFixed(0)}m] q:#${state.queue} | pps:${calcPPS().toFixed(0)} | p:${Math.floor(state.patience)} | dust:${state.dust.toFixed(0)} | wtl:${state.wtl.toFixed(1)}/${state.wtlMax} | time:${fmtTime(state.inGameSeconds)} | clicks:${state.totalClicks}${state.timeFrozen ? ' [FROZEN]' : ''}`);
    }
  }

  // Final
  console.log('');
  console.log(`=== RESULT ===`);
  console.log(`  Completed: ${state.queue <= 0 && state.inGameSeconds >= NINE_YEARS ? 'YES' : 'NO'}`);
  console.log(`  Real time: ${(state.realSeconds / 60).toFixed(1)} min`);
  console.log(`  In-game: ${fmtTime(state.inGameSeconds)}`);
  console.log(`  Clicks: ${state.totalClicks} | Hangups: ${state.hangups}`);
  console.log(`  Final PPS: ${calcPPS().toFixed(0)} | Dust: ${state.dust.toFixed(0)}`);
  console.log(`  Upgrades: ${state.boughtUpgrades.size}/${UPGRADES.length} | Collectors: ${state.boughtCollectors.size}/${DUST_COLLECTORS.length}`);
  console.log(`  Dept Transfer: ${state.departmentTransferred ? 'YES' : 'NO'}`);
  console.log(`  Time Frozen: ${state.timeFrozen ? 'YES' : 'NO'}`);
  console.log('');
}

// === PURCHASE LOGIC ===
function buyBestUpgrade() {
  for (const u of UPGRADES) {
    if (state.boughtUpgrades.has(u.id)) continue;
    if (state.maxPatience < u.revealAt) continue;
    if (u.revealAtQueue && state.queue > u.revealAtQueue) continue;
    if (u.revealAtActiveTime && state.activePlayTime < u.revealAtActiveTime) continue;
    if (state.patience >= u.cost) {
      state.patience -= u.cost;
      state.boughtUpgrades.add(u.id);
      applyUpgrade(u);
      console.log(`  [${(state.activePlayTime/60).toFixed(1)}m] UPGRADE: ${u.name} | pps:${calcPPS().toFixed(0)}`);
      return true;
    }
  }
  return false;
}

function buyBestGenerator() {
  let best = null, bestRatio = 0;
  for (const g of GENERATORS) {
    if (g.unlocksAt && state.maxPatience < g.unlocksAt) continue;
    const cost = getGenCost(g);
    if (state.patience < cost) continue;
    const mult = (state.genMults[g.id] || 1) * state.globalGenMult;
    const ratio = (g.baseProduction * mult) / cost;
    if (ratio > bestRatio) { bestRatio = ratio; best = g; }
  }
  if (best) { state.patience -= getGenCost(best); best.owned++; return true; }
  return false;
}

function buyBestCollector() {
  for (const c of DUST_COLLECTORS) {
    if (state.boughtCollectors.has(c.id)) continue;
    if (state.dust >= c.cost) {
      state.dust -= c.cost; state.boughtCollectors.add(c.id); applyCollector(c);
      console.log(`  [${(state.activePlayTime/60).toFixed(1)}m] COLLECTOR: ${c.name} | pps:${calcPPS().toFixed(0)}`);
      return true;
    }
  }
  return false;
}

function tryAdvanceQueue() {
  // Don't advance before 5 min (mirrors game lock)
  if (state.activePlayTime < 300) return false;
  const cost = getAdvanceCost();
  // During time freeze, be more aggressive (nothing else to spend on)
  const threshold = state.timeFrozen ? 1.0 : 1.5;
  if (state.patience >= cost * threshold && state.queue > 0) {
    state.patience -= cost;
    state.queue--;
    state.queueAdvances++;

    // Time freeze: advance grants time + dust
    if (state.timeFrozen) {
      const remaining = state.queue + 1;
      const timeChunk = (TEN_YEARS - state.inGameSeconds) / Math.max(1, remaining);
      state.inGameSeconds += timeChunk;
      if (state.dustStarted) state.dust += state.dustPerSec * timeChunk;
    }

    // Queue Familiarity
    if (state.queueFamiliarityUnlocked) {
      state.queueFamiliarityDiscount = Math.min(0.25, state.queueFamiliarityDiscount + 0.02);
      state.lastAdvanceTime = state.realSeconds;
    }

    // Department transfer: queue hits 0 before 9 years
    if (state.queue <= 0 && state.inGameSeconds < NINE_YEARS && !state.departmentTransferred) {
      state.departmentTransferred = true;
      state.queue = 75;
      console.log(`  [${(state.activePlayTime/60).toFixed(1)}m] *** DEPARTMENT TRANSFER *** queue reset to #75`);
    }
    return true;
  }
  return false;
}

// === HELPERS ===
function fmtTime(s) {
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return (s / 3600).toFixed(1) + 'h';
  if (s < 86400 * 30) return (s / 86400).toFixed(1) + 'd';
  if (s < 86400 * 365) return (s / (86400 * 30)).toFixed(1) + 'mo';
  return (s / (86400 * 365)).toFixed(1) + 'y';
}

// === RUN ===
const playerArg = process.argv.find(a => a.startsWith('--player='));
simulate(playerArg ? playerArg.split('=')[1] : 'active');
