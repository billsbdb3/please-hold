/**
 * The simulation. One function, called at a fixed 20 Hz by the loop and by the
 * headless balance simulator. No DOM, no wall clock, no randomness without an
 * injected source — so a given save plus a given elapsed time always produces the
 * same outcome, in the browser and in CI alike.
 */

import type { GameState, GeneratorId } from './types';
import { derive, costOf, costOfN, maxAffordable, isUnlocked } from './derive';
import {
  COMPOSURE, RAPPORT, STALL, IDLE,
  PHASE1_MILESTONES, PHASE1_GATE, GENERATOR_BY_ID,
} from '../data/balance';
import { UPGRADES_BY_ID, isAvailable, UPGRADES } from '../data/upgrades';
import { pushLog } from './log';

/** Advance the whole game by `dt` seconds. Mutates in place, deliberately. */
export function tick(s: GameState, dt: number): void {
  const p = s.p;

  p.elapsed += dt;
  s.t.sinceStall += dt;

  // Idle: the player has stopped interacting. Generators keep producing — an
  // incremental that stops paying while you read its own text is hostile — but
  // composure stops draining, because you are not the one on the phone right now.
  if (!s.t.idle) p.activeElapsed += dt;

  // Conclusions for this tick, recomputed from facts. Never accumulated.
  s.d = derive(p);

  // --- Production ---
  const produced = s.d.hps * dt;
  p.holdTime += produced;
  p.holdTimeLifetime += produced;

  // --- Combo decay ---
  // Grace period after the last stall, then decay, unless locked by an upgrade.
  if (p.combo > 1 && !hasGrant(p, 'comboLock')) {
    if (s.t.sinceStall * 1000 > STALL.comboGraceMs) {
      p.combo = Math.max(1, p.combo - STALL.comboDecay * dt);
    }
  }

  // --- Composure ---
  if (s.t.idle) {
    // Off the phone: recover.
    p.composure = Math.min(COMPOSURE.max, p.composure + COMPOSURE.regen * dt * 2);
  } else {
    const net = COMPOSURE.regen - s.d.composureDrain;
    p.composure = Math.max(0, Math.min(COMPOSURE.max, p.composure + net * dt));
  }

  // --- Rapport ---
  // Passive gain only while genuinely holding it together. Falling apart does not
  // build trust, which is the tradeoff the composure bands exist to express.
  if (!s.t.idle && p.composure >= COMPOSURE.bands[1].min) {
    p.rapport = Math.min(
      RAPPORT.max,
      p.rapport + RAPPORT.perSecond * s.d.band.rapportMultiplier * dt,
    );
  }

  // --- Milestones ---
  checkMilestones(s);

  // --- Composure failure ---
  // A grace countdown rather than an instant loss, so the player gets a chance to
  // react and so the failure reads as a slow slide rather than a gotcha.
  if (p.composure <= COMPOSURE.criticalAt) {
    s.t.criticalFor = (s.t.criticalFor ?? 0) + dt;
    if (s.t.criticalFor >= COMPOSURE.criticalGraceSeconds) {
      loseTheCall(s);
    }
  } else if (s.t.criticalFor) {
    s.t.criticalFor = 0;
  }
}

function hasGrant(p: GameState['p'], grant: string): boolean {
  return p.upgrades.some((id) => UPGRADES_BY_ID[id]?.grants === grant);
}

/** Milestones fire exactly once, in order, and are recorded as facts. */
function checkMilestones(s: GameState): void {
  const p = s.p;
  for (const m of PHASE1_MILESTONES) {
    if (p.milestones.includes(m.id)) continue;
    if (p.holdTimeLifetime < m.at) continue;

    p.milestones.push(m.id);
    if (m.rapportFloor) p.rapport = Math.max(p.rapport, m.rapportFloor);
    pushLog(s, m.line, 'beat');

    // A narrative beat interrupts. The UI reads this and shows the panel.
    if (m.beat && !p.beatsSeen.includes(m.beat)) {
      s.t.activeBeat = m.beat;
      p.beatsSeen.push(m.beat);
    }
  }

  if (p.holdTimeLifetime >= PHASE1_GATE && p.phase === 1) {
    // Phase transition is a UI event, not an automatic state change — the player
    // chooses to proceed, because the point of no return should be pressed.
    s.t.phaseGateReached = true;
  }
}

/**
 * You broke character. The scammer hangs up.
 *
 * The penalty is deliberately mild: you keep every upgrade, every generator and
 * all lifetime progress, and lose only banked Hold Time and some Rapport. The old
 * build's equivalent knocked the player backwards in the queue, which is the
 * failure mode the research calls out — punishment that costs progress makes
 * people close the tab rather than try again.
 */
function loseTheCall(s: GameState): void {
  const p = s.p;
  p.holdTime = 0;
  p.rapport = Math.max(0, p.rapport - 8);
  p.composure = COMPOSURE.max * 0.6;
  p.combo = 1;
  s.t.criticalFor = 0;
  s.t.callEnded = true;
  pushLog(s, 'The line goes dead. You redial. A different voice answers.', 'threat');
}

// ---------------------------------------------------------------- player actions

/** A manual stall. Returns the Hold Time gained, for the popup. */
export function stall(s: GameState, nowMs: number): number {
  const p = s.p;
  if (nowMs - (s.t.lastStallAt ?? 0) < STALL.cooldown) return 0;
  s.t.lastStallAt = nowMs;

  const gain = s.d.stallValue;
  p.holdTime += gain;
  p.holdTimeLifetime += gain;
  p.totalStalls++;

  // Composure cost, unless an upgrade has removed it.
  if (!hasGrant(p, 'freeStalls')) {
    p.composure = Math.max(0, p.composure - STALL.composureCost);
  }

  // Combo, if unlocked.
  if (hasGrant(p, 'comboUnlock')) {
    p.combo = Math.min(STALL.comboMax, p.combo + STALL.comboGain);
  }

  p.rapport = Math.min(
    RAPPORT.max,
    p.rapport + RAPPORT.perStall * s.d.band.rapportMultiplier,
  );

  s.t.sinceStall = 0;
  touch(s, nowMs);
  return gain;
}

/** Buy `n` of a generator. Returns how many were actually bought. */
export function buyGenerator(s: GameState, id: GeneratorId, n: number | 'max'): number {
  const p = s.p;
  if (!isUnlocked(p, id)) return 0;
  const owned = p.generators[id] ?? 0;
  const count = n === 'max' ? maxAffordable(id, owned, p.holdTime) : n;
  if (count <= 0) return 0;
  const cost = costOfN(id, owned, count);
  if (cost > p.holdTime) return 0;

  p.holdTime -= cost;
  p.generators[id] = owned + count;

  const def = GENERATOR_BY_ID[id];
  // First purchase of a tier is a small event; announce it once.
  if (owned === 0) pushLog(s, def.flavor, 'call');
  return count;
}

export function buyUpgrade(s: GameState, id: string): boolean {
  const p = s.p;
  const u = UPGRADES_BY_ID[id];
  if (!u) return false;
  if (p.upgrades.includes(id)) return false;
  if (u.cost > p.holdTime) return false;

  const owned = new Set(p.upgrades);
  if (!isAvailable(u, {
    lifetime: p.holdTimeLifetime,
    rapport: p.rapport,
    activeTime: p.activeElapsed,
    owned,
  })) return false;

  p.holdTime -= u.cost;
  p.upgrades.push(id);
  pushLog(s, u.flavor, 'call');
  return true;
}

/** Upgrades currently purchasable or visible. */
export function availableUpgrades(s: GameState) {
  const p = s.p;
  const owned = new Set(p.upgrades);
  return UPGRADES.filter((u) =>
    isAvailable(u, {
      lifetime: p.holdTimeLifetime,
      rapport: p.rapport,
      activeTime: p.activeElapsed,
      owned,
    }),
  );
}

/** Record an interaction, clearing idle. */
export function touch(s: GameState, nowMs: number): void {
  s.t.lastInteractionAt = nowMs;
  if (s.t.idle) {
    s.t.idle = false;
    s.t.returnedFromIdle = true;
  }
}

/** Called once per frame from the loop's render hook. */
export function updateIdle(s: GameState, nowMs: number): void {
  const since = (nowMs - s.t.lastInteractionAt) / 1000;
  s.t.idle = since > IDLE.thresholdSeconds;
}

/**
 * Offline catch-up. Credits production at a reduced rate rather than simulating
 * hours of ticks — honest, cheap, and it cannot produce a different answer than
 * the player would have got by playing.
 */
export function applyOffline(s: GameState, seconds: number): number {
  if (seconds < 60) return 0;
  const capped = Math.min(seconds, IDLE.maxOfflineHours * 3600);
  s.d = derive(s.p);
  const gained = s.d.hps * capped * IDLE.offlineRate;
  s.p.holdTime += gained;
  s.p.holdTimeLifetime += gained;
  s.p.elapsed += capped;
  return gained;
}

export { costOf, costOfN, maxAffordable, isUnlocked };
