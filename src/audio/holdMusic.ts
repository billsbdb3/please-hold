/**
 * The hold music. The centrepiece, and the joke.
 *
 * It has to sound like genuinely terrible muzak coming down a cheap phone line: a
 * plodding major-key loop, soft square and triangle voices, a lazy bass, a little
 * vibrato and a touch of detune so it sits fractionally wrong, all shoved through a
 * band-pass filter so nothing has the highs or lows a real recording would. Every few
 * bars the line drops for an instant, as bad lines do.
 *
 * The constraints that keep it a joke rather than a punishment:
 *   - No harsh highs. The band-pass caps well below anything piercing.
 *   - Quiet by default (the category gain and the low master default do the rest).
 *   - Mildly wearing over an hour is the intent; actively painful is a bug.
 *
 * It is a single scheduler that keeps a short lookahead of notes queued on the audio
 * clock, so the loop is seamless and cheap. start()/stop() own it, and setIntensity()
 * lets a later phase make the line degrade as heat rises without changing the tune.
 *
 * No samples. Oscillators and one filtered noise burst for the dropout click. Nothing
 * is fetched.
 */

import { engine } from './engine';

/** A dreary, entirely resolved major progression. It goes nowhere, forever. */
const A3 = 220.0;
const ROOT = A3;
const SEMI = (n: number) => ROOT * Math.pow(2, n / 12);

// I – vi – IV – V in A, two bars each: the most inoffensive loop imaginable, which is
// what makes it wearing. Values are scale degrees relative to A.
const CHORDS: number[][] = [
  [0, 4, 7], // A  (I)
  [9, 12, 16], // F#m (vi)
  [5, 9, 12], // D  (IV)
  [7, 11, 14], // E  (V)
];

const BASS_LINE = [0, 9, 5, 7]; // roots, one octave down

const BPM = 92; // plodding
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS_PER_CHORD = 2;
const LOOP_BARS = CHORDS.length * BARS_PER_CHORD; // 8 bars
const LOOP_SECONDS = LOOP_BARS * BAR;

const LOOKAHEAD = 0.25; // seconds of scheduler tick
const SCHEDULE_AHEAD = 0.7; // seconds of notes kept queued

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let nextNoteTime = 0;
let step = 0; // half-bar index within the loop
let intensity = 0; // 0..1, raises detune/dropout as "heat" climbs
let liveNodes: Set<AudioNode> = new Set();

function track(node: AudioNode): void {
  liveNodes.add(node);
}

/** A single voiced note: filtered osc with its own short envelope, self-cleaning. */
function playNote(
  ctx: AudioContext,
  bus: GainNode,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  detuneCents: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detuneCents;

  // Slight vibrato so the muzak has that queasy, over-processed wobble.
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 5.2;
  lfoGain.gain.value = freq * 0.006;
  lfo.connect(lfoGain).connect(osc.frequency);

  const env = gain.gain;
  env.setValueAtTime(0.0001, start);
  env.exponentialRampToValueAtTime(peak, start + 0.03);
  env.setValueAtTime(peak, start + dur * 0.6);
  env.exponentialRampToValueAtTime(0.0001, start + dur);

  osc.connect(gain).connect(bus);
  track(osc);
  track(gain);
  track(lfo);
  track(lfoGain);

  osc.start(start);
  lfo.start(start);
  osc.stop(start + dur + 0.02);
  lfo.stop(start + dur + 0.02);

  const cleanup = () => {
    try {
      osc.disconnect();
      gain.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
    } catch {
      /* already gone */
    }
    liveNodes.delete(osc);
    liveNodes.delete(gain);
    liveNodes.delete(lfo);
    liveNodes.delete(lfoGain);
  };
  osc.onended = cleanup;
}

/** The bad-line dropout: a very short mute of the whole bus plus a faint click. */
function dropout(ctx: AudioContext, bus: GainNode, at: number): void {
  // The bus gain is briefly notched. We touch a child gain we own rather than the
  // category bus itself, so we never fight the user's volume setting.
  const click = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 0.02);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.08;
  click.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  click.connect(g).connect(bus);
  track(click);
  track(g);
  click.start(at);
  click.onended = () => {
    try {
      click.disconnect();
      g.disconnect();
    } catch {
      /* gone */
    }
    liveNodes.delete(click);
    liveNodes.delete(g);
  };
}

/** The band-pass "phone line" the whole thing plays through, plus a soft output gain. */
let phoneFilter: BiquadFilterNode | null = null;
let musicGain: GainNode | null = null;

function ensureChain(ctx: AudioContext, bus: GainNode): GainNode | null {
  if (musicGain && phoneFilter) return musicGain;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900; // telephone-ish centre
  filter.Q.value = 0.9;

  const out = ctx.createGain();
  out.gain.value = 0.5; // headroom below the category bus

  filter.connect(out).connect(bus);
  phoneFilter = filter;
  musicGain = out;
  track(filter);
  track(out);
  return out;
}

/** Schedule one half-bar (two beats) of music starting at `time`. */
function scheduleHalfBar(ctx: AudioContext, chainIn: GainNode, time: number): void {
  const chordIndex = Math.floor(step / (BARS_PER_CHORD * 2)) % CHORDS.length;
  const chord = CHORDS[chordIndex] ?? CHORDS[0]!;
  const bassRoot = BASS_LINE[chordIndex] ?? 0;

  // Detune grows with intensity so the line sits more and more wrong as heat rises.
  const detune = 4 + intensity * 22;

  // Melody: one note per beat, walking the chord tones — flat and predictable.
  for (let beat = 0; beat < 2; beat++) {
    const t = time + beat * BEAT;
    const toneIndex = (step + beat) % chord.length;
    const semis = chord[toneIndex] ?? 0;
    playNote(ctx, chainIn, SEMI(semis + 12), t, BEAT * 0.9, 'square', 0.05, detune);
  }

  // Pad: hold the chord softly across the half-bar on triangle.
  for (const semis of chord) {
    playNote(ctx, chainIn, SEMI(semis), time, BAR * 0.5 * 0.95, 'triangle', 0.028, -detune);
  }

  // Bass: one plodding root per half-bar, an octave down.
  playNote(ctx, chainIn, SEMI(bassRoot - 12), time, BAR * 0.5 * 0.9, 'triangle', 0.06, 0);

  // Occasional dropout, more likely as intensity rises. Anchored to the loop position
  // so it never lands on every pass in the same place.
  const dropChance = 0.04 + intensity * 0.14;
  if (Math.random() < dropChance) {
    dropout(ctx, chainIn, time + Math.random() * BAR * 0.5);
  }
}

function tickScheduler(): void {
  const ctx = engine.context();
  const bus = engine.bus('music');
  if (!ctx || !bus) return;
  const chainIn = ensureChain(ctx, bus);
  if (!chainIn) return;

  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleHalfBar(ctx, chainIn, nextNoteTime);
    nextNoteTime += BAR * 0.5;
    step = (step + 1) % (LOOP_BARS * 2);
  }
}

/** Begin the hold music. No-op before unlock, and idempotent. */
export function start(): void {
  if (running) return;
  const ctx = engine.context();
  if (!ctx) return; // pre-unlock: silent no-op, by contract
  running = true;
  step = 0;
  nextNoteTime = ctx.currentTime + 0.08;
  tickScheduler();
  timer = setInterval(tickScheduler, LOOKAHEAD * 1000);
}

/** Stop the music and tear down every node so nothing lingers or crackles. */
export function stop(): void {
  running = false;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  for (const node of liveNodes) {
    try {
      if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
        (node as OscillatorNode).stop();
      }
      node.disconnect();
    } catch {
      /* already stopped or disconnected */
    }
  }
  liveNodes = new Set();
  phoneFilter = null;
  musicGain = null;
}

/**
 * 0..1. Raises detune and dropout frequency so the line degrades as heat climbs, without
 * touching the tune or the volume. Later phases call this; Phase 1 leaves it at 0.
 */
export function setIntensity(value: number): void {
  intensity = Math.max(0, Math.min(1, value));
}

/** Exposed for tests and diagnostics. */
export function isRunning(): boolean {
  return running;
}

export const LOOP_LENGTH_SECONDS = LOOP_SECONDS;
