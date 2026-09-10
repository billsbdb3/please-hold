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
