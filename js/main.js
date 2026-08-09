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
    patiencePerSec: 0, // from non-generator sources
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
    timeMultiplier: 1,
    inGameSeconds: 0,
    realStartTime: 0,
    realElapsed: 0,

    // Generator multipliers (per-generator and global)
    genMultipliers: {},
    globalGenMultiplier: 1,

    // Phase 2 resources
    rage: 0,
    holdTime: 0,

    // Phase 3 resources
    inertia: 0,
    entropy: 0,

    // Flags
    flags: { dustStarted: false, noWtlCost: false, started: false, comboUnlocked: false, drainAnnounced: false },

    // Tracking
    maxPatience: 0,
    maxDust: 0, // highest dust ever (for time factor stability)
    queueCostMult: 1, // multiplier on queue advance costs (reduced by dust shop)
    boughtUpgrades: new Set(),
    triggeredMilestones: new Set(),
  };

  // Initialize generator multipliers
  Phase1.generators.forEach(g => { state.genMultipliers[g.id] = 1; });

  // Phone tiers (by in-game time)
  const phoneTiers = [
    { name: 'Tin Can & String', icon: '🥫', timeThreshold: 0, bonus: null, announced: true },
    { name: 'Rotary Phone', icon: '☎️', timeThreshold: 86400 * 7, bonus: { patiencePerSecBonus: 0.5 }, announced: false,
      narrative: "Your tin can has evolved. You now hold a rotary phone. It took a week of holding to get here." },
    { name: 'Landline', icon: '📞', timeThreshold: 86400 * 90, bonus: { patiencePerClickBonus: 2 }, announced: false,
      narrative: "Three months. Your phone is now a proper landline. The cord is reassuring. You haven't moved." },
    { name: 'Cordless Phone', icon: '📱', timeThreshold: 86400 * 365 * 5, bonus: { patiencePerSecBonus: 1.0 }, announced: false,
      narrative: "Five years on hold. Your phone is cordless now. The freedom means nothing. You haven't moved in five years." },
  ];
  let currentPhoneTier = 0;

  // Dust system is in dust.js
  // Expose totalPPS for dust.js to access
  function totalPPS() {
    return state.patiencePerSec + Phase1.calcGeneratorPPS(state);
  }

  function getEffectiveAdvanceCost() {
    return Math.floor(Phase1.getAdvanceCost(state.queueAdvances) * state.queueCostMult * (1 - (state.queueMomentum || 0)));
  }

  // ===== TIMING =====
  let lastTick = 0, lastFlavorTime = 0, lastComboClick = -Infinity, lastClickTime = -Infinity;
  const CLICK_COOLDOWN = 110, COMBO_MAX = 4, COMBO_UP = 0.3, COMBO_DECAY = 0.4, FLAVOR_INTERVAL = 12000;
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
      <div class="resource"><div class="resource-label">Queue</div><div class="resource-value queue" id="val-queue">#${Phase1.QUEUE_START}</div></div>
    `;

    // Rates bar
    document.getElementById('rates-bar').innerHTML = 'patience/sec: <span id="val-pps">0.0</span>';

    // Actions
    document.getElementById('actions').innerHTML = `
      <button id="btn-endure" class="btn btn-primary">[ ENDURE ]<br><span class="btn-sub" id="sub-endure">+1 patience | -1 WtL</span></button>
      <button id="btn-refill" class="btn btn-secondary" style="display:none" disabled>Deep Breath<br><span class="btn-sub" id="sub-refill">5 patience → +12 WtL</span></button>
      <button id="btn-advance" class="btn btn-danger" disabled>Advance in Queue<br><span class="btn-sub" id="sub-advance">costs 25 patience</span></button>
    `;

    // Upgrades container: coping mechanisms on left, upgrades on right
    document.getElementById('upgrades-container').innerHTML = `
      <div class="upgrade-column gen-col"><h2>Coping Mechanisms</h2><div id="gen-list"></div></div>
      <div class="upgrade-column hold-col"><h2>Upgrades</h2><div id="upgrade-list"></div></div>
    `;

    // Build generator buttons
    const genList = document.getElementById('gen-list');
    Phase1.generators.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-btn gen-btn';
      btn.id = 'gbtn-' + g.id;
      btn.style.display = g.unlocked ? 'block' : 'none';
      btn.innerHTML = formatGenButton(g);
      btn.onclick = () => buyGenerator(g);
      genList.appendChild(btn);
    });

    // Build upgrade buttons
    const upList = document.getElementById('upgrade-list');
    Phase1.upgrades.forEach(u => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-btn';
      btn.id = 'ubtn-' + u.id;
      btn.style.display = 'none';
      btn.innerHTML = `<strong>${u.name}</strong> — ${u.desc}<br><span class="upgrade-cost">${NumberFormat.format(u.cost)} patience</span>`;
      btn.onclick = () => buyUpgrade(u);
      upList.appendChild(btn);
    });

    // Wire up action buttons
    document.getElementById('btn-endure').onclick = doEndure;
    document.getElementById('btn-refill').onclick = doRefill;
    document.getElementById('btn-advance').onclick = doAdvance;
  }

  function formatGenButton(g) {
    const cost = Phase1.getGeneratorCost(g);
    const mult = (state.genMultipliers[g.id] || 1) * state.globalGenMultiplier;
    const prodEach = (g.baseProduction * mult).toFixed(1);
    const softCapNote = g.owned >= g.softCapAt ? ' ⚠️' : '';
    return `<strong>${g.name}</strong> (${g.owned})${softCapNote}<br><span class="btn-sub">${g.desc} | +${prodEach}/sec each</span><br><span class="upgrade-cost">${NumberFormat.format(cost)} patience</span>`;
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
    // Combo only if unlocked
    if (state.flags.comboUnlocked) {
      lastComboClick = now;
      state.combo = Math.min(COMBO_MAX, state.combo + COMBO_UP);
    }
  }

  function doRefill() {
    if (state.patience >= state.refillCost) {
      state.patience -= state.refillCost;
      state.wtl = Math.min(state.wtlMax, state.wtl + state.refillAmount);
      // Visual flash on WtL bar
      const bar = document.getElementById('bar-wtl');
      if (bar) { bar.style.background = '#fff'; setTimeout(() => { bar.style.background = ''; }, 150); }
      console.log('[METRICS] Deep Breath at ' + mins() + ' | patience:' + Math.floor(state.patience) + ' | wtl:' + Math.floor(state.wtl) + '/' + state.wtlMax);
    }
  }

  function doAdvance() {
    const cost = getEffectiveAdvanceCost();
    if (state.patience >= cost && state.queue > 0) {
      state.patience -= cost;
      state.queue--;
      state.queueAdvances++;
      // Queue Momentum: small discount that builds when advancing rapidly
      // Resets if you go more than 10 seconds without advancing
      state.queueMomentum = Math.min(0.3, (state.queueMomentum || 0) + 0.02);
      state.lastAdvanceTime = state.realElapsed;
      console.log('[METRICS] Queue #' + state.queue + ' at ' + mins() + ' | cost:' + cost + ' | pps:' + totalPPS().toFixed(1) + ' | dust:' + state.dust.toFixed(1) + ' | clicks:' + state.totalClicks);
      Phase1.checkMilestones(state.queue, state.triggeredMilestones);
      UI.addLog('Advanced to #' + state.queue + '.');
      if (state.queue <= 0) endPhase1();
    }
  }

  function buyGenerator(g) {
    const cost = Phase1.getGeneratorCost(g);
    if (state.patience < cost) return;
    state.patience -= cost;
    g.owned++;
    console.log('[METRICS] Bought gen "' + g.name + '" (#' + g.owned + ') at ' + mins() + ' | cost:' + cost + ' | pps:' + totalPPS().toFixed(1) + ' | patience:' + Math.floor(state.patience));
    UI.addLog('Bought: ' + g.name + ' (' + g.owned + ')');
    const btn = document.getElementById('gbtn-' + g.id);
    if (btn) btn.innerHTML = formatGenButton(g);
  }

  function buyUpgrade(u) {
    if (state.boughtUpgrades.has(u.id)) return;
    if (state.patience < u.cost) return;
    state.patience -= u.cost;
    state.boughtUpgrades.add(u.id);
    u.effect(state);
    console.log('[METRICS] Bought upgrade "' + u.name + '" at ' + mins() + ' | patience:' + Math.floor(state.patience) + ' | pps:' + totalPPS().toFixed(1) + ' | clicks:' + state.totalClicks + ' | maxP:' + Math.floor(state.maxPatience));
    UI.addLog('Purchased: ' + u.name);
    // Show narrative in modal if present
    if (u.narrative) {
      UI.showMilestone(u.narrative);
    }
  }

  // ===== PHASE TRANSITION =====
  function endPhase1() {
    console.log('[METRICS] === PHASE 1 COMPLETE === at ' + mins() + ' | clicks:' + state.totalClicks + ' | hangups:' + state.hangups + ' | pps:' + totalPPS().toFixed(1) + ' | dust:' + state.dust.toFixed(1));
    UI.showTransition(
      'SOMEONE PICKS UP.',
      [
        '"Thank you for calling Meridian Solutions, my name is—"',
        '"Actually, before I help you, have you heard about our Extended Vehicle Protection Plan?"',
        'You stare at the phone.',
        'You were not calling about your car.',
        'You have been on hold for ' + NumberFormat.formatHoldTime(state.inGameSeconds) + '.',
        'You are covered in ' + NumberFormat.formatDust(state.dust) + ' of dust.',
        'For $1.47.',
        'And they want to talk about your CAR.',
      ],
      '[ WHAT. ]',
      () => { startPhase2(); }
    );
  }

  function startPhase2() {
    state.phase = 2;
    UI.addLog('Phase 2 begins. (Coming soon)');
  }

  // ===== PHONE TIER ===
  function checkPhoneTier() {
    for (let i = phoneTiers.length - 1; i > currentPhoneTier; i--) {
      if (state.inGameSeconds >= phoneTiers[i].timeThreshold && !phoneTiers[i].announced) {
        phoneTiers[i].announced = true;
        currentPhoneTier = i;
        const tier = phoneTiers[i];
        // Apply bonus
        if (tier.bonus) {
          if (tier.bonus.patiencePerSecBonus) state.patiencePerSec += tier.bonus.patiencePerSecBonus;
          if (tier.bonus.patiencePerClickBonus) state.patiencePerClick += tier.bonus.patiencePerClickBonus;
        }
        // Update phone display
        const phoneBar = document.getElementById('phone-bar');
        if (phoneBar) {
          const elapsed = phoneBar.querySelector('.elapsed');
          const elText = elapsed ? elapsed.textContent : '';
          phoneBar.innerHTML = '<span class="phone-icon">' + tier.icon + '</span> <span class="phone-name">' + tier.name + '</span><span class="elapsed">' + elText + '</span>';
        }
        // Narrative
        if (tier.narrative) UI.showMilestone(tier.narrative);
        UI.addLog('Phone evolved: ' + tier.name);
        console.log('[METRICS] Phone tier: ' + tier.name + ' at ' + mins() + ' | inGameTime:' + NumberFormat.formatHoldTime(state.inGameSeconds));
        break;
      }
    }
  }

  // Dust system UI handled by dust.js

  // ===== HANGUP =====
  function hangUp() {
    console.log('[METRICS] HANGUP at ' + mins() + ' | queue:#' + state.queue + ' | patience:' + Math.floor(state.patience) + ' | clicks:' + state.totalClicks);
    document.getElementById('game-area').style.display = 'none';
    const scr = document.getElementById('hangup-scr');
    scr.style.display = 'block';
    document.getElementById('hangup-txt').textContent = Flavor.getHangup();
    document.getElementById('redial-btn').onclick = redial;
    state.hangups++;
    // Fall back in queue but cost remains the same (queueAdvances unchanged)
    const penalty = Math.min(8, Math.floor(state.queueAdvances * 0.04) + 2);
    state.queue = Math.min(Phase1.QUEUE_START, state.queue + penalty);
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

  // ===== GAME LOOP =====
  function tick() {
    if (!state.flags.started) return;
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    state.realElapsed = (now - state.realStartTime) / 1000;

    // Time multiplier for DISPLAY: uses Dust module
    if (state.dust > state.maxDust) state.maxDust = state.dust;
    let dustTimeFactor = Dust.calcDustTimeFactor(state.maxDust);
    let effectiveTimeMult = state.timeMultiplier * dustTimeFactor;
    state.inGameSeconds += dt * effectiveTimeMult;

    // Combo decay (only if unlocked)
    if (state.flags.comboUnlocked && now - lastComboClick > 600 && state.combo > 1) {
      state.combo = Math.max(1, state.combo - COMBO_DECAY * dt);
    }

    // WtL PASSIVE DRAIN: hold music erodes you over time
    // Capped at 1.5/s so it's always survivable with Deep Breath
    const realMinutes = state.realElapsed / 60;
    if (realMinutes > 5) {
      // Announce drain the first time
      if (!state.flags.drainAnnounced) {
        state.flags.drainAnnounced = true;
        UI.showMilestone('The hold music is getting to you. You can feel your will to live... slipping. Slowly. Inevitably. You should probably take deep breaths more often.');
      }
      const baseDrain = 0.15 * Math.log2(realMinutes - 4);
      const lateDrain = realMinutes > 30 ? (realMinutes - 30) * 0.02 : 0;
      const drainRate = Math.min(1.5, baseDrain + lateDrain);
      state.wtl = Math.max(0, state.wtl - drainRate * dt);
    }

    // WtL regen (from upgrades)
    if (state.wtlRegen > 0) {
      state.wtl = Math.min(state.wtlMax, state.wtl + state.wtlRegen * dt);
    }

    // Hangup check: WtL below threshold
    if (state.wtl < 0.1) {
      hangUp(); return;
    }

    // Patience per sec: generators + base + combo
    let pps = totalPPS();
    pps *= state.combo;
    state.patience += pps * dt;
    if (state.patience > state.maxPatience) state.maxPatience = state.patience;

    // Dust: uses Dust module for capped accumulation
    if (state.flags.dustStarted) {
      state.dust += Dust.calcDustPerTick(state, dt, effectiveTimeMult);
    }

    // Phone tier check (based on in-game time)
    checkPhoneTier();

    // Log time/dust state every 60 real seconds
    if (Math.floor(state.realElapsed) % 60 === 0 && Math.floor(state.realElapsed) > 0 && Math.floor(state.realElapsed) !== state._lastTimeLog) {
      state._lastTimeLog = Math.floor(state.realElapsed);
      console.log('[METRICS] TIME at ' + mins() + ' | inGame:' + NumberFormat.formatHoldTime(state.inGameSeconds) + ' | timeMult:' + effectiveTimeMult.toFixed(1) + ' | dust:' + state.dust.toFixed(1) + ' | wtlDrain:' + (realMinutes > 5 ? (0.15 * Math.log2(realMinutes - 4)).toFixed(2) : '0') + '/s | wtl:' + state.wtl.toFixed(1));
    }

    // Flavor text
    if (now - lastFlavorTime > FLAVOR_INTERVAL) {
      document.getElementById('flavor-text').textContent = Flavor.getForPhase(state.phase);
      lastFlavorTime = now;
    }

    // Queue Momentum decay: resets if no advance in 10 seconds
    if (state.queueMomentum > 0 && state.realElapsed - (state.lastAdvanceTime || 0) > 10) {
      state.queueMomentum = Math.max(0, (state.queueMomentum || 0) - 0.05 * dt);
    }

    // Dust overlay
    UI.setDustOverlay(state.dust);

    updateDisplay();
    Dust.updateUI(state);
    requestAnimationFrame(tick);
  }

  // ===== DISPLAY =====
  function updateDisplay() {
    UI.setText('val-patience', NumberFormat.format(state.patience));
    UI.setText('val-wtl', Math.floor(state.wtl) + '/' + state.wtlMax);
    UI.setText('val-queue', '#' + state.queue);

    if (state.flags.dustStarted) {
      UI.show('res-dust');
      UI.setText('val-dust', NumberFormat.formatDust(state.dust));
    }

    // Rates bar
    const pps = totalPPS() * state.combo;
    if (pps > 0) {
      document.getElementById('rates-bar').style.display = 'block';
      UI.setText('val-pps', pps.toFixed(1));
    }

    // Phone bar elapsed
    const phoneBar = document.getElementById('phone-bar');
    if (phoneBar) {
      const elapsed = phoneBar.querySelector('.elapsed');
      if (elapsed) elapsed.textContent = NumberFormat.formatHoldTime(state.inGameSeconds);
    }

    // WtL bar
    const wtlPct = (state.wtl / state.wtlMax) * 100;
    UI.setWidth('bar-wtl', wtlPct);
    UI.setBarColor('bar-wtl', wtlPct);

    // WtL danger overlay (screen goes red as WtL drains)
    UI.setWtlOverlay(wtlPct);

    // Buttons
    const endureBtn = document.getElementById('btn-endure');
    const refillBtn = document.getElementById('btn-refill');
    const advanceBtn = document.getElementById('btn-advance');

    if (endureBtn) endureBtn.disabled = state.wtl < state.wtlPerClick;
    if (refillBtn) {
      if (state.wtl < state.wtlMax * 0.6) refillBtn.style.display = '';
      refillBtn.disabled = state.patience < state.refillCost;
      UI.setText('sub-refill', state.refillCost + ' patience → +' + state.refillAmount + ' WtL');
    }
    if (advanceBtn) {
      const cost = getEffectiveAdvanceCost();
      advanceBtn.disabled = state.patience < cost;
      UI.setText('sub-advance', 'costs ' + NumberFormat.format(cost) + ' patience');
    }

    UI.setText('sub-endure', '+' + state.patiencePerClick + ' patience' + (state.wtlPerClick > 0 ? ' | -' + state.wtlPerClick + ' WtL' : ''));

    // Generator visibility and buttons
    Phase1.generators.forEach(g => {
      const btn = document.getElementById('gbtn-' + g.id);
      if (!btn) return;
      if (!g.unlocked && state.maxPatience >= g.unlocksAt) {
        g.unlocked = true;
        btn.style.display = 'block';
        UI.addLog('New coping mechanism available: ' + g.name);
      }
      if (g.unlocked) {
        const cost = Phase1.getGeneratorCost(g);
        btn.disabled = state.patience < cost;
        btn.innerHTML = formatGenButton(g);
      }
    });

    // Upgrade visibility and state
    Phase1.upgrades.forEach(u => {
      const btn = document.getElementById('ubtn-' + u.id);
      if (!btn) return;
      if (!state.boughtUpgrades.has(u.id)) {
        if (state.maxPatience >= u.revealAt) btn.style.display = 'block';
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

    // Show upgrades container
    const upgradesBox = document.getElementById('upgrades-container');
    if (upgradesBox && !upgradesBox.classList.contains('revealed') && state.maxPatience >= 8) {
      upgradesBox.style.display = 'grid';
      upgradesBox.style.gridTemplateColumns = '1fr 1fr';
      upgradesBox.classList.add('revealed');
      UI.addLog('You consider your options.');
    }
  }

  // ===== SAVE =====
  function getState() {
    return {
      ...state,
      boughtUpgrades: Array.from(state.boughtUpgrades),
      triggeredMilestones: Array.from(state.triggeredMilestones),
      generators: Phase1.generators.map(g => ({ id: g.id, owned: g.owned, unlocked: g.unlocked })),
    };
  }

  return { init, state, getState, totalPPS };
})();

document.addEventListener('DOMContentLoaded', Game.init);
