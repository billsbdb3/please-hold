/**
 * The bridge between the simulation and the UI.
 *
 * The loop owns the truth (see engine/loop.ts). Svelte must never own game state,
 * because component lifecycles would then be able to destroy or duplicate it, and a
 * six-hour session would accumulate whatever the framework failed to release.
 *
 * So the contract is one-way and deliberately narrow:
 *
 *   - `game` is a plain, non-reactive object the simulation mutates freely at 20 Hz.
 *   - `frame` is a single reactive counter, bumped at the UI refresh rate.
 *   - Components derive a SNAPSHOT off `frame`, never the live object.
 *
 * That last point is load-bearing and was originally wrong: deriving `game.p` directly
 * hands back the same mutated-in-place reference every frame, Svelte sees no change,
 * and the entire UI silently freezes. See engine/snapshot.ts for the full account.
 *
 * The counter is bumped at UI_HZ rather than once per animation frame. The simulation
 * ticks at 20 Hz and numbers on a screen do not need more than about 15 updates a
 * second to read as continuous, so this caps snapshot allocation and template
 * re-evaluation without any visible difference.
 */

import type { GameState } from './engine/types';
import { GameLoop } from './engine/loop';
import { freshTransient, pushLog } from './engine/log';
import { derive } from './engine/derive';
import { tick, updateIdle, applyOffline, touch } from './engine/sim';
import { load, save as saveToStorage, clear, exportSave, importSave } from './engine/save';
import { SAVE } from './data/balance';
import { fmt, fmtDuration } from './engine/numbers';

/** UI refresh rate. The sim is unaffected by this. */
const UI_HZ = 15;
const UI_INTERVAL_MS = 1000 / UI_HZ;

/** Reactive: bumped at UI_HZ. The UI's only subscription. */
export const frame = $state({ n: 0 });

/** Non-reactive authoritative state. */
export const game: GameState = (() => {
  const now = Date.now();
  const loaded = load();
  const s: GameState = {
    p: loaded.state,
    d: derive(loaded.state),
    t: freshTransient(now),
  };

  if (loaded.discarded) {
    pushLog(
      s,
      'A previous save was found and could not be read. It has been discarded. This is the correct outcome.',
      'system',
    );
  }

  if (loaded.restored) {
    const gained = applyOffline(s, loaded.offlineSeconds);
    if (gained > 0) {
      pushLog(
        s,
        `You were away for ${fmtDuration(loaded.offlineSeconds)}. He stayed on the line. ${fmt(gained)} seconds wasted in your absence.`,
        'system',
      );
    }
  } else if (!loaded.discarded) {
    pushLog(s, 'Dial tone.', 'system');
  }

  return s;
})();

let saveAccumulator = 0;
let lastUiPush = 0;
/**
 * Once set, ALL persistence is disabled for the rest of this page's life.
 *
 * Without this, a reset could not win: `hardReset` clears the keys, then `location.reload`
 * fires `beforeunload`, which calls `saveNow()` and writes the save straight back — so the
 * game returned every time. Stopping the loop was not enough, because the unload listeners
 * are independent of it. This flag is the authoritative off-switch: `save()` becomes a
 * no-op, so nothing can resurrect a wiped save between the clear and the reload.
 */
let persistenceDisabled = false;

/**
 * The single persistence gate. Every write in this module goes through here, so once a
 * reset flips `persistenceDisabled` no code path — the tick autosave, the unload handlers,
 * an import — can write to storage again for the life of this page. That is what makes a
 * wipe survive Safari serving the reloaded page from its bfcache with the old JS heap and
 * autosave interval still live.
 */
function persist(p: GameState['p']): void {
  if (persistenceDisabled) return;
  saveToStorage(p);
}

const loop = new GameLoop<GameState>(game, {
  tick(s, dt) {
    tick(s, dt);

    saveAccumulator += dt;
    if (saveAccumulator >= SAVE.intervalSeconds) {
      saveAccumulator = 0;
      persist(s.p);
    }
  },
  render(s) {
    updateIdle(s, Date.now());
    // Throttled to UI_HZ. The simulation already ran; this only decides how often the
    // screen is allowed to notice.
    const now = performance.now();
    if (now - lastUiPush >= UI_INTERVAL_MS) {
      lastUiPush = now;
      frame.n++;
    }
  },
});

export function startGame(): void {
  loop.start();
}

export function stopGame(): void {
  loop.stop();
  persist(game.p);
}

/** Player interacted. Called from every input handler. */
export function interacted(): void {
  touch(game, Date.now());
}

/** Wipe and reload. Confirmed in the UI before this is reachable. */
export function hardReset(): void {
  // Order matters and every step is load-bearing:
  //  1. disable persistence, so nothing between here and the reload can write back;
  //  2. stop the loop, so no more ticks accumulate toward an autosave;
  //  3. clear the keys;
  //  4. defeat the bfcache. A plain location.reload() in Safari can hand back the SAME
  //     page from its page cache — same JS heap, same autosave interval — which would
  //     resurrect the save. Navigating to a fresh URL forces a real rebuild.
  persistenceDisabled = true;
  loop.stop();
  clear();
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.set('fresh', String(Date.now()));
  location.replace(url.toString());
}

/**
 * Export the current save as a base64 string the player can keep somewhere. Saves first,
 * so what they copy is the live state and not a 20-second-stale autosave.
 */
export function exportCurrent(): string {
  persist(game.p);
  return exportSave(game.p);
}

/**
 * Import a base64 save string. Returns false if it is not a save; on success it persists
 * the imported state and reloads, so the whole game re-initialises from it cleanly rather
 * than trying to swap state into a running loop.
 */
export function importFromString(text: string): boolean {
  const imported = importSave(text);
  if (!imported) return false;
  // Write the imported save immediately and unconditionally (bypassing the gate is not
  // needed here — persistence is still enabled), then reload past the cache so the game
  // re-initialises from it cleanly rather than the old heap ignoring it.
  loop.stop();
  saveToStorage(imported);
  const url = new URL(location.href);
  url.searchParams.set('fresh', String(Date.now()));
  location.replace(url.toString());
  return true;
}

/** Save immediately — used on tab hide, so a closed laptop does not lose 20s. */
export function saveNow(): void {
  persist(game.p);
}

/** Diagnostic, surfaced in the debug pane. */
export function loopStats() {
  return { totalTicks: loop.totalTicks };
}

/**
 * Persist on the way out. `visibilitychange` fires reliably on mobile where
 * `beforeunload` does not, so both are wired.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('beforeunload', () => saveNow());

  // Safari restores pages from its back/forward cache with the JS heap intact. If this
  // page is served from that cache, its in-memory state is stale relative to storage that
  // may have been cleared elsewhere — force a genuine reload so load() runs again.
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) location.reload();
  });
}
