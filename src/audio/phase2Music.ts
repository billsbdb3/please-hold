/**
 * PHASE 2 MUSIC — the hold music, from inside the building.
 *
 * WHY THIS IS THE SECOND ATTEMPT
 * ------------------------------
 * The first version was an abstract sequencer in seven with no thirds and no fifths. Technically
 * cold, and the playtest verdict was "music is still trash. needs to be music like the first one
 * with a twist." That is a better idea than mine, and it is better because it is the one the
 * FICTION was already asking for.
 *
 * You spent ninety minutes listening to their hold music down a telephone line. You are now on a
 * machine inside the building where it is generated. One of the game's own event lines says it
 * outright: "A recording has finished processing. It is nineteen minutes long. Two of those
 * minutes are hold music. It is the hold music."
 *
 * So this is the SAME PIECE — same key, same I-vi-IV-V loop, same plodding shape as
 * src/audio/holdMusic.ts, deliberately shared so it is recognisable within a bar. The twist is
 * everything about the listening:
 *
 *   - NO TELEPHONE FILTER. Phase 1 plays through a 900 Hz band-pass because you are on a phone.
 *     Here you are in the room: full range, with a sub octave underneath that the phone line
 *     physically could not carry. Same tune, suddenly with a body.
 *   - SLOWER. 92 BPM becomes 61. Recognisable, wrong.
 *   - THE THIRDS GO FLAT. Each chord's major third drops a semitone, so the cheerful I-vi-IV-V
 *     turns modal and sour without changing a single root. The progression you know, in a key it
 *     was not in.
 *   - THE MELODY IS MISSING AT FIRST, and returns as coverage grows. At the start you get the pad
 *     and the bass - the tune as heard through a wall. By the end the melody is back, complete,
 *     in the room with you.
 *
 * THE MUSIC IS THE PROGRESS BAR. Nobody notices a layer arriving. They notice, an hour later,
 * that they are hearing the whole thing.
 *
 * SUSPICION takes it away again: layers drop, detune widens, and the phone filter creeps BACK -
 * as if you were being pushed out of the room and onto the line again. A burn drops it entirely.
 */

import { engine } from './engine';

/**
 * Phase 1's material, restated rather than imported.
 *
 * holdMusic.ts keeps these private, and copying four short arrays is better than exporting its
 * internals and coupling two soundscapes that need to evolve separately. If Phase 1's loop ever
 * changes, this comment is the reminder that these must change with it.
 */
const ROOT = 220; // A3, as Phase 1
const CHORDS: number[][] = [
  [0, 4, 7], // A   (I)
  [9, 12, 16], // F#m (vi)
  [5, 9, 12], // D   (IV)
  [7, 11, 14], // E   (V)
];
const BASS_LINE = [0, 9, 5, 7];

/** Phase 1's melody walks the chord tones, one note per beat. */
const SEMI = (n: number) => ROOT * Math.pow(2, n / 12);

/**
 * Flatten every major third by a semitone.
 *
 * This is the whole twist in one function. A major third is 4 semitones above the root and a
 * minor third is 3, so dropping any interval of 4 or 16 turns the chord minor while leaving the
 * root and fifth alone. The progression stays I-vi-IV-V; it simply stops being pleased about it.
 */
function sour(semis: number, degreeRoot: number): number {
  const interval = ((semis - degreeRoot) % 12 + 12) % 12;
  return interval === 4 ? semis - 1 : semis;
}

const BPM = 61;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS_PER_CHORD = 2;

interface Music {
  ctx: AudioContext;
  out: GainNode;
  /** The telephone band-pass, wide open in the room and closing as suspicion rises. */
  phone: BiquadFilterNode;
  timer: number | null;
  nextTime: number;
  /** Half-bar index through the loop. */
  step: number;
  coverage: number;
  suspicion: number;
  stopped: boolean;
}

let live: Music | null = null;

/** How much of the piece the player has earned back. */
function layers(coverage: number, suspicion: number): number {
  let n = 1; // pad and bass: the tune through a wall
  if (coverage >= 0.12) n = 2; // sub octave — the body a phone line cannot carry
  if (coverage >= 0.3) n = 3; // the melody, in fragments
  if (coverage >= 0.55) n = 4; // the melody, complete
  if (coverage >= 0.8) n = 5; // and a counter-line above it
  if (suspicion > 0.6) n = Math.max(1, n - 1);
  if (suspicion > 0.85) n = Math.max(1, n - 2);
  return n;
}

export function startMusic(): void {
  if (live && !live.stopped) return;
  const ctx = engine.context();
  const bus = engine.bus('music');
  if (!ctx || !bus) return;

  const out = ctx.createGain();
  out.gain.value = 0.0001;
  const phone = ctx.createBiquadFilter();
  // Wide open: you are in the room, not on the line. Suspicion narrows this back down.
  phone.type = 'lowpass';
  phone.frequency.value = 7000;
  phone.Q.value = 0.5;
  out.connect(phone).connect(bus);

  live = {
    ctx, out, phone, timer: null,
    nextTime: ctx.currentTime + 0.2, step: 0,
    coverage: 0, suspicion: 0, stopped: false,
  };
  out.gain.setTargetAtTime(0.62, ctx.currentTime, 2.5);
  run();
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
  // The phone line creeping back: at full suspicion you are hearing it the way you did in Phase 1,
  // pushed out of the room and back onto the handset.
  m.phone.frequency.setTargetAtTime(7000 - 5800 * m.suspicion, m.ctx.currentTime, 3);
}

/** One voice. Detune rises with suspicion, exactly as Phase 1's line degrades under rage. */
function note(
  m: Music,
  at: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  detune = 0,
): void {
  const { ctx } = m;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune + m.suspicion * 26;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.02);
  g.gain.setTargetAtTime(gain * 0.7, at + 0.05, dur * 0.4);
  g.gain.setTargetAtTime(0.0001, at + dur * 0.75, 0.12);
  o.connect(g).connect(m.out);
  o.start(at);
  o.stop(at + dur + 0.1);
}

/** Schedule one half-bar, mirroring Phase 1's structure so the two are the same piece. */
function scheduleHalfBar(m: Music, step: number, time: number): void {
  const n = layers(m.coverage, m.suspicion);
  const chordIndex = Math.floor(step / (BARS_PER_CHORD * 2)) % CHORDS.length;
  const chord = CHORDS[chordIndex] ?? CHORDS[0];
  const degreeRoot = chord[0];
  const bassRoot = BASS_LINE[chordIndex] ?? 0;
  const detune = 3 + m.suspicion * 20;

  // 1. The pad, soured. The tune as heard through a wall.
  for (const semis of chord) {
    note(m, time, SEMI(sour(semis, degreeRoot)), BAR * 0.5 * 0.98, 'triangle', 0.05, -detune);
  }

  // 2. The bass, and beneath it the sub octave a telephone could not carry.
  note(m, time, SEMI(bassRoot - 12), BAR * 0.5 * 0.9, 'triangle', 0.075, 0);
  if (n >= 2) {
    note(m, time, SEMI(bassRoot - 24), BAR * 0.5 * 0.85, 'sine', 0.11, 0);
  }

  // 3. The melody, returning. Fragments first - one beat of the two - then both.
  if (n >= 3) {
    const beats = n >= 4 ? [0, 1] : [step % 2];
    for (const beat of beats) {
      const t = time + beat * BEAT;
      const toneIndex = (step + beat) % chord.length;
      const semis = sour(chord[toneIndex] ?? 0, degreeRoot);
      note(m, t, SEMI(semis + 12), BEAT * 0.85, 'square', 0.042, detune);
    }
  }

  // 4. A counter-line above it. It is nearly over.
  if (n >= 5 && step % 2 === 1) {
    const semis = sour(chord[(step + 2) % chord.length] ?? 0, degreeRoot);
    note(m, time + BEAT * 1.5, SEMI(semis + 24), BEAT * 0.7, 'sine', 0.03, -detune);
  }
}

/** Lookahead scheduler, same shape as Phase 1's. A coarse timer cannot place notes itself. */
function run(): void {
  const m = live;
  if (!m || m.stopped) return;
  m.timer = setInterval(() => {
    const cur = live;
    if (!cur || cur.stopped) return;
    const horizon = cur.ctx.currentTime + 0.8;
    while (cur.nextTime < horizon) {
      scheduleHalfBar(cur, cur.step, cur.nextTime);
      cur.nextTime += BAR * 0.5;
      cur.step = (cur.step + 1) % (CHORDS.length * BARS_PER_CHORD * 2);
    }
  }, 250) as unknown as number;
}

/**
 * A burn: the music stops.
 *
 * Worth more than any sting. An hour of a loop this familiar makes its absence the loudest thing
 * available, and it is the same gesture the room tone makes at the same moment.
 */
export function musicDuck(): void {
  const m = live;
  if (!m || m.stopped) return;
  const t = m.ctx.currentTime;
  m.out.gain.cancelScheduledValues(t);
  m.out.gain.setTargetAtTime(0.0001, t, 0.07);
  m.out.gain.setTargetAtTime(0.62, t + 1.6, 0.7);
}
