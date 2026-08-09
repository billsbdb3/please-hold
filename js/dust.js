/**
 * Dust system: accumulation, collectors (shop), and dust-time interaction.
 * Separated from main.js so dust balance can be tuned independently.
 */
const Dust = (function() {

  // Dust Collectors: 11 items spread across Phase 1
  // With dustPerSec=0.2 base, x30 time cap, and dust/sec boosts from collectors:
  // At peak (after broom+hepa+industrial): ~4.7 dust/sec × 30 = 141 dust/real-sec
  // All 11 should be purchasable within Phase 1
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
  ];

  let revealed = false;
  let built = false;

  // Reveal threshold
  const REVEAL_AT = 200; // particles (gives time between Entropy popup and shop reveal)

  /**
   * Calculate dust accumulation per real-time tick.
   * Dust uses in-game time but with its own cap (x30) to prevent explosion.
   */
  function calcDustPerTick(state, dt, effectiveTimeMult) {
    if (!state.flags.dustStarted) return 0;
    const dustTimeCap = Math.min(30, effectiveTimeMult);
    return state.dustPerSec * state.dustMultiplier * dt * dustTimeCap;
  }

  /**
   * Calculate the dust-based time factor for display.
   * Uses maxDust so spending dust never drops the time display backward.
   */
  function calcDustTimeFactor(maxDust) {
    if (maxDust <= 10) return 1;
    return Math.min(50000, 1 + Math.pow(Math.log10(maxDust + 1), 2) * 10);
  }

  // === UI ===
  function buildUI(container) {
    if (built) return;
    built = true;
    const col = document.createElement('div');
    col.className = 'upgrade-column dust-col';
    col.id = 'dust-collectors-col';
    col.innerHTML = '<h2>Dust Collectors</h2><div id="dust-collectors-list"></div>';
    container.appendChild(col);
    container.style.gridTemplateColumns = '1fr 1fr 1fr';

    const list = document.getElementById('dust-collectors-list');
    collectors.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-btn';
      btn.id = 'dcbtn-' + item.id;
      btn.innerHTML = `<strong>${item.name}</strong> — ${item.desc}<br><span class="upgrade-cost">${NumberFormat.formatDust(item.cost)}</span>`;
      btn.onclick = () => buy(item);
      list.appendChild(btn);
    });
  }

  function buy(item) {
    // Access game state through Game.state
    const state = Game.state;
    if (item.bought || state.dust < item.cost) return;
    state.dust -= item.cost;
    item.bought = true;
    item.effect(state);
    UI.addLog('Collected: ' + item.name);
    console.log('[METRICS] Dust collector "' + item.name + '" at ' + ((Date.now() - state.realStartTime) / 60000).toFixed(1) + 'm | dust:' + state.dust.toFixed(1) + ' | pps:' + Game.totalPPS().toFixed(1));
  }

  function updateUI(state) {
    if (!revealed && state.dust >= REVEAL_AT) {
      revealed = true;
      const container = document.getElementById('upgrades-container');
      if (container) {
        buildUI(container);
        UI.showMilestone('The dust is accumulating. You notice it has... properties. You can shape it. Use it. This is probably fine.');
      }
    }
    if (!built) return;

    collectors.forEach(item => {
      const btn = document.getElementById('dcbtn-' + item.id);
      if (!btn) return;
      if (item.bought && !btn.classList.contains('owned')) {
        btn.classList.add('owned');
        btn.innerHTML = '<strong>' + item.name + '</strong> ✓';
        btn.disabled = true;
      } else if (!item.bought) {
        btn.disabled = state.dust < item.cost;
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
