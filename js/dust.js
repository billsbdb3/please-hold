/**
 * Dust system (FINAL v5)
 * 
 * Asymptotic collector model:
 * - Primary bonus: 1 - e^(-collectors_owned * 0.1) → caps at +100% production
 * - Each collector ALSO has a unique secondary effect (queue speed, dust mult, queue cost)
 * - Production bonus is applied in Game.totalPPS() via state.dustCollectorCount
 * - Secondary effects are applied directly to state on purchase
 */
const Dust = (function() {

  const collectors = [
    { id: 'ds_cloth', name: 'Microfiber Cloth', desc: '+prod bonus, +5% queue speed', cost: 300, bought: false,
      secondary: 'queueSpeed', secondaryVal: 0.05,
      applySecondary(s) { s.queueSpeedMult += 0.05; } },
    { id: 'ds_feather', name: 'Feather Duster', desc: '+prod bonus, +5% queue speed', cost: 800, bought: false,
      secondary: 'queueSpeed', secondaryVal: 0.05,
      applySecondary(s) { s.queueSpeedMult += 0.05; } },
    { id: 'ds_filter', name: 'Air Filter', desc: '+prod bonus, dust income x1.25', cost: 2000, bought: false,
      secondary: 'dustMult', secondaryVal: 1.25,
      applySecondary(s) { s.dustMultiplier *= 1.25; } },
    { id: 'ds_aircan', name: 'Compressed Air Can', desc: '+prod bonus, dust income x1.5', cost: 5000, bought: false,
      secondary: 'dustMult', secondaryVal: 1.5,
      applySecondary(s) { s.dustMultiplier *= 1.5; } },
    { id: 'ds_dustpan', name: 'Dustpan & Brush', desc: '+prod bonus, queue cost -10%', cost: 8000, bought: false,
      secondary: 'queueCost', secondaryVal: 0.9,
      applySecondary(s) { s.queueCostMult *= 0.9; } },
    { id: 'ds_handvac', name: 'Hand Vacuum', desc: '+prod bonus, +10% queue speed', cost: 15000, bought: false,
      secondary: 'queueSpeed', secondaryVal: 0.10,
      applySecondary(s) { s.queueSpeedMult += 0.10; } },
    { id: 'ds_hepa', name: 'HEPA Filter', desc: '+prod bonus, dust income x1.5', cost: 25000, bought: false,
      secondary: 'dustMult', secondaryVal: 1.5,
      applySecondary(s) { s.dustMultiplier *= 1.5; } },
    { id: 'ds_static', name: 'Static Collector', desc: '+prod bonus, queue cost -15%', cost: 40000, bought: false,
      secondary: 'queueCost', secondaryVal: 0.85,
      applySecondary(s) { s.queueCostMult *= 0.85; } },
    { id: 'ds_shopvac', name: 'Shop Vac', desc: '+prod bonus, +15% queue speed', cost: 60000, bought: false,
      secondary: 'queueSpeed', secondaryVal: 0.15,
      applySecondary(s) { s.queueSpeedMult += 0.15; } },
    { id: 'ds_cleanroom', name: 'Clean Room Protocol', desc: '+prod bonus, dust income x2', cost: 100000, bought: false,
      secondary: 'dustMult', secondaryVal: 2.0,
      applySecondary(s) { s.dustMultiplier *= 2.0; } },
    { id: 'ds_singular', name: 'Dust Singularity', desc: '+prod bonus, queue cost -20%', cost: 150000, bought: false,
      secondary: 'queueCost', secondaryVal: 0.8,
      applySecondary(s) { s.queueCostMult *= 0.8; } },
    { id: 'ds_entropy', name: 'Entropy Harvester', desc: '+prod bonus, +20% queue speed', cost: 300000, bought: false,
      secondary: 'queueSpeed', secondaryVal: 0.20,
      applySecondary(s) { s.queueSpeedMult += 0.20; } },
    { id: 'ds_pressure', name: 'Negative Pressure Chamber', desc: '+prod bonus, dust income x2', cost: 600000, bought: false,
      secondary: 'dustMult', secondaryVal: 2.0,
      applySecondary(s) { s.dustMultiplier *= 2.0; } },
    { id: 'ds_void', name: 'Void Condenser', desc: '+prod bonus, +25% queue speed', cost: 1200000, bought: false,
      secondary: 'queueSpeed', secondaryVal: 0.25,
      applySecondary(s) { s.queueSpeedMult += 0.25; } },
  ];

  let revealed = false;
  let built = false;

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
      // Show asymptotic bonus in tooltip
      const currentBonus = getProductionBonus(Game.state.dustCollectorCount);
      const nextBonus = getProductionBonus(Game.state.dustCollectorCount + 1);
      const gainStr = '+' + ((nextBonus - currentBonus) * 100).toFixed(1) + '% prod';
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
    state.dustCollectorCount++;
    item.applySecondary(state);

    const bonus = getProductionBonus(state.dustCollectorCount);
    UI.addLog('Dust: ' + item.name + ' (+' + (bonus * 100).toFixed(0) + '% total prod bonus)');
    console.log('[METRICS] DUST COLLECTOR "' + item.name + '" at ' + ((Date.now() - state.realStartTime) / 60000).toFixed(1) + 'm | cost:' + item.cost + ' | dust:' + state.dust.toFixed(1) + ' | collectors:' + state.dustCollectorCount + ' | prodBonus:' + (bonus * 100).toFixed(1) + '%');
  }

  /**
   * Get the asymptotic production bonus for N collectors.
   * Returns a multiplier fraction (0 to ~1.0).
   * Applied in Game.totalPPS() as: pps *= (1 + bonus)
   */
  function getProductionBonus(count) {
    if (count <= 0) return 0;
    return 1 - Math.exp(-count * Balance.DUST.collectorCoefficient);
  }

  function updateUI(state) {
    if (!revealed && state.dust >= Balance.DUST.revealThreshold) {
      revealed = true;
      buildUI();
      Game.pauseGame();
      UI.showMilestone('The dust is accumulating. You notice it has... properties.', Game.resumeGame);
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

  return { collectors, getProductionBonus, updateUI, reset };
})();
