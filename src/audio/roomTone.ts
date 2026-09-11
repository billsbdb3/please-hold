/**
 * PHASE 2 — THE ROOM.
 *
 * Phase 1 is a telephone: hold music, DTMF, line noise, a ring cadence. Phase 2 is a PLACE.
 * You are on a machine inside their network, and what you should hear is the room that machine
 * is sitting in — fans, mains hum, a drive working, somebody typing two desks away.
 *
 * DESIGN NOTES (from please-hold-research/19-phase2-audio.md)
 * ---------------------------------------------------------
 * Everything hangs off the existing `music` bus, so the mute toggle and volume ramps already
 * govern it and nothing new has to be wired into the settings drawer.
 *
 * Three sub-buses:
 *   room    the continuous bed — four fan layers off ONE noise buffer, plus a mains hum
 *   drone   a slow, rootless, clinical pad whose centre climbs as coverage grows
 *   machine rate-limited one-shots: drive seeks, relay clicks, distant typing
 *
 * TENSION IS SUBTRACTIVE, which is the important idea and the opposite of what a score does.
 * As suspicion rises the room's lowpass CLOSES and the machine noises STOP: the world gets
 * smaller and quieter rather than louder, because a floor that thinks it is being watched is a
 * careful floor. A burn ducks the entire bed to near-silence for about a second and brings it
 * back with a relay click. That earned silence is the loudest thing in the phase.
 *
 * ANTI-FATIGUE is a real constraint, not a nicety: this runs for two hours. So energy is kept
 * out of the 2–5 kHz band where the ear tires fastest, the spectrum is always slowly moving
 * (two bandpass banks detuned so they beat against each other), no resonance is ever pinned,
 * and there are scheduled micro-rests. A drone that never changes becomes a headache.
 *
 * COST: about 15–20 live nodes at steady state and almost nothing scheduled per second, which
 * is cheaper than Phase 1's hold music. That matters next to a 20 Hz simulation and fourteen
 * animated camera feeds.
 */

import { engine } from './engine';

/** Tonal set for the drone: fourths and a tritone, in Hz. */
const DRONE_STEPS = [55, 73.42, 77.78, 98, 103.83];

interface Room {
  ctx: AudioContext;
  /** Whole-bed gain, ducked on a burn. */
  bed: GainNode;
  /** The bed's lowpass — closes as suspicion rises. */
  lowpass: BiquadFilterNode;
  room: GainNode;
  drone: GainNode;
  machine: GainNode;
  droneOscs: OscillatorNode[];
  sources: AudioScheduledSourceNode[];
  /** Suspicion 0..1, as last set. */
  suspicion: number;
  /** Timer for the machine one-shots. */
  timer: number | null;
  stopped: boolean;
}

let live: Room | null = null;

/**
 * One looping noise buffer, shared by every fan layer.
 *
 * Four separate noise sources would be four buffers of the same thing. One buffer with
 * different filters on each tap is indistinguishable and a quarter of the memory.
 */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const seconds = 3;
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Slightly brown rather than white: integrated noise sits lower and is far less fatiguing.
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

function noiseTap(
  ctx: AudioContext,
  buf: AudioBuffer,
  dest: AudioNode,
  type: BiquadFilterType,
  freq: number,
  q: number,
  gain: number,
  sources: AudioScheduledSourceNode[],
): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(dest);
  src.start();
  sources.push(src);
}

/**
 * Start the room. Safe to call repeatedly and safe before the first gesture — with no
 * AudioContext this is a no-op, which is the same contract every other sound module here has.
 */
export function startRoom(): void {
  if (live && !live.stopped) return;
  const ctx = engine.context();
  const bus = engine.bus('music');
  if (!ctx || !bus) return;

  const bed = ctx.createGain();
  bed.gain.value = 0.0001;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 900;
  lowpass.Q.value = 0.4;
  bed.connect(lowpass).connect(bus);

  const room = ctx.createGain();
  room.gain.value = 0.85;
  const drone = ctx.createGain();
  drone.gain.value = 0.16;
  const machine = ctx.createGain();
  machine.gain.value = 0.5;
  for (const g of [room, drone, machine]) g.connect(bed);

  const sources: AudioScheduledSourceNode[] = [];
  const noise = makeNoise(ctx);

  // Four fan layers. The two bandpasses are deliberately detuned by 40 Hz so they beat against
  // each other slowly — that drift is what stops the bed becoming a fixed, tiring tone.
  noiseTap(ctx, noise, room, 'lowpass', 220, 0.7, 0.5, sources);
  noiseTap(ctx, noise, room, 'bandpass', 480, 1.8, 0.16, sources);
  noiseTap(ctx, noise, room, 'bandpass', 520, 2.2, 0.13, sources);
  noiseTap(ctx, noise, room, 'highpass', 5200, 0.5, 0.012, sources);

  // Mains hum. 50 Hz and its harmonics, with a very slow breath on the fundamental so it is
  // never perfectly static.
  for (const [f, g] of [[50, 0.05], [100, 0.028], [150, 0.012]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const gn = ctx.createGain();
    gn.gain.value = g;
    o.connect(gn).connect(room);
    o.start();
    sources.push(o);
  }
  const breath = ctx.createOscillator();
  breath.type = 'sine';
  breath.frequency.value = 0.2;
  const breathAmt = ctx.createGain();
  breathAmt.gain.value = 1.5;
  breath.connect(breathAmt);
  breath.start();
  sources.push(breath);

  // The drone: a root and a tritone. No third and no fifth — a fifth would sound resolved and a
  // minor third would sound sad. A tritone sounds like equipment.
  const droneOscs: OscillatorNode[] = [];
  for (const [mult, g] of [[1, 0.5], [Math.SQRT2, 0.32]] as const) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = DRONE_STEPS[0] * mult;
    const gn = ctx.createGain();
    gn.gain.value = g;
    o.connect(gn).connect(drone);
    o.start();
    droneOscs.push(o);
    sources.push(o);
  }

  live = {
    ctx, bed, lowpass, room, drone, machine, droneOscs, sources,
    suspicion: 0, timer: null, stopped: false,
  };

  // Fade in over four seconds. A room does not begin, it is simply there once you notice it.
  bed.gain.setTargetAtTime(0.5, ctx.currentTime, 1.4);
  scheduleMachine();
}

/** Stop everything and release the nodes. */
export function stopRoom(): void {
  const r = live;
  if (!r || r.stopped) return;
  r.stopped = true;
  if (r.timer !== null) clearTimeout(r.timer);
  r.bed.gain.setTargetAtTime(0.0001, r.ctx.currentTime, 0.6);
  const kill = r.sources;
  setTimeout(() => {
    for (const s of kill) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
  }, 2500);
  live = null;
}

/**
 * Suspicion, 0..1. Closes the room down as it rises.
 *
 * The bed's lowpass falls from 900 Hz to 320 Hz and the machine one-shots thin out to nothing.
 * The effect is that the room gets SMALLER, which is the sound of a floor being careful — and it
 * is the same fiction as the yield penalty in the simulation, so the audio is telling the player
 * something true rather than decorating it.
 */
export function setSuspicion(fraction: number): void {
  const r = live;
  if (!r || r.stopped) return;
  const f = Math.max(0, Math.min(1, fraction));
  r.suspicion = f;
  r.lowpass.frequency.setTargetAtTime(900 - 580 * f, r.ctx.currentTime, 1.2);
  // A touch more hum as the fans are the only thing left.
  r.room.gain.setTargetAtTime(0.85 + 0.1 * f, r.ctx.currentTime, 1.5);
}

/**
 * Coverage, 0..1. Walks the drone's tonal centre up the set.
 *
 * Nobody notices this happening. They notice, at the end, that it sits higher and tighter than
 * it did when they arrived.
 */
export function setCoverage(fraction: number): void {
  const r = live;
  if (!r || r.stopped) return;
  const idx = Math.min(DRONE_STEPS.length - 1, Math.floor(fraction * DRONE_STEPS.length));
  const root = DRONE_STEPS[idx];
  r.droneOscs[0]?.frequency.setTargetAtTime(root, r.ctx.currentTime, 6);
  r.droneOscs[1]?.frequency.setTargetAtTime(root * Math.SQRT2, r.ctx.currentTime, 6);
}

/**
 * A burn: somebody noticed you.
 *
 * The whole bed ducks to near-silence for about a second, then returns with a relay click. An
 * hour of continuous room tone makes this the single loudest event in the phase without adding
 * one decibel — the research's point that in a soundscape, silence is the accent.
 */
export function burnSting(): void {
  const r = live;
  if (!r || r.stopped) return;
  const t = r.ctx.currentTime;
  r.bed.gain.cancelScheduledValues(t);
  r.bed.gain.setTargetAtTime(0.02, t, 0.05);
  r.bed.gain.setTargetAtTime(0.5, t + 1.0, 0.35);
  relay(1.05);
}

/** A relay closing. Short, dry, mechanical. */
function relay(delay = 0): void {
  const r = live;
  if (!r || r.stopped) return;
  const { ctx } = r;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
  }
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  src.connect(f).connect(g).connect(r.machine);
  src.start(t);
}

/** A drive doing something. Chattering seeks over a few hundred milliseconds. */
function driveSeek(): void {
  const r = live;
  if (!r || r.stopped) return;
  const { ctx } = r;
  const n = 3 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + i * (0.03 + Math.random() * 0.05);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1400 + Math.random() * 900;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 3;
    o.connect(f).connect(g).connect(r.machine);
    o.start(t);
    o.stop(t + 0.05);
  }
}

/** Somebody typing, two desks away and through a wall. */
function distantTyping(): void {
  const r = live;
  if (!r || r.stopped) return;
  const { ctx } = r;
  const n = 5 + Math.floor(Math.random() * 12);
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + i * (0.07 + Math.random() * 0.12);
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let j = 0; j < d.length; j++) {
      d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / d.length, 8);
    }
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.06 + Math.random() * 0.05;
    src.connect(f).connect(g).connect(r.machine);
    src.start(t);
  }
}

/**
 * Something appeared on a feed. A short data chirp — two tones, rising, unmusical.
 *
 * Deliberately NOT a pleasant notification sound. It is a machine telling another machine
 * something, which happens to be audible.
 */
export function feedChirp(): void {
  const r = live;
  if (!r || r.stopped) return;
  const { ctx } = r;
  const t = ctx.currentTime;
  for (const [i, f] of [1180, 1620].entries()) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    const at = t + i * 0.06;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.07, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    o.connect(g).connect(r.machine);
    o.start(at);
    o.stop(at + 0.12);
  }
}

/** Noted down. A single dry confirmation, lower than the chirp that prompted it. */
export function noteConfirm(): void {
  const r = live;
  if (!r || r.stopped) return;
  const { ctx } = r;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 740;
  o.frequency.setTargetAtTime(560, t, 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(r.machine);
  o.start(t);
  o.stop(t + 0.2);
}

/**
 * The machine one-shot scheduler.
 *
 * Rate falls as suspicion rises, to nothing at the top. This is the subtractive tension model:
 * the room does not get louder when things are going badly, it goes quiet. A player who has had
 * drives chattering around them for an hour will feel the absence before they can name it.
 */
function scheduleMachine(): void {
  const r = live;
  if (!r || r.stopped) return;

  const quiet = r.suspicion;
  // 6–14 s when nothing is wrong, stretching toward silence as suspicion climbs.
  const base = 6000 + Math.random() * 8000;
  const wait = base * (1 + quiet * 5);

  r.timer = setTimeout(() => {
    const cur = live;
    if (!cur || cur.stopped) return;
    // Above nine tenths the room has stopped making noise altogether.
    if (cur.suspicion < 0.9) {
      const roll = Math.random();
      if (roll < 0.45) driveSeek();
      else if (roll < 0.8) distantTyping();
      else relay();
    }
    scheduleMachine();
  }, wait) as unknown as number;
}
