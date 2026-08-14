/**
 * PLEASE HOLD - UI Module (v6)
 * 
 * ALL DOM manipulation lives here. No other module touches the DOM.
 * Renders state, handles animations, modals, and log output.
 */
const UI = (function() {
  let logEl = null;
  let modalQueue = [];
  let modalShowing = false;

  // === INITIALIZATION ===

  function buildGameUI() {
    const phone = Phone.getCurrentTier();
    document.getElementById('phone-bar').innerHTML =
      `<span class="phone-icon">${phone.emoji}</span><span class="phone-name">${phone.name}</span><span class="elapsed">0:00</span>`;

    document.getElementById('panel-left').innerHTML = `
      <div class="res-block"><span class="res-label">PATIENCE</span><div class="res-value patience" id="val-patience">0</div><span class="res-rate" id="val-pps-rate"></span></div>
      <div class="res-block"><span class="res-label">WILL TO LIVE</span><div class="res-value wtl" id="val-wtl">${Balance.WTL.max}/${Balance.WTL.max}</div><div class="bar-container"><div class="bar bar-wtl" id="bar-wtl"></div></div><span class="res-rate" id="val-wtl-rate"></span><div class="wtl-state" id="val-wtl-state"></div></div>
      <div class="res-block" id="res-dust" style="display:none"><span class="res-label">DUST</span><div class="res-value dust" id="val-dust">0</div><span class="res-rate" id="val-dust-rate"></span><div class="dust-degrade" id="val-dust-degrade"></div></div>
      <div class="res-block" id="queue-block"><span class="res-label" id="queue-label">ON HOLD</span><div class="res-value queue" id="val-queue">...</div><div class="bar-container bar-container-queue"><div class="bar bar-queue" id="bar-queue"></div></div></div>
      <div id="actions">
        <button id="btn-endure" class="btn btn-primary">ENDURE<span class="btn-sub" id="sub-endure">+1</span></button>
      </div>
      <div id="actions-secondary">
        <button id="btn-refill" class="btn btn-secondary" style="display:none">Deep Breath<span class="btn-sub" id="sub-refill"></span></button>
      </div>
    `;

    // Center panel: generators
    const genList = document.getElementById('gen-list');
    genList.innerHTML = '';
    Generators.getDefs().forEach(def => {
      const div = document.createElement('div');
      div.className = 'gen-item';
      div.id = 'gbtn-' + def.id;
      div.style.display = State.get().generators[def.id].unlocked ? '' : 'none';
      genList.appendChild(div);
    });

    // Right panel: upgrades + collectors
    const upList = document.getElementById('upgrade-list');
    upList.innerHTML = '';
    Upgrades.getDefs().forEach(u => {
      const div = document.createElement('div');
      div.className = 'upgrade-item';
      div.id = 'ubtn-' + u.id;
      div.style.display = 'none';
      upList.appendChild(div);
    });

    // Dust collectors (initially hidden)
    const dustList = document.getElementById('dust-list');
    if (dustList) {
      dustList.innerHTML = '';
      Dust.getCollectors().forEach(c => {
        const div = document.createElement('div');
        div.className = 'dust-item';
        div.id = 'dcbtn-' + c.id;
        div.style.display = 'none';
        dustList.appendChild(div);
      });
    }

    logEl = document.getElementById('log');
  }

  // === RENDER (called every frame) ===

  function render(effectivePPS) {
    const s = State.get();
    const now = Date.now();

    // Patience
    setText('val-patience', NumberFormat.format(s.patience));

    // PPS rate
    const ppsDisplay = effectivePPS * s.combo;
    const ppsEl = document.getElementById('val-pps-rate');
    if (ppsEl) {
      if (ppsDisplay > 0) {
        let txt = '+' + (ppsDisplay < 10 ? ppsDisplay.toFixed(1) : NumberFormat.compact(ppsDisplay)) + '/sec';
        if (s.flags.comboUnlocked && s.combo > 1.01) txt += ' (x' + s.combo.toFixed(1) + ')';
        const buffRemaining = Events.getBuffRemaining(now);
        if (buffRemaining > 0) txt += ' ⚡x' + Balance.CONNECTION.buffMultiplier + ' [' + buffRemaining.toFixed(0) + 's]';
        ppsEl.textContent = txt;
        ppsEl.className = 'res-rate positive';
      } else {
        ppsEl.textContent = '';
      }
    }

    // WtL
    const wtlState = Wtl.getState();
    setText('val-wtl', Math.round(s.wtl) + '/' + Balance.WTL.max);
    setWidth('bar-wtl', Wtl.getPercent());

    // WtL state display
    const wtlStateEl = document.getElementById('val-wtl-state');
    if (wtlStateEl) {
      if (s.hangingUp) {
        wtlStateEl.textContent = '⚠ HANGING UP: ' + s.hangupCountdown.toFixed(1) + 's';
        wtlStateEl.className = 'wtl-state critical';
      } else if (wtlState.name !== 'Calm') {
        wtlStateEl.textContent = wtlState.name;
        wtlStateEl.className = 'wtl-state ' + (wtlState.name === 'Breaking Point' ? 'danger' : wtlState.name === 'Furious' ? 'warning' : '');
      } else {
        wtlStateEl.textContent = '';
        wtlStateEl.className = 'wtl-state';
      }
    }

    // WtL rate
    const wtlRateEl = document.getElementById('val-wtl-rate');
    if (wtlRateEl) {
      const drain = Wtl.getDrain();
      if (drain > 0) {
        const net = Balance.WTL.passiveRegen - drain;
        wtlRateEl.textContent = net.toFixed(2) + '/sec';
        wtlRateEl.className = 'res-rate negative';
      } else {
        wtlRateEl.textContent = '';
      }
    }

    // WtL panel class for visual state
    const panelLeft = document.getElementById('panel-left');
    if (panelLeft) {
      panelLeft.classList.remove('wtl-frustrated', 'wtl-furious', 'wtl-breaking', 'wtl-hangingup');
      if (wtlState.name === 'Frustrated') panelLeft.classList.add('wtl-frustrated');
      else if (wtlState.name === 'Furious') panelLeft.classList.add('wtl-furious');
      else if (wtlState.name === 'Breaking Point') panelLeft.classList.add('wtl-breaking');
      else if (wtlState.name === 'Hanging Up') panelLeft.classList.add('wtl-hangingup');
    }

    // Dust
    if (s.flags.dustStarted) {
      show('res-dust');
      setText('val-dust', NumberFormat.compact(s.dust));
      const dustRate = Dust.getRate();
      const dustRateEl = document.getElementById('val-dust-rate');
      if (dustRateEl) {
        dustRateEl.textContent = '+' + dustRate.toFixed(1) + '/sec';
        dustRateEl.className = 'res-rate negative'; // dust is bad!
      }
      const degradeEl = document.getElementById('val-dust-degrade');
      if (degradeEl) {
        const deg = Dust.getDegradation();
        if (deg > 0.01) {
          degradeEl.textContent = '-' + (deg * 100).toFixed(0) + '% production';
          degradeEl.className = 'dust-degrade active';
        } else {
          degradeEl.textContent = '';
        }
      }
      // Show dust section in right panel
      const dustSection = document.getElementById('dust-section');
      if (dustSection) dustSection.style.display = '';
    }

    // Queue
    if (s.queueRevealed) {
      setText('queue-label', s.queuePass === 2 ? 'QUEUE (TRANSFER)' : 'QUEUE');
      setText('val-queue', '#' + s.queue);
    } else {
      setText('queue-label', 'ON HOLD');
      setText('val-queue', '...');
    }
    setWidth('bar-queue', Queue.getBarPercent());

    // Phone bar
    const phoneBar = document.getElementById('phone-bar');
    if (phoneBar) {
      const elapsed = phoneBar.querySelector('.elapsed');
      if (elapsed) {
        elapsed.textContent = s.queueAdvances === 0
          ? NumberFormat.formatHoldTime(s.activePlayTime)
          : NumberFormat.formatHoldTime(Queue.getInGameTime());
      }
    }

    // Connection buff glow
    const container = document.getElementById('game-container');
    if (container) {
      if (Events.getBuffRemaining(now) > 0) container.classList.add('buff-active');
      else container.classList.remove('buff-active');
    }

    // Endure button
    const endureBtn = document.getElementById('btn-endure');
    if (endureBtn) {
      const cv = Click.getValue(effectivePPS);
      const wtlCostStr = s.wtlPerClick > 0 ? ' | -' + s.wtlPerClick.toFixed(1) + ' WtL' : '';
      setTextInner('sub-endure', '+' + NumberFormat.compact(cv) + wtlCostStr);
    }

    // Deep Breath button (shows whenever WtL drops below 80%)
    const refillBtn = document.getElementById('btn-refill');
    if (refillBtn) {
      if (s.wtl < Balance.WTL.max * 0.8) {
        refillBtn.style.display = '';
        const cost = Wtl.getRefillCost(effectivePPS);
        refillBtn.disabled = s.patience < cost;
        setTextInner('sub-refill', NumberFormat.compact(cost) + 'p → +' + Balance.WTL.refillAmount + ' WtL');
      }
    }

    // Connection button (prominent, above panels)
    const connDiv = document.getElementById('connection-event');
    if (connDiv) {
      connDiv.style.display = s.connectionActive ? '' : 'none';
    }

    // Generators
    renderGenerators(effectivePPS);

    // Upgrades
    renderUpgrades(effectivePPS);

    // Dust collectors
    renderCollectors();

    // Dust overlay
    setDustOverlay(Dust.getOverlayOpacity());

    // Flavor text
    renderFlavor(now);
  }

  function renderGenerators(effectivePPS) {
    const s = State.get();
    Generators.getDefs().forEach(def => {
      const div = document.getElementById('gbtn-' + def.id);
      if (!div) return;
      const gen = s.generators[def.id];
      if (!gen.unlocked) { div.style.display = 'none'; return; }
      div.style.display = '';

      const cost = Generators.getCost(def.id);
      const perUnit = Generators.getPerUnitPPS(def.id);
      const milestoneMult = Generators.getMilestoneMult(def.id);
      const milestoneTag = milestoneMult > 1 ? ' [x' + milestoneMult + ']' : '';
      const degradation = Dust.getDegradation();
      const adjustedPerUnit = perUnit * (1 - degradation);

      div.className = 'gen-item' + (s.patience < cost ? ' disabled' : '');
      div.innerHTML = '<div class="gi-info"><span class="gi-name">' + def.name + ' (' + gen.owned + ')' + milestoneTag + '</span><span class="gi-desc">+' + adjustedPerUnit.toFixed(1) + '/sec each</span></div><span class="gi-cost">' + NumberFormat.compact(cost) + '</span>';
    });
  }

  function renderUpgrades(effectivePPS) {
    const s = State.get();
    Upgrades.getDefs().forEach(u => {
      const div = document.getElementById('ubtn-' + u.id);
      if (!div) return;
      if (s.boughtUpgrades.includes(u.id)) {
        if (!div.classList.contains('owned')) {
          div.className = 'upgrade-item owned';
          div.innerHTML = '<span class="ui-name">' + u.name + ' ✓</span>';
          div.onclick = null;
        }
        return;
      }
      // Check visibility
      const visible = isUpgradeVisible(u, s);
      div.style.display = visible ? '' : 'none';
      if (!visible) return;

      div.className = 'upgrade-item' + (s.patience < u.cost ? ' disabled' : '');
      div.innerHTML = '<div class="ui-info"><span class="ui-name">' + u.name + '</span><span class="ui-desc">' + u.desc + '</span></div><span class="ui-cost">' + NumberFormat.compact(u.cost) + '</span>';
    });
  }

  function isUpgradeVisible(u, s) {
    if (u.revealAt && s.maxPatience < u.revealAt) return false;
    if (u.revealAtQueue && s.queue > u.revealAtQueue) return false;
    if (u.revealAtActiveTime && s.activePlayTime < u.revealAtActiveTime) return false;
    return true;
  }

  function renderCollectors() {
    const s = State.get();
    if (!s.flags.dustStarted) return;

    Dust.getCollectors().forEach(c => {
      const div = document.getElementById('dcbtn-' + c.id);
      if (!div) return;

      if (Dust.isCollectorOwned(c.id)) {
        if (!div.classList.contains('owned')) {
          div.className = 'dust-item owned';
          div.innerHTML = '<span class="di-name">' + c.name + ' ✓</span>';
          div.onclick = null;
        }
        div.style.display = '';
        return;
      }

      // Show if affordable or within 5x of cost (so player can see what's coming)
      const showThreshold = c.cost * 0.2;
      if (s.dust >= showThreshold || s.collectorsOwned.length >= Dust.getCollectors().indexOf(c)) {
        div.style.display = '';
        div.className = 'dust-item' + (s.dust < c.cost ? ' disabled' : '');
        div.innerHTML = '<div><span class="di-name">' + c.name + '</span><span class="di-desc">' + c.desc + '</span></div><span class="di-cost">' + NumberFormat.compact(c.cost) + ' dust</span>';
      } else {
        div.style.display = 'none';
      }
    });
  }

  function renderFlavor(now) {
    const s = State.get();
    if (now - s._lastFlavorTime > Balance.UI.flavorInterval) {
      s._lastFlavorTime = now;
      const flavorEl = document.getElementById('flavor-text');
      if (flavorEl && typeof Flavor !== 'undefined') {
        flavorEl.textContent = Flavor.getForPhase(s.phase);
      }
    }
  }

  // === MODAL SYSTEM (pauses game, queues multiple) ===

  function showModal(msg, callback) {
    modalQueue.push({ msg, callback });
    if (!modalShowing) showNextModal();
  }

  function showNextModal() {
    if (modalQueue.length === 0) { modalShowing = false; return; }
    modalShowing = true;
    const { msg, callback } = modalQueue.shift();

    let modal = document.getElementById('milestone-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'milestone-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="modal-inner">
        <p class="modal-star">★</p>
        <p class="modal-text">${msg}</p>
        <button class="modal-ok" id="modal-ok-btn">OK</button>
      </div>`;
    modal.style.display = 'flex';

    document.getElementById('modal-ok-btn').onclick = () => {
      modal.style.display = 'none';
      if (callback) callback();
      showNextModal();
    };
  }

  function isModalShowing() {
    return modalShowing;
  }

  // === TRANSITION SCREENS ===

  function showTransition(title, lines, btnText, onContinue) {
    const screen = document.getElementById('transition-screen');
    screen.innerHTML = '<h2>' + title + '</h2>' + lines.map(l => '<p>' + l + '</p>').join('') +
      '<button class="btn btn-call" id="transition-btn">' + btnText + '</button>';
    screen.style.display = 'block';
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('transition-btn').onclick = () => {
      screen.style.display = 'none';
      document.getElementById('game-area').style.display = 'flex';
      if (onContinue) onContinue();
    };
  }

  function showHangup(text, onRedial) {
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('hangup-scr').style.display = 'block';
    document.getElementById('hangup-txt').textContent = text;
    document.getElementById('redial-btn').onclick = () => {
      document.getElementById('hangup-scr').style.display = 'none';
      document.getElementById('game-area').style.display = 'flex';
      if (onRedial) onRedial();
    };
  }

  // === PHONE BAR UPDATE ===

  function updatePhoneBar(tier) {
    const icon = document.querySelector('#phone-bar .phone-icon');
    const name = document.querySelector('#phone-bar .phone-name');
    if (icon) icon.textContent = tier.emoji;
    if (name) name.textContent = tier.name;
  }

  // === GENERATOR PURCHASE FLASH ===

  function flashGenerator(id) {
    const div = document.getElementById('gbtn-' + id);
    if (div) {
      div.classList.add('just-bought');
      setTimeout(() => div.classList.remove('just-bought'), 400);
    }
  }

  // === LOG ===

  function addLog(msg, className) {
    if (!logEl) logEl = document.getElementById('log');
    if (!logEl) return;
    const p = document.createElement('p');
    p.textContent = msg;
    if (className) p.className = className;
    logEl.appendChild(p);
    // Scroll the output panel (parent has overflow-y: auto)
    const scrollable = logEl.parentElement;
    if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
    // Keep log trimmed
    while (logEl.children.length > 50) logEl.removeChild(logEl.firstChild);
  }

  // === UTILITIES ===

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setTextInner(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function show(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  }

  function hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function setDustOverlay(opacity) {
    const el = document.getElementById('dust-overlay');
    if (el) el.style.background = 'rgba(80,60,30,' + opacity.toFixed(3) + ')';
  }

  return {
    buildGameUI, render, showModal, isModalShowing,
    showTransition, showHangup, updatePhoneBar, flashGenerator,
    addLog, setText, setWidth, show, hide, setDustOverlay,
  };
})();
