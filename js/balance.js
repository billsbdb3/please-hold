/**
 * PLEASE HOLD - Balance Constants (v6 Final Architecture)
 * 
 * ALL tunable numbers live here. Zero logic.
 * Other modules reference these via Balance.SECTION.value
 */
const Balance = Object.freeze({

  // === GENERATORS ===
  GENERATORS: Object.freeze({
    doodle:      { baseCost: 15,     growthRate: 1.15, baseProduction: 0.2,   softCapAt: 30, unlocksAt: 0,      boostPercent: 0 },
    fidget:      { baseCost: 100,    growthRate: 1.14, baseProduction: 1.0,   softCapAt: 25, unlocksAt: 80,     boostPercent: 0.004 },
    autodialer:  { baseCost: 800,    growthRate: 1.13, baseProduction: 5.0,   softCapAt: 22, unlocksAt: 600,    boostPercent: 0.008 },
    speeddialer: { baseCost: 6000,   growthRate: 1.12, baseProduction: 25.0,  softCapAt: 18, unlocksAt: 5000,   boostPercent: 0.012 },
    robocaller:  { baseCost: 50000,  growthRate: 1.11, baseProduction: 120.0, softCapAt: 15, unlocksAt: 40000,  boostPercent: 0.016 },
    callcenter:  { baseCost: 500000, growthRate: 1.10, baseProduction: 600.0, softCapAt: 12, unlocksAt: 350000, boostPercent: 0.02 },
  }),
  SOFT_CAP_EXPONENT: 4,
  MILESTONE_INTERVAL: 25,     // x2 every 25 owned (automatic, free)
  CASCADE_CAP: 2.5,           // max boost from higher-tier cascade

  // === QUEUE ===
  QUEUE: Object.freeze({
    startPosition: 200,
    growthRate: 1.06,
    baseCost: 200,
    pass2Mult: 5,             // second pass costs multiplied by this
    transferPosition: 150,    // queue resets here on department transfer
    revealPosition: 120,      // queue number revealed to player
  }),

  // === DUST (threat system) ===
  DUST: Object.freeze({
    // Dust accumulation: sqrt(maxPatience) × scaleFactor × (collectorAcceleration ^ collectorsOwned)
    scaleFactor: 0.01,
    collectorAcceleration: 1.3,   // each collector makes dust accumulate faster (threat grows)
    // Dust reduction: collectors actively remove dust
    reductionBase: 5,             // each collector removes this much dust/sec base
    reductionScaling: 0.15,       // bonus per collector: reduction × (1 + owned × this)
    // Degradation
    baseThreshold: 1000,
    thresholdPerCollector: 1000,
    maxDegradation: 0.70,
    // Visual overlay
    overlayMax: 0.45,
    overlayDivisor: 3000,
  }),

  // === DUST COLLECTORS (14 total, all protect against degradation) ===
  COLLECTORS: Object.freeze([
    { id: 'dc_cloth',     name: 'Microfiber Cloth',          cost: 200,      desc: 'Wipe down the desk' },
    { id: 'dc_feather',   name: 'Feather Duster',            cost: 600,      desc: 'Brush the cobwebs forming' },
    { id: 'dc_aircan',    name: 'Compressed Air Can',        cost: 1500,     desc: 'Blast the vents clear' },
    { id: 'dc_dustpan',   name: 'Dustpan & Brush',           cost: 4000,     desc: 'Sweep the floor around you' },
    { id: 'dc_filter',    name: 'Air Filter',                cost: 8000,     desc: 'The air itself is thick' },
    { id: 'dc_handvac',   name: 'Hand Vacuum',               cost: 15000,    desc: 'It growls at the dust' },
    { id: 'dc_hepa',      name: 'HEPA Filter',               cost: 30000,    desc: 'Medical grade. Necessary.' },
    { id: 'dc_shopvac',   name: 'Shop Vac',                  cost: 60000,    desc: 'Industrial. Loud. Effective.' },
    { id: 'dc_purifier',  name: 'Air Purifier',              cost: 120000,   desc: 'Runs 24/7. Barely keeps up.' },
    { id: 'dc_cleanroom', name: 'Clean Room Protocol',       cost: 250000,   desc: 'Sealed environment. Still leaks.' },
    { id: 'dc_scrubber',  name: 'Electrostatic Scrubber',    cost: 400000,   desc: 'Charges the air. Dust clings to walls.' },
    { id: 'dc_negative',  name: 'Negative Pressure Chamber', cost: 800000,   desc: 'Nothing should survive in here.' },
    { id: 'dc_singular',  name: 'Dust Singularity',          cost: 1500000,  desc: 'A small vortex. Concerning but effective.' },
    { id: 'dc_void',      name: 'Void Condenser',            cost: 3000000,  desc: 'The dust ceases to exist. For now.' },
  ]),

  // === CLICK / COMBO ===
  CLICK: Object.freeze({
    cooldown: 110,            // ms between clicks
    baseValue: 1,             // base patience per click
    ppsScale: 0.05,           // click value += pps × this
    queuePushScale: 0.10,     // queue push per click = effectivePPS × this
    wtlCost: 0.5,             // WtL lost per click (out of 100)
    comboMaxBase: 4,          // base combo cap
    comboGain: 0.3,           // combo added per click
    comboDecay: 0.2,          // combo lost per second (base)
    comboDecayDelay: 600,     // ms after last click before decay starts
    comboDecaySlowMult: 0.5,  // Muscle Memory multiplier on decay rate
  }),

  // === CONNECTION OPPORTUNITY EVENTS ===
  CONNECTION: Object.freeze({
    minInterval: 180,         // seconds between events (3 min)
    maxInterval: 300,         // seconds (5 min)
    windowDuration: 5,        // seconds player has to click
    buffMultiplier: 3,        // production × this during buff
    buffDuration: 10,         // seconds buff lasts
  }),

  // === WILL TO LIVE ===
  WTL: Object.freeze({
    max: 100,
    passiveRegen: 0.05,       // per second, always on
    drainStart: 300,          // active seconds before drain begins (5 min)
    baseDrain: 0.5,           // drain/sec base after drainStart
    positionDrainMax: 0.3,    // additional drain at queue #0 (linear with progress)
    drainReductionChair: 0.25,  // Comfortable Chair reduction
    drainReductionCallus: 0.50, // Emotional Callus reduction (stacks multiplicatively)
    hangupCountdown: 10,      // seconds at <10% before forced hangup
    refillAmount: 40,         // Deep Breath restores this
    refillMinCost: 10,        // minimum cost
    refillPpsMult: 2,         // cost = max(min, effectivePPS × this)
    // Thresholds (percentage of max)
    thresholds: Object.freeze({
      calm:          { min: 75, queueMult: 1.0,  clickMult: 1.0, genMult: 1.0 },
      frustrated:    { min: 50, queueMult: 0.9,  clickMult: 1.0, genMult: 1.0 },
      furious:       { min: 25, queueMult: 0.75, clickMult: 1.5, genMult: 1.0 },
      breakingPoint: { min: 10, queueMult: 0.5,  clickMult: 1.5, genMult: 1.25 },
      hangingUp:     { min: 0,  queueMult: 0.0,  clickMult: 2.0, genMult: 1.5 },
    }),
  }),

  // === HANGUP PENALTY ===
  HANGUP: Object.freeze({
    penaltyPercent: 0.20,
    minPenalty: 3,
  }),

  // === PHONE TIERS (Phase 1 caps at Cordless) ===
  PHONE: Object.freeze([
    { id: 'phone_tincan',   name: 'Tin Can & String', emoji: '🥫', queueGate: 999, prodBonus: 0,    queueBonus: 0 },
    { id: 'phone_rotary',   name: 'Rotary Phone',    emoji: '☎️',  queueGate: 180, prodBonus: 0.05, queueBonus: 0 },
    { id: 'phone_wall',     name: 'Wall Phone',      emoji: '📞', queueGate: 150, prodBonus: 0.10, queueBonus: 0.05 },
    { id: 'phone_cordless', name: 'Cordless Phone',  emoji: '📱', queueGate: 100, prodBonus: 0.15, queueBonus: 0.10 },
  ]),

  // === TIME DISPLAY ===
  TIME: Object.freeze({
    nineYears: 86400 * 365 * 9,
    tenYears: 86400 * 365 * 10,
  }),

  // === IDLE / OFFLINE ===
  IDLE: Object.freeze({
    threshold: 180000,        // ms without interaction = idle
    welcomeBackMinDuration: 60,
    welcomeBackRate: 0.25,
    welcomeBackMaxHours: 24,
  }),

  // === UI ===
  UI: Object.freeze({
    flavorInterval: 12000,    // ms between flavor text changes
  }),

  // === LOGGING ===
  LOG: Object.freeze({
    periodicInterval: 60,     // seconds between comprehensive logs
  }),
});
