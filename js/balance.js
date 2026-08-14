/**
 * PLEASE HOLD - Balance Configuration
 * All tunable numbers in one place. Change balance here, not in game logic files.
 * Referenced as: Balance.GENERATORS, Balance.QUEUE, Balance.DUST, etc.
 */
const Balance = (function() {

  // === GENERATORS ===
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

  // === QUEUE ===
  const QUEUE = {
    startPosition: 200,
    growthRate: 1.06,
    baseCost: 200,
    pass2Mult: 5,
    transferPosition: 150,    // queue resets to this on dept transfer
    revealPosition: 120,      // queue number shown to player at this position
    queueSpeedBase: 1.0,      // base queue speed multiplier
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
    timeCap: 30,                // max time multiplier applied to dust accumulation
    ppsLinkFactor: 0.0001,      // dust bonus = totalPPS * this
    revealThreshold: 200,       // particles before dust shop shows
    // Dust time factor: only activates after Time Blur I AND threshold met
    timeFactorThreshold: 500,   // min dust before factor activates
    timeFactorScale: 8,         // multiplier on log curve
    timeFactorMax: 50000,       // hard cap on dust time factor
  };

  // Dust collector definitions (all dust-removal themed, no WtL/flat dust effects)
  const DUST_COLLECTORS = [
    { id: 'ds_cloth',     name: 'Microfiber Cloth',          cost: 300,       desc: '+10% patience/sec' },
    { id: 'ds_feather',   name: 'Feather Duster',            cost: 800,       desc: '+15% queue speed' },
    { id: 'ds_filter',    name: 'Air Filter',                cost: 2000,      desc: '+25% patience/sec' },
    { id: 'ds_aircan',    name: 'Compressed Air Can',        cost: 5000,      desc: 'Dust income x1.5' },
    { id: 'ds_dustpan',   name: 'Dustpan & Brush',           cost: 8000,      desc: 'Queue cost -15%' },
    { id: 'ds_handvac',   name: 'Hand Vacuum',               cost: 15000,     desc: '+50% patience/sec' },
    { id: 'ds_hepa',      name: 'HEPA Filter',               cost: 25000,     desc: 'Dust income x2' },
    { id: 'ds_static',    name: 'Static Collector',          cost: 40000,     desc: 'ALL production x2' },
    { id: 'ds_shopvac',   name: 'Shop Vac',                  cost: 60000,     desc: 'Queue cost -30%, +25% queue speed' },
    { id: 'ds_cleanroom', name: 'Clean Room Protocol',       cost: 100000,    desc: 'ALL production x3, +1 combo cap' },
    { id: 'ds_singular',  name: 'Dust Singularity',          cost: 150000,    desc: 'ALL production x3' },
    { id: 'ds_entropy',   name: 'Entropy Harvester',         cost: 300000,    desc: 'ALL production x3, dust income x2' },
    { id: 'ds_pressure',  name: 'Negative Pressure Chamber', cost: 600000,    desc: 'ALL production x4, +50% queue speed' },
    { id: 'ds_void',      name: 'Void Condenser',            cost: 1200000,   desc: 'ALL production x5' },
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
    scaleFactor: 0.05,      // click value = base + pps * this (5% of 1 second)
    burstAmount: 50,        // queue progress per click (after Hold Pressure)
  };

  // === WILL TO LIVE ===
  const WTL = {
    baseMax: 15,              // WtL max stays at 15 forever
    baseDrainStart: 300,      // active seconds before drain begins (5 min)
    baseDrainRate: 0.15,      // multiplier on log2 curve
    maxDrainRate: 4.0,        // cap on total drain/sec (raised from 1.5)
    ppsDrainFactor: 0.003,    // ppsDrain = sqrt(pps) * this
    ppsDrainReduction: 0.75,  // Emotional Callus reduces pps drain by this much
    refillAmount: 12,         // Deep Breath restores this much WtL
    refillMinCost: 5,         // minimum Deep Breath cost
    refillPpsMult: 2,         // Deep Breath cost = max(min, pps * this)
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
    CLICK, WTL, HANGUP, PHONE, IDLE, UI_CONFIG
  };
})();
