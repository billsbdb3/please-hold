/**
 * Save/Load system using localStorage.
 * Auto-saves every 30 seconds.
 * Handles offline progression on load.
 */
const Save = (function() {
  const SAVE_KEY = 'pleaseHold_save';
  const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
  const MAX_OFFLINE_HOURS = 24;

  let autoSaveTimer = null;

  function save(state) {
    const data = {
      version: 1,
      timestamp: Date.now(),
      state: state
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Save failed:', e);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.state) return null;

      // Calculate offline time
      const offlineMs = Date.now() - data.timestamp;
      const offlineSec = Math.min(offlineMs / 1000, MAX_OFFLINE_HOURS * 3600);
      data.offlineSeconds = Math.max(0, offlineSec);

      return data;
    } catch (e) {
      console.warn('Load failed:', e);
      return null;
    }
  }

  function clear() {
    localStorage.removeItem(SAVE_KEY);
  }

  function startAutoSave(getStateFn) {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(() => {
      save(getStateFn());
    }, AUTO_SAVE_INTERVAL);
  }

  function stopAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }

  return { save, load, clear, startAutoSave, stopAutoSave };
})();
