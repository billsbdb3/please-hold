/**
 * The audio facade.
 *
 * The one surface the rest of the game imports. No component or store ever touches an
 * AudioContext, the graph, or the individual sound modules directly — they call `audio.*`
 * and nothing else. That keeps the "no bare AudioContext outside src/audio/" rule trivially
 * enforceable and means the whole subsystem could be swapped without touching a caller.
 *
 * Everything here is a safe no-op before `unlock()`.
 */

import { engine } from './engine';
import * as roomTone from './roomTone';
import * as phase2Music from './phase2Music';
import type { Category } from './engine';
import * as holdMusic from './holdMusic';
import * as sfx from './sfx';
import { playPersona } from './personaTones';

export const audio = {
  /** Call once, from the "Pick up the handset" gesture. Creates the AudioContext. */
  unlock(): void {
    engine.unlock();
  },
  get unlocked(): boolean {
    return engine.unlocked;
  },

  // --- Preferences (wired to the Settings drawer) ---
  get muted(): boolean {
    return engine.isMuted;
  },
  setMuted(v: boolean): void {
    engine.setMuted(v);
  },
  toggleMuted(): boolean {
    return engine.toggleMuted();
  },
  getMasterVolume(): number {
    return engine.getMasterVolume();
  },
  setMasterVolume(v: number): void {
    engine.setMasterVolume(v);
  },
  getCategoryVolume(c: Category): number {
    return engine.getCategoryVolume(c);
  },
  setCategoryVolume(c: Category, v: number): void {
    engine.setCategoryVolume(c, v);
  },

  // --- Phase 2: the room ---
  /**
   * Start the server-room bed. Phase 1's hold music should be stopped first — they are two
   * different places and hearing both at once would say the player is in neither.
   */
  startRoom(): void {
    roomTone.startRoom();
    // The room is the place; the music is the machine keeping time in it. Room tone alone was
    // just white noise, which is exactly how it was described.
    phase2Music.startMusic();
  },
  stopRoom(): void {
    roomTone.stopRoom();
    phase2Music.stopMusic();
  },
  /** Suspicion 0..1. Closes the room down: quieter and smaller, never louder. */
  setSuspicion(f: number): void {
    roomTone.setSuspicion(f);
    phase2Music.setMusicSuspicion(f);
  },
  /** Coverage 0..1. Walks the drone's tonal centre up as the map fills in. */
  setCoverage(f: number): void {
    roomTone.setCoverage(f);
    // Layers arrive with coverage, so the music is itself a progress bar.
    phase2Music.setMusicCoverage(f);
  },
  /** Somebody noticed: duck the whole room to near-silence, then a relay. */
  burnSting(): void {
    roomTone.burnSting();
    phase2Music.musicDuck();
  },
  /** Something has appeared on a feed. */
  feedChirp(): void {
    roomTone.feedChirp();
  },
  /** Noted down. */
  noteConfirm(): void {
    roomTone.noteConfirm();
  },

  // --- Hold music ---
  startHoldMusic(): void {
    holdMusic.start();
  },
  stopHoldMusic(): void {
    holdMusic.stop();
  },
  /** 0..1 — degrade the line as heat rises. */
  setHoldMusicIntensity(v: number): void {
    holdMusic.setIntensity(v);
  },

  // --- UI sounds ---
  stall(): void {
    sfx.stallClick();
  },
  purchase(): void {
    sfx.purchase();
  },
  refused(): void {
    sfx.refused();
  },
  dossierTick(): void {
    sfx.dossierTick();
  },
  milestone(): void {
    sfx.milestone();
  },
  boilOver(): void {
    sfx.boilOver();
  },

  // --- Persona motifs ---
  persona(id: string): void {
    playPersona(id);
  },
};

export type { Category };
