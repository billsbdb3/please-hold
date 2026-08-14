#!/usr/bin/env node
/**
 * PLEASE HOLD - Phase 1 Simulator (v3: Auto-Queue)
 * 
 * Matches current game logic:
 * - Auto-queue: progress fills at pps, advances when full
 * - Click adds burst to queue progress
 * - Cost curve: BASE × GROWTH^(QUEUE_START - pos)
 * - Two-pass: 100→0 then 75→0
 * - Cascade boost capped at 2.5x
 * - Click value = base + pps × 0.05
 * - Time = queue position
 * 
 * Usage: node tools/simulate.js [--growth=1.12] [--base=50] [--target=90]
 */

// === CONFIGURABLE PARAMETERS (override via CLI) ===
const args = {};
process.argv.slice(2).forEach(a => {
  const [k, v] = a.replace('--', '').split('=');
  args[k] = parseFloat(v) || v;
});

const QUEUE_START = args.queuesize || 200;
const GROWTH = args.growth || 1.12;
const BASE_COST = args.base || 50;
const TARGET_MINUTES = args.target || 90;
const CLICK_BURST = args.clickburst || 50; // fixed progress per click
const QUEUE_SPEED_MULT_BASE = 1.0;
const SECOND_PASS_MULT = args.pass2mult || 10; // multiply costs by this on second pass

// === GENERATORS ===
const GENERATORS = [
  { id: 'doodle', baseCost: 15, growthRate: 1.15, baseProduction: 0.2, softCapAt: 30, unlocksAt: 0, owned: 0, boostPct: 0 },
  { id: 'fidget', baseCost: 100, growthRate: 1.14, baseProduction: 1.0, softCapAt: 25, unlocksAt: 80, owned: 0, boostPct: 0.004 },
  { id: 'auto', baseCost: 800, growthRate: 1.13, baseProduction: 5.0, softCapAt: 22, unlocksAt: 600, owned: 0, boostPct: 0.008 },
  { id: 'speed', baseCost: 6000, growthRate: 1.12, baseProduction: 25.0, softCapAt: 18, unlocksAt: 5000, owned: 0, boostPct: 0.012 },
  { id: 'robo', baseCost: 50000, growthRate: 1.11, baseProduction: 120.0, softCapAt: 15, unlocksAt: 40000, owned: 0, boostPct: 0.016 },
  { id: 'shadow', baseCost: 500000, growthRate: 1.10, baseProduction: 600.0, softCapAt: 12, unlocksAt: 350000, owned: 0, boostPct: 0.02 },
];

// === UPGRADES (multipliers only, simplified) ===
const UPGRADES = [
  { id: 'doodle2x', cost: 250, revealAt: 130, mult: 'doodle', val: 2 },
  { id: 'fidget2x', cost: 1500, revealAt: 900, mult: 'fidget', val: 2 },
  { id: 'auto2x', cost: 6000, revealAt: 4000, mult: 'auto', val: 2 },
  { id: 'speed2x', cost: 25000, revealAt: 15000, revealQ: 70, mult: 'speed', val: 2 },
  { id: 'robo2x', cost: 150000, revealAt: 80000, revealQ: 40, mult: 'robo', val: 2 },
  { id: 'shadow2x', cost: 800000, revealAt: 500000, revealQ: 25, mult: 'shadow', val: 2 },
  { id: 'robo3x', cost: 3000000, revealAt: 1500000, revealQ: 18, mult: 'robo', val: 3 },
  { id: 'speed3x', cost: 8000000, revealAt: 4000000, revealQ: 12, mult: 'speed', val: 3 },
  // Time Blurs (global x2)
  { id: 'blur1', cost: 100000, revealTime: 1800, mult: 'global', val: 2 },
  { id: 'blur2', cost: 500000, revealTime: 2700, mult: 'global', val: 2 },
  { id: 'blur3', cost: 2500000, revealTime: 3600, mult: 'global', val: 2 },
];

// === STATE ===
let state;
function reset() {
  state = {
    patience: 0, maxP: 0, queue: QUEUE_START, queuePass: 1,
    queueProgress: 0, queueSpeedMult: QUEUE_SPEED_MULT_BASE,
    genMults: { doodle: 1, fidget: 1, auto: 1, speed: 1, robo: 1, shadow: 1 },
    globalMult: 1, combo: 1, comboMax: 4, comboLocked: false,
    activeTime: 0, clicks: 0, bought: new Set(),
    dustStarted: false, dust: 0, dustPerSec: 0,
  };
  GENERATORS.forEach(g => { g.owned = 0; });
}

// === PPS CALCULATION (with cascade cap 2.5x) ===
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
      const mult = (state.genMults[g.id] || 1) * state.globalMult;
      total += g.baseProduction * g.owned * mult * boost[g.id];
    }
  });
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
  if (state.queuePass === 2) cost = Math.floor(cost * SECOND_PASS_MULT);
  return cost;
}

// === SIMULATION ===
function simulate() {
  reset();
  const DT = 0.1;
  const MAX_TIME = 7200; // 2 hours max
  let clickAccum = 0;
  let lastLog = 0;

  // Realistic click rate: high early, drops off mid-late game
  function getClickRate(activeTime) {
    const min = activeTime / 60;
    if (min < 15) return 2.0;    // Stage 1: active clicking
    if (min < 30) return 0.8;    // Stage 2: occasional
    if (min < 45) return 0.3;    // Stage 2 late: rare
    return 0.1;                   // Stage 3: maintenance only
  }

  console.log(`\n=== SIMULATE: growth=${GROWTH} base=${BASE_COST} pass2mult=${SECOND_PASS_MULT} clickBurst=${CLICK_BURST} ===\n`);

  while (state.activeTime < MAX_TIME) {
    state.activeTime += DT;

    // --- PPS ---
    const pps = calcPPS();
    const earned = pps * state.combo * DT;
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
      state.queueProgress += CLICK_BURST;
      if (state.combo < state.comboMax) state.combo = Math.min(state.comboMax, state.combo + 0.3);
    }

    // --- Combo decay (simplified: no decay if locked) ---
    if (!state.comboLocked && state.combo > 1) {
      state.combo = Math.max(1, state.combo - 0.1 * DT);
    }

    // --- Auto-queue ---
    state.queueProgress += pps * state.queueSpeedMult * DT;
    const qCost = getQueueCost(state.queue);
    if (state.queueProgress >= qCost && state.queue > 0) {
      state.queueProgress -= qCost;
      state.queue--;

      if (state.queue <= 0) {
        if (state.queuePass === 1) {
          state.queuePass = 2;
          state.queue = 75;
          state.queueProgress = 0;
          const min = (state.activeTime / 60).toFixed(1);
          console.log(`  [${min}m] *** DEPARTMENT TRANSFER *** pps:${pps.toFixed(0)}`);
        } else {
          const min = (state.activeTime / 60).toFixed(1);
          console.log(`  [${min}m] *** PHASE 1 COMPLETE ***`);
          break;
        }
      }
    }

    // --- Dust ---
    if (state.dustStarted) {
      state.dust += (state.dustPerSec + pps * 0.0001) * DT;
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
        const min = (state.activeTime / 60).toFixed(1);
        console.log(`  [${min}m] UPGRADE: ${u.id} | pps:${calcPPS().toFixed(0)} | q:#${state.queue}`);
      }
    }

    // --- Buy generators (best ratio) ---
    let best = null, bestRatio = 0;
    for (const g of GENERATORS) {
      if (g.unlocksAt && state.maxP < g.unlocksAt) continue;
      const cost = getGenCost(g);
      if (state.patience < cost) continue;
      const mult = (state.genMults[g.id] || 1) * state.globalMult;
      const ratio = (g.baseProduction * mult) / cost;
      if (ratio > bestRatio) { bestRatio = ratio; best = g; }
    }
    if (best) {
      state.patience -= getGenCost(best);
      best.owned++;
    }

    // --- Special: Entropy Noticed at queue 55 ---
    if (!state.dustStarted && state.queue <= 55 && state.maxP >= 30000) {
      state.dustStarted = true;
      state.dustPerSec = 0.2;
      state.patience -= 50000;
    }

    // --- Special: Optimized Routing at queue 38 ---
    if (!state.bought.has('optroute') && state.queue <= 38 && state.patience >= 200000) {
      state.bought.add('optroute');
      state.patience -= 200000;
      state.queueSpeedMult += 0.25;
      const min = (state.activeTime / 60).toFixed(1);
      console.log(`  [${min}m] UPGRADE: Optimized Routing | speedMult:${state.queueSpeedMult}`);
    }

    // --- Special: Muscle Memory at queue 35 ---
    if (!state.bought.has('muscle') && state.queue <= 35 && state.patience >= 300000) {
      state.bought.add('muscle');
      state.patience -= 300000;
      state.comboLocked = true;
    }

    // --- Periodic log ---
    if (state.activeTime - lastLog >= 60) {
      lastLog = state.activeTime;
      const min = (state.activeTime / 60).toFixed(0);
      console.log(`  [${min}m] q:#${state.queue} | pps:${pps.toFixed(0)} | p:${Math.floor(state.patience)} | dust:${state.dust.toFixed(0)} | combo:${state.combo.toFixed(1)} | clicks:${state.clicks} | pass:${state.queuePass}`);
    }
  }

  // Summary
  const min = (state.activeTime / 60).toFixed(1);
  console.log(`\n=== RESULT ===`);
  console.log(`  Time: ${min} min`);
  console.log(`  Queue: #${state.queue} (pass ${state.queuePass})`);
  console.log(`  Completed: ${state.queue <= 0 && state.queuePass === 2 ? 'YES' : 'NO'}`);
  console.log(`  Final PPS: ${calcPPS().toFixed(0)}`);
  console.log(`  Clicks: ${state.clicks}`);
  console.log(`  Dust: ${state.dust.toFixed(0)}`);
  console.log(`  Upgrades: ${state.bought.size}`);
  console.log(`  Growth: ${GROWTH} | Base: ${BASE_COST} | Pass2Mult: ${SECOND_PASS_MULT}`);
  console.log('');
}

simulate();
