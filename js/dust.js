/**
 * Dust system: accumulation, collectors (shop), and dust-time interaction.
 * Collectors are dust-removal tools. Spending dust to buy them.
 * No WtL regen, no flat dust/sec. All effects are multipliers or queue/production boosts.
 */
const Dust = (function() {

  // Dust Collectors: 14 items, all dust-removal themed
  const collectors = [
    { id: 'ds_cloth', name: 'Microfiber Cloth', desc: '+10% patience/sec', cost: 300, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.1; } },
    { id: 'ds_feather', name: 'Feather Duster', desc: '+15% queue speed', cost: 800, bought: false,
      effect(s) { s.queueSpeedMult += 0.15; } },
    { id: 'ds_filter', name: 'Air Filter', desc: '+25% patience/sec', cost: 2000, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.25; } },
    { id: 'ds_aircan', name: 'Compressed Air Can', desc: 'Dust income x1.5', cost: 5000, bought: false,
      effect(s) { s.dustMultiplier *= 1.5; } },
    { id: 'ds_dustpan', name: 'Dustpan & Brush', desc: 'Queue cost -15%', cost: 8000, bought: false,
      effect(s) { s.queueCostMult *= 0.85; } },
    { id: 'ds_handvac', name: 'Hand Vacuum', desc: '+50% patience/sec', cost: 15000, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.5; } },
    { id: 'ds_hepa', name: 'HEPA Filter', desc: 'Dust income x2', cost: 25000, bought: false,
      effect(s) { s.dustMultiplier *= 2; } },
    { id: 'ds_static', name: 'Static Collector', desc: 'ALL production x2', cost: 40000, bought: false,
      effect(s) { s.globalGenMultiplier *= 2; } },
    { id: 'ds_shopvac', name: 'Shop Vac', desc: 'Queue cost -30%, +25% queue speed', cost: 60000, bought: false,
      effect(s) { s.queueCostMult *= 0.7; s.queueSpeedMult += 0.25; } },
    { id: 'ds_cleanroom', name: 'Clean Room Protocol', desc: 'ALL production x3, +1 combo cap', cost: 100000, bought: false,
      effect(s) { s.globalGenMultiplier *= 3; s.comboCapMax += 1; } },
    { id: 'ds_singular', name: 'Dust Singularity', desc: 'ALL production x3', cost: 150000, bought: false,
      effect(s) { s.globalGenMultiplier *= 3; } },
    { id: 'ds_entropy', name: 'Entropy Harvester', desc: 'ALL production x3, dust income x2', cost: 300000, bought: false,
      effect(s) { s.globalGenMultiplier *= 3; s.dustMultiplier *= 2; } },
    { id: 'ds_pressure', name: 'Negative Pressure Chamber', desc: 'ALL production x4, +50% queue speed', cost: 600000, bought: false,
      effect(s) { s.globalGenMultiplier *= 4; s.queueSpeedMult += 0.5; } },
    { id: 'ds_void', name: 'Void Condenser', desc: 'ALL production x5', cost: 1200000, bought: false,
      effect(s) { s.globalGenMultiplier *= 5; } },
  ];

  let revealed = false;
  let built = false;

  /**
   * Calculate dust accumulation per real-time tick.
   * Dust uses in-game time but with its own cap (x30) to prevent explosion.
   * Also gets a bonus from total PPS (ties patience economy to dust economy).
   */
  function calcDustPerTick(state, dt, effectiveTimeMult) {
    if (!state.flags.dustStarted) return 0;
    const dustTimeCap = Math.min(Balance.DUST.timeCap, effectiveTimeMult);
    // PPS-linked dust: generators produce dust as a byproduct
    const ppsBonus = (Game.totalPPS() * Balance.DUST.ppsLinkFactor);
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
    console.log('[METRICS] DUST COLLECTOR "' + item.name + '" at ' + ((Date.now() - state.realStartTime) / 60000).toFixed(1) + 'm | cost:' + item.cost + ' | dust:' + state.dust.toFixed(1) + ' | pps:' + Game.totalPPS().toFixed(1) + ' | dustMult:' + state.dustMultiplier.toFixed(1));
  }

  function updateUI(state) {
    if (!revealed && state.dust >= Balance.DUST.revealThreshold) {
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

  return { collectors, calcDustPerTick, calcDustTimeFactor, updateUI, reset };
})();
