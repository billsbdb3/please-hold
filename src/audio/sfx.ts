/**
 * UI sound effects, all synthesised, all short, all self-cleaning.
 *
 * The stall click is the load-bearing one: it fires several times a second for an hour,
 * so it (a) varies pitch a little per press so a thousand of them do not turn into one
 * maddening tone, and (b) is hard-capped by a per-key rate limiter so a held space bar
 * or a frantic clicker cannot stack a hundred overlapping voices and crackle.
 *
 * Every node is disconnected on its `onended`, so nothing accumulates across a long
 * session. No files.
 */

import { engine } from './engine';
import type { Category } from './engine';

/**
 * Per-key minimum interval between retriggers, in ms. A play call that arrives sooner
 * than this after the same key's last one is dropped. This is the crackle guard.
 */
const RATE_LIMIT_MS: Record<string, number> = {
  stall: 55, // ~18/s ceiling; the DTMF blip is ~40ms so they never pile up
  purchase: 90,
  refused: 120,
  dossier: 70,
  milestone: 400,
  boilover: 500,
};
const DEFAULT_LIMIT_MS = 80;

const lastPlayed: Record<string, number> = {};

/**
 * The rate limiter. Returns true if a sound with this key is allowed to play now, and
 * records the time when it is. Pure w.r.t. the injected clock, so tests drive it with a
 * fake `now` and assert the ceiling directly.
 */
export function allow(key: string, now: number): boolean {
  const limit = RATE_LIMIT_MS[key] ?? DEFAULT_LIMIT_MS;
  const last = lastPlayed[key];
  if (last !== undefined && now - last < limit) return false;
  lastPlayed[key] = now;
  return true;
}

/** Test seam: forget all rate-limit history. */
export function resetRateLimiter(): void {
  for (const k of Object.keys(lastPlayed)) delete lastPlayed[k];
}

/** A single enveloped tone that disconnects itself when it finishes. */
function tone(
  ctx: AudioContext,
  bus: GainNode,
  opts: {
    freq: number;
    start: number;
    dur: number;
    type?: OscillatorType;
    peak?: number;
    endFreq?: number;
  },
): void {
  const { freq, start, dur, type = 'sine', peak = 0.16, endFreq } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  osc.connect(gain).connect(bus);
  osc.start(start);
  osc.stop(start + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* gone */
    }
  };
}

/** A short filtered noise burst that disconnects itself. */
function noise(
  ctx: AudioContext,
  bus: GainNode,
  opts: { start: number; dur: number; peak?: number; cutoff?: number; type?: BiquadFilterType },
): void {
  const { start, dur, peak = 0.2, cutoff = 1400, type = 'lowpass' } = opts;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(bus);
  src.start(start);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    } catch {
      /* gone */
    }
  };
}

/** Resolve the ui bus, or null before unlock. Every play routes through this. */
function ui(): { ctx: AudioContext; bus: GainNode } | null {
  const ctx = engine.context();
  const bus: GainNode | null = engine.bus('ui' satisfies Category);
  if (!ctx || !bus) return null;
  return { ctx, bus };
}

/**
 * The stall "click": a brief DTMF-ish pair of tones, pitch nudged a little per press so a
 * long session does not fixate on one note. Rate-limited under the `stall` key.
 */
export function stallClick(now = Date.now()): void {
  if (!allow('stall', now)) return;
  const a = ui();
  if (!a) return;
  const { ctx, bus } = a;
  const t = ctx.currentTime;
  // DTMF-like: a low + high pair, both jittered by up to a semitone.
  const jitter = () => Math.pow(2, (Math.random() * 2 - 1) / 24);
  tone(ctx, bus, { freq: 697 * jitter(), start: t, dur: 0.045, type: 'sine', peak: 0.09 });
  tone(ctx, bus, { freq: 1209 * jitter(), start: t, dur: 0.045, type: 'sine', peak: 0.07 });
}

/** Purchase confirmed: a clean two-note rise. */
export function purchase(now = Date.now()): void {
  if (!allow('purchase', now)) return;
  const a = ui();
  if (!a) return;
  const { ctx, bus } = a;
  const t = ctx.currentTime;
  tone(ctx, bus, { freq: 523.25, start: t, dur: 0.09, type: 'triangle', peak: 0.14 });
  tone(ctx, bus, { freq: 783.99, start: t + 0.07, dur: 0.12, type: 'triangle', peak: 0.14 });
}

/** Refused / can't afford: a soft, short low buzz. Not a klaxon. */
export function refused(now = Date.now()): void {
  if (!allow('refused', now)) return;
  const a = ui();
  if (!a) return;
  const { ctx, bus } = a;
  const t = ctx.currentTime;
  tone(ctx, bus, { freq: 155, start: t, dur: 0.13, type: 'square', peak: 0.08, endFreq: 138 });
}

/** Banking a dossier page: a small dry tick. */
export function dossierTick(now = Date.now()): void {
  if (!allow('dossier', now)) return;
  const a = ui();
  if (!a) return;
  const { ctx, bus } = a;
  const t = ctx.currentTime;
  tone(ctx, bus, { freq: 1500, start: t, dur: 0.03, type: 'sine', peak: 0.1 });
  noise(ctx, bus, { start: t, dur: 0.02, peak: 0.05, cutoff: 3000, type: 'highpass' });
}

/** Milestone reached: a flat three-note sting. Understated on purpose. */
export function milestone(now = Date.now()): void {
  if (!allow('milestone', now)) return;
  const a = ui();
  if (!a) return;
  const { ctx, bus } = a;
  const t = ctx.currentTime;
  const notes = [440, 587.33, 659.25];
  notes.forEach((f, i) => {
    tone(ctx, bus, { freq: f, start: t + i * 0.11, dur: 0.16, type: 'triangle', peak: 0.13 });
  });
}

/**
 * The scammer loses his temper: a clipped noise burst over a descending tone. Must read
 * as shouting without being, or pretending to be, a voice.
 */
export function boilOver(now = Date.now()): void {
  if (!allow('boilover', now)) return;
  const a = ui();
  if (!a) return;
  const { ctx, bus } = a;
  const t = ctx.currentTime;
  noise(ctx, bus, { start: t, dur: 0.22, peak: 0.22, cutoff: 900, type: 'bandpass' });
  tone(ctx, bus, { freq: 320, start: t, dur: 0.3, type: 'sawtooth', peak: 0.12, endFreq: 90 });
}
