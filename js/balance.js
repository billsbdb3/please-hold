/**
 * PLEASE HOLD - Balance Configuration
 * All tunable numbers in one place. Change balance here, not in game logic files.
 * Referenced as: Balance.GENERATORS, Balance.QUEUE, Balance.DUST, etc.
 */
const Balance = (function() {

  // === GENERATORS ===
  const GENERATORS = {
    doodle:      { baseCost: 15,     growthRate: 1.18, baseProduction: 0.1,   softCapAt: 25, unlocksAt: 0,      boostPercent: 0 },
    fidget:      { baseCost: 100,    growthRate: 1.17, baseProduction: 0.35,  softCapAt: 25, unlocksAt: 50,     boostPercent: 0.003 },
    autodialer:  { baseCost: 600,    growthRate: 1.16, baseProduction: 2.0,   softCapAt: 22, unlocksAt: 400,    boostPercent: 0.008 },
    speeddialer: { baseCost: 5000,   growthRate: 1.15, baseProduction: 10.0,  softCapAt: 20, unlocksAt: 4000,   boostPercent: 0.015 },
    robocaller:  { baseCost: 40000,  growthRate: 1.14, baseProduction: 50.0,  softCapAt: 15, unlocksAt: 30000,  boostPercent: 0.02 },
    callcenter:  { baseCost: 350000, growthRate: 1.13, baseProduction: 300.0, softCapAt: 12, unlocksAt: 250000, boostPercent: 0.03 },
  };

  // Soft cap: post-cap growth = growthRate^SOFT_CAP_EXPONENT
  const SOFT_CAP_EXPONENT = 8;

  // === QUEUE ===
  const QUEUE = {
    startPosition: 150,
    baseCost: 30,
    growthRate: 1.095,
    lateThreshold: 120,       // advances after which late multiplier kicks in
    lateExponent: 1.8,        // depth^exponent
    lateDivisor: 12,          // divisor for late multiplier: 1 + depth^exp / divisor
    advanceLockTime: 300,     // seconds of active play before advance unlocks
    familiarityPerAdvance: 0.02,
    familiarityMax: 0.25,
    familiarityDecayRate: 0.03,
    familiarityTimeout: 15000, // ms before decay starts
    transferResetRatio: 0.4,   // queueAdvances *= this on department transfer
    transferQueuePosition: 75, // queue resets to this on transfer
  };

  // === TIME ===
  const TIME = {
    nineYears: 86400 * 365 * 9,
    tenYears: 86400 * 365 * 10,
    timeBlurI_mult: 10,
    timeBlurII_mult: 10,
    timeBlurIII_mult: 12,
    timeBlurI_activeTime: 1800,   // 30 min
    timeBlurII_activeTime: 2700,  // 45 min
    timeBlurIII_activeTime: 3600, // 60 min
    timeBlurI_cost: 200000,
    timeBlurII_cost: 600000,
    timeBlurIII_cost: 2500000,
    comboCapAfterBlurI: 5,
    comboCapAfterBlurII: 6,
    comboCapAfterBlurIII: 8,
  };

  // === DUST ===
  const DUST = {
    baseRate: 0.2,              // dustPerSec when Entropy Noticed bought
    timeCap: 30,                // max time multiplier applied to dust accumulation
    ppsLinkFactor: 0.0001,      // dust bonus = totalPPS * this
    revealThreshold: 200,       // particles before dust shop shows
    // Dust time factor: only activates after Time Blur I AND threshold met
    timeFactorThreshold: 500,   // min dust before factor activates
    timeFactorScale: 8,         // multiplier on log curve
    timeFactorMax: 50000,       // hard cap on dust time factor
  };

  // Dust collector definitions
  const DUST_COLLECTORS = [
    { id: 'ds_cloth',       name: 'Microfiber Cloth',      desc: '+10% patience/sec',              cost: 300 },
    { id: 'ds_mask',        name: 'Dust Mask',             desc: '+0.3 WtL regen/sec',             cost: 800 },
    { id: 'ds_filter',      name: 'Air Filter',            desc: '+25% patience/sec',              cost: 2000 },
    { id: 'ds_broom',       name: 'Industrial Broom',      desc: '+0.5 dust/sec base rate',        cost: 4000 },
    { id: 'ds_map',         name: 'Phone Tree Map',        desc: 'Queue advances cost 15% less',   cost: 7000 },
    { id: 'ds_vacuum',      name: 'Robotic Vacuum',        desc: '+50% patience/sec, +0.5 WtL',    cost: 12000 },
    { id: 'ds_hepa',        name: 'HEPA System',           desc: '+1 dust/sec, +5 max WtL',        cost: 20000 },
    { id: 'ds_static',      name: 'Static Collector',      desc: '+100% patience/sec (x2)',        cost: 32000 },
    { id: 'ds_directline',  name: 'Executive Direct Line', desc: 'Queue advances cost 30% less',   cost: 50000 },
    { id: 'ds_industrial',  name: 'Industrial Extraction', desc: '+3 dust/sec, +1 WtL regen',      cost: 75000 },
    { id: 'ds_singularity', name: 'Dust Singularity',      desc: 'ALL production x3',              cost: 120000 },
    { id: 'ds_entropy',     name: 'Entropy Harvester',     desc: '+5 dust/sec, ALL production x2', cost: 250000 },
    { id: 'ds_temporal',    name: 'Temporal Accumulator',   desc: '+10 dust/sec, +2 WtL regen',    cost: 500000 },
    { id: 'ds_void',        name: 'Void Condenser',        desc: 'ALL production x5',              cost: 1000000 },
  ];

  // === CLICK / COMBO ===
  const CLICK = {
    cooldown: 110,          // ms between clicks
    basePatiencePerClick: 1,
    baseWtlPerClick: 1,
    comboMax: 4,            // base combo cap (before Time Blurs)
    comboUp: 0.3,           // combo gain per click
    comboDecay: 0.4,        // combo decay per second
    comboDecayDelay: 600,   // ms after last click before decay starts
  };

  // === WILL TO LIVE ===
  const WTL = {
    baseMax: 15,
    baseDrainStart: 300,      // active seconds before drain begins (5 min)
    baseDrainRate: 0.15,      // multiplier on log2 curve
    lateDrainStart: 1800,     // active seconds (30 min) before late drain
    lateDrainRate: 0.02,      // per minute after lateDrainStart
    maxDrainRate: 1.5,        // cap on total drain/sec
    baseRefillCost: 5,
    baseRefillAmount: 12,
  };

  // === IDLE / OFFLINE ===
  const IDLE = {
    threshold: 180000,         // ms without interaction = idle (3 min)
    welcomeBackMinDuration: 60, // seconds idle before welcome back triggers
    welcomeBackRate: 0.25,     // 25% of production awarded
    welcomeBackMaxHours: 24,   // cap on offline duration
  };

  // === UI ===
  const UI_CONFIG = {
    flavorInterval: 12000,     // ms between flavor text changes
    dustOverlayMax: 0.35,      // max opacity of dust overlay
    dustOverlayDivisor: 5000,  // dust / this = opacity (before max)
  };

  return {
    GENERATORS, SOFT_CAP_EXPONENT,
    QUEUE, TIME, DUST, DUST_COLLECTORS,
    CLICK, WTL, IDLE, UI_CONFIG
  };
})();
