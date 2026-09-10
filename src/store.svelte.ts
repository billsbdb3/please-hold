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
import { load, save, clear } from './engine/save';
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

const loop = new GameLoop<GameState>(game, {
  tick(s, dt) {
    tick(s, dt);

    saveAccumulator += dt;
    if (saveAccumulator >= SAVE.intervalSeconds) {
      saveAccumulator = 0;
      save(s.p);
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
  save(game.p);
}

/** Player interacted. Called from every input handler. */
export function interacted(): void {
  touch(game, Date.now());
}

/** Wipe and reload. Confirmed in the UI before this is reachable. */
export function hardReset(): void {
  loop.stop();
  clear();
  location.reload();
}

/** Save immediately — used on tab hide, so a closed laptop does not lose 20s. */
export function saveNow(): void {
  save(game.p);
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
}
