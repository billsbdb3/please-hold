/**
 * PLEASE HOLD - Generators (v6)
 * 
 * Handles: generator definitions, cost calculation, milestone multipliers,
 * cascading boost system, and base PPS calculation.
 * 
 * NOTE: Dust degradation is NOT applied here. This module returns "raw" PPS.
 * The main loop applies degradation from Dust.getDegradation() externally.
 * This keeps generator logic pure and testable.
 */
const Generators = (function() {

  // Generator metadata (static definitions)
  const DEFS = [
    { id: 'doodle',      name: 'Doodle Pad',          desc: 'Doodle to pass the time' },
    { id: 'fidget',      name: 'Fidget Spinner',      desc: 'Idle hands, idle minds' },
    { id: 'autodialer',  name: 'Autodialer',          desc: 'It redials for you. Endlessly.' },
    { id: 'speeddialer', name: 'Speed Dialer',        desc: 'Faster. Angrier. More persistent.' },
    { id: 'robocaller',  name: 'Robo-Caller',         desc: 'An army of robotic patience.' },
    { id: 'callcenter',  name: 'Shadow Call Center',  desc: 'They hold for you. All of them.' },
  ];

  /** Get the list of generator definitions */
  function getDefs() {
    return DEFS;
  }

  /** Get balance config for a generator by ID */
  function getConfig(id) {
    return Balance.GENERATORS[id];
  }

  /** Calculate purchase cost for the next unit of a generator */
  function getCost(id) {
    const s = State.get();
    const cfg = Balance.GENERATORS[id];
    const owned = s.generators[id].owned;

    if (owned >= cfg.softCapAt) {
      const base = cfg.baseCost * Math.pow(cfg.growthRate, cfg.softCapAt);
      const excess = owned - cfg.softCapAt;
      const postCapGrowth = Math.pow(cfg.growthRate, Balance.SOFT_CAP_EXPONENT);
      return Math.floor(base * Math.pow(postCapGrowth, excess));
    }
    return Math.floor(cfg.baseCost * Math.pow(cfg.growthRate, owned));
  }

  /** Get milestone multiplier for a generator (x2 per threshold in staggered array) */
  function getMilestoneMult(id) {
    const owned = State.get().generators[id].owned;
    const thresholds = Balance.MILESTONES[id] || [];
    let mult = 1;
    for (let i = 0; i < thresholds.length; i++) {
      if (owned >= thresholds[i]) mult *= 2;
    }
    return mult;
  }

  /** 
   * Get cascade boost for a specific generator.
   * Higher-tier generators boost all lower tiers. Capped at CASCADE_CAP.
   */
  function getCascadeBoost(targetId) {
    const s = State.get();
    const targetIdx = DEFS.findIndex(d => d.id === targetId);
    if (targetIdx < 0) return 1;

    let boost = 1;
    for (let i = targetIdx + 1; i < DEFS.length; i++) {
      const cfg = Balance.GENERATORS[DEFS[i].id];
      const owned = s.generators[DEFS[i].id].owned;
      if (owned > 0 && cfg.boostPercent > 0) {
        boost += owned * cfg.boostPercent;
      }
    }
    return Math.min(Balance.CASCADE_CAP, boost);
  }

  /**
   * Calculate base PPS (before dust degradation, phone bonus, connection buff).
   * Includes: generator production × owned × upgradeMult × milestoneMult × cascade × globalMult
   */
  function getBasePPS() {
    const s = State.get();
    let total = 0;

    DEFS.forEach(def => {
      const owned = s.generators[def.id].owned;
      if (owned <= 0) return;

      const cfg = Balance.GENERATORS[def.id];
      const upgradeMult = s.genMultipliers[def.id] || 1;
      const milestoneMult = getMilestoneMult(def.id);
      const cascade = getCascadeBoost(def.id);
      const globalMult = s.globalGenMultiplier || 1;

      total += cfg.baseProduction * owned * upgradeMult * milestoneMult * cascade * globalMult;
    });

    return total;
  }

  /**
   * Get production per second for a single unit of a generator (for display).
   * Shows what each unit produces at current multipliers.
   */
  function getPerUnitPPS(id) {
    const s = State.get();
    const cfg = Balance.GENERATORS[id];
    const upgradeMult = s.genMultipliers[id] || 1;
    const milestoneMult = getMilestoneMult(id);
    const cascade = getCascadeBoost(id);
    const globalMult = s.globalGenMultiplier || 1;
    return cfg.baseProduction * upgradeMult * milestoneMult * cascade * globalMult;
  }

  /** 
   * Buy a generator. Returns true if purchased.
   * Does NOT handle UI or logging — caller does that.
   */
  function buy(id) {
    const s = State.get();
    const cost = getCost(id);
    if (s.patience < cost) return false;

    s.patience -= cost;
    s.generators[id].owned++;
    return true;
  }

  /**
   * Check if any generator should be unlocked based on maxPatience.
   * Returns array of newly unlocked generator IDs.
   */
  function checkUnlocks() {
    const s = State.get();
    const unlocked = [];

    DEFS.forEach(def => {
      const cfg = Balance.GENERATORS[def.id];
      if (!s.generators[def.id].unlocked && s.maxPatience >= cfg.unlocksAt) {
        s.generators[def.id].unlocked = true;
        unlocked.push(def.id);
      }
    });

    return unlocked;
  }

  /**
   * Check if a generator just crossed a milestone threshold.
   * Returns array of { id, milestoneNum, totalMult } for newly triggered milestones.
   */
  function checkMilestones() {
    const s = State.get();
    const fired = [];

    DEFS.forEach(def => {
      const owned = s.generators[def.id].owned;
      const thresholds = Balance.MILESTONES[def.id] || [];
      for (let i = 0; i < thresholds.length; i++) {
        if (owned >= thresholds[i]) {
          const key = def.id + '_m' + i;
          if (!s.triggeredGenMilestones.includes(key)) {
            s.triggeredGenMilestones.push(key);
            fired.push({
              id: def.id,
              name: def.name,
              milestoneNum: i + 1,
              totalMult: Math.pow(2, i + 1),
              owned: owned,
            });
          }
        }
      }
    });

    return fired;
  }

  /**
   * Get the dominance breakdown (% contribution of each generator to total PPS).
   * Used for logging.
   */
  function getDominance() {
    const s = State.get();
    const breakdown = {};
    let total = 0;

    DEFS.forEach(def => {
      const owned = s.generators[def.id].owned;
      if (owned <= 0) { breakdown[def.id] = 0; return; }

      const cfg = Balance.GENERATORS[def.id];
      const upgradeMult = s.genMultipliers[def.id] || 1;
      const milestoneMult = getMilestoneMult(def.id);
      const cascade = getCascadeBoost(def.id);
      const globalMult = s.globalGenMultiplier || 1;
      const pps = cfg.baseProduction * owned * upgradeMult * milestoneMult * cascade * globalMult;

      breakdown[def.id] = pps;
      total += pps;
    });

    // Convert to percentages
    if (total > 0) {
      Object.keys(breakdown).forEach(id => {
        breakdown[id] = Math.round((breakdown[id] / total) * 100);
      });
    }

    return breakdown;
  }

  return {
    getDefs, getConfig, getCost, getMilestoneMult, getCascadeBoost,
    getBasePPS, getPerUnitPPS, buy, checkUnlocks, checkMilestones, getDominance,
  };
})();
