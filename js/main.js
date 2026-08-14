/**
 * PLEASE HOLD - Main game controller (v3 redesign)
 * TIME = QUEUE POSITION. No independent clock.
 * Dynamic queue costs scale with production.
 * Click value scales with production.
 */
const Game = (function() {
  // ===== CORE STATE =====
  const state = {
    phase: 1,
    patience: 0,
    dust: 0,
    wtl: Balance.WTL.baseMax,
    wtlMax: Balance.WTL.baseMax,
    wtlPerClick: Balance.CLICK.baseWtlPerClick,
    patiencePerClick: Balance.CLICK.basePatiencePerClick,
    dustPerSec: 0,
    dustMultiplier: 1,
    wtlRegen: 0,
    refillCost: Balance.WTL.baseRefillCost,
    refillAmount: Balance.WTL.baseRefillAmount,
    queue: Phase1.QUEUE_START,
    queueAdvances: 0,
    totalClicks: 0,
    hangups: 0,
    combo: 1,
    comboCapMax: Balance.CLICK.comboMax,
    realStartTime: 0,
    realElapsed: 0,
    activePlayTime: 0,
    lastInteractionTime: 0,
    isIdle: false,
    queueFamiliarityDiscount: 0,
    lastAdvanceTime: 0,
    queueProgress: 0,
    queueSpeedMult: 1.0,
    queueRevealed: false,
    queuePass: 1, // 1 = first pass, 2 = second pass
    genMultipliers: {},
    globalGenMultiplier: 1,
    queueCostMult: 1,
    maxPatience: 0,
    maxDust: 0,
    flags: {
      started: false, dustStarted: false, noWtlCost: false,
      comboUnlocked: false, comboLocked: false,
      drainAnnounced: false, queueFamiliarity: false, timeFrozen: false
    },
    boughtUpgrades: new Set(),
    triggeredMilestones: new Set(),
  };

  Phase1.generators.forEach(g => { state.genMultipliers[g.id] = 1; });

  // ===== TIME = QUEUE POSITION =====
  // Non-linear mapping: queue position → in-game seconds
  function queueToTime(queuePos) {
    const total = Phase1.QUEUE_START; // 100
    const progress = 1 - (queuePos / total); // 0 at start, 1 at queue 0
    // Exponential curve: slow early, fast late
    const curved = Math.pow(progress, 2.5);
    return curved * Balance.TIME.nineYears;
  }

  function getInGameTime() {
    return queueToTime(state.queue);
  }

  // ===== PRODUCTION =====
  function totalPPS() {
    return Phase1.calcGeneratorPPS(state);
  }

  // Click value scales with production: base + 5% of 1 second of pps
  function getClickValue() {
    return state.patiencePerClick + (totalPPS() * Balance.CLICK.scaleFactor);
  }

  // Queue position cost: fixed curve, filled by pps over time
  function getQueuePositionCost(pos) {
    // Growth 1.14, pass2 x12 (sim verified: 96 min active, 120 min idle)
    let cost = Math.floor(50 * Math.pow(1.14, (Phase1.QUEUE_START - pos)));
    if (state.queuePass === 2) cost = Math.floor(cost * 12);
    return cost;
  }
  }

  // ===== TIMING =====
  let lastTick = 0, lastFlavorTime = 0, lastComboClick = -Infinity, lastClickTime = -Infinity;

  function mins() { return ((Date.now() - state.realStartTime) / 60000).toFixed(1) + 'm'; }

  function registerInteraction() {
    state.lastInteractionTime = Date.now();
    if (state.isIdle) state.isIdle = false;
  }

  // ===== INIT =====
  function init() {
    const saveData = Save.load();
    if (saveData && saveData.state && saveData.state.flags && saveData.state.flags.started) {
      restoreState(saveData.state);
      document.getElementById('pre-call').style.display = 'none';
      document.getElementById('game-area').style.display = 'flex';
      buildPhase1UI();
      UI.addLog('Game restored. Welcome back.');
      document.addEventListener('mousemove', registerInteraction);
      document.addEventListener('keypress', registerInteraction);
      document.addEventListener('touchstart', registerInteraction);
      state.lastInteractionTime = Date.now();
      lastTick = Date.now();
      Save.startAutoSave(getState);
      requestAnimationFrame(tick);
    } else {
      document.getElementById('call-btn').onclick = startGame;
    }
  }

  function restoreState(saved) {
    Object.keys(saved).forEach(k => {
      if (k === 'boughtUpgrades') state.boughtUpgrades = new Set(saved.boughtUpgrades);
      else if (k === 'triggeredMilestones') state.triggeredMilestones = new Set(saved.triggeredMilestones);
      else if (k === 'generators') {
        saved.generators.forEach(sg => {
          const g = Phase1.generators.find(x => x.id === sg.id);
          if (g) { g.owned = sg.owned; g.unlocked = sg.unlocked; }
        });
      }
      else if (k === 'flags') Object.assign(state.flags, saved.flags);
      else if (k === 'genMultipliers') Object.assign(state.genMultipliers, saved.genMultipliers);
      else if (state.hasOwnProperty(k)) state[k] = saved[k];
    });
    state.boughtUpgrades.forEach(uid => {
      const u = Phase1.upgrades.find(x => x.id === uid);
      if (u) u.effect(state);
    });
    Dust.collectors.forEach(c => {
      if (saved.boughtCollectors && saved.boughtCollectors.includes(c.id)) {
        c.bought = true; c.effect(state);
      }
    });
  }

  function startGame() {
    state.flags.started = true;
    state.realStartTime = Date.now();
    state.lastInteractionTime = Date.now();
    lastTick = Date.now();
    document.addEventListener('mousemove', registerInteraction);
    document.addEventListener('keypress', registerInteraction);
    document.addEventListener('touchstart', registerInteraction);
    document.getElementById('pre-call').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    buildPhase1UI();
    UI.addLog('You dial Meridian Solutions Inc.');
    UI.addLog('"All representatives are currently busy."');
    UI.addLog('"Please hold."');
    Save.startAutoSave(getState);
    requestAnimationFrame(tick);
  }

  // ===== PHASE 1 UI (Three-Panel Layout) =====
  function buildPhase1UI() {
    document.getElementById('game-area').classList.add('active');

    document.getElementById('phone-bar').innerHTML =
      '<span class="phone-icon">🥫</span> <span class="phone-name">Tin Can & String</span><span class="elapsed">' + NumberFormat.formatHoldTime(0) + '</span>';

    // Left panel: resources + actions
    document.getElementById('panel-left').innerHTML = `
      <div class="res-block"><span class="res-label">PATIENCE</span><div class="res-value patience" id="val-patience">0</div><span class="res-rate" id="val-pps-rate"></span></div>
      <div class="res-block"><span class="res-label">WILL TO LIVE</span><div class="res-value wtl" id="val-wtl">${state.wtlMax}/${state.wtlMax}</div><div class="bar-container"><div class="bar bar-wtl" id="bar-wtl"></div></div><span class="res-rate" id="val-wtl-rate"></span></div>
      <div class="res-block" id="res-dust" style="display:none"><span class="res-label">DUST</span><div class="res-value dust" id="val-dust">0</div><span class="res-rate" id="val-dust-rate"></span></div>
      <div class="res-block" id="queue-block"><span class="res-label" id="queue-label">ON HOLD</span><div class="res-value queue" id="val-queue">...</div><div class="bar-container bar-container-queue"><div class="bar bar-queue" id="bar-queue"></div></div></div>
      <div id="actions">
        <button id="btn-endure" class="btn btn-primary">ENDURE<span class="btn-sub" id="sub-endure">+1 | -1 WtL</span></button>
        <button id="btn-refill" class="btn btn-secondary" style="display:none">Deep Breath<span class="btn-sub" id="sub-refill">${state.refillCost}p → +${state.refillAmount} WtL</span></button>
      </div>
    `;

    // Center panel: generators
    const genList = document.getElementById('gen-list');
    genList.innerHTML = '';
    Phase1.generators.forEach(g => {
      const div = document.createElement('div');
      div.className = 'gen-item';
      div.id = 'gbtn-' + g.id;
      div.style.display = g.unlocked ? '' : 'none';
      div.onclick = () => buyGenerator(g);
      genList.appendChild(div);
    });

    // Right panel: upgrades (built dynamically)
    const upList = document.getElementById('upgrade-list');
    upList.innerHTML = '';
    Phase1.upgrades.forEach(u => {
      const div = document.createElement('div');
      div.className = 'upgrade-item';
      div.id = 'ubtn-' + u.id;
      div.style.display = 'none';
      div.onclick = () => buyUpgrade(u);
      upList.appendChild(div);
    });

    document.getElementById('btn-endure').onclick = doEndure;
    document.getElementById('btn-refill').onclick = doRefill;
  }

  // ===== ACTIONS =====
  function doEndure() {
    if (state.wtl <= 0) return;
    const now = Date.now();
    if (now - lastClickTime < Balance.CLICK.cooldown) return;
    lastClickTime = now;
    registerInteraction();
    const clickVal = getClickValue();
    state.patience += clickVal;
    state.maxPatience += clickVal;
    if (!state.flags.noWtlCost) state.wtl = Math.max(0, state.wtl - state.wtlPerClick);
    state.totalClicks++;
    // Click also pushes queue progress (fixed burst)
    state.queueProgress += 50;
    if (state.flags.comboUnlocked) {
      lastComboClick = now;
      state.combo = Math.min(state.comboCapMax, state.combo + Balance.CLICK.comboUp);
    }
  }

  function doRefill() {
    if (state.patience >= state.refillCost) {
      registerInteraction();
      state.patience -= state.refillCost;
      state.wtl = Math.min(state.wtlMax, state.wtl + state.refillAmount);
      state._wtlFlash = Date.now();
      const bar = document.getElementById('bar-wtl');
      if (bar) { bar.style.background = '#fff'; setTimeout(() => { bar.style.background = ''; }, 200); }
      // Update button text
      const refillBtn = document.getElementById('btn-refill');
      if (refillBtn) UI.setText('sub-refill', state.refillCost + 'p → +' + state.refillAmount + ' WtL');
    }
  }

  function buyGenerator(g) {
    const cost = Phase1.getGeneratorCost(g);
    if (state.patience < cost) return;
    registerInteraction();
    state.patience -= cost;
    g.owned++;
    console.log('[METRICS] Bought "' + g.name + '" (#' + g.owned + ') at ' + mins() + ' | cost:' + cost + ' | pps:' + totalPPS().toFixed(1) + ' | patience:' + Math.floor(state.patience) + ' | active:' + (state.activePlayTime/60).toFixed(1) + 'm');
    UI.addLog(g.name + ' (' + g.owned + ')');
  }

  function buyUpgrade(u) {
    if (state.boughtUpgrades.has(u.id)) return;
    if (state.patience < u.cost) return;
    registerInteraction();
    state.patience -= u.cost;
    state.boughtUpgrades.add(u.id);
    u.effect(state);
    console.log('[METRICS] UPGRADE "' + u.name + '" at ' + mins() + ' | pps:' + totalPPS().toFixed(1) + ' | clicks:' + state.totalClicks + ' | active:' + (state.activePlayTime/60).toFixed(1) + 'm | queue:#' + state.queue + ' | maxP:' + Math.floor(state.maxPatience) + ' | dust:' + Math.floor(state.dust));
    UI.addLog('★ ' + u.name);
    if (u.narrative) UI.showMilestone(u.narrative);
  }

  // ===== PHASE TRANSITION =====
  function endPhase1() {
    console.log('[METRICS] === PHASE 1 COMPLETE === at ' + mins() + ' | clicks:' + state.totalClicks + ' | pps:' + totalPPS().toFixed(1) + ' | dust:' + state.dust.toFixed(0));
    UI.showTransition(
      'SOMEONE PICKS UP.',
      ['"Thank you for calling Meridian Solutions—"', '"Have you heard about our Extended Vehicle Protection Plan?"',
       'You have been on hold for ' + NumberFormat.formatHoldTime(getInGameTime()) + '.', 'For $1.47.'],
      '[ WHAT. ]', () => { UI.addLog('Phase 2 begins. (Coming soon)'); }
    );
  }

  // ===== HANGUP =====
  function hangUp() {
    console.log('[METRICS] HANGUP at ' + mins() + ' | queue:#' + state.queue);
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('hangup-scr').style.display = 'block';
    document.getElementById('hangup-txt').textContent = Flavor.getHangup();
    document.getElementById('redial-btn').onclick = redial;
    state.hangups++;
    const penalty = Math.min(5, Math.floor(state.queueAdvances * 0.03) + 1);
    state.queue = Math.min(Balance.QUEUE.startPosition, state.queue + penalty);
    state.patience = 0;
    state.wtl = state.wtlMax;
  }

  function redial() {
    document.getElementById('hangup-scr').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    UI.addLog('Redial. Queue: #' + state.queue + '. Dignity gone.');
    lastTick = Date.now();
    requestAnimationFrame(tick);
  }

  // ===== GAME LOOP =====
  function tick() {
    if (!state.flags.started) return;
    const now = Date.now();
    let dt = Math.min((now - lastTick) / 1000, 1.0);
    lastTick = now;
    state.realElapsed = (now - state.realStartTime) / 1000;

    // Idle detection
    if (now - state.lastInteractionTime > Balance.IDLE.threshold) {
      if (!state.isIdle) { state.isIdle = true; state.idleStartTime = now; }
    }
    if (!state.isIdle) state.activePlayTime += dt;

    // Welcome back
    if (state.isIdle && now - state.lastInteractionTime < Balance.IDLE.threshold) {
      // Just came back
      state.isIdle = false;
      const idleDur = Math.min(86400, (now - (state.idleStartTime || now)) / 1000);
      if (idleDur > Balance.IDLE.welcomeBackMinDuration) {
        const earned = Math.floor(totalPPS() * idleDur * Balance.IDLE.welcomeBackRate);
        state.patience += earned;
        state.maxPatience += earned;
        state.wtl = state.wtlMax;
        UI.addLog('Welcome back. +' + NumberFormat.format(earned) + ' patience.');
      }
    }

    // Combo decay
    if (state.flags.comboUnlocked && !state.flags.comboLocked && now - lastComboClick > Balance.CLICK.comboDecayDelay && state.combo > 1) {
      state.combo = Math.max(1, state.combo - Balance.CLICK.comboDecay * dt);
    }

    // WtL drain (active time based)
    if (!state.isIdle) {
      const activeMin = state.activePlayTime / 60;
      if (activeMin > Balance.WTL.baseDrainStart / 60) {
        if (!state.flags.drainAnnounced) {
          state.flags.drainAnnounced = true;
          UI.showMilestone('The hold music is getting to you. Your will to live... slips.');
        }
        const drainMin = activeMin - (Balance.WTL.baseDrainStart / 60);
        const rate = Math.min(Balance.WTL.maxDrainRate, Balance.WTL.baseDrainRate * Math.log2(drainMin + 1));
        state.wtl = Math.max(0, state.wtl - rate * dt);
      }
    }

    // WtL regen
    if (state.wtlRegen > 0) state.wtl = Math.min(state.wtlMax, state.wtl + state.wtlRegen * dt);

    // Hangup
    if (!state.isIdle && state.wtl < 0.1) { hangUp(); return; }

    // Production (0 when idle)
    let pps = state.isIdle ? 0 : totalPPS();
    pps *= state.combo;
    const earned = pps * dt;
    state.patience += earned;
    state.maxPatience += earned;

    // Dust (real-time, pps-linked, no time factor)
    if (state.flags.dustStarted && !state.isIdle) {
      const ppsBonus = totalPPS() * Balance.DUST.ppsLinkFactor;
      state.dust += (state.dustPerSec + ppsBonus) * state.dustMultiplier * dt;
      if (state.dust > state.maxDust) state.maxDust = state.dust;
    }

    // === AUTO-QUEUE: progress fills, queue advances automatically ===
    if (!state.isIdle && state.queue > 0) {
      const pps = totalPPS();
      state.queueProgress += pps * state.queueSpeedMult * dt;
      const cost = getQueuePositionCost(state.queue);
      
      if (state.queueProgress >= cost) {
        state.queueProgress -= cost;
        state.queue--;
        state.queueAdvances++;
        state._queueFlash = Date.now(); // flash full bar for 200ms
        
        // Reveal queue position at position 60
        if (!state.queueRevealed && state.queue <= 60) {
          state.queueRevealed = true;
          UI.addLog('"Your queue position is: ' + state.queue + '."');
          UI.showMilestone('"Your estimated queue position is: ' + state.queue + '."');
        }
        
        Phase1.checkMilestones(state.queue, state.triggeredMilestones);
        console.log('[METRICS] Queue #' + state.queue + ' at ' + mins() + ' | cost:' + cost + ' | pps:' + pps.toFixed(1) + ' | holdTime:' + NumberFormat.formatHoldTime(getInGameTime()) + ' | active:' + (state.activePlayTime/60).toFixed(1) + 'm');
        
        // Queue hits 0
        if (state.queue <= 0) {
          if (state.queuePass === 1) {
            // Department transfer
            state.queuePass = 2;
            state.queue = 75;
            state.queueProgress = 0;
            UI.showMilestone('"Thank you for holding. I\'m transferring you to our Specialist Department."<br><br><em>*click*</em><br><br>"Please continue to hold."');
            UI.addLog('TRANSFERRED. The hold music changes.');
            console.log('[METRICS] DEPARTMENT TRANSFER at ' + mins() + ' | pps:' + pps.toFixed(1));
          } else {
            // Phase 1 complete
            endPhase1();
          }
        }
      }
    }

    // Phone tier check (based on in-game time from queue position)
    const inGameTime = getInGameTime();
    if (inGameTime >= 86400 * 365 * 5 && !state._phoneTier4) {
      state._phoneTier4 = true;
      document.querySelector('#phone-bar .phone-icon').textContent = '📱';
      document.querySelector('#phone-bar .phone-name').textContent = 'Cordless Phone';
      UI.addLog('Phone evolved: Cordless Phone');
    } else if (inGameTime >= 86400 * 90 && !state._phoneTier3) {
      state._phoneTier3 = true;
      document.querySelector('#phone-bar .phone-icon').textContent = '📞';
      document.querySelector('#phone-bar .phone-name').textContent = 'Landline';
      UI.addLog('Phone evolved: Landline');
    } else if (inGameTime >= 86400 * 7 && !state._phoneTier2) {
      state._phoneTier2 = true;
      document.querySelector('#phone-bar .phone-icon').textContent = '☎️';
      document.querySelector('#phone-bar .phone-name').textContent = 'Rotary Phone';
      UI.addLog('Phone evolved: Rotary Phone');
    }

    // Flavor text (in its own box, not log)
    if (now - lastFlavorTime > Balance.UI_CONFIG.flavorInterval) {
      lastFlavorTime = now;
      const flavorEl = document.getElementById('flavor-text');
      if (flavorEl) flavorEl.textContent = Flavor.getForPhase(state.phase);
    }

    // Periodic log
    if (Math.floor(state.realElapsed) % 60 === 0 && Math.floor(state.realElapsed) > 0 && Math.floor(state.realElapsed) !== state._lastLog) {
      state._lastLog = Math.floor(state.realElapsed);
      console.log('[METRICS] TIME ' + mins() + ' | active:' + (state.activePlayTime / 60).toFixed(1) + 'm | pps:' + totalPPS().toFixed(0) + ' | q:#' + state.queue + ' | hold:' + NumberFormat.formatHoldTime(getInGameTime()) + ' | dust:' + Math.floor(state.dust) + ' | wtl:' + state.wtl.toFixed(1) + ' | combo:' + state.combo.toFixed(1) + ' | clicks:' + state.totalClicks + ' | maxP:' + Math.floor(state.maxPatience));
    }

    UI.setDustOverlay(state.dust);
    updateDisplay();
    Dust.updateUI(state);
    requestAnimationFrame(tick);
  }

  // ===== DISPLAY =====
  function updateDisplay() {
    UI.setText('val-patience', NumberFormat.format(state.patience));
    UI.setText('val-wtl', Math.floor(state.wtl) + '/' + state.wtlMax);
    
    // Queue display: hidden until revealed, draining bar
    if (state.queueRevealed) {
      document.getElementById('queue-label').textContent = 'QUEUE';
      UI.setText('val-queue', '#' + state.queue);
    } else {
      document.getElementById('queue-label').textContent = 'ON HOLD';
      UI.setText('val-queue', '...');
    }
    const qCost = getQueuePositionCost(state.queue);
    let qPct;
    if (state._queueFlash && Date.now() - state._queueFlash < 200) {
      qPct = 100; // show full briefly on advance
    } else {
      qPct = qCost > 0 ? ((qCost - state.queueProgress) / qCost) * 100 : 0;
    }
    UI.setWidth('bar-queue', Math.max(0, Math.min(100, qPct)));
    
    const wtlPct = (state._wtlFlash && Date.now() - state._wtlFlash < 200) ? 100 : (state.wtl / state.wtlMax) * 100;
    UI.setWidth('bar-wtl', wtlPct);
    UI.setBarColor('bar-wtl', wtlPct);
    UI.setWtlOverlay(wtlPct);

    // Dust display (just numbers, no units)
    if (state.flags.dustStarted) {
      UI.show('res-dust');
      UI.setText('val-dust', NumberFormat.compact(state.dust));
      const dustRate = state.dustPerSec + totalPPS() * Balance.DUST.ppsLinkFactor;
      const drEl = document.getElementById('val-dust-rate');
      if (drEl) { drEl.textContent = '+' + dustRate.toFixed(1) + '/sec'; drEl.className = 'res-rate positive'; }
    }

    // PPS rate under patience
    const pps = totalPPS() * state.combo;
    const ppsEl = document.getElementById('val-pps-rate');
    if (ppsEl) {
      if (pps > 0) {
        const display = pps < 10 ? pps.toFixed(1) : NumberFormat.compact(pps);
        ppsEl.textContent = '+' + display + '/sec';
        ppsEl.className = 'res-rate positive';
        if (state.flags.comboUnlocked && state.combo > 1.01) {
          ppsEl.textContent += ' (x' + state.combo.toFixed(1) + ')';
        }
      } else { ppsEl.textContent = ''; }
    }

    // WtL rate
    const wtlEl = document.getElementById('val-wtl-rate');
    if (wtlEl) {
      const activeMin = state.activePlayTime / 60;
      if (activeMin > Balance.WTL.baseDrainStart / 60) {
        const drainMin = activeMin - (Balance.WTL.baseDrainStart / 60);
        const rate = Math.min(Balance.WTL.maxDrainRate, Balance.WTL.baseDrainRate * Math.log2(drainMin + 1));
        const net = state.wtlRegen - rate;
        if (net < 0) { wtlEl.textContent = net.toFixed(1) + '/sec'; wtlEl.className = 'res-rate negative'; }
        else if (net > 0) { wtlEl.textContent = '+' + net.toFixed(1) + '/sec'; wtlEl.className = 'res-rate positive'; }
        else { wtlEl.textContent = ''; }
      } else if (state.wtlRegen > 0) {
        wtlEl.textContent = '+' + state.wtlRegen.toFixed(1) + '/sec'; wtlEl.className = 'res-rate positive';
      } else { wtlEl.textContent = ''; }
    }

    // Phone bar time display
    // Before first advance: tick 1 real second per second (cosmetic)
    // After first advance: shows queue-based time
    const phoneBar = document.getElementById('phone-bar');
    if (phoneBar) {
      const elapsed = phoneBar.querySelector('.elapsed');
      if (elapsed) {
        if (state.queueAdvances === 0) {
          // Cosmetic tick before first advance
          elapsed.textContent = NumberFormat.formatHoldTime(state.activePlayTime);
        } else {
          elapsed.textContent = NumberFormat.formatHoldTime(getInGameTime());
        }
      }
    }

    // Action buttons
    const refillBtn = document.getElementById('btn-refill');
    if (refillBtn) {
      if (state.wtl < state.wtlMax * 0.7) refillBtn.style.display = '';
      refillBtn.disabled = state.patience < state.refillCost;
      UI.setText('sub-refill', state.refillCost + 'p → +' + state.refillAmount + ' WtL');
    }
    const endureBtn = document.getElementById('btn-endure');
    if (endureBtn) {
      endureBtn.disabled = state.wtl < state.wtlPerClick;
      const cv = getClickValue();
      UI.setText('sub-endure', '+' + NumberFormat.compact(cv) + (state.wtlPerClick > 0 ? ' | -' + state.wtlPerClick + ' WtL' : ''));
    }

    // Generators (one-line compact)
    Phase1.generators.forEach(g => {
      const div = document.getElementById('gbtn-' + g.id);
      if (!div) return;
      if (!g.unlocked && state.maxPatience >= g.unlocksAt) {
        g.unlocked = true;
        div.style.display = '';
        UI.addLog('New: ' + g.name);
        console.log('[METRICS] GENERATOR UNLOCKED: "' + g.name + '" at ' + mins() + ' | active:' + (state.activePlayTime/60).toFixed(1) + 'm | maxP:' + Math.floor(state.maxPatience) + ' | pps:' + totalPPS().toFixed(1));
      }
      if (g.unlocked) {
        const cost = Phase1.getGeneratorCost(g);
        const ppsEach = (g.baseProduction * (state.genMultipliers[g.id] || 1) * state.globalGenMultiplier * Phase1.getNestedBoost(g.id)).toFixed(1);
        div.className = 'gen-item' + (state.patience < cost ? ' disabled' : '');
        div.innerHTML = '<div class="gi-info"><span class="gi-name">' + g.name + ' (' + g.owned + ')</span><span class="gi-desc">+' + ppsEach + '/sec each</span></div><span class="gi-cost">' + NumberFormat.compact(cost) + '</span>';
      }
    });

    // Upgrades (one-line compact)
    Phase1.upgrades.forEach(u => {
      const div = document.getElementById('ubtn-' + u.id);
      if (!div) return;
      if (!state.boughtUpgrades.has(u.id)) {
        let visible = true;
        if (u.revealAt && state.maxPatience < u.revealAt) visible = false;
        if (u.revealAtQueue && state.queue > u.revealAtQueue) visible = false;
        if (u.revealAtActiveTime && state.activePlayTime < u.revealAtActiveTime) visible = false;
        if (u.revealAtGen) {
          const gen = Phase1.generators.find(g => g.id === u.revealAtGen.id);
          if (!gen || gen.owned < u.revealAtGen.count) visible = false;
        }
        if (visible && div.style.display === 'none') {
          console.log('[METRICS] UPGRADE AVAILABLE: "' + u.name + '" at ' + mins() + ' | active:' + (state.activePlayTime/60).toFixed(1) + 'm | queue:#' + state.queue + ' | pps:' + totalPPS().toFixed(1) + ' | maxP:' + Math.floor(state.maxPatience));
        }
        div.style.display = visible ? '' : 'none';
        div.className = 'upgrade-item' + (state.patience < u.cost ? ' disabled' : '');
        div.innerHTML = '<div class="ui-info"><span class="ui-name">' + u.name + '</span><span class="ui-desc">' + u.desc + '</span></div><span class="ui-cost">' + NumberFormat.compact(u.cost) + '</span>';
      } else if (!div.classList.contains('owned')) {
        div.className = 'upgrade-item owned';
        div.innerHTML = '<span class="ui-name">' + u.name + ' ✓</span>';
        div.title = u.desc;
        div.onclick = null;
      }
    });

  }

  // ===== SAVE =====
  function getState() {
    return {
      ...state,
      boughtUpgrades: Array.from(state.boughtUpgrades),
      triggeredMilestones: Array.from(state.triggeredMilestones),
      generators: Phase1.generators.map(g => ({ id: g.id, owned: g.owned, unlocked: g.unlocked })),
      boughtCollectors: Dust.collectors.filter(c => c.bought).map(c => c.id),
    };
  }

  return { init, state, getState, totalPPS, getInGameTime };
})();

document.addEventListener('DOMContentLoaded', Game.init);
