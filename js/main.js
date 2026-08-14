/**
 * PLEASE HOLD - Main Game Loop (v6)
 * 
 * ORCHESTRATION ONLY. No game logic here.
 * Calls into modules, handles timing, and wires up events.
 */
const Game = (function() {
  let lastTick = 0;
  let paused = false;

  // === EFFECTIVE PPS (computed each frame, shared across modules) ===
  function getEffectivePPS() {
    const s = State.get();
    const now = Date.now();
    let pps = Generators.getBasePPS();
    // Phone bonus
    const phoneBonus = Phone.getBonus();
    pps *= (1 + phoneBonus.prod);
    // Dust degradation (the threat!)
    pps *= (1 - Dust.getDegradation());
    // WtL gen multiplier
    pps *= Wtl.getState().genMult;
    // Connection buff
    pps *= Events.getConnectionMult(now);
    return pps;
  }

  // === PAUSE / RESUME ===
  function pause() { paused = true; }
  function resume() { paused = false; lastTick = Date.now(); }
  function isPaused() { return paused; }

  // === INITIALIZATION ===
  function init() {
    if (State.load()) {
      // Restore from save
      Upgrades.reapplyAll();
      document.getElementById('pre-call').style.display = 'none';
      document.getElementById('game-area').style.display = 'flex';
      UI.buildGameUI();
      wireEvents();
      UI.addLog('Game restored. Welcome back.');
      State.get().lastInteractionTime = Date.now();
      lastTick = Date.now();
      State.startAutoSave();
      requestAnimationFrame(tick);
    } else {
      document.getElementById('call-btn').onclick = startGame;
    }
  }

  function startGame() {
    const s = State.get();
    s.flags.started = true;
    s.realStartTime = Date.now();
    s.lastInteractionTime = Date.now();
    s.nextConnectionTime = Date.now() + (Balance.CONNECTION.minInterval * 1000);
    lastTick = Date.now();

    document.getElementById('pre-call').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    UI.buildGameUI();
    wireEvents();

    UI.addLog('You dial Meridian Solutions Inc.');
    UI.addLog('"All representatives are currently busy."');
    UI.addLog('"Please hold."');

    State.startAutoSave();
    requestAnimationFrame(tick);
  }

  // === WIRE DOM EVENTS ===
  function wireEvents() {
    document.getElementById('btn-endure').onclick = onEndure;
    document.getElementById('btn-refill').onclick = onRefill;
    document.getElementById('btn-connection').onclick = onConnection;

    // Generator buy handlers
    Generators.getDefs().forEach(def => {
      const div = document.getElementById('gbtn-' + def.id);
      if (div) div.onclick = () => onBuyGenerator(def.id);
    });

    // Upgrade buy handlers
    Upgrades.getDefs().forEach(u => {
      const div = document.getElementById('ubtn-' + u.id);
      if (div) div.onclick = () => onBuyUpgrade(u.id);
    });

    // Collector buy handlers
    Dust.getCollectors().forEach(c => {
      const div = document.getElementById('dcbtn-' + c.id);
      if (div) div.onclick = () => onBuyCollector(c.id);
    });

    // Interaction tracking
    document.addEventListener('mousemove', registerInteraction);
    document.addEventListener('keypress', registerInteraction);
    document.addEventListener('touchstart', registerInteraction);
  }

  function registerInteraction() {
    const s = State.get();
    s.lastInteractionTime = Date.now();
    if (s.isIdle) s.isIdle = false;
  }

  // === PLAYER ACTIONS ===
  function onEndure() {
    if (paused) return;
    const result = Click.doClick(getEffectivePPS(), Date.now());
    if (!result) return;
    registerInteraction();
  }

  function onRefill() {
    if (paused) return;
    registerInteraction();
    const s = State.get();
    const ePPS = getEffectivePPS() * s.combo;
    const before = s.wtl;
    if (Wtl.doRefill(ePPS)) {
      Log.event('deep_breath', { cost: Wtl.getRefillCost(ePPS), before, after: s.wtl, pps: ePPS });
    }
  }

  function onConnection() {
    if (paused) return;
    registerInteraction();
    if (Events.claimConnection()) {
      UI.addLog('📞 Signal boost! Production x' + Balance.CONNECTION.buffMultiplier + ' for ' + Balance.CONNECTION.buffDuration + 's', 'event');
      Log.event('connection_claim', { pps: getEffectivePPS() });
    }
  }

  function onBuyGenerator(id) {
    if (paused) return;
    registerInteraction();
    const ppsBefore = getEffectivePPS();
    if (!Generators.buy(id)) return;

    const def = Generators.getDefs().find(d => d.id === id);
    const s = State.get();
    UI.flashGenerator(id);
    Log.event('generator_buy', { name: def.name, owned: s.generators[id].owned, cost: Generators.getCost(id), pps: getEffectivePPS() });

    // Check milestones
    const milestones = Generators.checkMilestones();
    milestones.forEach(m => {
      const ppsAfter = getEffectivePPS();
      UI.addLog('★ ' + m.name + ' milestone! (x' + m.totalMult + ')', 'event');
      pause();
      UI.showModal(m.name + ' reached ' + m.owned + '! Production x' + m.totalMult, resume);
      Log.event('milestone', { name: m.name, mult: m.totalMult, ppsBefore, ppsAfter });
    });
  }

  function onBuyUpgrade(id) {
    if (paused) return;
    registerInteraction();
    const u = Upgrades.getById(id);
    if (!u) return;
    if (!Upgrades.buy(id)) return;

    const s = State.get();
    UI.addLog('★ ' + u.name, 'event');
    Log.event('upgrade', { name: u.name, pps: getEffectivePPS(), queue: s.queue });

    if (u.narrative) {
      pause();
      UI.showModal(u.narrative, resume);
    }

    // Check phase 1 completion after every upgrade purchase
    if (Queue.isPhase1Complete()) endPhase1();
  }

  function onBuyCollector(id) {
    if (paused) return;
    registerInteraction();
    if (!Dust.buyCollector(id)) return;

    const s = State.get();
    const c = Dust.getCollectors().find(x => x.id === id);
    UI.addLog('🧹 ' + c.name, 'event');
    Log.event('collector_buy', { name: c.name, cost: c.cost, dustAfter: s.dust, count: s.collectorsOwned.length, threshold: Dust.getThreshold() });

    // Check phase 1 completion after every collector purchase
    if (Queue.isPhase1Complete()) endPhase1();
  }

  // === PHASE TRANSITION ===
  function endPhase1() {
    pause();
    const s = State.get();
    Log.event('phase1_complete', { clicks: s.totalClicks, pps: getEffectivePPS(), dust: s.dust });

    UI.showTransition(
      'SOMEONE PICKS UP.',
      [
        '"Thank you for calling Meridian Solutions."',
        '"We\'ve been trying to reach you about your car\'s extended warranty."',
        '',
        'You have been on hold for ' + NumberFormat.formatHoldTime(Queue.getInGameTime()) + '.',
        'For $1.47.',
        '',
        'The dust settles. For a moment.',
      ],
      '[ No. I want my goddamn $1.47. ]',
      () => {
        UI.addLog('You refuse to hang up. Phase 2 begins.');
        // Phase 2 setup will go here
      }
    );
  }

  // === HANGUP ===
  function doHangup() {
    pause();
    const s = State.get();
    s.hangups++;
    const penalty = Queue.applyHangupPenalty();
    Log.event('hangup', { queue: s.queue - penalty, penalty, newQueue: s.queue });

    UI.showHangup(
      typeof Flavor !== 'undefined' ? Flavor.getHangup() : 'You hung up.',
      () => {
        UI.addLog('Redial. Queue: #' + s.queue + '. Dignity: gone.');
        resume();
      }
    );
  }

  // === GAME LOOP ===
  function tick() {
    const s = State.get();
    if (!s.flags.started) return;
    const now = Date.now();

    // Paused: keep looping but don't advance
    if (paused || UI.isModalShowing()) {
      lastTick = now;
      requestAnimationFrame(tick);
      return;
    }

    let dt = Math.min((now - lastTick) / 1000, 1.0);
    lastTick = now;
    s.realElapsed = (now - s.realStartTime) / 1000;

    // Idle detection
    if (now - s.lastInteractionTime > Balance.IDLE.threshold) {
      if (!s.isIdle) { s.isIdle = true; s.idleStartTime = now; }
    }
    if (!s.isIdle) s.activePlayTime += dt;

    // Welcome back from idle
    if (s.isIdle && now - s.lastInteractionTime < Balance.IDLE.threshold) {
      s.isIdle = false;
      const idleDur = Math.min(86400, (now - (s.idleStartTime || now)) / 1000);
      if (idleDur > Balance.IDLE.welcomeBackMinDuration) {
        const earned = Math.floor(getEffectivePPS() * idleDur * Balance.IDLE.welcomeBackRate);
        s.patience += earned;
        s.maxPatience += earned;
        s.wtl = Balance.WTL.max;
        UI.addLog('Welcome back. +' + NumberFormat.format(earned) + ' patience.');
      }
    }

    if (s.isIdle) { requestAnimationFrame(tick); return; }

    // --- SYSTEMS TICK ---
    const effectivePPS = getEffectivePPS();

    // Combo decay
    Click.decayCombo(dt, now);

    // WtL drain + regen
    const wtlTransition = Wtl.tick(dt);
    if (wtlTransition) {
      Log.event('wtl_state', { from: s._lastWtlState || 'Calm', to: wtlTransition, wtl: s.wtl, drain: Wtl.getDrain() });
      s._lastWtlState = wtlTransition;
    } else if (!s._lastWtlState) {
      s._lastWtlState = Wtl.getState().name;
    }

    // WtL drain announcement
    if (!s.flags.drainAnnounced && Wtl.getDrain() > 0) {
      s.flags.drainAnnounced = true;
      UI.addLog('The hold music is getting to you. Your will to live... slips.');
    }

    // Hangup check
    const hangupResult = Wtl.checkHangup(dt);
    if (hangupResult === 'hangup') { doHangup(); return; }

    // Production
    const earned = effectivePPS * s.combo * dt;
    s.patience += earned;
    s.maxPatience += earned;

    // Dust accumulation
    Dust.accumulate(dt);

    // Queue advance
    const qResult = Queue.tick(effectivePPS, dt);
    if (qResult.advanced) {
      // Phone tier check
      const newTier = Phone.checkTier();
      if (newTier) {
        UI.updatePhoneBar(newTier);
        UI.addLog('Connection upgrade: ' + newTier.name, 'event');
        Log.event('phone_upgrade', newTier);
      }

      // Queue reveal
      if (Queue.checkReveal()) {
        UI.addLog('"Your queue position is: ' + s.queue + '."');
      }

      // Queue milestones
      const milestone = Events.checkQueueMilestone();
      if (milestone) {
        pause();
        UI.showModal(milestone, resume);
      }

      // Log advance
      Log.event('queue_advance', { position: s.queue, cost: Queue.getCost(), pps: effectivePPS, holdTime: NumberFormat.formatHoldTime(Queue.getInGameTime()) });

      // Department transfer
      if (qResult.transferred) {
        pause();
        UI.showModal('"Thank you for holding. I\'m transferring you to our Specialist Department."<br><br><em>*click*</em><br><br>"Please continue to hold."', resume);
        UI.addLog('TRANSFERRED. The hold music changes.');
        Log.event('transfer', { pps: effectivePPS });
      }

      // Phase 1 completion (queue hit 0 on pass 2)
      if (qResult.completed) { endPhase1(); return; }
    }

    // Generator unlocks
    const unlocked = Generators.checkUnlocks();
    unlocked.forEach(id => {
      const def = Generators.getDefs().find(d => d.id === id);
      UI.addLog('New: ' + def.name);
      Log.event('generator_unlock', { name: def.name, maxP: s.maxPatience });
    });

    // Connection events
    const connResult = Events.checkConnection(now);
    if (connResult === 'appear') {
      UI.addLog('📞 Signal detected! Click to boost!');
    }

    // Periodic logging
    if (s.activePlayTime - s._lastLogTime >= Balance.LOG.periodicInterval) {
      s._lastLogTime = s.activePlayTime;
      Log.periodic(effectivePPS);
    }

    // Render UI
    UI.render(effectivePPS);

    requestAnimationFrame(tick);
  }

  return { init, pause, resume, isPaused, getEffectivePPS };
})();

document.addEventListener('DOMContentLoaded', Game.init);
