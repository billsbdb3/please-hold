/**
 * Save / load with a versioned envelope and a migration chain.
 *
 * The old build had none of this: it merged a raw blob into a fresh object and
 * hoped. New fields silently inherited `undefined`, nested objects were
 * shallow-merged, and there was no version to branch on. Combined with persisted
 * multipliers (see types.ts) a save could not survive a schema change.
 *
 * Rules here:
 *  1. Every save carries a `version`. Loading runs migrations in order until the
 *     save is current. A save from v1 must still load in v9.
 *  2. Only `Persisted` is written. Derived values and transient UI state are not
 *     in the envelope at all, so they cannot be stale.
 *  3. Two slots, A/B rolling. A crash mid-write cannot destroy both.
 *  4. A checksum detects corruption. It is NOT anti-cheat — this is a
 *     single-player local save and defending it would be theatre.
 */

import type { Persisted } from './types';
import { freshState, CURRENT_VERSION } from './state';

const SLOT_A = 'pleasehold.save.a';
const SLOT_B = 'pleasehold.save.b';
const SLOT_PTR = 'pleasehold.save.ptr';

interface Envelope {
  version: number;
  savedAt: number;
  checksum: number;
  data: Persisted;
}

/**
 * Cheap, stable string hash (djb2). Detects truncation and bit-rot.
 * Not cryptographic and not trying to be.
 */
function checksum(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Migration chain. Each entry takes a save AT that version and returns one at
 * version + 1. Never delete a migration — an old save in someone's browser
 * still needs the whole ladder.
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 → v2: the v7 vanilla build. Its saves are unsalvageable by design — the
   * theme changed and its multipliers were corrupt (audit bug #1), so importing
   * them would import the corruption. We detect and discard, deliberately and
   * visibly, rather than silently producing a broken game.
   */
  1: (data) => ({ ...data, version: 2, __discarded: true }),
};

function migrate(raw: Record<string, unknown>): Persisted | null {
  let data = raw;
  let version = typeof data.version === 'number' ? data.version : 1;

  while (version < CURRENT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      console.warn(`[save] no migration from v${version}; discarding save`);
      return null;
    }
    data = step(data);
    version = typeof data.version === 'number' ? data.version : version + 1;
  }

  if (data.__discarded) return null;

  // Fill any field added since this save was written. Fresh state supplies the
  // default; the save supplies anything it actually knows about.
  const fresh = freshState();
  const merged = { ...fresh, ...data, version: CURRENT_VERSION } as Persisted;

  // Nested objects need explicit merging — a spread would replace, not merge,
  // and a save predating a new generator would drop it entirely.
  merged.generators = { ...fresh.generators, ...(data.generators as object ?? {}) };

  // Arrays must be arrays. A corrupt save that stored an object here would
  // otherwise crash the first `.includes()` call.
  if (!Array.isArray(merged.upgrades)) merged.upgrades = [];
  if (!Array.isArray(merged.milestones)) merged.milestones = [];
  if (!Array.isArray(merged.roster)) merged.roster = [];
  if (!Array.isArray(merged.beatsSeen)) merged.beatsSeen = [];

  return sanitise(merged);
}

/**
 * Last line of defence against NaN and Infinity reaching the UI.
 *
 * The old build could reach both (audit bug #1) and the symptom was a screen full
 * of "NaN" with no way back. A single non-finite number in a currency poisons
 * every downstream calculation for the rest of the session, so it is cheaper to
 * clamp on load than to hunt the source later.
 */
function sanitise(p: Persisted): Persisted {
  const numericKeys: string[] = [
    'holdTime', 'holdTimeLifetime', 'intel', 'intelLifetime',
    'evidence', 'evidenceLifetime', 'rapport', 'coverage', 'credibility',
    'composure', 'heat', 'warning', 'totalStalls', 'combo',
    'elapsed', 'activeElapsed',
  ];
  const bag = p as unknown as Record<string, unknown>;
  for (const k of numericKeys) {
    const v = bag[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) bag[k] = 0;
  }
  for (const id of Object.keys(p.generators) as (keyof typeof p.generators)[]) {
    const v = p.generators[id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) p.generators[id] = 0;
  }
  // Combo must never load below its floor of 1, or production silently halves.
  if (p.combo < 1) p.combo = 1;
  // Composure is a percentage; a save cannot claim 900.
  p.composure = Math.max(0, Math.min(100, p.composure));
  p.coverage = Math.max(0, Math.min(1, p.coverage));
  return p;
}

export function save(p: Persisted): void {
  try {
    p.lastSeenAt = Date.now();
    const body = JSON.stringify(p);
    const envelope: Envelope = {
      version: CURRENT_VERSION,
      savedAt: p.lastSeenAt,
      checksum: checksum(body),
      data: p,
    };
    // Alternate slots so an interrupted write leaves the other intact.
    const ptr = localStorage.getItem(SLOT_PTR) === 'a' ? 'b' : 'a';
    localStorage.setItem(ptr === 'a' ? SLOT_A : SLOT_B, JSON.stringify(envelope));
    localStorage.setItem(SLOT_PTR, ptr);
  } catch (e) {
    // Quota exceeded, or private-mode storage. Not fatal; the game keeps running.
    console.warn('[save] write failed', e);
  }
}

function readSlot(key: string): Envelope | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    if (!env || typeof env !== 'object' || !env.data) return null;
    const body = JSON.stringify(env.data);
    if (typeof env.checksum === 'number' && checksum(body) !== env.checksum) {
      console.warn(`[save] checksum mismatch in ${key}`);
      return null;
    }
    return env;
  } catch {
    return null;
  }
}

export interface LoadResult {
  state: Persisted;
  /** True when a save was found and used. */
  restored: boolean;
  /** Wall-clock seconds since the save was written, clamped. */
  offlineSeconds: number;
  /** Set when a save existed but could not be used. */
  discarded: boolean;
}

/** Offline credit is capped at 24h — the genre norm, and honest about it. */
const MAX_OFFLINE_SECONDS = 24 * 60 * 60;

export function load(): LoadResult {
  const ptr = localStorage.getItem(SLOT_PTR);
  // Prefer the slot the pointer names, but fall back to the other one, then to
  // whichever is newer. A half-written primary should not cost the player a save.
  const primary = readSlot(ptr === 'b' ? SLOT_B : SLOT_A);
  const secondary = readSlot(ptr === 'b' ? SLOT_A : SLOT_B);
  const chosen =
    primary && secondary
      ? primary.savedAt >= secondary.savedAt ? primary : secondary
      : primary ?? secondary;

  if (!chosen) {
    return { state: freshState(), restored: false, offlineSeconds: 0, discarded: false };
  }

  const migrated = migrate(chosen.data as unknown as Record<string, unknown>);
  if (!migrated) {
    return { state: freshState(), restored: false, offlineSeconds: 0, discarded: true };
  }

  const rawOffline = Math.max(0, (Date.now() - (migrated.lastSeenAt || Date.now())) / 1000);
  return {
    state: migrated,
    restored: true,
    offlineSeconds: Math.min(rawOffline, MAX_OFFLINE_SECONDS),
    discarded: false,
  };
}

export function clear(): void {
  localStorage.removeItem(SLOT_A);
  localStorage.removeItem(SLOT_B);
  localStorage.removeItem(SLOT_PTR);
}

/** Export as a base64 string the player can paste somewhere safe. */
export function exportSave(p: Persisted): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(p))));
}

/** Import a base64 string. Returns null if it is not a save. */
export function importSave(text: string): Persisted | null {
  try {
    const json = decodeURIComponent(escape(atob(text.trim())));
    return migrate(JSON.parse(json) as Record<string, unknown>);
  } catch {
    return null;
  }
}
