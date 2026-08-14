/**
 * PLEASE HOLD - Balance Configuration (FINAL v5)
 * All tunable numbers in one place.
 * 
 * Core design:
 * - WtL graduated states (100 max, thresholds at 75/50/25/10)
 * - Combo always decays (never locks)
 * - Milestone multipliers at 25/50/75/100 owned (rotating dominance)
 * - Asymptotic dust collectors (capped at +100%)
 * - Reversed pressure second pass (boss fight)
 * - Connection Opportunity events every 3-5 min
 * - Click value = pps × 0.1 for queue push
 */
const Balance = (function() {

  // === GENERATORS ===
  // Lower growth rates on higher tiers = longer relevance window
  const GENERATORS = {
    doodle:      { baseCost: 15,     growthRate: 1.15, baseProduction: 0.2,   softCapAt: 30, unlocksAt: 0,      boostPercent: 0 },
    fidget:      { baseCost: 100,    growthRate: 1.14, baseProduction: 1.0,   softCapAt: 25, unlocksAt: 80,     boostPercent: 0.004 },
    autodialer:  { baseCost: 800,    growthRate: 1.13, baseProduction: 5.0,   softCapAt: 22, unlocksAt: 600,    boostPercent: 0.008 },
    speeddialer: { baseCost: 6000,   growthRate: 1.12, baseProduction: 25.0,  softCapAt: 18, unlocksAt: 5000,   boostPercent: 0.012 },
    robocaller:  { baseCost: 50000,  growthRate: 1.11, baseProduction: 120.0, softCapAt: 15, unlocksAt: 40000,  boostPercent: 0.016 },
    callcenter:  { baseCost: 500000, growthRate: 1.10, baseProduction: 600.0, softCapAt: 12, unlocksAt: 350000, boostPercent: 0.02 },
  };

  // Soft cap: post-cap growth = growthRate^SOFT_CAP_EXPONENT
  const SOFT_CAP_EXPONENT = 4;

  // Milestone multipliers: x2 at every MILESTONE_INTERVAL purchases (free, automatic)
  const MILESTONE_INTERVAL = 25; // x2 at 25, 50, 75, 100 owned

  // === QUEUE ===
  const QUEUE = {
    startPosition: 200,
    growthRate: 1.06,
    baseCost: 200,
    pass2Mult: 5,             // costs x5 on second pass (only used if not reversed)
    transferPosition: 150,    // queue resets to this on dept transfer (legacy, pass2 is now reversed)
    revealPosition: 120,      // queue number shown to player at this position
    queueSpeedBase: 1.0,
  };

  // === SECOND PASS (Reversed Pressure) ===
  const PASS2 = {
    startPosition: 1,           // you start at #1 (almost there!)
    basePressure: 500,          // incoming callers push you back at this base rate/sec
    pressureGrowth: 0.02,       // pressure increases by this fraction per second
    maxPosition: 50,            // if pushed back to here, penalty
    holdTarget: 10,             // must stay at position <= this
    holdDuration: 60,           // for this many seconds (consecutive)
    holdMinWtl: 25,             // with WtL above this percentage
  };

  // === TIME ===
  const TIME = {
    nineYears: 86400 * 365 * 9,
    tenYears: 86400 * 365 * 10,
    timeBlurI_activeTime: 1800,   // 30 min
    timeBlurII_activeTime: 2700,  // 45 min
    timeBlurIII_activeTime: 3600, // 60 min
    timeBlurI_cost: 100000,
    timeBlurII_cost: 500000,
    timeBlurIII_cost: 2500000,
    comboCapAfterBlurI: 5,
    comboCapAfterBlurII: 6,
    comboCapAfterBlurIII: 8,
  };

  // === DUST ===
  const DUST = {
    baseRate: 0.2,              // dustPerSec when Entropy Noticed bought
    ppsLinkFactor: 0.0001,      // dust bonus = totalPPS * this
    revealThreshold: 200,       // particles before dust shop shows
    // Asymptotic collector model
    collectorCoefficient: 0.1,  // bonus = 1 - e^(-owned * this) → caps at +100%
  };

  // Dust collector definitions (asymptotic primary bonus + unique secondary)
  const DUST_COLLECTORS = [
    { id: 'ds_cloth',     name: 'Microfiber Cloth',          cost: 300,       desc: 'Production bonus + 5% queue speed', secondary: 'queueSpeed', secondaryVal: 0.05 },
    { id: 'ds_feather',   name: 'Feather Duster',            cost: 800,       desc: 'Production bonus + 5% queue speed', secondary: 'queueSpeed', secondaryVal: 0.05 },
    { id: 'ds_filter',    name: 'Air Filter',                cost: 2000,      desc: 'Production bonus + dust income x1.25', secondary: 'dustMult', secondaryVal: 1.25 },
    { id: 'ds_aircan',    name: 'Compressed Air Can',        cost: 5000,      desc: 'Production bonus + dust income x1.5', secondary: 'dustMult', secondaryVal: 1.5 },
    { id: 'ds_dustpan',   name: 'Dustpan & Brush',           cost: 8000,      desc: 'Production bonus + queue cost -10%', secondary: 'queueCost', secondaryVal: 0.9 },
    { id: 'ds_handvac',   name: 'Hand Vacuum',               cost: 15000,     desc: 'Production bonus + 10% queue speed', secondary: 'queueSpeed', secondaryVal: 0.10 },
    { id: 'ds_hepa',      name: 'HEPA Filter',               cost: 25000,     desc: 'Production bonus + dust income x1.5', secondary: 'dustMult', secondaryVal: 1.5 },
    { id: 'ds_static',    name: 'Static Collector',          cost: 40000,     desc: 'Production bonus + queue cost -15%', secondary: 'queueCost', secondaryVal: 0.85 },
    { id: 'ds_shopvac',   name: 'Shop Vac',                  cost: 60000,     desc: 'Production bonus + 15% queue speed', secondary: 'queueSpeed', secondaryVal: 0.15 },
    { id: 'ds_cleanroom', name: 'Clean Room Protocol',       cost: 100000,    desc: 'Production bonus + dust income x2', secondary: 'dustMult', secondaryVal: 2.0 },
    { id: 'ds_singular',  name: 'Dust Singularity',          cost: 150000,    desc: 'Production bonus + queue cost -20%', secondary: 'queueCost', secondaryVal: 0.8 },
    { id: 'ds_entropy',   name: 'Entropy Harvester',         cost: 300000,    desc: 'Production bonus + 20% queue speed', secondary: 'queueSpeed', secondaryVal: 0.20 },
    { id: 'ds_pressure',  name: 'Negative Pressure Chamber', cost: 600000,    desc: 'Production bonus + dust income x2', secondary: 'dustMult', secondaryVal: 2.0 },
    { id: 'ds_void',      name: 'Void Condenser',            cost: 1200000,   desc: 'Production bonus + 25% queue speed', secondary: 'queueSpeed', secondaryVal: 0.25 },
  ];

  // === CLICK / COMBO ===
  const CLICK = {
    cooldown: 110,            // ms between clicks
    baseClickValue: 1,        // base patience per click (before pps scaling)
    clickPpsScale: 0.05,      // click value = base + pps * this (5% of 1 second)
    queuePushScale: 0.10,     // queue progress per click = pps * this (10% of 1 second)
    baseWtlPerClick: 0.5,     // WtL cost per click (out of 100 max now)
    comboMax: 4,              // base combo cap (before Time Blurs)
    comboUp: 0.3,             // combo gain per click
    comboDecay: 0.2,          // combo decay per second (always active)
    comboDecayDelay: 600,     // ms after last click before decay starts
    comboDecaySlowMult: 0.5,  // Muscle Memory: decay *= this (50% slower → 0.1/sec)
  };

  // === CONNECTION OPPORTUNITY EVENTS ===
  const CONNECTION = {
    minInterval: 180000,      // min ms between events (3 min)
    maxInterval: 300000,      // max ms between events (5 min)
    windowDuration: 5000,     // ms player has to click it
    buffMultiplier: 3,        // production multiplied by this during buff
    buffDuration: 10,         // seconds the buff lasts
  };

  // === WILL TO LIVE (graduated states) ===
  const WTL = {
    max: 100,
    passiveRegen: 0.05,         // per second, always on (tiny)
    drainStart: 300,            // active seconds before drain begins (5 min)
    baseDrain: 0.5,             // base drain/sec after drainStart
    positionDrainMax: 0.3,      // additional drain at queue #0 (scales linearly with progress)
    drainReductionCallus: 0.5,  // Emotional Callus reduces total drain by this fraction
    // Deep Breath
    refillAmount: 40,           // restores this much WtL
    refillMinCost: 10,          // minimum patience cost
    refillPpsMult: 2,           // cost = max(min, pps * this)
    // Threshold states (percentages of max)
    thresholds: {
      calm:          { min: 75, queueMult: 1.0,  clickMult: 1.0, genMult: 1.0 },
      frustrated:    { min: 50, queueMult: 0.9,  clickMult: 1.0, genMult: 1.0 },
      furious:       { min: 25, queueMult: 0.75, clickMult: 1.5, genMult: 1.0 },
      breakingPoint: { min: 10, queueMult: 0.5,  clickMult: 1.5, genMult: 1.25 },
      hangingUp:     { min: 0,  queueMult: 0.0,  clickMult: 2.0, genMult: 1.5 },
    },
    hangupCountdown: 10,        // seconds at <10% before forced hangup
  };

  // === HANGUP ===
  const HANGUP = {
    penaltyPercent: 0.20,     // lose 20% of positions cleared
    minPenalty: 3,            // minimum positions lost
  };

  // === PHONE UPGRADES (passive bonus track) ===
  const PHONE = [
    { id: 'phone_tincan',   name: 'Tin Can & String',  emoji: '🥫', queueGate: 999, prodBonus: 0,    queueBonus: 0 },
    { id: 'phone_rotary',   name: 'Rotary Phone',      emoji: '☎️',  queueGate: 180, prodBonus: 0.05, queueBonus: 0 },
    { id: 'phone_wall',     name: 'Wall Phone',        emoji: '📞', queueGate: 150, prodBonus: 0.10, queueBonus: 0 },
    { id: 'phone_cordless', name: 'Cordless Phone',    emoji: '📱', queueGate: 100, prodBonus: 0.15, queueBonus: 0.05 },
    { id: 'phone_smart',    name: 'Smartphone',        emoji: '📲', queueGate: 50,  prodBonus: 0.25, queueBonus: 0.10 },
    { id: 'phone_neural',   name: 'Neural Link',       emoji: '🧠', queueGate: 10,  prodBonus: 0.50, queueBonus: 0.25 },
  ];

  // === IDLE / OFFLINE ===
  const IDLE = {
    threshold: 180000,         // ms without interaction = idle (3 min)
    welcomeBackMinDuration: 60,
    welcomeBackRate: 0.25,
    welcomeBackMaxHours: 24,
  };

  // === UI ===
  const UI_CONFIG = {
    flavorInterval: 12000,
    dustOverlayMax: 0.35,
    dustOverlayDivisor: 5000,
  };

  return {
    GENERATORS, SOFT_CAP_EXPONENT, MILESTONE_INTERVAL,
    QUEUE, PASS2, TIME, DUST, DUST_COLLECTORS,
    CLICK, CONNECTION, WTL, HANGUP, PHONE, IDLE, UI_CONFIG
  };
})();
