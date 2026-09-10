/**
 * Audio tests — only what is testable headlessly.
 *
 * The node environment has no AudioContext and no Web Audio graph, so we deliberately do
 * NOT test sound output. We test the three things that are pure logic:
 *   1. mute / volume persistence round-trips through localStorage under pleasehold.audio.*;
 *   2. the rate limiter enforces its per-key ceiling against an injected clock;
 *   3. every play function is a safe no-op before unlock() — no throw, with no AudioContext.
 *
 * Because there is no AudioContext, unlock() itself cannot create a real context here; the
 * engine detects the missing constructor and stays locked, which is exactly the state the
 * no-op contract must hold in. That is the point of the third group.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Minimal localStorage stand-in — same approach as tests/save.test.ts. */
function installLocalStorage(): void {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  installLocalStorage();
  // A fresh module graph per test, so the engine re-reads its persisted defaults from the
  // just-installed (empty) localStorage rather than carrying state between tests.
  vi.resetModules();
});

describe('preferences persistence', () => {
  it('starts muted on first ever load (no stored preference)', async () => {
    const { audio } = await import('../src/audio/index');
    expect(audio.muted).toBe(true);
  });

  it('round-trips mute through localStorage', async () => {
    const first = await import('../src/audio/index');
    first.audio.setMuted(false);
    expect(localStorage.getItem('pleasehold.audio.muted')).toBe('false');

    // A fresh module graph reads the stored value back.
    vi.resetModules();
    const second = await import('../src/audio/index');
    expect(second.audio.muted).toBe(false);
  });

  it('round-trips master volume, clamped to 0..1', async () => {
    const first = await import('../src/audio/index');
    first.audio.setMasterVolume(0.42);
    first.audio.setMasterVolume(9); // clamps to 1
    expect(localStorage.getItem('pleasehold.audio.master')).toBe('1');

    first.audio.setMasterVolume(0.42);
    vi.resetModules();
    const second = await import('../src/audio/index');
    expect(second.audio.getMasterVolume()).toBeCloseTo(0.42, 6);
  });

  it('round-trips per-category volume independently', async () => {
    const first = await import('../src/audio/index');
    first.audio.setCategoryVolume('music', 0.2);
    first.audio.setCategoryVolume('ui', 0.6);
    expect(localStorage.getItem('pleasehold.audio.cat.music')).toBe('0.2');

    vi.resetModules();
    const second = await import('../src/audio/index');
    expect(second.audio.getCategoryVolume('music')).toBeCloseTo(0.2, 6);
    expect(second.audio.getCategoryVolume('ui')).toBeCloseTo(0.6, 6);
  });

  it('does not collide with the save keys', async () => {
    const { audio } = await import('../src/audio/index');
    audio.setMuted(false);
    audio.setMasterVolume(0.5);
    for (const k of ['pleasehold.save.a', 'pleasehold.save.b', 'pleasehold.save.ptr']) {
      expect(localStorage.getItem(k)).toBeNull();
    }
  });
});

describe('rate limiter', () => {
  it('allows the first call and blocks a too-soon retrigger of the same key', async () => {
    const { allow, resetRateLimiter } = await import('../src/audio/sfx');
    resetRateLimiter();
    expect(allow('stall', 1000)).toBe(true); // first ever
    expect(allow('stall', 1010)).toBe(false); // 10ms later, under the 55ms ceiling
    expect(allow('stall', 1100)).toBe(true); // 100ms later, allowed again
  });

  it('caps a burst of rapid presses to the per-key ceiling', async () => {
    const { allow, resetRateLimiter } = await import('../src/audio/sfx');
    resetRateLimiter();
    // 200 presses across 1000ms of virtual time = every 5ms. The stall ceiling is 55ms,
    // so at most ceil(1000/55)+1 may pass.
    let passed = 0;
    for (let ms = 0; ms < 1000; ms += 5) {
      if (allow('stall', ms)) passed++;
    }
    expect(passed).toBeLessThanOrEqual(Math.ceil(1000 / 55) + 1);
    expect(passed).toBeGreaterThan(0);
  });

  it('tracks keys independently', async () => {
    const { allow, resetRateLimiter } = await import('../src/audio/sfx');
    resetRateLimiter();
    expect(allow('stall', 0)).toBe(true);
    // A different key at the same instant is not blocked by stall's history.
    expect(allow('purchase', 0)).toBe(true);
  });
});

describe('safe no-op before unlock', () => {
  it('reports locked when there is no AudioContext to create', async () => {
    const { audio } = await import('../src/audio/index');
    // Node has no AudioContext constructor, so unlock cannot create one.
    audio.unlock();
    expect(audio.unlocked).toBe(false);
  });

  it('every play function is a no-op that does not throw before unlock', async () => {
    const { audio } = await import('../src/audio/index');
    expect(() => {
      audio.stall();
      audio.purchase();
      audio.refused();
      audio.dossierTick();
      audio.milestone();
      audio.boilOver();
      audio.persona('doris');
      audio.persona('nonexistent-persona');
      audio.startHoldMusic();
      audio.setHoldMusicIntensity(0.5);
      audio.stopHoldMusic();
    }).not.toThrow();
  });

  it('persona motifs exist for every shipped persona id', async () => {
    const { hasMotif } = await import('../src/audio/personaTones');
    const { PERSONAS } = await import('../src/data/balance');
    for (const p of PERSONAS) {
      expect(hasMotif(p.id)).toBe(true);
    }
  });
});
