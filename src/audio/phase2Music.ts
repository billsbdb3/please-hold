/**
 * PHASE 2 MUSIC — the machine keeping time.
 *
 * WHY THIS FILE EXISTS. Phase 2 shipped with room tone and a drone so quiet it may as well not
 * have been there. The playtest verdict: "the music needs to change. its just white noise at this
 * point. needs more substance." Correct. I aimed at "almost unscored" and landed on unscored.
 *
 * The mistake was treating sparse as a synonym for quiet. Sparse means FEW EVENTS, not
 * inaudible ones — so this is a real sequencer with real notes, and the restraint lives in the
 * pattern rather than in the gain.
 *
 * WHAT IT PLAYS
 * -------------
 * A slow machine cycle at 69 BPM in seven, which is the whole character: seven beats never
 * settles, so the phase always sounds like it is mid-process. A steady four would sound like a
 * decision had been made.
 *
 * Notes come from stacked fourths plus a tritone — no thirds and no perfect fifths anywhere.
 * A third would make it sad and a fifth would make it resolved, and this is neither: it is
 * equipment running in a room you should not be in.
 *
 * THE MUSIC IS THE PROGRESS BAR. Layers arrive with coverage:
 *   0%   a low pulse. Something is powered on.
 *   15%  a second voice a fourth up. It is doing something.
 *   35%  a data figure, plucked, off the beat.
 *   55%  a high bell every other cycle. Somebody is paying attention.
 *   80%  the bass doubles and the figure fills in. It is nearly over.
 * Nobody notices a layer arriving. They notice, an hour later, that the room is playing something
 * it was not playing when they got there.
 *
 * SUSPICION TAKES IT AWAY. High heat strips layers back and detunes what is left. The music
 * getting simpler is the sound of you having less room to work in — same subtractive logic as the
 * room tone, and the same as the yield penalty in the simulation. It never adds a stinger.
 *
 * COST. One lookahead scheduler on a 25 Hz timer, notes built and discarded per hit, nothing
 * retained. Comparable to Phase 1's hold music, which is the budget it has to fit inside.
 */

import { engine } from './engine';

/** Stacked fourths and a tritone. Deliberately no third, no fifth. */
const ROOT = 55;
const SCALE = [1, 4 / 3, 45 / 32, 16 / 9, 2, 8 / 3, 45 / 16];

/** Seven beats, so it never settles. */
const STEPS = 7;
const BPM = 69;
const STEP_SECONDS = 60 / BPM;

interface Music {
  ctx: AudioContext;
  out: GainNode;
  filter: BiquadFilterNode;
  timer: number | null;
  /** Next step index and its scheduled audio time. */
  step: number;
  nextTime: number;
  cycle: number;
  coverage: number;
  suspicion: number;
  stopped: boolean;
}

let live: Music | null = null;

/** How many layers the current coverage has earned. */
function layers(coverage: number, suspicion: number): number {
  let n = 1;
  if (coverage >= 0.15) n = 2;
  if (coverage >= 0.35) n = 3;
  if (coverage >= 0.55) n = 4;
  if (coverage >= 0.8) n = 5;
  // Suspicion takes them away again. The room gets simpler, not louder.
  if (suspicion > 0.6) n = Math.max(1, n - 1);
  if (suspicion > 0.85) n = Math.max(1, n - 1);
  return n;
}

export function startMusic(): void {
  if (live && !live.stopped) return;
  const ctx = engine.context();
  const bus = engine.bus('music');
  if (!ctx || !bus) return;

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2600;
  filter.Q.value = 0.6;
  out.connect(filter).connect(bus);

  live = {
    ctx, out, filter, timer: null,
    step: 0, nextTime: ctx.currentTime + 0.15, cycle: 0,
    coverage: 0, suspicion: 0, stopped: false,
  };
  out.gain.setTargetAtTime(0.5, ctx.currentTime, 2.2);
  tickScheduler();
}

export function stopMusic(): void {
  const m = live;
  if (!m || m.stopped) return;
  m.stopped = true;
  if (m.timer !== null) clearInterval(m.timer);
  m.out.gain.setTargetAtTime(0.0001, m.ctx.currentTime, 0.8);
  live = null;
}

export function setMusicCoverage(f: number): void {
  if (live && !live.stopped) live.coverage = Math.max(0, Math.min(1, f));
}

export function setMusicSuspicion(f: number): void {
  const m = live;
  if (!m || m.stopped) return;
  m.suspicion = Math.max(0, Math.min(1, f));
  // Closing the filter as suspicion rises: the same gesture the room tone makes, so the two
  // layers move together rather than fighting.
  m.filter.frequency.setTargetAtTime(2600 - 1700 * m.suspicion, m.ctx.currentTime, 2);
}

/** A plucked tone. Short, filtered, gone. */
function pluck(m: Music, at: number, freq: number, gain: number, decay: number, type: OscillatorType): void {
  const { ctx } = m;
  const o = ctx.createOscillator();
  o.type = type;
  // Detune with suspicion. Never quite in tune once they are nervous.
  o.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.004 + m.suspicion * 0.006);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = Math.max(400, freq * 6);
  o.connect(f).connect(g).connect(m.out);
  o.start(at);
  o.stop(at + decay + 0.05);
}

/** One step of the pattern. */
function playStep(m: Music, step: number, at: number): void {
  const n = layers(m.coverage, m.suspicion);
  const cycle = m.cycle;

  // 1. The pulse. Something is powered on. Beats 0 and 4 of seven.
  if (step === 0 || step === 4) {
    pluck(m, at, ROOT, 0.30, step === 0 ? 0.9 : 0.6, 'sine');
    // A second, tuned a hair off, so the low end breathes rather than sitting still.
    pluck(m, at, ROOT * 1.004, 0.12, 0.7, 'triangle');
  }

  // 2. A fourth above, answering. It is doing something.
  if (n >= 2 && step === 2) {
    pluck(m, at, ROOT * SCALE[1], 0.16, 0.75, 'triangle');
  }

  // 3. The data figure, off the beat, in the tritone. This is the part that reads as machinery.
  if (n >= 3 && (step === 1 || step === 3 || step === 6)) {
    const note = SCALE[[2, 3, 5][step % 3]] ?? SCALE[2];
    pluck(m, at + STEP_SECONDS * 0.5, ROOT * note * 2, 0.075, 0.22, 'square');
  }

  // 4. A bell, every other cycle. Somebody is paying attention.
  if (n >= 4 && step === 5 && cycle % 2 === 0) {
    pluck(m, at, ROOT * SCALE[4] * 2, 0.085, 1.6, 'sine');
  }

  // 5. The bass doubles and the figure fills in. It is nearly over.
  if (n >= 5) {
    if (step === 2 || step === 6) pluck(m, at, ROOT * 0.5, 0.18, 0.8, 'sine');
    if (step === 5) pluck(m, at + STEP_SECONDS * 0.5, ROOT * SCALE[3] * 2, 0.06, 0.2, 'square');
  }
}

/**
 * Lookahead scheduler.
 *
 * A timer this coarse cannot place notes accurately, so it schedules AHEAD on the audio clock and
 * only wakes often enough to stay in front. Same pattern as Phase 1's hold music.
 */
function tickScheduler(): void {
  const m = live;
  if (!m || m.stopped) return;
  m.timer = setInterval(() => {
    const cur = live;
    if (!cur || cur.stopped) return;
    const horizon = cur.ctx.currentTime + 0.4;
    while (cur.nextTime < horizon) {
      playStep(cur, cur.step, cur.nextTime);
      cur.nextTime += STEP_SECONDS;
      cur.step = (cur.step + 1) % STEPS;
      if (cur.step === 0) cur.cycle++;
    }
  }, 40) as unknown as number;
}

/**
 * A burn: drop out entirely for a moment.
 *
 * The music stopping is worth more than any sting. An hour of a seven-beat cycle makes its
 * absence the loudest event available.
 */
export function musicDuck(): void {
  const m = live;
  if (!m || m.stopped) return;
  const t = m.ctx.currentTime;
  m.out.gain.cancelScheduledValues(t);
  m.out.gain.setTargetAtTime(0.0001, t, 0.06);
  m.out.gain.setTargetAtTime(0.5, t + 1.4, 0.6);
}
