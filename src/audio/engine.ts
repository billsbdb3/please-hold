/**
 * The audio engine core.
 *
 * One AudioContext, created lazily on the first user gesture, because every browser
 * blocks audio until then. Everything else in src/audio/ routes through the three
 * category gains hung off the master gain, so a single mute or volume change moves
 * everything at once and nothing has to know the graph.
 *
 * The contract the rest of the game relies on:
 *   - Nothing throws before unlock(). A play call made too early is a silent no-op,
 *     not an exception, so callers never have to guard.
 *   - Preferences (mute, per-category volume) persist under `pleasehold.audio.*`,
 *     kept clear of the save system's `pleasehold.save.*` keys.
 *   - There is exactly one context for the life of the page. It is never recreated.
 *
 * No audio files are used anywhere in this module or its siblings. Every sound is
 * synthesised at runtime from oscillators and noise. That is a deliberate design
 * decision, not a limitation: it keeps the bundle tiny, sidesteps all licensing, and
 * the thin synthetic quality suits a game about being left on hold.
 */

export type Category = 'music' | 'ui' | 'voice';

const STORAGE_PREFIX = 'pleasehold.audio.';
const KEY_MUTED = `${STORAGE_PREFIX}muted`;
const KEY_MASTER = `${STORAGE_PREFIX}master`;
const KEY_CAT = (c: Category) => `${STORAGE_PREFIX}cat.${c}`;

/** Deliberately quiet. Nobody gets a jump-scare from a browser tab. */
const DEFAULT_MASTER = 0.35;
const DEFAULT_CATEGORY: Record<Category, number> = { music: 0.8, ui: 0.9, voice: 0.85 };

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / quota. Audio preferences are not worth crashing over.
  }
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private categories: Record<Category, GainNode> | null = null;

  /**
   * REQUIREMENT: start muted on the very first load, so nobody is surprised by noise.
   * Once the player has expressed any preference we honour it, muted or not.
   */
  private muted = readBool(KEY_MUTED, true);
  private masterVolume = readNumber(KEY_MASTER, DEFAULT_MASTER);
  private categoryVolume: Record<Category, number> = {
    music: readNumber(KEY_CAT('music'), DEFAULT_CATEGORY.music),
    ui: readNumber(KEY_CAT('ui'), DEFAULT_CATEGORY.ui),
    voice: readNumber(KEY_CAT('voice'), DEFAULT_CATEGORY.voice),
  };

  /** True once unlock() has run against a real user gesture. */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getCategoryVolume(c: Category): number {
    return this.categoryVolume[c];
  }

  /**
   * Create the context on the first real gesture. Called from the "Pick up the handset"
   * button. Idempotent: a second call just resumes a suspended context.
   */
  unlock(): void {
    if (this.ctx) {
      // Some browsers suspend the context when the tab loses focus.
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.connect(ctx.destination);

    const categories: Record<Category, GainNode> = {
      music: ctx.createGain(),
      ui: ctx.createGain(),
      voice: ctx.createGain(),
    };
    for (const g of Object.values(categories)) g.connect(master);

    this.ctx = ctx;
    this.master = master;
    this.categories = categories;

    this.applyGains();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  /**
   * The live AudioContext, or null before unlock. Sound modules must treat null as
   * "do nothing" rather than an error — that is what makes every play call a safe
   * no-op before the first gesture.
   */
  context(): AudioContext | null {
    return this.ctx;
  }

  /** The gain node a sound of the given category should connect to, or null pre-unlock. */
  bus(c: Category): GainNode | null {
    return this.categories?.[c] ?? null;
  }

  /** The audio-clock "now", or 0 pre-unlock. Convenience for schedulers. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    write(KEY_MUTED, String(value));
    this.applyGains();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMasterVolume(value: number): void {
    this.masterVolume = Math.max(0, Math.min(1, value));
    write(KEY_MASTER, String(this.masterVolume));
    this.applyGains();
  }

  setCategoryVolume(c: Category, value: number): void {
    this.categoryVolume[c] = Math.max(0, Math.min(1, value));
    write(KEY_CAT(c), String(this.categoryVolume[c]));
    this.applyGains();
  }

  /**
   * Push the current mute/volume settings into the graph. A short ramp rather than a
   * hard set, so toggling mute mid-hold-music does not click.
   */
  private applyGains(): void {
    if (!this.ctx || !this.master || !this.categories) return;
    const t = this.ctx.currentTime;
    const effectiveMaster = this.muted ? 0 : this.masterVolume;
    this.master.gain.setTargetAtTime(effectiveMaster, t, 0.015);
    for (const c of Object.keys(this.categories) as Category[]) {
      this.categories[c].gain.setTargetAtTime(this.categoryVolume[c], t, 0.015);
    }
  }
}

/** The single engine instance. The facade in index.ts is the only intended consumer. */
export const engine = new AudioEngine();
