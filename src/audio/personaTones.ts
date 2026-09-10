/**
 * Persona motifs: a distinct 2-3 note figure per voice, played on switching to it.
 *
 * These are NOT speech and must never be mistaken for it — they are little instrumental
 * stings, one per character, chosen to sit with the persona's flavour in src/data/balance.ts:
 *   - Doris: bewildered and gentle — a soft, questioning rise that trails off.
 *   - Nigel: officious — a clipped, self-important two-note fanfare.
 *   - The Teenager: flat and monotone — the same note, twice, going nowhere.
 *   - Mr Pemberton: precise and pedantic — three even, deliberate steps.
 *   - Deborah, Accounts Payable: clipped and bureaucratic — two curt, staccato notes.
 *   - A Very Sincere Man: oddly warm — a gentle, consonant major third that lingers.
 *
 * If a persona has no entry (a new voice added later), nothing plays rather than a wrong
 * sound. Every node self-cleans. No files.
 */

import { engine } from './engine';

interface MotifNote {
  freq: number;
  /** Start offset from the motif's beginning, seconds. */
  at: number;
  dur: number;
  type: OscillatorType;
  peak: number;
}

/** Motifs keyed by persona id (see PERSONAS in src/data/balance.ts). */
const MOTIFS: Record<string, MotifNote[]> = {
  // Gentle, questioning, trails upward and softens.
  doris: [
    { freq: 392.0, at: 0, dur: 0.18, type: 'sine', peak: 0.12 },
    { freq: 493.88, at: 0.16, dur: 0.26, type: 'sine', peak: 0.1 },
  ],
  // Officious little fanfare: two firm notes, the second higher and clipped.
  nigel: [
    { freq: 523.25, at: 0, dur: 0.12, type: 'square', peak: 0.1 },
    { freq: 698.46, at: 0.12, dur: 0.16, type: 'square', peak: 0.11 },
  ],
  // Monotone. The same note, twice, expressing nothing.
  teenager: [
    { freq: 329.63, at: 0, dur: 0.14, type: 'triangle', peak: 0.1 },
    { freq: 329.63, at: 0.18, dur: 0.14, type: 'triangle', peak: 0.1 },
  ],
  // Pedantic: three even, deliberate ascending steps, each exactly alike in shape.
  pemberton: [
    { freq: 440.0, at: 0, dur: 0.13, type: 'triangle', peak: 0.11 },
    { freq: 523.25, at: 0.15, dur: 0.13, type: 'triangle', peak: 0.11 },
    { freq: 659.25, at: 0.3, dur: 0.15, type: 'triangle', peak: 0.11 },
  ],
  // Bureaucratic: two curt staccato notes, dry and final. No PO number, no third note.
  deborah: [
    { freq: 587.33, at: 0, dur: 0.08, type: 'square', peak: 0.11 },
    { freq: 466.16, at: 0.11, dur: 0.08, type: 'square', peak: 0.11 },
  ],
  // Oddly warm: a soft major third that lingers, entirely sincere.
  sincere: [
    { freq: 349.23, at: 0, dur: 0.28, type: 'sine', peak: 0.11 },
    { freq: 440.0, at: 0.06, dur: 0.34, type: 'sine', peak: 0.09 },
  ],
};

/** Play the motif for a persona id. No-op before unlock or for an unknown id. */
export function playPersona(id: string): void {
  const motif = MOTIFS[id];
  if (!motif) return;
  const ctx = engine.context();
  const bus = engine.bus('voice');
  if (!ctx || !bus) return;

  const base = ctx.currentTime;
  for (const n of motif) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type;
    osc.frequency.value = n.freq;
    const start = base + n.at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(n.peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
    osc.connect(gain).connect(bus);
    osc.start(start);
    osc.stop(start + n.dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* gone */
      }
    };
  }
}

/** Exposed for tests: which persona ids have a motif. */
export function hasMotif(id: string): boolean {
  return id in MOTIFS;
}
