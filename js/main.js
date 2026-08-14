/**
 * PLEASE HOLD - Main game controller (FINAL v5)
 * 
 * Core systems:
 * - WtL graduated states (Calm → Frustrated → Furious → Breaking Point → Hanging Up)
 * - Combo always decays (Muscle Memory slows decay, never locks)
 * - Click pushes queue at pps × 0.1 (always relevant)
 * - Connection Opportunity events every 3-5 min
 * - Game pauses on modals
 * - Queue bar shows overall position (full at #200, empty at #0)
 * - Reversed pressure second pass (boss fight)
 * - Asymptotic dust collector bonus
 */
const Game = (function() {
  // ===== CORE STATE =====
  const state = {
    phase: 1,
    patience: 0,
    dust: 0,
    wtl: Balance.WTL.max,
    wtlPerClick: Balance.CLICK.baseWtlPerClick,
    baseClickValue: Balance.CLICK.baseClickValue,
    clickValueMult: 1.0,
    dustPerSec: 0,
    dustMultiplier: 1,
    drainReduction: 0,
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
    queueProgress: 0,
    queueSpeedMult: Balance.QUEUE.queueSpeedBase,
    queueCostMult: 1.0,
    queueRevealed: false,
    queuePass: 1,
    genMultipliers: {},
    globalGenMultiplier: 1,
    maxPatience: 0,
    maxDust: 0,
    phoneTier: 0,
    phoneProdBonus: 0,
    phoneQueueBonus: 0,
    // Dust collector bonus (asymptotic)
    dustCollectorCount: 0,
    // Connection Opportunity
    nextConnectionTime: 0,
    connectionActive: false,
    connectionExpires: 0,
    connectionBuffExpires: 0,
    // Pass 2 (reversed pressure)
    pass2Timer: 0,
    pass2HoldTimer: 0,
    pass2Elapsed: 0,
    // WtL hangup countdown
    hangupCountdown: 0,
    hangingUp: false,
    // Pausing
    paused: false,
    // Flags
    flags: {
      started: false, dustStarted: false, noWtlCost: false,
      comboUnlocked: false, muscleMemory: false,
      drainAnnounced: false, holdPressure: false,
      emotionalCallus: false, deepBreathHalf: false
    },
    boughtUpgrades: new Set(),
    triggeredMilestones: new Set(),
    triggeredGenMilestones: new Set(),
  };

  Phase1.generators.forEach(g => { state.genMultipliers[g.id] = 1; });

  // ===== TIME = QUEUE POSITION =====
  function queueToTime(queuePos) {
    const total = Phase1.QUEUE_START;
    const progress = 1 - (queuePos / total);
    const curved = Math.pow(progress, 2.5);
    return curved * Balance.TIME.nineYears;
  }

  function getInGameTime() {
    if (state.queuePass === 2) {
      // Pass 2: time goes from 9 years → 10 years
      const transferTotal = Balance.QUEUE.transferPosition;
      const progress = state.queue <= 0 ? 1 : (1 - (state.queue / transferTotal));
      return Balance.TIME.nineYears + (Math.max(0, progress) * (Balance.TIME.tenYears - Balance.TIME.nineYears));
    }
    return queueToTime(state.queue);
  }

  // ===== PRODUCTION =====
  function totalPPS() {
    let pps = Phase1.calcGeneratorPPS(state);
    // Phone tier passive bonus
    if (state.phoneProdBonus > 0) pps *= (1 + state.phoneProdBonus);
    // Asymptotic dust collector bonus
    if (state.dustCollectorCount > 0) {
      const bonus = 1 - Math.exp(-state.dustCollectorCount * Balance.DUST.collectorCoefficient);
      pps *= (1 + bonus);
    }
    // WtL state generator multiplier
    const wtlState = getWtlState();
    pps *= wtlState.genMult;
    // Connection buff
    if (state.connectionBuffExpires && Date.now() < state.connectionBuffExpires) {
      pps *= Balance.CONNECTION.buffMultiplier;
    }
    return pps;
  }

  function getClickValue() {
    const base = state.baseClickValue + (totalPPS() * Balance.CLICK.clickPpsScale);
    return base * state.clickValueMult;
  }

  function getQueuePositionCost(pos) {
    let cost = Math.floor(Balance.QUEUE.baseCost * Math.pow(Balance.QUEUE.growthRate, (Phase1.QUEUE_START - pos)));
    cost = Math.floor(cost * state.queueCostMult);
    return cost;
  }

  function getRefillCost() {
    const pps = totalPPS();
    let cost = Math.max(Balance.WTL.refillMinCost, Math.floor(pps * Balance.WTL.refillPpsMult));
    if (state.flags.deepBreathHalf) cost = Math.floor(cost * 0.5);
    return cost;
  }

  // ===== WTL STATE =====
  function getWtlState() {
    const pct = (state.wtl / Balance.WTL.max) * 100;
    const t = Balance.WTL.thresholds;
    if (pct >= t.calm.min) return { name: 'Calm', ...t.calm };
    if (pct >= t.frustrated.min) return { name: 'Frustrated', ...t.frustrated };
    if (pct >= t.furious.min) return { name: 'Furious', ...t.furious };
    if (pct >= t.breakingPoint.min) return { name: 'Breaking Point', ...t.breakingPoint };
    return { name: 'Hanging Up', ...t.hangingUp };
  }

  function getWtlDrain() {
    const activeMin = state.activePlayTime / 60;
    const drainStartMin = Balance.WTL.drainStart / 60;
    if (activeMin <= drainStartMin) return 0;

    let drain = Balance.WTL.baseDrain;
    // Position-based drain: closer to front = more anxious
    const progressRatio = 1 - (state.queue / Phase1.QUEUE_START);
    drain += Balance.WTL.positionDrainMax * progressRatio;

    // Comfortable Chair: 25% reduction
    if (state.drainReduction) drain *= (1 - state.drainReduction);
    // Emotional Callus: additional 50% reduction
    if (state.flags.emotionalCallus) drain *= (1 - Balance.WTL.drainReductionCallus);

    return drain;
  }

  // ===== TIMING =====
  let lastTick = 0, lastFlavorTime = 0, lastComboClick = -Infinity, lastClickTime = -Infinity;

  function mins() { return ((Date.now() - state.realStartTime) / 60000).toFixed(1) + 'm'; }

  function registerInteraction() {
    state.lastInteractionTime = Date.now();
    if (state.isIdle) state.isIdle = false;
  }

  // ===== PAUSE ON MODALS =====
  function pauseGame() { state.paused = true; }
  function resumeGame() { state.paused = false; lastTick = Date.now(); }

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
      else if (k === 'triggeredGenMilestones') state.triggeredGenMilestones = new Set(saved.triggeredGenMilestones);
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
        c.bought = true; c.applySecondary(state);
        state.dustCollectorCount++;
      }
    });
  }

  function startGame() {
    state.flags.started = true;
    state.realStartTime = Date.now();
    state.lastInteractionTime = Date.now();
    state.nextConnectionTime = Date.now() + Balance.CONNECTION.minInterval + Math.random() * (Balance.CONNECTION.maxInterval - Balance.CONNECTION.minInterval);
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

  // ===== PHASE 1 UI =====
  function buildPhase1UI() {
    document.getElementById('game-area').classList.add('active');
    document.getElementById('phone-bar').innerHTML =
      '<span class="phone-icon">🥫</span> <span class="phone-name">Tin Can & String</span><span class="elapsed">' + NumberFormat.formatHoldTime(0) + '</span>';

    document.getElementById('panel-left').innerHTML = `
      <div class="res-block"><span class="res-label">PATIENCE</span><div class="res-value patience" id="val-patience">0</div><span class="res-rate" id="val-pps-rate"></span></div>
      <div class="res-block"><span class="res-label">WILL TO LIVE</span><div class="res-value wtl" id="val-wtl">${Balance.WTL.max}/${Balance.WTL.max}</div><div class="bar-container"><div class="bar bar-wtl" id="bar-wtl"></div></div><span class="res-rate" id="val-wtl-rate"></span><span class="wtl-state" id="val-wtl-state"></span></div>
      <div class="res-block" id="res-dust" style="display:none"><span class="res-label">DUST</span><div class="res-value dust" id="val-dust">0</div><span class="res-rate" id="val-dust-rate"></span></div>
      <div class="res-block" id="queue-block"><span class="res-label" id="queue-label">ON HOLD</span><div class="res-value queue" id="val-queue">...</div><div class="bar-container bar-container-queue"><div class="bar bar-queue" id="bar-queue"></div></div></div>
      <div id="actions">
        <button id="btn-endure" class="btn btn-primary">ENDURE<span class="btn-sub" id="sub-endure">+1</span></button>
        <button id="btn-refill" class="btn btn-secondary" style="display:none">Deep Breath<span class="btn-sub" id="sub-refill">10p → +40 WtL</span></button>
      </div>
      <div id="connection-event" style="display:none"><button id="btn-connection" class="btn btn-connection">📞 CONNECTION OPPORTUNITY</button></div>
    `;

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
    document.getElementById('btn-connection').onclick = claimConnection;
  }

  // ===== ACTIONS =====
  function doEndure() {
    if (state.wtl <= 0 || state.paused) return;
    const now = Date.now();
    if (now - lastClickTime < Balance.CLICK.cooldown) return;
    lastClickTime = now;
    registerInteraction();

    const clickVal = getClickValue();
    state.patience += clickVal;
    state.maxPatience += clickVal;
    if (!state.flags.noWtlCost) state.wtl = Math.max(0, state.wtl - state.wtlPerClick);
    state.totalClicks++;

    // Hold Pressure: click pushes queue (pps × 0.1)
    if (state.flags.holdPressure) {
      const wtlState = getWtlState();
      const push = totalPPS() * Balance.CLICK.queuePushScale * wtlState.clickMult;
      state.queueProgress += push;
    }

    // Combo
    if (state.flags.comboUnlocked) {
      lastComboClick = now;
      state.combo = Math.min(state.comboCapMax, state.combo + Balance.CLICK.comboUp);
    }
  }

  function doRefill() {
    const cost = getRefillCost();
    if (state.patience >= cost && !state.paused) {
      registerInteraction();
      const before = state.wtl;
      state.patience -= cost;
      state.wtl = Math.min(Balance.WTL.max, state.wtl + Balance.WTL.refillAmount);
      state._wtlFlash = Date.now();
      console.log('[METRICS] DEEP BREATH at ' + mins() + ' | cost:' + cost + ' | wtl:' + before.toFixed(1) + '→' + state.wtl.toFixed(1) + ' | pps:' + totalPPS().toFixed(0));
    }
  }

  function claimConnection() {
    if (!state.connectionActive || state.paused) return;
    registerInteraction();
    state.connectionActive = false;
    state.connectionBuffExpires = Date.now() + (Balance.CONNECTION.buffDuration * 1000);
    document.getElementById('connection-event').style.display = 'none';
    UI.addLog('📞 Signal boost! Production x' + Balance.CONNECTION.buffMultiplier + ' for ' + Balance.CONNECTION.buffDuration + 's');
    console.log('[METRICS] CONNECTION CLAIMED at ' + mins() + ' | pps:' + totalPPS().toFixed(0) + ' | buff:x' + Balance.CONNECTION.buffMultiplier + ' for ' + Balance.CONNECTION.buffDuration + 's');
    scheduleNextConnection();
  }

  function scheduleNextConnection() {
    const delay = Balance.CONNECTION.minInterval + Math.random() * (Balance.CONNECTION.maxInterval - Balance.CONNECTION.minInterval);
    state.nextConnectionTime = Date.now() + delay;
  }

  function buyGenerator(g) {
    const cost = Phase1.getGeneratorCost(g);
    if (state.patience < cost || state.paused) return;
    registerInteraction();
    state.patience -= cost;
    g.owned++;
    // Flash animation
    const genDiv = document.getElementById('gbtn-' + g.id);
    if (genDiv) { genDiv.classList.add('just-bought'); setTimeout(() => genDiv.classList.remove('just-bought'), 400); }
    console.log('[METRICS] Bought "' + g.name + '" (#' + g.owned + ') at ' + mins() + ' | cost:' + cost + ' | pps:' + totalPPS().toFixed(1) + ' | patience:' + Math.floor(state.patience) + ' | active:' + (state.activePlayTime / 60).toFixed(1) + 'm');

    // Check milestone
    const milestones = Phase1.checkGeneratorMilestones(state);
    milestones.forEach(m => {
      state._lastEventTime = Date.now();
      const ppsBefore = totalPPS();
      UI.addLog('★ ' + m.gen.name + ' milestone! (x' + m.mult + ')');
      UI.showMilestone(m.gen.name + ' reached ' + (m.milestone * Balance.MILESTONE_INTERVAL) + '! Production x' + m.mult);
      console.log('[METRICS] MILESTONE: ' + m.gen.name + ' x' + m.mult + ' at ' + mins() + ' | ppsBefore:' + ppsBefore.toFixed(0) + ' → ppsAfter:' + totalPPS().toFixed(0));
    });
  }

  function buyUpgrade(u) {
    if (state.boughtUpgrades.has(u.id) || state.paused) return;
    if (state.patience < u.cost) return;
    registerInteraction();
    state.patience -= u.cost;
    state.boughtUpgrades.add(u.id);
    u.effect(state);
    state._lastEventTime = Date.now();
    console.log('[METRICS] UPGRADE "' + u.name + '" at ' + mins() + ' | pps:' + totalPPS().toFixed(1) + ' | clicks:' + state.totalClicks + ' | active:' + (state.activePlayTime / 60).toFixed(1) + 'm | queue:#' + state.queue + ' | maxP:' + Math.floor(state.maxPatience) + ' | dust:' + Math.floor(state.dust));
    UI.addLog('★ ' + u.name);
    if (u.narrative) {
      pauseGame();
      UI.showMilestone(u.narrative, resumeGame);
    }
  }

  // ===== PHASE TRANSITION =====
  function endPhase1() {
    state.paused = true; // Stop everything
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
    pauseGame();
    console.log('[METRICS] HANGUP at ' + mins() + ' | queue:#' + state.queue);
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('hangup-scr').style.display = 'block';
    document.getElementById('hangup-txt').textContent = Flavor.getHangup();
    document.getElementById('redial-btn').onclick = redial;
    state.hangups++;
    const cleared = Phase1.QUEUE_START - state.queue;
    const penalty = Math.max(Balance.HANGUP.minPenalty, Math.floor(cleared * Balance.HANGUP.penaltyPercent));
    state.queue = Math.min(Phase1.QUEUE_START, state.queue + penalty);
    state.patience = 0;
    state.wtl = Balance.WTL.max;
    state.hangingUp = false;
    state.hangupCountdown = 0;
    console.log('[METRICS] HANGUP PENALTY: ' + penalty + ' positions back → queue #' + state.queue);
  }

  function redial() {
    document.getElementById('hangup-scr').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    UI.addLog('Redial. Queue: #' + state.queue + '. Dignity gone.');
    resumeGame();
  }

  // ===== GAME LOOP =====
  function tick() {
    if (!state.flags.started) return;
    const now = Date.now();

    // If paused, just keep looping without advancing anything
    if (state.paused) {
      lastTick = now;
      requestAnimationFrame(tick);
      return;
    }

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
      state.isIdle = false;
      const idleDur = Math.min(86400, (now - (state.idleStartTime || now)) / 1000);
      if (idleDur > Balance.IDLE.welcomeBackMinDuration) {
        const earned = Math.floor(totalPPS() * idleDur * Balance.IDLE.welcomeBackRate);
        state.patience += earned;
        state.maxPatience += earned;
        state.wtl = Balance.WTL.max;
        UI.addLog('Welcome back. +' + NumberFormat.format(earned) + ' patience.');
      }
    }

    // Combo decay (ALWAYS decays, never locks)
    if (state.flags.comboUnlocked && now - lastComboClick > Balance.CLICK.comboDecayDelay && state.combo > 1) {
      let decay = Balance.CLICK.comboDecay;
      if (state.flags.muscleMemory) decay *= Balance.CLICK.comboDecaySlowMult;
      state.combo = Math.max(1, state.combo - decay * dt);
    }

    // WtL drain (graduated)
    if (!state.isIdle) {
      const drain = getWtlDrain();
      if (drain > 0) {
        if (!state.flags.drainAnnounced) {
          state.flags.drainAnnounced = true;
          UI.addLog('The hold music is getting to you. Your will to live... slips.');
        }
        state.wtl = Math.max(0, state.wtl - drain * dt);
      }
      // Passive regen (tiny)
      state.wtl = Math.min(Balance.WTL.max, state.wtl + Balance.WTL.passiveRegen * dt);

      // Track WtL state transitions
      const newWtlState = getWtlState();
      if (state._lastWtlState && state._lastWtlState !== newWtlState.name) {
        console.log('[METRICS] WTL STATE: ' + state._lastWtlState + ' → ' + newWtlState.name + ' | wtl:' + state.wtl.toFixed(1) + ' | drain:' + drain.toFixed(2) + '/s | at ' + mins());
        state._lastEventTime = Date.now();
      }
      state._lastWtlState = newWtlState.name;
    }

    // Hangup countdown at <10%
    const wtlPct = (state.wtl / Balance.WTL.max) * 100;
    if (!state.isIdle && wtlPct < 10) {
      if (!state.hangingUp) { state.hangingUp = true; state.hangupCountdown = Balance.WTL.hangupCountdown; }
      state.hangupCountdown -= dt;
      if (state.hangupCountdown <= 0) { hangUp(); return; }
    } else {
      state.hangingUp = false;
      state.hangupCountdown = 0;
    }

    // Production
    let pps = state.isIdle ? 0 : totalPPS();
    pps *= state.combo;
    const earned = pps * dt;
    state.patience += earned;
    state.maxPatience += earned;

    // Dust accumulation
    if (state.flags.dustStarted && !state.isIdle) {
      const ppsBonus = totalPPS() * Balance.DUST.ppsLinkFactor;
      state.dust += (state.dustPerSec + ppsBonus) * state.dustMultiplier * dt;
      if (state.dust > state.maxDust) state.maxDust = state.dust;
    }

    // === AUTO-QUEUE (Pass 1) ===
    if (!state.isIdle && state.queue > 0 && state.queuePass === 1) {
      const basePps = totalPPS();
      const wtlState = getWtlState();
      const effectiveSpeed = (state.queueSpeedMult + state.phoneQueueBonus) * wtlState.queueMult;
      state.queueProgress += basePps * effectiveSpeed * dt;
      const cost = getQueuePositionCost(state.queue);

      if (state.queueProgress >= cost) {
        state.queueProgress -= cost;
        state.queue--;
        state.queueAdvances++;

        // Queue reveal (no pause — just log it)
        if (!state.queueRevealed && state.queue <= Balance.QUEUE.revealPosition) {
          state.queueRevealed = true;
          UI.addLog('"Your queue position is: ' + state.queue + '."');
        }

        // Phone tier upgrades
        const phoneTiers = Balance.PHONE;
        for (let i = phoneTiers.length - 1; i >= 0; i--) {
          if (state.queue <= phoneTiers[i].queueGate && state.phoneTier < i) {
            state.phoneTier = i;
            state.phoneProdBonus = phoneTiers[i].prodBonus;
            state.phoneQueueBonus = phoneTiers[i].queueBonus;
            const phoneIcon = document.querySelector('#phone-bar .phone-icon');
            const phoneName = document.querySelector('#phone-bar .phone-name');
            if (phoneIcon) phoneIcon.textContent = phoneTiers[i].emoji;
            if (phoneName) phoneName.textContent = phoneTiers[i].name;
            UI.addLog('Connection upgrade: ' + phoneTiers[i].name);
            break;
          }
        }

        Phase1.checkMilestones(state.queue, state.triggeredMilestones);
        console.log('[METRICS] Queue #' + state.queue + ' at ' + mins() + ' | cost:' + cost + ' | pps:' + totalPPS().toFixed(1) + ' | holdTime:' + NumberFormat.formatHoldTime(getInGameTime()) + ' | active:' + (state.activePlayTime / 60).toFixed(1) + 'm');

        // Queue hits 0 → Department Transfer → Start Pass 2
        if (state.queue <= 0) {
          state.queuePass = 2;
          state.queue = Balance.PASS2.startPosition;
          state.queueProgress = 0;
          state.pass2Elapsed = 0;
          state.pass2HoldTimer = 0;
          pauseGame();
          UI.showMilestone('"Thank you for holding. I\'m transferring you to our Specialist Department."<br><br><em>*click*</em><br><br>"Please continue to hold."<br><br><em>You can hear other callers behind you...</em>', resumeGame);
          UI.addLog('TRANSFERRED. You hear other callers pushing in behind you...');
          console.log('[METRICS] DEPARTMENT TRANSFER at ' + mins() + ' | pps:' + totalPPS().toFixed(1));
        }
      }
    }

    // === PASS 2: REVERSED PRESSURE (boss fight) ===
    if (!state.isIdle && state.queuePass === 2) {
      state.pass2Elapsed += dt;
      const pps = totalPPS();
      const wtlState = getWtlState();

      // Incoming pressure pushes you backward
      const pressure = Balance.PASS2.basePressure * (1 + Balance.PASS2.pressureGrowth * state.pass2Elapsed);
      const yourPush = pps * (state.queueSpeedMult + state.phoneQueueBonus) * wtlState.queueMult;

      // Net movement: positive = being pushed back, negative = advancing
      const netPressure = pressure - yourPush;
      state.queueProgress += netPressure * dt;

      // Convert accumulated pressure to position changes
      // Each "position" costs a fixed amount to traverse
      const positionCost = 10000; // arbitrary unit for position movement
      while (state.queueProgress >= positionCost && state.queue < Balance.PASS2.maxPosition) {
        state.queueProgress -= positionCost;
        state.queue++;
        console.log('[METRICS] PASS2 pushed back to #' + state.queue + ' at ' + mins());
      }
      while (state.queueProgress <= -positionCost && state.queue > 1) {
        state.queueProgress += positionCost;
        state.queue--;
      }
      // Clamp
      if (state.queue < 1) state.queue = 1;
      if (state.queueProgress < -positionCost) state.queueProgress = 0;
      if (state.queueProgress > positionCost * 2) state.queueProgress = positionCost * 2;

      // Win condition: hold at position ≤ target for duration with WtL > threshold
      if (state.queue <= Balance.PASS2.holdTarget && wtlPct >= Balance.PASS2.holdMinWtl) {
        state.pass2HoldTimer += dt;
        if (state.pass2HoldTimer >= Balance.PASS2.holdDuration) {
          endPhase1();
          return;
        }
      } else {
        state.pass2HoldTimer = 0; // reset if conditions not met
      }

      // Penalty if pushed to max position
      if (state.queue >= Balance.PASS2.maxPosition) {
        state.queue = Balance.PASS2.maxPosition - 10;
        state.queueProgress = 0;
        state.wtl = Math.max(0, state.wtl - 20); // harsh WtL penalty
        UI.addLog('Pushed too far back! Others are cutting ahead...');
      }
    }

    // Connection Opportunity events
    if (!state.connectionActive && now >= state.nextConnectionTime && state.queueAdvances > 5) {
      state.connectionActive = true;
      state.connectionExpires = now + Balance.CONNECTION.windowDuration;
      document.getElementById('connection-event').style.display = '';
    }
    if (state.connectionActive && now >= state.connectionExpires) {
      state.connectionActive = false;
      document.getElementById('connection-event').style.display = 'none';
      scheduleNextConnection();
    }

    // Flavor text
    if (now - lastFlavorTime > Balance.UI_CONFIG.flavorInterval) {
      lastFlavorTime = now;
      const flavorEl = document.getElementById('flavor-text');
      if (flavorEl) flavorEl.textContent = Flavor.getForPhase(state.phase);
    }

    // Periodic log (comprehensive)
    if (Math.floor(state.realElapsed) % 60 === 0 && Math.floor(state.realElapsed) > 0 && Math.floor(state.realElapsed) !== state._lastLog) {
      state._lastLog = Math.floor(state.realElapsed);
      const ppsNow = totalPPS();
      const wtlState = getWtlState();
      const drain = getWtlDrain();
      const refillCost = getRefillCost();
      const effectiveQueueSpeed = (state.queueSpeedMult + state.phoneQueueBonus) * wtlState.queueMult;
      const qCost = state.queue > 0 ? getQueuePositionCost(state.queue) : 0;
      const timeToNext = qCost > 0 ? (qCost / (ppsNow * effectiveQueueSpeed)).toFixed(1) : '—';
      const clickQueuePush = state.flags.holdPressure ? (ppsNow * Balance.CLICK.queuePushScale * wtlState.clickMult).toFixed(0) : '0';

      // Generator dominance breakdown
      const genPps = Phase1.generators.map(g => {
        if (g.owned <= 0) return null;
        const mult = (state.genMultipliers[g.id] || 1) * state.globalGenMultiplier * Phase1.getMilestoneMultiplier(g.owned);
        const boost = Phase1.getNestedBoost(g.id);
        return { id: g.id.replace('gen_', '')[0], pps: g.baseProduction * g.owned * mult * boost };
      }).filter(Boolean);
      const totalGen = genPps.reduce((s, g) => s + g.pps, 0);
      const dominance = genPps.map(g => g.id + ':' + (totalGen > 0 ? ((g.pps / totalGen) * 100).toFixed(0) : 0) + '%').join(' ');

      // Time since last unlock/milestone/upgrade
      const lastEvent = state._lastEventTime || state.realStartTime;
      const timeSinceEvent = ((Date.now() - lastEvent) / 1000).toFixed(0);

      console.log('[METRICS] TIME ' + mins() + ' | active:' + (state.activePlayTime / 60).toFixed(1) + 'm | pps:' + ppsNow.toFixed(0) + ' | q:#' + state.queue + ' | hold:' + NumberFormat.formatHoldTime(getInGameTime()) + ' | pass:' + state.queuePass);
      console.log('[METRICS]   WtL:' + state.wtl.toFixed(1) + '/' + Balance.WTL.max + ' [' + wtlState.name + '] drain:' + drain.toFixed(2) + '/s | refillCost:' + refillCost + ' | combo:' + state.combo.toFixed(1) + '/' + state.comboCapMax);
      console.log('[METRICS]   Queue: speed=' + effectiveQueueSpeed.toFixed(2) + ' | cost=' + qCost + ' | ETA=' + timeToNext + 's | clickPush=' + clickQueuePush + '/click');
      console.log('[METRICS]   Gens: ' + Phase1.generators.map(g => g.id.replace('gen_', '')[0] + ':' + g.owned).join(' ') + ' | dominance: ' + dominance);
      console.log('[METRICS]   Dust:' + Math.floor(state.dust) + ' | collectors:' + state.dustCollectorCount + '/14 | dustMult:' + state.dustMultiplier.toFixed(1) + ' | phone:' + state.phoneTier + ' | clicks:' + state.totalClicks + ' | sinceEvent:' + timeSinceEvent + 's');
    }

    UI.setDustOverlay(state.dust);
    updateDisplay();
    Dust.updateUI(state);
    requestAnimationFrame(tick);
  }

  // ===== DISPLAY =====
  function updateDisplay() {
    UI.setText('val-patience', NumberFormat.format(state.patience));
    UI.setText('val-wtl', Math.round(state.wtl) + '/' + Balance.WTL.max);

    // WtL state indicator + panel class
    const wtlState = getWtlState();
    const wtlStateEl = document.getElementById('val-wtl-state');
    if (wtlStateEl) {
      wtlStateEl.textContent = wtlState.name !== 'Calm' ? wtlState.name : '';
      wtlStateEl.className = 'wtl-state ' + (wtlState.name === 'Hanging Up' ? 'critical' : wtlState.name === 'Breaking Point' ? 'danger' : wtlState.name === 'Furious' ? 'warning' : '');
    }
    // Panel visual state
    const panelLeft = document.getElementById('panel-left');
    if (panelLeft) {
      panelLeft.className = '';
      if (wtlState.name === 'Frustrated') panelLeft.className = 'wtl-frustrated';
      else if (wtlState.name === 'Furious') panelLeft.className = 'wtl-furious';
      else if (wtlState.name === 'Breaking Point') panelLeft.className = 'wtl-breaking';
      else if (wtlState.name === 'Hanging Up') panelLeft.className = 'wtl-hangingup';
    }

    // Connection buff glow on game container
    const container = document.getElementById('game-container');
    if (container) {
      if (state.connectionBuffExpires && Date.now() < state.connectionBuffExpires) {
        if (!container.classList.contains('buff-active')) container.classList.add('buff-active');
      } else {
        container.classList.remove('buff-active');
      }
    }

    // Queue display: bar shows OVERALL position (full at #200, empty at #0)
    if (state.queueRevealed) {
      document.getElementById('queue-label').textContent = state.queuePass === 2 ? 'HOLDING POSITION' : 'QUEUE';
      UI.setText('val-queue', '#' + state.queue);
    } else {
      document.getElementById('queue-label').textContent = 'ON HOLD';
      UI.setText('val-queue', '...');
    }
    const qBarPct = (state.queue / Phase1.QUEUE_START) * 100;
    UI.setWidth('bar-queue', Math.max(0, Math.min(100, qBarPct)));

    // WtL bar
    const wtlPct = (state.wtl / Balance.WTL.max) * 100;
    UI.setWidth('bar-wtl', wtlPct);
    UI.setBarColor('bar-wtl', wtlPct);
    if (typeof UI.setWtlOverlay === 'function') UI.setWtlOverlay(wtlPct);

    // Hangup countdown
    if (state.hangingUp) {
      UI.setText('val-wtl', '⚠️ ' + state.hangupCountdown.toFixed(1) + 's');
    }

    // Pass 2 hold timer
    if (state.queuePass === 2 && state.pass2HoldTimer > 0) {
      const holdEl = document.getElementById('val-queue');
      if (holdEl) holdEl.textContent = '#' + state.queue + ' [HOLD: ' + state.pass2HoldTimer.toFixed(0) + '/' + Balance.PASS2.holdDuration + 's]';
    }

    // Dust display
    if (state.flags.dustStarted) {
      UI.show('res-dust');
      UI.setText('val-dust', NumberFormat.compact(state.dust));
      const dustRate = (state.dustPerSec + totalPPS() * Balance.DUST.ppsLinkFactor) * state.dustMultiplier;
      const drEl = document.getElementById('val-dust-rate');
      if (drEl) { drEl.textContent = '+' + dustRate.toFixed(1) + '/sec'; drEl.className = 'res-rate positive'; }
    }

    // PPS rate
    const pps = totalPPS() * state.combo;
    const ppsEl = document.getElementById('val-pps-rate');
    if (ppsEl) {
      if (pps > 0) {
        const display = pps < 10 ? pps.toFixed(1) : NumberFormat.compact(pps);
        let rateText = '+' + display + '/sec';
        if (state.flags.comboUnlocked && state.combo > 1.01) {
          rateText += ' (x' + state.combo.toFixed(1) + ')';
        }
        if (state.connectionBuffExpires && Date.now() < state.connectionBuffExpires) {
          const remaining = ((state.connectionBuffExpires - Date.now()) / 1000).toFixed(0);
          rateText += ' ⚡x' + Balance.CONNECTION.buffMultiplier + ' [' + remaining + 's]';
        }
        ppsEl.textContent = rateText;
        ppsEl.className = 'res-rate positive';
      } else { ppsEl.textContent = ''; }
    }

    // WtL rate
    const wtlEl = document.getElementById('val-wtl-rate');
    if (wtlEl) {
      const drain = getWtlDrain();
      if (drain > 0) {
        const net = Balance.WTL.passiveRegen - drain;
        wtlEl.textContent = net.toFixed(2) + '/sec';
        wtlEl.className = 'res-rate negative';
      } else { wtlEl.textContent = ''; }
    }

    // Phone bar time
    const phoneBar = document.getElementById('phone-bar');
    if (phoneBar) {
      const elapsed = phoneBar.querySelector('.elapsed');
      if (elapsed) {
        elapsed.textContent = state.queueAdvances === 0 ? NumberFormat.formatHoldTime(state.activePlayTime) : NumberFormat.formatHoldTime(getInGameTime());
      }
    }

    // Refill button
    const refillCost = getRefillCost();
    const refillBtn = document.getElementById('btn-refill');
    if (refillBtn) {
      if (state.wtl < Balance.WTL.max * 0.7) refillBtn.style.display = '';
      refillBtn.disabled = state.patience < refillCost;
      UI.setText('sub-refill', NumberFormat.compact(refillCost) + 'p → +' + Balance.WTL.refillAmount + ' WtL');
    }

    // Endure button
    const endureBtn = document.getElementById('btn-endure');
    if (endureBtn) {
      endureBtn.disabled = state.wtl < state.wtlPerClick;
      const cv = getClickValue();
      const wtlCostStr = state.wtlPerClick > 0 ? ' | -' + state.wtlPerClick.toFixed(1) + ' WtL' : '';
      UI.setText('sub-endure', '+' + NumberFormat.compact(cv) + wtlCostStr);
    }

    // Generators
    Phase1.generators.forEach(g => {
      const div = document.getElementById('gbtn-' + g.id);
      if (!div) return;
      if (!g.unlocked && state.maxPatience >= g.unlocksAt) {
        g.unlocked = true;
        div.style.display = '';
        UI.addLog('New: ' + g.name);
        console.log('[METRICS] GENERATOR UNLOCKED: "' + g.name + '" at ' + mins() + ' | active:' + (state.activePlayTime / 60).toFixed(1) + 'm | maxP:' + Math.floor(state.maxPatience) + ' | pps:' + totalPPS().toFixed(1));
      }
      if (g.unlocked) {
        const cost = Phase1.getGeneratorCost(g);
        const milestoneMult = Phase1.getMilestoneMultiplier(g.owned);
        const ppsEach = (g.baseProduction * (state.genMultipliers[g.id] || 1) * state.globalGenMultiplier * milestoneMult * Phase1.getNestedBoost(g.id)).toFixed(1);
        const milestoneTag = milestoneMult > 1 ? ' [x' + milestoneMult + ']' : '';
        div.className = 'gen-item' + (state.patience < cost ? ' disabled' : '');
        div.innerHTML = '<div class="gi-info"><span class="gi-name">' + g.name + ' (' + g.owned + ')' + milestoneTag + '</span><span class="gi-desc">+' + ppsEach + '/sec each</span></div><span class="gi-cost">' + NumberFormat.compact(cost) + '</span>';
      }
    });

    // Upgrades
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
          console.log('[METRICS] UPGRADE AVAILABLE: "' + u.name + '" at ' + mins() + ' | active:' + (state.activePlayTime / 60).toFixed(1) + 'm | queue:#' + state.queue + ' | pps:' + totalPPS().toFixed(1) + ' | maxP:' + Math.floor(state.maxPatience));
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
      triggeredGenMilestones: Array.from(state.triggeredGenMilestones),
      generators: Phase1.generators.map(g => ({ id: g.id, owned: g.owned, unlocked: g.unlocked })),
      boughtCollectors: Dust.collectors.filter(c => c.bought).map(c => c.id),
    };
  }

  return { init, state, getState, totalPPS, getInGameTime, getRefillCost, getWtlState, pauseGame, resumeGame };
})();

document.addEventListener('DOMContentLoaded', Game.init);
