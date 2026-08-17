#!/usr/bin/env node
/**
 * PLEASE HOLD - Phase 1 Balance Simulator v7
 * 
 * Validates the comprehensive rebalance:
 * - Staggered milestones (rotating dominance)
 * - Dust as exchange rate (PPS × dustFactor, capped at threshold×1.5)
 * - 20 upgrades spread across 60-90 min
 * - Collector costs exponential (200 × 3^n)
 * - Target: 60-90 minutes for regular player
 */

// === GENERATORS (staggered milestones) ===
const GENS = [
  { id: 'd', baseCost: 15, growth: 1.15, prod: 0.2, softCap: 30, unlocks: 0, milestones: [10, 25, 50, 100] },
  { id: 'f', baseCost: 100, growth: 1.14, prod: 1.0, softCap: 25, unlocks: 80, milestones: [15, 35, 70] },
  { id: 'a', baseCost: 800, growth: 1.13, prod: 5.0, softCap: 22, unlocks: 600, milestones: [12, 30, 60] },
  { id: 's', baseCost: 6000, growth: 1.12, prod: 25.0, softCap: 18, unlocks: 5000, milestones: [10, 25, 50] },
  { id: 'r', baseCost: 50000, growth: 1.11, prod: 120.0, softCap: 15, unlocks: 40000, milestones: [8, 20, 40] },
  { id: 'c', baseCost: 500000, growth: 1.10, prod: 600.0, softCap: 12, unlocks: 350000, milestones: [5, 15, 30] },
];

// === DUST ===
const DUST_FACTOR = 0.001; // dust/sec = effectivePPS × this
const DUST_BASE_THRESHOLD = 1000;
const DUST_THRESHOLD_PER_COLLECTOR = 3000;
const DUST_MAX_DEGRADE = 0.70;
const NUM_COLLECTORS = 14;
// Collector costs: 200 × 1.8^n
const COLLECTOR_COSTS = [];
for (let i = 0; i < NUM_COLLECTORS; i++) COLLECTOR_COSTS.push(Math.floor(200 * Math.pow(1.8, i)));

// === QUEUE ===
const QUEUE_START = 200;
const QUEUE_GROWTH = 1.06;
const QUEUE_BASE_COST = 200;
const QUEUE_PASS2_MULT = 5;
const QUEUE_TRANSFER = 150;

// === UPGRADES (20 total, spread across game) ===
const UPGRADES = [
  // Time-gated globals
  { id: 'blur1', cost: 100000, revealTime: 1800, mult: 'global', val: 2 },
  { id: 'blur2', cost: 500000, revealTime: 2700, mult: 'global', val: 2 },
  { id: 'blur3', cost: 2500000, revealTime: 3600, mult: 'global', val: 2 },
  // Queue-gated targeted
  { id: 'robo2x', cost: 150000, revealQ: 110, mult: 'r', val: 2 },
  { id: 'allprod25', cost: 250000, revealQ: 90, mult: 'global', val: 1.25 },
  { id: 'qspeed15', cost: 200000, revealQ: 100, mult: 'qspeed', val: 0.15 },
  { id: 'shadow2x', cost: 800000, revealQ: 70, mult: 'c', val: 2 },
  { id: 'allprod50', cost: 2000000, revealQ: 40, mult: 'global', val: 1.5 },
  { id: 'qspeed25', cost: 3000000, revealQ: 20, mult: 'qspeed', val: 0.25 },
];

// === STATE ===
let s;
function reset() {
  s = {
    patience: 0, maxP: 0, queue: QUEUE_START, queuePass: 1,
    queueProgress: 0, queueSpeed: 1.0,
    gens: GENS.map(g => ({ ...g, owned: 0 })),
    genMults: { d: 1, f: 1, a: 1, s: 1, r: 1, c: 1 },
    globalMult: 1, combo: 1, comboMax: 4,
    activeTime: 0, clicks: 0, bought: new Set(),
    dustStarted: false, dust: 0, collectorsOwned: 0,
    phoneTier: 0, phoneProd: 0, phoneQueue: 0,
  };
}

// === MILESTONES ===
function getMilestoneMult(gen) {
  let mult = 1;
  for (const threshold of gen.milestones) {
    if (gen.owned >= threshold) mult *= 2;
  }
  return mult;
}

// === PPS ===
function calcPPS() {
  let total = 0;
  for (const g of s.gens) {
    if (g.owned <= 0) continue;
    const mult = s.genMults[g.id] * s.globalMult * getMilestoneMult(g);
    total += g.prod * g.owned * mult;
  }
  total *= (1 + s.phoneProd);
  // Dust degradation
  const threshold = DUST_BASE_THRESHOLD + s.collectorsOwned * DUST_THRESHOLD_PER_COLLECTOR;
  const degrade = s.dust > 0 ? Math.min(DUST_MAX_DEGRADE, s.dust / (s.dust + threshold)) : 0;
  total *= (1 - degrade);
  return total;
}

// === COSTS ===
function getGenCost(g) {
  if (g.owned >= g.softCap) {
    const base = g.baseCost * Math.pow(g.growth, g.softCap);
    return Math.floor(base * Math.pow(Math.pow(g.growth, 4), g.owned - g.softCap));
  }
  return Math.floor(g.baseCost * Math.pow(g.growth, g.owned));
}

function getQueueCost() {
  let cost = Math.floor(QUEUE_BASE_COST * Math.pow(QUEUE_GROWTH, QUEUE_START - s.queue));
  if (s.queuePass === 2) cost *= QUEUE_PASS2_MULT;
  return cost;
}

// === SIMULATE ===
function simulate() {
  reset();
  const DT = 0.1;
  const MAX_TIME = 7200;
  let clickAccum = 0, lastLog = 0;
  let lastMilestones = {};
  const PHONE = [
    { gate: 180, prod: 0.05, queue: 0 },
    { gate: 150, prod: 0.10, queue: 0.05 },
    { gate: 100, prod: 0.15, queue: 0.10 },
  ];

  function getClickRate(t) {
    const min = t / 60;
    if (min < 15) return 2.0;
    if (min < 30) return 1.0;
    if (min < 45) return 0.5;
    return 0.3;
  }

  console.log('\n=== PLEASE HOLD v7 SIM ===\n');

  while (s.activeTime < MAX_TIME) {
    s.activeTime += DT;
    const pps = calcPPS();

    // Production
    const earned = pps * s.combo * DT;
    s.patience += earned;
    s.maxP += earned;

    // Clicking
    clickAccum += getClickRate(s.activeTime) * DT;
    const clicks = Math.floor(clickAccum);
    clickAccum -= clicks;
    for (let i = 0; i < clicks; i++) {
      s.patience += 1 + pps * 0.05;
      s.maxP += 1 + pps * 0.05;
      s.clicks++;
      s.queueProgress += pps * 0.1; // Hold Pressure
      if (s.combo < s.comboMax) s.combo = Math.min(s.comboMax, s.combo + 0.3);
    }

    // Combo decay
    if (s.combo > 1) s.combo = Math.max(1, s.combo - 0.2 * DT);

    // Dust (exchange rate model: proportional to PPS, NO CAP)
    if (s.dustStarted) {
      s.dust += pps * DUST_FACTOR * DT;
    }

    // Queue
    const effectiveSpeed = s.queueSpeed + s.phoneQueue;
    s.queueProgress += pps * effectiveSpeed * DT;
    const qCost = getQueueCost();
    if (s.queueProgress >= qCost && s.queue > 0) {
      s.queueProgress -= qCost;
      s.queue--;

      // Phone
      for (const p of PHONE) {
        if (s.queue <= p.gate && s.phoneProd < p.prod) {
          s.phoneProd = p.prod; s.phoneQueue = p.queue;
        }
      }

      if (s.queue <= 0) {
        if (s.queuePass === 1) {
          s.queuePass = 2; s.queue = QUEUE_TRANSFER; s.queueProgress = 0;
          console.log(`  [${(s.activeTime/60).toFixed(1)}m] *** DEPARTMENT TRANSFER *** pps:${pps.toFixed(0)}`);
        } else {
          // Check completion
          if (s.collectorsOwned >= NUM_COLLECTORS && s.bought.size >= UPGRADES.length + 3) {
            console.log(`  [${(s.activeTime/60).toFixed(1)}m] *** PHASE 1 COMPLETE ***`);
            break;
          }
          // Not complete — stall at queue 0
          s.queue = 0;
        }
      }
    }

    // Dust start at queue 120
    if (!s.dustStarted && s.queue <= 120 && s.maxP >= 50000) {
      s.dustStarted = true;
      s.bought.add('entropy');
      console.log(`  [${(s.activeTime/60).toFixed(1)}m] DUST STARTS | pps:${pps.toFixed(0)}`);
    }

    // Buy collectors
    if (s.dustStarted && s.collectorsOwned < NUM_COLLECTORS) {
      const cost = COLLECTOR_COSTS[s.collectorsOwned];
      if (s.dust >= cost) {
        s.dust -= cost;
        s.collectorsOwned++;
        console.log(`  [${(s.activeTime/60).toFixed(1)}m] COLLECTOR ${s.collectorsOwned}/14 | cost:${cost} | dust:${s.dust.toFixed(0)} | degrade:${(calcPPS() < pps ? ((1-calcPPS()/pps)*100).toFixed(0) : 0)}%`);
      }
    }

    // Buy upgrades
    for (const u of UPGRADES) {
      if (s.bought.has(u.id)) continue;
      if (u.revealQ && s.queue > u.revealQ) continue;
      if (u.revealTime && s.activeTime < u.revealTime) continue;
      if (s.patience >= u.cost) {
        s.patience -= u.cost;
        s.bought.add(u.id);
        if (u.mult === 'global') s.globalMult *= u.val;
        else if (u.mult === 'qspeed') s.queueSpeed += u.val;
        else if (s.genMults[u.mult] !== undefined) s.genMults[u.mult] *= u.val;
        if (u.id === 'blur1') s.comboMax = 5;
        if (u.id === 'blur2') s.comboMax = 6;
        if (u.id === 'blur3') s.comboMax = 8;
        console.log(`  [${(s.activeTime/60).toFixed(1)}m] UPGRADE: ${u.id} | pps:${calcPPS().toFixed(0)} | q:#${s.queue}`);
      }
    }

    // Buy generators
    let bought = true;
    while (bought) {
      bought = false;
      let best = null, bestRatio = 0;
      for (const g of s.gens) {
        if (s.maxP < g.unlocks) continue;
        const cost = getGenCost(g);
        if (s.patience < cost) continue;
        const mult = s.genMults[g.id] * s.globalMult * getMilestoneMult(g);
        const ratio = (g.prod * mult) / cost;
        if (ratio > bestRatio) { bestRatio = ratio; best = g; }
      }
      if (best) {
        const prevMult = getMilestoneMult(best);
        s.patience -= getGenCost(best);
        best.owned++;
        bought = true;
        const newMult = getMilestoneMult(best);
        if (newMult > prevMult && !lastMilestones[best.id + newMult]) {
          lastMilestones[best.id + newMult] = true;
          console.log(`  [${(s.activeTime/60).toFixed(1)}m] MILESTONE: ${best.id} x${newMult} (${best.owned} owned) | pps:${calcPPS().toFixed(0)}`);
        }
      }
    }

    // Periodic log
    if (s.activeTime - lastLog >= 60) {
      lastLog = s.activeTime;
      const ppsNow = calcPPS();
      const threshold = DUST_BASE_THRESHOLD + s.collectorsOwned * DUST_THRESHOLD_PER_COLLECTOR;
      const degrade = s.dust > 0 ? Math.min(DUST_MAX_DEGRADE, s.dust / (s.dust + threshold)) * 100 : 0;
      const genStr = s.gens.map(g => g.id + ':' + g.owned).join(' ');
      console.log(`  [${(s.activeTime/60).toFixed(0)}m] q:#${s.queue} | pps:${ppsNow.toFixed(0)} | dust:${s.dust.toFixed(0)} degrade:${degrade.toFixed(0)}% | collectors:${s.collectorsOwned}/14 | pass:${s.queuePass} | ${genStr}`);
    }
  }

  const min = (s.activeTime / 60).toFixed(1);
  console.log(`\n=== RESULT ===`);
  console.log(`  Time: ${min} min`);
  console.log(`  Completed: ${s.queue <= 0 && s.queuePass === 2 && s.collectorsOwned >= NUM_COLLECTORS ? 'YES' : 'NO'}`);
  console.log(`  PPS: ${calcPPS().toFixed(0)}`);
  console.log(`  Clicks: ${s.clicks}`);
  console.log(`  Collectors: ${s.collectorsOwned}/${NUM_COLLECTORS}`);
  console.log(`  Upgrades: ${s.bought.size}`);
  console.log(`  Queue: #${s.queue} (pass ${s.queuePass})`);
  console.log(`  Gens: ${s.gens.map(g => g.id + ':' + g.owned).join(', ')}`);
}

simulate();
