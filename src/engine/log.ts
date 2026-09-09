/**
 * The activity log.
 *
 * In an incremental with no cutscenes, the log IS the narration. The research is
 * emphatic on this: Paperclips and A Dark Room carry their entire story in a
 * scrolling column of flat sentences, and the log doubles as the game's main
 * feedback channel — something happened, here is a line about it.
 *
 * The structural model is the Cookie Clicker news ticker: one fixed frame, applied
 * to escalating catastrophe, which the frame never acknowledges. Our fixed frame is
 * the call transcript. It stays a call transcript even when what it is transcribing
 * has stopped being a phone call.
 */

import type { GameState, LogLine } from './types';

/**
 * Cap. A six-hour session would otherwise accumulate tens of thousands of nodes
 * and the DOM would become the performance problem.
 */
const MAX_LINES = 140;

export function pushLog(s: GameState, text: string, kind: LogLine['kind'] = 'system'): void {
  // Collapse immediate duplicates into a counter rather than repeating the line.
  // A log that says the same thing four times reads as a bug, not as emphasis.
  const last = s.t.log[s.t.log.length - 1];
  if (last && last.text === text) {
    last.repeat = (last.repeat ?? 1) + 1;
    return;
  }

  s.t.log.push({
    id: s.t.nextId++,
    text,
    kind,
    at: s.p.elapsed,
  });

  if (s.t.log.length > MAX_LINES) s.t.log.splice(0, s.t.log.length - MAX_LINES);
}

export function freshTransient(nowMs: number): GameState['t'] {
  return {
    log: [],
    lastInteractionAt: nowMs,
    idle: false,
    sinceStall: 0,
    popups: [],
    activeBeat: null,
    lastStallAt: 0,
    criticalFor: 0,
    callEnded: false,
    phaseGateReached: false,
    returnedFromIdle: false,
    nextId: 1,
    event: null,
    // First window is deliberately early so the mechanic teaches itself before the
    // player has settled into pure autopilot.
    nextEventIn: 70,
    burstFor: 0,
    burstMultiplier: 1,
    eventsCaught: 0,
    eventsMissed: 0,
  };
}
