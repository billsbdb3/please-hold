/**
 * PLEASE HOLD - Game State (v6)
 * 
 * Single source of truth. All modules access state via State.get().
 * Handles serialization (save) and deserialization (load).
 * No game logic here — just data and persistence.
 */
const State = (function() {
  const SAVE_KEY = 'pleaseHold_save';

  function createFreshState() {
    return {
      // Core resources
      patience: 0,
      maxPatience: 0,
      dust: 0,
      wtl: Balance.WTL.max,

      // Queue
      queue: Balance.QUEUE.startPosition,
      queueProgress: 0,
      queueAdvances: 0,
      queuePass: 1,
      queueRevealed: false,
      queueSpeedMult: 1.0,
      queueCostMult: 1.0,

      // Click / Combo
      combo: 1,
      comboCapMax: Balance.CLICK.comboMaxBase,
      wtlPerClick: Balance.CLICK.wtlCost,
      clickValueMult: 1.0,
      totalClicks: 0,

      // Generators (owned counts stored here, defs in generators.js)
      generators: {
        doodle: { owned: 0, unlocked: true },
        fidget: { owned: 0, unlocked: false },
        autodialer: { owned: 0, unlocked: false },
        speeddialer: { owned: 0, unlocked: false },
        robocaller: { owned: 0, unlocked: false },
        callcenter: { owned: 0, unlocked: false },
      },
      genMultipliers: {
        doodle: 1, fidget: 1, autodialer: 1,
        speeddialer: 1, robocaller: 1, callcenter: 1,
      },
      globalGenMultiplier: 1,

      // Dust system
      dustPerSec: 0,
      dustMultiplier: 1,
      collectorsOwned: [],   // array of collector IDs purchased

      // Phone
      phoneTier: 0,

      // WtL
      hangupCountdown: 0,
      hangingUp: false,
      drainReduction: 0,     // from upgrades (Comfortable Chair, Emotional Callus)
      hangups: 0,

      // Upgrades
      boughtUpgrades: [],    // array of upgrade IDs

      // Events
      connectionBuffExpires: 0,
      nextConnectionTime: 0,
      connectionActive: false,

      // Time tracking
      phase: 1,
      realStartTime: 0,
      realElapsed: 0,
      activePlayTime: 0,
      lastInteractionTime: 0,
      isIdle: false,
      idleStartTime: 0,

      // Milestones / tracking
      triggeredMilestones: [],     // queue milestone positions triggered
      triggeredGenMilestones: [],  // generator milestone keys triggered

      // Flags (one-time unlocks / states)
      flags: {
        started: false,
        dustStarted: false,
        holdPressure: false,
        comboUnlocked: false,
        muscleMemory: false,
        emotionalCallus: false,
        deepBreathHalf: false,
        noWtlCost: false,
        drainAnnounced: false,
        chairBought: false,
      },

      // UI state (not saved but needed for display)
      paused: false,
      _lastWtlState: null,
      _lastEventTime: 0,
      _lastLogTime: 0,
      _lastComboClick: 0,
      _lastClickTime: 0,
      _lastFlavorTime: 0,
    };
  }

  // Active state reference
  let state = createFreshState();

  /** Get the current state object (mutable reference) */
  function get() {
    return state;
  }

  /** Reset to fresh state */
  function reset() {
    state = createFreshState();
  }

  /** Serialize state for saving (converts Sets/non-JSON to arrays) */
  function serialize() {
    return JSON.stringify({
      ...state,
      // Exclude transient UI state
      paused: undefined,
      _lastWtlState: undefined,
      _lastEventTime: undefined,
      _lastLogTime: undefined,
      _lastComboClick: undefined,
      _lastClickTime: undefined,
      _lastFlavorTime: undefined,
    });
  }

  /** Load and restore from localStorage */
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !saved.flags || !saved.flags.started) return false;

      // Merge saved data into fresh state (preserves new fields with defaults)
      const fresh = createFreshState();
      Object.keys(fresh).forEach(key => {
        if (key.startsWith('_') || key === 'paused') return; // skip transient
        if (saved.hasOwnProperty(key)) {
          if (typeof fresh[key] === 'object' && !Array.isArray(fresh[key]) && fresh[key] !== null) {
            // Merge objects (flags, generators, genMultipliers)
            fresh[key] = { ...fresh[key], ...saved[key] };
          } else {
            fresh[key] = saved[key];
          }
        }
      });
      state = fresh;
      return true;
    } catch (e) {
      console.error('[State] Load failed:', e);
      return false;
    }
  }

  /** Save to localStorage */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, serialize());
    } catch (e) {
      console.error('[State] Save failed:', e);
    }
  }

  /** Clear saved data */
  function clearSave() {
    localStorage.removeItem(SAVE_KEY);
  }

  /** Start auto-save interval */
  let saveInterval = null;
  function startAutoSave(intervalMs) {
    if (saveInterval) clearInterval(saveInterval);
    saveInterval = setInterval(save, intervalMs || 30000);
  }

  function stopAutoSave() {
    if (saveInterval) { clearInterval(saveInterval); saveInterval = null; }
  }

  return { get, reset, serialize, load, save, clearSave, startAutoSave, stopAutoSave };
})();
