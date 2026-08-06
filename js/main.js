/**
 * PLEASE HOLD - Main game controller.
 * Manages game state, loop, phase transitions, and coordination.
 */
const Game = (function() {
  // ===== CORE STATE =====
  const state = {
    phase: 1,
    patience: 0,
    dust: 0,
    wtl: 15,
    wtlMax: 15,
    wtlPerClick: 1,
    patiencePerClick: 1,
    patiencePerSec: 0,
    dustPerSec: 0,
    dustMultiplier: 1,
    wtlRegen: 0,
    refillCost: 5,
    refillAmount: 12,
    queue: Phase1.QUEUE_START,
    queueAdvances: 0,
    totalClicks: 0,
    hangups: 0,
    combo: 1,
    timeMultiplier: 1, // in-game time multiplier
    inGameSeconds: 0,  // total subjective seconds on hold
    realStartTime: 0,
    realElapsed: 0,

    // Phase 2 resources
    rage: 0,
    holdTime: 0,

    // Phase 3 resources
    inertia: 0,
    entropy: 0,

    // Flags
    flags: {
      dustStarted: false,
      noWtlCost: false,
      started: false,
    },

    // Tracking
    maxPatience: 0, // highest patience ever reached
    boughtUpgrades: new Set(),
    triggeredMilestones: new Set(),
  };

  // ===== TIMING =====
  let lastTick = 0;
  let lastFlavorTime = 0;
  let lastComboClick = -Infinity;
  let lastClickTime = -Infinity;
  const CLICK_COOLDOWN = 110;
  const COMBO_MAX = 4;
  const COMBO_UP = 0.3;
  const COMBO_DECAY = 0.4;
  const FLAVOR_INTERVAL = 12000;

  function mins() { return ((Date.now() - state.realStartTime) / 60000).toFixed(1) + 'm'; }

  // ===== INIT =====
  function init() {
    document.getElementById('call-btn').onclick = startGame;
  }

  function startGame() {
    state.flags.started = true;
    state.realStartTime = Date.now();
    lastTick = Date.now();

    document.getElementById('pre-call').style.display = 'none';
    document.getElementById('game-area').style.display = 'block';

    buildPhase1UI();
    UI.addLog('You dial Meridian Solutions Inc.');
    UI.addLog('"Thank you for calling. All representatives are currently busy."');
    UI.addLog('"Your current queue position is: one hundred and fifty."');
    UI.addLog('Hold music begins.');
    document.getElementById('flavor-text').textContent = Flavor.phase1[0];
    lastFlavorTime = Date.now();

    Save.startAutoSave(getState);
    requestAnimationFrame(tick);
  }

  // ===== PHASE 1 UI =====
  function buildPhase1UI() {
    document.body.classList.add('phase-1');

    // Phone bar
    document.getElementById('phone-bar').innerHTML =
      '<span class="phone-icon">🥫</span> <span class="phone-name">Tin Can & String</span><span class="elapsed">' + NumberFormat.formatHoldTime(0) + '</span>';

    // Status bar
    document.getElementById('status-bar').innerHTML = `
      <div class="resource"><div class="resource-label">Patience</div><div class="resource-value patience" id="val-patience">0</div></div>
      <div class="resource"><div class="resource-label">Will to Live</div><div class="resource-value wtl" id="val-wtl">15/15</div><div class="bar-container"><div class="bar bar-wtl" id="bar-wtl"></div></div></div>
      <div class="resource" id="res-dust" style="display:none"><div class="resource-label">Dust</div><div class="resource-value dust" id="val-dust">0</div></div>
      <div class="resource"><div class="resource-label">Queue</div><div class="resource-value queue" id="val-queue">#150</div></div>
    `;

    // Actions
    document.getElementById('actions').innerHTML = `
      <button id="btn-endure" class="btn btn-primary">[ ENDURE ]<br><span class="btn-sub" id="sub-endure">+1 patience | -1 WtL</span></button>
      <button id="btn-refill" class="btn btn-secondary" style="display:none" disabled>Deep Breath<br><span class="btn-sub" id="sub-refill">5 patience → +12 WtL</span></button>
      <button id="btn-advance" class="btn btn-danger" disabled>Advance in Queue<br><span class="btn-sub" id="sub-advance">costs 20 patience</span></button>
    `;

    // Upgrades container
    document.getElementById('upgrades-container').innerHTML = `
      <div class="upgrade-column hold-col"><h2>Hold Upgrades</h2><div id="upgrade-list"></div></div>
    `;

    // Build upgrade buttons
    const list = document.getElementById('upgrade-list');
    Phase1.upgrades.forEach(u => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-btn';
      btn.id = 'ubtn-' + u.id;
      btn.style.display = 'none';
      btn.innerHTML = `<strong>${u.name}</strong> — ${u.desc}<br><span class="upgrade-cost">${NumberFormat.format(u.cost)} patience</span>`;
      btn.onclick = () => buyUpgrade(u);
      list.appendChild(btn);
    });

    // Wire up action buttons
    document.getElementById('btn-endure').onclick = doEndure;
    document.getElementById('btn-refill').onclick = doRefill;
    document.getElementById('btn-advance').onclick = doAdvance;
  }

  // ===== ACTIONS =====
  function doEndure() {
    if (state.wtl <= 0) return;
    const now = Date.now();
    if (now - lastClickTime < CLICK_COOLDOWN) return;
    lastClickTime = now;

    state.patience += state.patiencePerClick;
    if (state.patience > state.maxPatience) state.maxPatience = state.patience;
    state.wtl = Math.max(0, state.wtl - state.wtlPerClick);
    state.totalClicks++;

    // Combo
    lastComboClick = now;
    state.combo = Math.min(COMBO_MAX, state.combo + COMBO_UP);
  }

  function doRefill() {
    if (state.patience >= state.refillCost) {
      state.patience -= state.refillCost;
      state.wtl = Math.min(state.wtlMax, state.wtl + state.refillAmount);
      console.log('[METRICS] Deep Breath at ' + mins() + ' | patience:' + Math.floor(state.patience) + ' | wtl:' + Math.floor(state.wtl) + '/' + state.wtlMax);
    }
  }

  function doAdvance() {
    const cost = Phase1.getAdvanceCost(state.queueAdvances);
    if (state.patience >= cost && state.queue > 0) {
      state.patience -= cost;
      state.queue--;
      state.queueAdvances++;
      console.log('[METRICS] Queue #' + state.queue + ' at ' + mins() + ' | cost:' + cost + ' | pps:' + state.patiencePerSec.toFixed(1) + ' | dust:' + state.dust.toFixed(1) + ' | clicks:' + state.totalClicks);
      Phase1.checkMilestones(state.queue, state.triggeredMilestones);
      UI.addLog('Advanced to #' + state.queue + '.');
      if (state.queue <= 0) endPhase1();
    }
  }

  function buyUpgrade(u) {
    if (state.boughtUpgrades.has(u.id)) return;
    if (state.patience < u.cost) return;
    state.patience -= u.cost;
    state.boughtUpgrades.add(u.id);
    u.effect(state);
    console.log('[METRICS] Bought "' + u.name + '" at ' + mins() + ' | patience:' + Math.floor(state.patience) + ' | pps:' + state.patiencePerSec.toFixed(1) + ' | dust:' + state.dust.toFixed(1) + ' | clicks:' + state.totalClicks + ' | maxP:' + Math.floor(state.maxPatience));
    UI.addLog('Purchased: ' + u.name);
  }

  // ===== PHASE TRANSITION =====
  function endPhase1() {
    console.log('[METRICS] === PHASE 1 COMPLETE === at ' + mins() + ' | clicks:' + state.totalClicks + ' | hangups:' + state.hangups + ' | pps:' + state.patiencePerSec.toFixed(1) + ' | dust:' + state.dust.toFixed(1) + ' | maxP:' + Math.floor(state.maxPatience));
    UI.showTransition(
      'SOMEONE PICKS UP.',
      [
        '"Thank you for calling Meridian Solutions, my name is—"',
        '"Actually, before I help you, have you heard about our Extended Vehicle Protection Plan?"',
        'You stare at the phone.',
        'You were not calling about your car.',
        'You have been on hold for ' + NumberFormat.formatHoldTime(state.inGameSeconds) + '.',
        'For $1.47.',
        'And they want to talk about your CAR.',
      ],
      '[ WHAT. ]',
      () => { startPhase2(); }
    );
  }

  function startPhase2() {
    state.phase = 2;
    // TODO: Build Phase 2 UI and mechanics
    UI.addLog('Phase 2 begins. (Coming soon)');
  }

  // ===== GAME LOOP =====
  function tick() {
    if (!state.flags.started) return;
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    // Real elapsed
    state.realElapsed = (now - state.realStartTime) / 1000;

    // In-game time
    state.inGameSeconds += dt * state.timeMultiplier;

    // Combo decay
    if (now - lastComboClick > 600 && state.combo > 1) {
      state.combo = Math.max(1, state.combo - COMBO_DECAY * dt);
    }

    // WtL regen
    if (state.wtlRegen > 0) {
      state.wtl = Math.min(state.wtlMax, state.wtl + state.wtlRegen * dt);
    }

    // Hangup check
    if (state.wtl <= 0 && state.wtlRegen < 0.3 && state.wtlPerClick > 0) {
      hangUp();
      return;
    }

    // Patience per sec (with combo multiplier)
    let pps = state.patiencePerSec;
    pps *= state.combo;
    state.patience += pps * dt;

    // Track max patience
    if (state.patience > state.maxPatience) state.maxPatience = state.patience;

    // Dust
    if (state.flags.dustStarted) {
      state.dust += state.dustPerSec * state.dustMultiplier * dt;
    }

    // Flavor text
    if (now - lastFlavorTime > FLAVOR_INTERVAL) {
      document.getElementById('flavor-text').textContent = Flavor.getForPhase(state.phase);
      lastFlavorTime = now;
    }

    // Dust overlay
    UI.setDustOverlay(state.dust);

    // Update display
    updateDisplay();

    requestAnimationFrame(tick);
  }

  function hangUp() {
    console.log('[METRICS] HANGUP at ' + mins() + ' | queue:#' + state.queue + ' | patience:' + Math.floor(state.patience) + ' | clicks:' + state.totalClicks);
    document.getElementById('game-area').style.display = 'none';
    const scr = document.getElementById('hangup-scr');
    scr.style.display = 'block';
    document.getElementById('hangup-txt').textContent = Flavor.getHangup();
    document.getElementById('redial-btn').onclick = redial;
    state.hangups++;
    const penalty = Math.min(10, Math.floor(state.queueAdvances * 0.05) + 2);
    state.queue = Math.min(Phase1.QUEUE_START, state.queue + penalty);
    state.queueAdvances = Math.max(0, state.queueAdvances - penalty);
    state.patience = 0;
    state.wtl = state.wtlMax;
  }

  function redial() {
    document.getElementById('hangup-scr').style.display = 'none';
    document.getElementById('game-area').style.display = 'block';
    UI.addLog('You redial. Queue: #' + state.queue + '. Upgrades remain. Dignity does not.');
    lastTick = Date.now();
    requestAnimationFrame(tick);
  }

  // ===== DISPLAY UPDATE =====
  function updateDisplay() {
    // Patience
    UI.setText('val-patience', NumberFormat.format(state.patience));

    // WtL
    UI.setText('val-wtl', Math.floor(state.wtl) + '/' + state.wtlMax);
    const wtlPct = (state.wtl / state.wtlMax) * 100;
    UI.setWidth('bar-wtl', wtlPct);
    UI.setBarColor('bar-wtl', wtlPct);

    // Queue
    UI.setText('val-queue', '#' + state.queue);

    // Dust
    if (state.flags.dustStarted) {
      UI.show('res-dust');
      UI.setText('val-dust', NumberFormat.format(state.dust) + ' mm');
    }

    // Phone bar elapsed
    const phoneBar = document.getElementById('phone-bar');
    if (phoneBar) {
      const elapsed = phoneBar.querySelector('.elapsed');
      if (elapsed) elapsed.textContent = NumberFormat.formatHoldTime(state.inGameSeconds);
    }

    // Buttons
    const endureBtn = document.getElementById('btn-endure');
    const refillBtn = document.getElementById('btn-refill');
    const advanceBtn = document.getElementById('btn-advance');

    if (endureBtn) endureBtn.disabled = state.wtl <= 0;
    if (refillBtn) {
      // Reveal when WtL drops below 60%
      if (state.wtl < state.wtlMax * 0.6) refillBtn.style.display = '';
      refillBtn.disabled = state.patience < state.refillCost;
      UI.setText('sub-refill', state.refillCost + ' patience → +' + state.refillAmount + ' WtL');
    }
    if (advanceBtn) {
      const cost = Phase1.getAdvanceCost(state.queueAdvances);
      advanceBtn.disabled = state.patience < cost;
      UI.setText('sub-advance', 'costs ' + NumberFormat.format(cost) + ' patience');
    }

    // Endure button text
    UI.setText('sub-endure', '+' + state.patiencePerClick + ' patience' + (state.wtlPerClick > 0 ? ' | -' + state.wtlPerClick + ' WtL' : ''));

    // Upgrades visibility & state
    Phase1.upgrades.forEach(u => {
      const btn = document.getElementById('ubtn-' + u.id);
      if (!btn) return;
      if (!state.boughtUpgrades.has(u.id)) {
        if (state.maxPatience >= u.revealAt) {
          btn.style.display = 'block';
        }
        btn.disabled = state.patience < u.cost;
      } else {
        btn.style.display = 'block';
        if (!btn.classList.contains('owned')) {
          btn.classList.add('owned');
          btn.innerHTML = '<strong>' + u.name + '</strong> ✓';
          btn.disabled = true;
        }
      }
    });

    // Show upgrades container once first upgrade is visible
    const upgradesBox = document.getElementById('upgrades-container');
    if (upgradesBox && !upgradesBox.classList.contains('revealed') && state.maxPatience >= 15) {
      upgradesBox.style.display = 'grid';
      upgradesBox.style.gridTemplateColumns = '1fr';
      upgradesBox.classList.add('revealed');
      UI.addLog('You consider your options.');
    }
  }

  // ===== SAVE STATE =====
  function getState() {
    return {
      ...state,
      boughtUpgrades: Array.from(state.boughtUpgrades),
      triggeredMilestones: Array.from(state.triggeredMilestones),
    };
  }

  // ===== PUBLIC API =====
  return { init, state, getState };
})();

// Start on DOM ready
document.addEventListener('DOMContentLoaded', Game.init);
