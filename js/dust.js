/**
 * Dust system: accumulation, collectors (shop), and dust-time interaction.
 * Separated from main.js so dust balance can be tuned independently.
 */
const Dust = (function() {

  // Dust Collectors: 11 items spread across late Phase 1
  // At dustPerSec=1 with x100 time cap: ~100 particles/real-sec max
  // Over 30 min endgame: ~180,000 particles. Costs spread 50-5500.
  const collectors = [
    { id: 'ds_cloth', name: 'Microfiber Cloth', desc: '+10% patience/sec', cost: 200, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.1; } },
    { id: 'ds_mask', name: 'Dust Mask', desc: '+0.3 WtL regen/sec', cost: 500, bought: false,
      effect(s) { s.wtlRegen += 0.3; } },
    { id: 'ds_filter', name: 'Air Filter', desc: '+25% patience/sec', cost: 1200, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.25; } },
    { id: 'ds_broom', name: 'Industrial Broom', desc: '+1 dust/sec base rate', cost: 2500, bought: false,
      effect(s) { s.dustPerSec += 1; } },
    { id: 'ds_map', name: 'Phone Tree Map', desc: 'Queue advances cost 15% less', cost: 5000, bought: false,
      effect(s) { s.queueCostMult *= 0.85; } },
    { id: 'ds_vacuum', name: 'Robotic Vacuum', desc: '+50% patience/sec, +0.5 WtL regen', cost: 8000, bought: false,
      effect(s) { s.globalGenMultiplier *= 1.5; s.wtlRegen += 0.5; } },
    { id: 'ds_hepa', name: 'HEPA System', desc: '+2 dust/sec, +5 max WtL', cost: 15000, bought: false,
      effect(s) { s.dustPerSec += 2; s.wtlMax += 5; } },
    { id: 'ds_static', name: 'Static Collector', desc: '+100% patience/sec (x2)', cost: 30000, bought: false,
      effect(s) { s.globalGenMultiplier *= 2; } },
    { id: 'ds_directline', name: 'Executive Direct Line', desc: 'Queue advances cost 30% less', cost: 50000, bought: false,
      effect(s) { s.queueCostMult *= 0.7; } },
    { id: 'ds_industrial', name: 'Industrial Extraction', desc: '+5 dust/sec, +1 WtL regen', cost: 80000, bought: false,
      effect(s) { s.dustPerSec += 5; s.wtlRegen += 1; } },
    { id: 'ds_singularity', name: 'Dust Singularity', desc: 'ALL production x3', cost: 150000, bought: false,
      effect(s) { s.globalGenMultiplier *= 3; } },
  ];

  let revealed = false;
  let built = false;

  // Reveal threshold
  const REVEAL_AT = 30; // particles

  /**
   * Calculate dust accumulation per real-time tick.
   * Dust uses in-game time but with its own cap (x100) to prevent explosion.
   */
  function calcDustPerTick(state, dt, effectiveTimeMult) {
    if (!state.flags.dustStarted) return 0;
    const dustTimeCap = Math.min(10, effectiveTimeMult);
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
