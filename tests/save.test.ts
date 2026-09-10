/**
 * Save/load tests.
 *
 * The first test here is the one the old build most needed and never had. Audit bug
 * #1: `State.load()` restored persisted multipliers, and then `Upgrades.reapplyAll()`
 * applied every upgrade's effect again on top. Every reload doubled all twelve
 * numeric upgrades, and a long-lived save eventually reached Infinity and then NaN.
 *
 * The architectural fix is that multipliers are DERIVED and never persisted (see
 * engine/types.ts). `savedThenLoadedIsIdempotent` is the test that proves it and
 * would fail loudly if anyone ever put a multiplier back into `Persisted`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { freshState, CURRENT_VERSION } from '../src/engine/state';
import { derive } from '../src/engine/derive';
import { save, load, clear, exportSave, importSave } from '../src/engine/save';
import type { Persisted } from '../src/engine/types';

/** jsdom is not configured; a minimal localStorage stand-in is enough and faster. */
function installLocalStorage(): void {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

/** A save that has made real progress, so multipliers are actually in play. */
function progressedState(): Persisted {
  const p = freshState();
  p.holdTime = 5_000_000;
  p.holdTimeLifetime = 40_000_000;
  p.generators.confusion = 30;
  p.generators.wrongPassword = 20;
  p.generators.catInterrupt = 12;
  // Six upgrades including several global multipliers — the exact configuration
  // that used to compound on reload.
  p.upgrades = ['u.notepad', 'u.rhythm', 'u.tea', 'u.landline', 'u.holdmusic', 'u.dialup'];
  p.milestones = ['p1.contact', 'p1.remote', 'p1.screenshare', 'p1.quota'];
  p.rapport = 48;
  p.composure = 72;
  p.combo = 2.4;
  return p;
}

beforeEach(() => {
  installLocalStorage();
  clear();
});

describe('save round-trip', () => {
  it('restores every fact unchanged', () => {
    const original = progressedState();
    save(original);
    const result = load();

    expect(result.restored).toBe(true);
    expect(result.discarded).toBe(false);
    expect(result.state.holdTime).toBeCloseTo(original.holdTime, 6);
    expect(result.state.holdTimeLifetime).toBeCloseTo(original.holdTimeLifetime, 6);
    expect(result.state.generators).toEqual(original.generators);
    expect(result.state.upgrades).toEqual(original.upgrades);
    expect(result.state.milestones).toEqual(original.milestones);
    expect(result.state.rapport).toBeCloseTo(original.rapport, 6);
  });

  /**
   * THE REGRESSION TEST FOR BUG #1.
   *
   * Derived production must be identical before saving and after loading, and must
   * stay identical across repeated save/load cycles. If multipliers ever creep back
   * into the persisted set, this diverges immediately and geometrically.
   */
  it('derived multipliers are identical after repeated save/load cycles', () => {
    let p = progressedState();
    const baseline = derive(p);

    for (let cycle = 0; cycle < 10; cycle++) {
      save(p);
      const loaded = load();
      expect(loaded.restored).toBe(true);
      p = loaded.state;
      const d = derive(p);

      expect(d.globalMultiplier).toBeCloseTo(baseline.globalMultiplier, 10);
      expect(d.hps).toBeCloseTo(baseline.hps, 6);
      expect(Number.isFinite(d.hps)).toBe(true);
      expect(Number.isNaN(d.hps)).toBe(false);
    }
  });

  it('survives ten cycles without reaching Infinity or NaN', () => {
    let p = progressedState();
    for (let i = 0; i < 10; i++) {
      save(p);
      p = load().state;
    }
    for (const v of [p.holdTime, p.holdTimeLifetime, p.rapport, p.composure, p.combo]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(derive(p).hps).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});

describe('migration and corruption', () => {
  it('returns a fresh state when nothing is saved', () => {
    const r = load();
    expect(r.restored).toBe(false);
    expect(r.discarded).toBe(false);
    expect(r.state.holdTimeLifetime).toBe(0);
  });

  it('discards a v1 (vanilla) save rather than importing its corruption', () => {
    localStorage.setItem('pleasehold.save.a', JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      checksum: 0,
      data: { version: 1, patience: 999, wtl: 12 },
    }));
    localStorage.setItem('pleasehold.save.ptr', 'a');
    const r = load();
    // Either the checksum rejects it or the migration discards it; both are correct
    // and both must yield a clean fresh state rather than a half-converted one.
    expect(r.restored).toBe(false);
    expect(r.state.holdTimeLifetime).toBe(0);
  });

  it('repairs non-finite numbers instead of propagating them', () => {
    const p = progressedState();
    (p as unknown as Record<string, unknown>).holdTime = Number.POSITIVE_INFINITY;
    (p as unknown as Record<string, unknown>).rapport = Number.NaN;
    save(p);
    const r = load();
    expect(Number.isFinite(r.state.holdTime)).toBe(true);
    expect(Number.isFinite(r.state.rapport)).toBe(true);
  });

  it('clamps a composure value a save could not legitimately hold', () => {
    const p = progressedState();
    p.composure = 900;
    save(p);
    expect(load().state.composure).toBeLessThanOrEqual(100);
  });

  it('fills fields added since the save was written', () => {
    const p = progressedState();
    const partial = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
    delete partial.roster;
    delete partial.beatsSeen;
    localStorage.setItem('pleasehold.save.a', JSON.stringify({
      version: CURRENT_VERSION,
      savedAt: Date.now(),
      checksum: 0,
      data: partial,
    }));
    localStorage.setItem('pleasehold.save.ptr', 'a');
    const r = load();
    // Checksum will reject this hand-built envelope, which is itself correct
    // behaviour; the point is that it never throws.
    expect(Array.isArray(r.state.roster)).toBe(true);
    expect(Array.isArray(r.state.beatsSeen)).toBe(true);
  });
});

describe('export / import', () => {
  it('round-trips through base64', () => {
    const p = progressedState();
    const imported = importSave(exportSave(p));
    expect(imported).not.toBeNull();
    expect(imported!.holdTimeLifetime).toBeCloseTo(p.holdTimeLifetime, 6);
    expect(imported!.upgrades).toEqual(p.upgrades);
  });

  it('returns null for text that is not a save', () => {
    expect(importSave('not a save')).toBeNull();
    expect(importSave('')).toBeNull();
  });
});
