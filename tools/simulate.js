#!/usr/bin/env node
/**
 * PLEASE HOLD - Phase 1 Simulator (FINAL v5)
 * 
 * Matches game logic:
 * - Auto-queue: progress fills at pps × queueSpeedMult × wtlStateMult, advances when full
 * - Click pushes queue at pps × 0.1 × clickMult (after Hold Pressure)
 * - Combo always decays, Muscle Memory halves decay
 * - Milestone multipliers at 25/50/75/100 owned
 * - Asymptotic dust collectors (production bonus caps at +100%)
 * - WtL graduated states affect queue speed, click power, gen output
 * - Connection events every 3-5 min (30 sec of production)
 * - Pass 2: reversed pressure (boss fight)
 * 
 * Usage: node tools/simulate.js [--verbose]
 */

const verbose = process.argv.includes('--verbose');

// === GENERATORS ===
const GENERATORS = [
  { id: 'doodle', baseCost: 15, growthRate: 1.15, baseProduction: 0.2, softCapAt: 30, unlocksAt: 0, owned: 0, boostPct: 0 },
  { id: 'fidget', baseCost: 100, growthRate: 1.14, baseProduction: 1.0, softCapAt: 25, unlocksAt: 80, owned: 0, boostPct: 0.004 },
  { id: 'auto', baseCost: 800, growthRate: 1.13, baseProduction: 5.0, softCapAt: 22, unlocksAt: 600, owned: 0, boostPct: 0.008 },
  { id: 'speed', baseCost: 6000, growthRate: 1.12, baseProduction: 25.0, softCapAt: 18, unlocksAt: 5000, owned: 0, boostPct: 0.012 },
  { id: 'robo', baseCost: 50000, growthRate: 1.11, baseProduction: 120.0, softCapAt: 15, unlocksAt: 40000, owned: 0, boostPct: 0.016 },
  { id: 'shadow', baseCost: 500000, growthRate: 1.10, baseProduction: 600.0, softCapAt: 12, unlocksAt: 350000, owned: 0, boostPct: 0.02 },
];

// === UPGRADES ===
const UPGRADES = [
  { id: 'modem', cost: 25000, revealAt: 15000, revealQ: 130, mult: 'speed', val: 2 },
  { id: 'shadow2x', cost: 800000, revealAt: 500000, revealQ: 65, mult: 'shadow', val: 2 },
  { id: 'blur1', cost: 100000, revealTime: 1800, mult: 'global', val: 2 },
  { id: 'blur2', cost: 500000, revealTime: 2700, mult: 'global', val: 2 },
  { id: 'blur3', cost: 2500000, revealTime: 3600, mult: 'global', val: 2 },
];

// === DUST COLLECTORS ===
const DUST_COLLECTORS = [
  { id: 'cloth', cost: 300, queueSpeed: 0.05, dustMult: 1, queueCost: 1 },
  { id: 'feather', cost: 800, queueSpeed: 0.05, dustMult: 1, queueCost: 1 },
  { id: 'filter', cost: 2000, queueSpeed: 0, dustMult: 1.25, queueCost: 1 },
  { id: 'aircan', cost: 5000, queueSpeed: 0, dustMult: 1.5, queueCost: 1 },
  { id: 'dustpan', cost: 8000, queueSpeed: 0, dustMult: 1, queueCost: 0.9 },
  { id: 'handvac', cost: 15000, queueSpeed: 0.10, dustMult: 1, queueCost: 1 },
  { id: 'hepa', cost: 25000, queueSpeed: 0, dustMult: 1.5, queueCost: 1 },
  { id: 'static', cost: 40000, queueSpeed: 0, dustMult: 1, queueCost: 0.85 },
  { id: 'shopvac', cost: 60000, queueSpeed: 0.15, dustMult: 1, queueCost: 1 },
  { id: 'cleanroom', cost: 100000, queueSpeed: 0, dustMult: 2.0, queueCost: 1 },
  { id: 'singular', cost: 150000, queueSpeed: 0, dustMult: 1, queueCost: 0.8 },
  { id: 'entropy', cost: 300000, queueSpeed: 0.20, dustMult: 1, queueCost: 1 },
  { id: 'pressure', cost: 600000, queueSpeed: 0, dustMult: 2.0, queueCost: 1 },
  { id: 'void', cost: 1200000, queueSpeed: 0.25, dustMult: 1, queueCost: 1 },
];

// === PHONE TIERS ===
const PHONE_TIERS = [
  { queueGate: 999, prodBonus: 0, queueBonus: 0 },
  { queueGate: 180, prodBonus: 0.05, queueBonus: 0 },
  { queueGate: 150, prodBonus: 0.10, queueBonus: 0 },
  { queueGate: 100, prodBonus: 0.15, queueBonus: 0.05 },
  { queueGate: 50, prodBonus: 0.25, queueBonus: 0.10 },
  { queueGate: 10, prodBonus: 0.50, queueBonus: 0.25 },
];

// === CONSTANTS ===
const QUEUE_START = 200;
const GROWTH = 1.06;
const BASE_COST = 200;
const MILESTONE_INTERVAL = 25;
const DUST_COEFF = 0.1;
const PASS2_BASE_PRESSURE = 500;
const PASS2_PRESSURE_GROWTH = 0.02;
const PASS2_HOLD_TARGET = 10;
const PASS2_HOLD_DURATION = 60;
const CONNECTION_INTERVAL = 240; // avg 4 min in seconds
const CONNECTION_BURST_SEC = 30;

// === STATE ===
let state;
function reset() {
  state = {
    patience: 0, maxP: 0, queue: QUEUE_START, queuePass: 1,
    queueProgress: 0, queueSpeedMult: 1.0, queueCostMult: 1.0,
    genMults: { doodle: 1, fidget: 1, auto: 1, speed: 1, robo: 1, shadow: 1 },
    globalMult: 1, combo: 1, comboMax: 4, comboDecayRate: 0.4,
    activeTime: 0, clicks: 0, bought: new Set(), boughtCollectors: new Set(),
    dustStarted: false, dust: 0, dustPerSec: 0.2, dustMult: 1,
    holdPressure: false, phoneTier: 0, phoneProdBonus: 0, phoneQueueBonus: 0,
    dustCollectorCount: 0,
    // WtL (simplified for sim — tracks state but doesn't cause hangups)
    wtl: 100, wtlDrain: 0,
    // Pass 2
    pass2Elapsed: 0, pass2HoldTimer: 0,
    // Connection events
    nextConnection: CONNECTION_INTERVAL,
  };
  GENERATORS.forEach(g => { g.owned = 0; });
}

// === PPS CALCULATION ===
function getMilestoneMult(owned) {
  return Math.pow(2, Math.floor(owned / MILESTONE_INTERVAL));
}

function calcPPS() {
  const boost = {};
  GENERATORS.forEach(g => { boost[g.id] = 1; });
  for (let i = GENERATORS.length - 1; i >= 1; i--) {
    const g = GENERATORS[i];
    if (g.owned > 0 && g.boostPct > 0) {
      for (let j = 0; j < i; j++) {
        boost[GENERATORS[j].id] += g.owned * g.boostPct;
      }
    }
  }
  GENERATORS.forEach(g => { if (boost[g.id] > 2.5) boost[g.id] = 2.5; });

  let total = 0;
  GENERATORS.forEach(g => {
    if (g.owned > 0) {
      const mult = (state.genMults[g.id] || 1) * state.globalMult * getMilestoneMult(g.owned);
      total += g.baseProduction * g.owned * mult * boost[g.id];
    }
  });

  // Phone bonus
  if (state.phoneProdBonus > 0) total *= (1 + state.phoneProdBonus);
  // Asymptotic dust collector bonus
  if (state.dustCollectorCount > 0) {
    total *= (1 + (1 - Math.exp(-state.dustCollectorCount * DUST_COEFF)));
  }
  return total;
}

// === COSTS ===
function getGenCost(g) {
  if (g.owned >= g.softCapAt) {
    const base = g.baseCost * Math.pow(g.growthRate, g.softCapAt);
    return Math.floor(base * Math.pow(Math.pow(g.growthRate, 4), g.owned - g.softCapAt));
  }
  return Math.floor(g.baseCost * Math.pow(g.growthRate, g.owned));
}

function getQueueCost(pos) {
  let cost = Math.floor(BASE_COST * Math.pow(GROWTH, (QUEUE_START - pos)));
  cost = Math.floor(cost * state.queueCostMult);
  return cost;
}

// === WTL STATE (simplified) ===
function getWtlQueueMult() {
  const pct = state.wtl;
  if (pct >= 75) return 1.0;
  if (pct >= 50) return 0.9;
  if (pct >= 25) return 0.75;
  if (pct >= 10) return 0.5;
  return 0.0;
}

function getWtlGenMult() {
  const pct = state.wtl;
  if (pct >= 25) return 1.0;
  if (pct >= 10) return 1.25;
  return 1.5;
}

// === SIMULATION ===
function simulate() {
  reset();
  const DT = 0.1;
  const MAX_TIME = 7200;
  let clickAccum = 0;
  let lastLog = 0;
  let lastMilestoneLog = {};

  function getClickRate(activeTime) {
    const min = activeTime / 60;
    if (min < 15) return 2.0;
    if (min < 30) return 1.0;
    if (min < 45) return 0.5;
    return 0.3; // still clicking in boss fight
  }

  console.log(`\n=== PLEASE HOLD v5 SIMULATOR ===\n`);

  while (state.activeTime < MAX_TIME) {
    state.activeTime += DT;
    const pps = calcPPS();

    // --- WtL simulation (simplified: drains, refills automatically when low) ---
    const activeMin = state.activeTime / 60;
    if (activeMin > 5) {
      const progressRatio = 1 - (state.queue / QUEUE_START);
      let drain = 0.5 + 0.3 * progressRatio;
      state.wtl = Math.max(0, state.wtl - drain * DT);
      state.wtl = Math.min(100, state.wtl + 0.05 * DT); // passive regen
      // Auto-refill when below 40 (simulates player hitting Deep Breath)
      if (state.wtl < 40 && state.patience > pps * 2) {
        state.patience -= Math.max(10, pps * 2);
        state.wtl = Math.min(100, state.wtl + 40);
      }
    }

    // --- Production ---
    const genMult = getWtlGenMult();
    const earned = pps * genMult * state.combo * DT;
    state.patience += earned;
    state.maxP += earned;

    // --- Clicking ---
    clickAccum += getClickRate(state.activeTime) * DT;
    const clicks = Math.floor(clickAccum);
    clickAccum -= clicks;
    for (let i = 0; i < clicks; i++) {
      const clickVal = 1 + pps * 0.05;
      state.patience += clickVal;
      state.maxP += clickVal;
      state.clicks++;
      // Hold Pressure: pps × 0.1 per click
      if (state.holdPressure) {
        state.queueProgress += pps * 0.1;
      }
      if (state.combo < state.comboMax) state.combo = Math.min(state.comboMax, state.combo + 0.3);
    }

    // --- Combo decay (always active) ---
    if (state.combo > 1) {
      state.combo = Math.max(1, state.combo - state.comboDecayRate * DT);
    }

    // --- Connection events ---
    state.nextConnection -= DT;
    if (state.nextConnection <= 0 && state.queue < 190) {
      const burst = pps * CONNECTION_BURST_SEC;
      state.patience += burst;
      state.maxP += burst;
      state.nextConnection = CONNECTION_INTERVAL;
      if (verbose) console.log(`  [${(state.activeTime/60).toFixed(1)}m] CONNECTION EVENT: +${burst.toFixed(0)}`);
    }

    // === PASS 1: AUTO-QUEUE ===
    if (state.queuePass === 1 && state.queue > 0) {
      const wtlQMult = getWtlQueueMult();
      const effectiveSpeed = (state.queueSpeedMult + state.phoneQueueBonus) * wtlQMult;
      state.queueProgress += pps * effectiveSpeed * DT;
      const qCost = getQueueCost(state.queue);

      if (state.queueProgress >= qCost) {
        state.queueProgress -= qCost;
        state.queue--;

        // Phone tier
        for (let i = PHONE_TIERS.length - 1; i >= 0; i--) {
          if (state.queue <= PHONE_TIERS[i].queueGate && state.phoneTier < i) {
            state.phoneTier = i;
            state.phoneProdBonus = PHONE_TIERS[i].prodBonus;
            state.phoneQueueBonus = PHONE_TIERS[i].queueBonus;
            if (verbose) console.log(`  [${(state.activeTime/60).toFixed(1)}m] PHONE TIER ${i}: +${(PHONE_TIERS[i].prodBonus*100)}% prod, +${(PHONE_TIERS[i].queueBonus*100)}% queue`);
            break;
          }
        }

        if (state.queue <= 0) {
          // Department Transfer → Pass 2
          state.queuePass = 2;
          state.queue = 1;
          state.queueProgress = 0;
          state.pass2Elapsed = 0;
          state.pass2HoldTimer = 0;
          console.log(`  [${(state.activeTime/60).toFixed(1)}m] *** DEPARTMENT TRANSFER *** pps:${pps.toFixed(0)}`);
        }
      }
    }

    // === PASS 2: REVERSED PRESSURE ===
    if (state.queuePass === 2) {
      state.pass2Elapsed += DT;
      const wtlQMult = getWtlQueueMult();
      const pressure = PASS2_BASE_PRESSURE * (1 + PASS2_PRESSURE_GROWTH * state.pass2Elapsed);
      const yourPush = pps * (state.queueSpeedMult + state.phoneQueueBonus) * wtlQMult;
      const net = pressure - yourPush;

      state.queueProgress += net * DT;
      const posCost = 10000;
      while (state.queueProgress >= posCost && state.queue < 50) {
        state.queueProgress -= posCost;
        state.queue++;
      }
      while (state.queueProgress <= -posCost && state.queue > 1) {
        state.queueProgress += posCost;
        state.queue--;
      }
      if (state.queue < 1) state.queue = 1;

      // Win condition
      if (state.queue <= PASS2_HOLD_TARGET && state.wtl >= 25) {
        state.pass2HoldTimer += DT;
        if (state.pass2HoldTimer >= PASS2_HOLD_DURATION) {
          console.log(`  [${(state.activeTime/60).toFixed(1)}m] *** PHASE 1 COMPLETE (held position for ${PASS2_HOLD_DURATION}s) ***`);
          break;
        }
      } else {
        state.pass2HoldTimer = 0;
      }
    }

    // --- Dust ---
    if (state.dustStarted) {
      state.dust += (state.dustPerSec + pps * 0.0001) * state.dustMult * DT;
    }

    // --- Hold Pressure at queue ≤170 ---
    if (!state.holdPressure && state.queue <= 170 && state.maxP >= 400) {
      state.holdPressure = true;
      state.patience -= 600;
      console.log(`  [${(state.activeTime/60).toFixed(1)}m] UPGRADE: Hold Pressure`);
    }

    // --- Entropy Noticed at queue ≤120 ---
    if (!state.dustStarted && state.queue <= 120 && state.maxP >= 50000) {
      state.dustStarted = true;
      state.patience -= 50000;
      console.log(`  [${(state.activeTime/60).toFixed(1)}m] UPGRADE: Entropy Noticed (dust starts)`);
    }

    // --- Optimized Routing at queue ≤100 ---
    if (!state.bought.has('routing') && state.queue <= 100 && state.patience >= 200000) {
      state.bought.add('routing');
      state.patience -= 200000;
      state.queueSpeedMult += 0.10;
      console.log(`  [${(state.activeTime/60).toFixed(1)}m] UPGRADE: Optimized Routing`);
    }

    // --- Muscle Memory at queue ≤85 ---
    if (!state.bought.has('muscle') && state.queue <= 85 && state.patience >= 300000) {
      state.bought.add('muscle');
      state.patience -= 300000;
      state.comboDecayRate = 0.2; // halved
      console.log(`  [${(state.activeTime/60).toFixed(1)}m] UPGRADE: Muscle Memory (decay halved)`);
    }

    // --- Emotional Callus at queue ≤60, 40min ---
    if (!state.bought.has('callus') && state.queue <= 60 && state.activeTime >= 2400 && state.patience >= 500000) {
      state.bought.add('callus');
      state.patience -= 500000;
      // In sim: don't model WtL reduction, just note it
      console.log(`  [${(state.activeTime/60).toFixed(1)}m] UPGRADE: Emotional Callus`);
    }

    // --- Buy upgrades ---
    for (const u of UPGRADES) {
      if (state.bought.has(u.id)) continue;
      if (u.revealAt && state.maxP < u.revealAt) continue;
      if (u.revealQ && state.queue > u.revealQ) continue;
      if (u.revealTime && state.activeTime < u.revealTime) continue;
      if (state.patience >= u.cost) {
        state.patience -= u.cost;
        state.bought.add(u.id);
        if (u.mult === 'global') state.globalMult *= u.val;
        else if (state.genMults[u.mult] !== undefined) state.genMults[u.mult] *= u.val;
        if (u.id === 'blur1') state.comboMax = 5;
        if (u.id === 'blur2') state.comboMax = 6;
        if (u.id === 'blur3') state.comboMax = 8;
        console.log(`  [${(state.activeTime/60).toFixed(1)}m] UPGRADE: ${u.id} | pps:${calcPPS().toFixed(0)} | q:#${state.queue}`);
      }
    }

    // --- Buy dust collectors ---
    if (state.dustStarted) {
      for (const c of DUST_COLLECTORS) {
        if (state.boughtCollectors.has(c.id)) continue;
        if (state.dust >= c.cost) {
          state.dust -= c.cost;
          state.boughtCollectors.add(c.id);
          state.dustCollectorCount++;
          state.queueSpeedMult += c.queueSpeed;
          state.dustMult *= c.dustMult;
          state.queueCostMult *= c.queueCost;
          const bonus = (1 - Math.exp(-state.dustCollectorCount * DUST_COEFF)) * 100;
          console.log(`  [${(state.activeTime/60).toFixed(1)}m] DUST: ${c.id} (${state.dustCollectorCount}/14, +${bonus.toFixed(0)}% prod) | dust:${state.dust.toFixed(0)}`);
        }
      }
    }

    // --- Buy generators (best ratio, buy multiple per tick) ---
    let bought = true;
    while (bought) {
      bought = false;
      let best = null, bestRatio = 0;
      for (const g of GENERATORS) {
        if (g.unlocksAt && state.maxP < g.unlocksAt) continue;
        const cost = getGenCost(g);
        if (state.patience < cost) continue;
        const mult = (state.genMults[g.id] || 1) * state.globalMult * getMilestoneMult(g.owned);
        const ratio = (g.baseProduction * mult) / cost;
        if (ratio > bestRatio) { bestRatio = ratio; best = g; }
      }
      if (best && state.patience >= getGenCost(best)) {
        const prevMilestone = Math.floor(best.owned / MILESTONE_INTERVAL);
        state.patience -= getGenCost(best);
        best.owned++;
        bought = true;
        // Log milestones
        const newMilestone = Math.floor(best.owned / MILESTONE_INTERVAL);
        if (newMilestone > prevMilestone && !lastMilestoneLog[best.id + newMilestone]) {
          lastMilestoneLog[best.id + newMilestone] = true;
          console.log(`  [${(state.activeTime/60).toFixed(1)}m] MILESTONE: ${best.id} x${Math.pow(2, newMilestone)} (${best.owned} owned)`);
        }
      }
    }

    // --- Periodic log ---
    if (state.activeTime - lastLog >= 60) {
      lastLog = state.activeTime;
      const min = (state.activeTime / 60).toFixed(0);
      const genSummary = GENERATORS.map(g => g.id[0] + ':' + g.owned).join(' ');
      console.log(`  [${min}m] q:#${state.queue} | pps:${pps.toFixed(0)} | p:${Math.floor(state.patience)} | dust:${state.dust.toFixed(0)} | combo:${state.combo.toFixed(1)} | clicks:${state.clicks} | pass:${state.queuePass} | phone:${state.phoneTier} | wtl:${state.wtl.toFixed(0)} | ${genSummary}`);
    }
  }

  // Summary
  const min = (state.activeTime / 60).toFixed(1);
  const genSummary = GENERATORS.map(g => g.id + ':' + g.owned).join(', ');
  console.log(`\n=== RESULT ===`);
  console.log(`  Time: ${min} min`);
  console.log(`  Completed: ${state.queuePass === 2 && state.pass2HoldTimer >= PASS2_HOLD_DURATION ? 'YES' : 'NO'}`);
  console.log(`  Final PPS: ${calcPPS().toFixed(0)}`);
  console.log(`  Clicks: ${state.clicks}`);
  console.log(`  Dust: ${state.dust.toFixed(0)}`);
  console.log(`  Dust Collectors: ${state.dustCollectorCount}/14`);
  console.log(`  Phone Tier: ${state.phoneTier}`);
  console.log(`  Upgrades: ${state.bought.size}`);
  console.log(`  Generators: ${genSummary}`);
  console.log(`  Pass 2 Hold Timer: ${state.pass2HoldTimer.toFixed(1)}s / ${PASS2_HOLD_DURATION}s`);
  console.log('');
}

simulate();
