/**
 * Dust system: accumulation, collectors (shop), and dust-time interaction.
 * Separated from main.js so dust balance can be tuned independently.
 */
const Dust = (function() {

  // Dust Collectors: 14 items spread across Phase 1
  const collectors = [
    { id: 'ds_cloth', name: 'Microfiber Cloth', desc: '+10% patience/sec', cost: 300, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.1; } },
    { id: 'ds_mask', name: 'Dust Mask', desc: '+0.3 WtL regen/sec', cost: 800, bought: false,
      effect(s) { s.wtlRegen += 0.3; } },
    { id: 'ds_filter', name: 'Air Filter', desc: '+25% patience/sec', cost: 2000, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.25; } },
    { id: 'ds_broom', name: 'Industrial Broom', desc: '+0.5 dust/sec base rate', cost: 4000, bought: false,
      effect(s) { s.dustPerSec += 0.5; } },
    { id: 'ds_map', name: 'Phone Tree Map', desc: 'Queue advances cost 15% less', cost: 7000, bought: false,
      effect(s) { s.queueCostMult *= 0.85; } },
    { id: 'ds_vacuum', name: 'Robotic Vacuum', desc: '+50% patience/sec, +0.5 WtL regen', cost: 12000, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.5; s.wtlRegen += 0.5; } },
    { id: 'ds_hepa', name: 'HEPA System', desc: '+1 dust/sec, +5 max WtL', cost: 20000, bought: false,
      effect(s) { s.dustPerSec += 1; s.wtlMax += 5; } },
    { id: 'ds_static', name: 'Static Collector', desc: '+100% patience/sec (x2)', cost: 32000, bought: false,
      effect(s) { s.globalGenMultiplier *= 2; } },
    { id: 'ds_directline', name: 'Executive Direct Line', desc: 'Queue advances cost 30% less', cost: 50000, bought: false,
      effect(s) { s.queueCostMult *= 0.7; } },
    { id: 'ds_industrial', name: 'Industrial Extraction', desc: '+3 dust/sec, +1 WtL regen', cost: 75000, bought: false,
      effect(s) { s.dustPerSec += 3; s.wtlRegen += 1; } },
    { id: 'ds_singularity', name: 'Dust Singularity', desc: 'ALL production x3', cost: 120000, bought: false,
      effect(s) { s.globalGenMultiplier *= 3; } },
    { id: 'ds_entropy', name: 'Entropy Harvester', desc: '+5 dust/sec, ALL production x2', cost: 250000, bought: false,
      effect(s) { s.dustPerSec += 5; s.globalGenMultiplier *= 2; } },
    { id: 'ds_temporal', name: 'Temporal Accumulator', desc: '+10 dust/sec, +2 WtL regen', cost: 500000, bought: false,
      effect(s) { s.dustPerSec += 10; s.wtlRegen += 2; } },
    { id: 'ds_void', name: 'Void Condenser', desc: 'ALL production x5', cost: 1000000, bought: false,
      effect(s) { s.globalGenMultiplier *= 5; } },
  ];

  let revealed = false;
  let built = false;

  // Reveal threshold
  const REVEAL_AT = 200; // particles (gives time between Entropy popup and shop reveal)

  /**
   * Calculate dust accumulation per real-time tick.
   * Dust uses in-game time but with its own cap (x30) to prevent explosion.
   * Also gets a bonus from total PPS (ties patience economy to dust economy).
   */
  function calcDustPerTick(state, dt, effectiveTimeMult) {
    if (!state.flags.dustStarted) return 0;
    const dustTimeCap = Math.min(30, effectiveTimeMult);
    // PPS-linked dust: generators produce dust as a byproduct
    const ppsBonus = (Game.totalPPS() * 0.0001);
    const totalDustRate = (state.dustPerSec + ppsBonus) * state.dustMultiplier;
    return totalDustRate * dt * dustTimeCap;
  }

  /**
   * Calculate the dust-based time factor for display.
   * Only activates above threshold. Gentler curve.
   * NOTE: This only applies to effectiveTimeMult AFTER Time Blur I is purchased (handled in main.js).
   */
  function calcDustTimeFactor(maxDust) {
    const threshold = Balance.DUST.timeFactorThreshold;
    if (maxDust < threshold) return 1;
    const adjusted = maxDust / threshold;
    return Math.min(Balance.DUST.timeFactorMax, 1 + Math.pow(Math.log10(adjusted + 1), 2) * Balance.DUST.timeFactorScale);
  }

  // === UI ===
  function buildUI() {
    if (built) return;
    built = true;
    const section = document.getElementById('dust-section');
    const list = document.getElementById('dust-list');
    if (!section || !list) return;
    section.style.display = '';

    collectors.forEach(item => {
      const div = document.createElement('div');
      div.className = 'dust-item';
      div.id = 'dcbtn-' + item.id;
      div.innerHTML = `<div><span class="di-name">${item.name}</span><span class="di-desc">${item.desc}</span></div><span class="di-cost">${NumberFormat.compact(item.cost)}</span>`;
      div.onclick = () => buy(item);
      list.appendChild(div);
    });
  }

  function buy(item) {
    const state = Game.state;
    if (item.bought || state.dust < item.cost) return;
    state.dust -= item.cost;
    item.bought = true;
    item.effect(state);
    UI.addLog('Dust: ' + item.name);
    console.log('[METRICS] DUST COLLECTOR "' + item.name + '" at ' + ((Date.now() - state.realStartTime) / 60000).toFixed(1) + 'm | cost:' + item.cost + ' | dust:' + state.dust.toFixed(1) + ' | pps:' + Game.totalPPS().toFixed(1) + ' | dustPerSec:' + state.dustPerSec.toFixed(1));
  }

  function updateUI(state) {
    if (!revealed && state.dust >= REVEAL_AT) {
      revealed = true;
      buildUI();
      UI.showMilestone('The dust is accumulating. You notice it has... properties.');
      UI.addLog('Dust collectors available.');
    }
    if (!built) return;

    collectors.forEach(item => {
      const div = document.getElementById('dcbtn-' + item.id);
      if (!div) return;
      if (item.bought && !div.classList.contains('owned')) {
        div.classList.add('owned');
        div.innerHTML = '<span class="di-name">' + item.name + ' ✓</span>';
        div.title = item.desc;
        div.onclick = null;
      } else if (!item.bought) {
        div.className = 'dust-item' + (state.dust < item.cost ? ' disabled' : '');
      }
    });
  }

  function reset() {
    revealed = false;
    built = false;
    collectors.forEach(c => { c.bought = false; });
  }

  return { collectors, calcDustPerTick, calcDustTimeFactor, updateUI, reset, REVEAL_AT };
})();
