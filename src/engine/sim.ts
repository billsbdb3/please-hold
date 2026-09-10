/**
 * The simulation. One function, called at a fixed 20 Hz by the loop and by the
 * headless balance simulator. No DOM, no wall clock, no randomness without an
 * injected source — so a given save plus a given elapsed time always produces the
 * same outcome, in the browser and in CI alike.
 */

import type { GameState, GeneratorId } from './types';
import type { DossierDef } from '../data/balance';
import {
  derive, costOf, costOfN, maxAffordable, isUnlocked,
  maxComposure, dossierAvailable,
} from './derive';
import {
  COMPOSURE, RAPPORT, STALL, IDLE,
  PHASE1_MILESTONES, GENERATOR_BY_ID, GENERATORS,
  EVENTS, DOSSIER, DOSSIER_BY_ID, REDIAL,
  RAGE, BOIL_OVER_LINES, PERSONAS, PERSONA_BY_ID, PERSONA_SWITCH_COST,
  SLIPS, PHASE1_COMPLETION, ENDGAME_THRESHOLD,
} from '../data/balance';
import { GENERATOR_IDS } from './state';
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

  // --- Production, including any active opportunity burst ---
  const burst = s.t.burstFor > 0 ? s.t.burstMultiplier : 1;
  const produced = s.d.hps * burst * dt;
  p.holdTime += produced;
  p.holdTimeLifetime += produced;
  p.holdTimeCareer += produced;
  if (p.holdTimeLifetime > p.bestCallLifetime) p.bestCallLifetime = p.holdTimeLifetime;

  if (s.t.burstFor > 0) {
    s.t.burstFor = Math.max(0, s.t.burstFor - dt);
    if (s.t.burstFor === 0) s.t.burstMultiplier = 1;
  }

  // The dropped-call notice decays on its own. It used to be a boolean that was set
  // and never cleared, which permanently disabled the Stall button.
  if (s.t.callEndedFor > 0) s.t.callEndedFor = Math.max(0, s.t.callEndedFor - dt);
  if (s.t.breathCooldown > 0) s.t.breathCooldown = Math.max(0, s.t.breathCooldown - dt);

  // --- Opportunity events ---
  updateEvents(s, dt);

  // --- The Routine (auto-buy), once earned ---
  s.t.sinceAutoBuy += dt;
  if (s.t.sinceAutoBuy >= AUTOBUY_INTERVAL && hasAutoBuy(p)) {
    s.t.sinceAutoBuy = 0;
    autoBuyCheapest(s);
  }

  // --- Combo decay ---
  // Grace period after the last stall, then decay, unless locked by an upgrade.
  if (p.combo > 1 && !hasGrant(p, 'comboLock')) {
    if (s.t.sinceStall * 1000 > STALL.comboGraceMs) {
      p.combo = Math.max(1, p.combo - STALL.comboDecay * dt);
    }
  }

  // --- Composure ---
  const cMax = maxComposure(p);
  if (s.t.idle) {
    // Off the phone: recover.
    p.composure = Math.min(cMax, p.composure + COMPOSURE.regen * dt * 2);
  } else {
    const net = COMPOSURE.regen - s.d.composureDrain;
    p.composure = Math.max(0, Math.min(cMax, p.composure + net * dt));
  }

  // --- Rage ---
  p.rage = Math.min(RAGE.max, p.rage + RAGE.perSecond * s.d.persona.rageMultiplier * dt);
  // Decays only once he has had a moment of quiet, and never while you are away: a man
  // left on hold does not calm down, he stews. This also keeps the boil-over reachable for
  // a low-attention player, who otherwise never saw the payoff at all.
  if (!s.t.idle && s.t.sinceStall > RAGE.decayGraceSeconds) {
    p.rage = Math.max(0, p.rage - RAGE.decayPerSecond * dt);
  }
  if (p.rage >= RAGE.max) boilOver(s);

  // --- Rapport ---
  // Passive gain only while genuinely holding it together. Falling apart does not
  // build trust, which is the tradeoff the composure bands exist to express.
  if (!s.t.idle && p.composure >= (COMPOSURE.bands[1].min / COMPOSURE.max) * cMax) {
    p.rapport = Math.min(
      RAPPORT.max,
      p.rapport + RAPPORT.perSecond * s.d.band.rapportMultiplier * s.d.rapportMultiplier * dt,
    );
  }

  // --- Milestones ---
  checkMilestones(s);

  // --- Composure failure ---
  // A grace countdown rather than an instant loss, so the player gets a chance to
  // react and so the failure reads as a slow slide rather than a gotcha.
  if (p.composure <= (COMPOSURE.criticalAt / COMPOSURE.max) * cMax) {
    s.t.criticalFor = (s.t.criticalFor ?? 0) + dt;
    if (s.t.criticalFor >= COMPOSURE.criticalGraceSeconds) {
      loseTheCall(s);
    }
  } else if (s.t.criticalFor) {
    s.t.criticalFor = 0;
  }
}

/** How often The Routine fires. Frequent enough to help, slow enough to feel passive. */
const AUTOBUY_INTERVAL = 3;

function hasAutoBuy(p: GameState['p']): boolean {
  return p.dossier.some((id) => DOSSIER_BY_ID[id]?.autoBuy);
}

/**
 * Buy the single cheapest affordable tactic. Deliberately cheapest rather than
 * best-payback: the auto-buyer should keep the floor ticking over, not out-play a
 * human who is making considered purchases.
 */
function autoBuyCheapest(s: GameState): void {
  let best: GeneratorId | null = null;
  let bestCost = Infinity;
  for (const g of GENERATORS) {
    if (!isUnlocked(s.p, g.id)) continue;
    const cost = costOf(g.id, s.p.generators[g.id] ?? 0);
    if (cost <= s.p.holdTime && cost < bestCost) { bestCost = cost; best = g.id; }
  }
  if (best) buyGenerator(s, best, 1);
}

/**
 * He loses his temper.
 *
 * The payoff of the rage track, and the moment Phase 1 starts feeding Phase 2: a furious
 * man is a careless one, so something usable slips out — a name, a floor, a supervisor —
 * which is banked as a dossier page. Rage drops but not to zero, so the next one is work.
 */
function boilOver(s: GameState): void {
  const p = s.p;
  p.rage = RAGE.resetTo;
  p.boilOvers++;
  p.notes += RAGE.boilOverNotes;
  p.notesLifetime += RAGE.boilOverNotes;

  // Each boil-over discloses the NEXT thing on the list, so the payoff escalates and is
  // permanent: a name, a shift, a supervisor, a floor. Once every slip is spent, fall back
  // to the generic shouting lines so the mechanic still reads.
  const slipIndex = p.roster.length;
  if (slipIndex < SLIPS.length) {
    const slip = SLIPS[slipIndex];
    p.roster.push({
      id: `slip.${slipIndex}`,
      handle: slip.entry,
      realName: null,
      role: slip.role,
      // Honest from the start, surfaced later: see docs/DESIGN.md twist 2.
      recruitedByFalseAd: slipIndex % 3 === 1,
      freed: false,
    });
    pushLog(s, slip.line, 'beat');
    pushLog(s, `Written down: ${slip.entry}`, 'intel');
  } else {
    pushLog(s, BOIL_OVER_LINES[p.boilOvers % BOIL_OVER_LINES.length], 'beat');
  }

  // A burst, because a man shouting at you is not reading his script.
  s.t.burstMultiplier = RAGE.boilOverBurst;
  s.t.burstFor = Math.max(s.t.burstFor, RAGE.boilOverBurstSeconds);
}

/** Voices currently available, by career progress. */
export function availablePersonas(s: GameState) {
  return PERSONAS.filter((x) => s.p.holdTimeCareer >= x.unlocksAt);
}

/**
 * Change voice. Costs composure, because dropping one character and finding another
 * mid-call is work — which is what stops the player free-swapping to whichever persona
 * happens to be optimal second by second.
 */
export function switchPersona(s: GameState, id: string): boolean {
  const def = PERSONA_BY_ID[id];
  if (!def) return false;
  if (s.p.persona === id) return false;
  if (s.p.holdTimeCareer < def.unlocksAt) return false;
  if (s.p.composure <= PERSONA_SWITCH_COST) return false;

  s.p.persona = id;
  s.p.composure = Math.max(0, s.p.composure - PERSONA_SWITCH_COST);
  s.d = derive(s.p);
  pushLog(s, `You are ${def.name} now.`, 'call');
  return true;
}

/** Whether every Phase 1 condition is met. See PHASE1_COMPLETION for why there are three. */
export function phase1Complete(p: GameState['p']): boolean {
  return (
    p.holdTimeCareer >= PHASE1_COMPLETION.careerHoldTime &&
    p.rapport >= PHASE1_COMPLETION.rapport &&
    p.roster.length >= PHASE1_COMPLETION.rosterEntries
  );
}

/** Per-condition progress, 0..1 each, for the UI to show what is still outstanding. */
export function phase1Progress(p: GameState['p']) {
  return {
    time: Math.min(1, p.holdTimeCareer / PHASE1_COMPLETION.careerHoldTime),
    trust: Math.min(1, p.rapport / PHASE1_COMPLETION.rapport),
    slips: Math.min(1, p.roster.length / PHASE1_COMPLETION.rosterEntries),
  };
}

function hasGrant(p: GameState['p'], grant: string): boolean {
  return p.upgrades.some((id) => UPGRADES_BY_ID[id]?.grants === grant);
}

/**
 * Opportunity windows.
 *
 * Deliberately penalty-free: a missed window logs a line and nothing else. The
 * research is clear that the golden-cookie pattern works because it rewards
 * attention rather than punishing absence — the moment a missed event costs you
 * something, an idle game becomes a chore with a timer.
 *
 * Scheduling uses a COUNTDOWN, never an absolute timestamp. The old build stored
 * `Date.now()` deadlines in the save (audit bug #5), so reloading after a break
 * rapid-fired every event that had "expired" while the tab was closed.
 */
function updateEvents(s: GameState, dt: number): void {
  // Windows only open while the player is actually present. Firing them into an
  // empty room would just manufacture a miss.
  if (s.t.idle) return;

  if (s.t.event) {
    s.t.event.expiresIn -= dt;
    if (s.t.event.expiresIn <= 0) {
      s.t.event = null;
      s.t.eventsMissed++;
      s.t.nextEventIn = rollEventDelay(s);
      pushLog(s, 'The moment passes. He picks up where he left off.', 'system');
    }
    return;
  }

  s.t.nextEventIn -= dt;
  if (s.t.nextEventIn > 0) return;

  const pool = EVENTS.pool;
  // Deterministic selection from the elapsed clock, so the simulator and the browser
  // agree and a run is reproducible.
  const pick = pool[Math.floor(Math.abs(Math.sin(s.p.elapsed * 7.3) * pool.length)) % pool.length];
  s.t.event = {
    id: pick.id,
    label: pick.label,
    expiresIn: EVENTS.windowSeconds,
    multiplier: pick.multiplier,
    duration: pick.duration,
  };
}

function rollEventDelay(s: GameState): number {
  let rate = 1;
  for (const id of s.p.dossier) {
    const dd = DOSSIER_BY_ID[id];
    if (dd?.eventRateMultiplier) rate *= dd.eventRateMultiplier;
  }
  const span = EVENTS.maxInterval - EVENTS.minInterval;
  const jitter = Math.abs(Math.sin(s.p.elapsed * 3.1)) * span;
  return (EVENTS.minInterval + jitter) / rate;
}

/** Catch the open window. Returns the multiplier granted, or 0 if there was none. */
export function catchEvent(s: GameState): number {
  const e = s.t.event;
  if (!e) return 0;
  s.t.burstMultiplier = e.multiplier;
  s.t.burstFor = e.duration;
  s.t.event = null;
  s.t.eventsCaught++;
  s.t.nextEventIn = rollEventDelay(s);
  pushLog(s, `Production ×${e.multiplier} for ${e.duration} seconds.`, 'intel');
  return e.multiplier;
}

// ------------------------------------------------------------------------ redial

/** Whether hanging up and calling back is currently allowed. */
export function canRedial(s: GameState): boolean {
  // Eligible once any call has gone deep enough. It is safe to key this on the best-ever
  // figure now that the PAYOUT is cumulative: the button may be lit, but pressing it
  // without new depth grants nothing, so there is nothing to farm.
  return Math.max(s.p.bestCallLifetime, s.p.holdTimeLifetime) >= REDIAL.minLifetimeToRedial;
}

/**
 * Hang up and call back — the within-phase soft reset.
 *
 * Banks Notes, wipes the call, keeps the dossier. Note what is NOT reset:
 * `holdTimeLifetime` is, because it measures this call, but `bestCallLifetime`,
 * `notesLifetime`, `redials`, `dossier`, `roster` and `beatsSeen` persist. Milestones
 * persist too — you do not re-watch the narrative beats you have already seen, which
 * is the difference between a prestige loop and a punishment.
 */
export function redial(s: GameState): number {
  const p = s.p;
  if (!canRedial(s)) return 0;

  const gained = s.d.notesOnRedial;
  p.notes += gained;
  p.notesLifetime += gained;
  // Advance the ratchet to the UNMULTIPLIED base, so this progress is never paid for twice
  // and the dossier's Notes bonus cannot inflate what counts as already-granted.
  p.redialNotesGranted = Math.floor(Math.sqrt(p.holdTimeCareer / REDIAL.divisor));
  p.redials++;

  // Wipe the call itself.
  p.holdTime = 0;
  p.holdTimeLifetime = 0;
  p.upgrades = [];
  p.combo = 1;
  p.totalStalls = 0;
  for (const id of GENERATOR_IDS) p.generators[id] = 0;

  // He half-remembers you. Some rapport survives.
  p.rapport = Math.floor(p.rapport * REDIAL.rapportRetained);
  // Rage mostly carries: a different person answers, but the floor has heard about you.
  p.rage = p.rage * RAGE.carriedAcrossRedial;

  applyDossierStart(s);

  s.t.event = null;
  s.t.burstFor = 0;
  s.t.burstMultiplier = 1;
  s.t.nextEventIn = 70;
  s.d = derive(p);

  pushLog(s, `You hang up. You wait four minutes. You call back. ${gained} pages.`, 'beat');
  return gained;
}

/** Apply permanent dossier head-starts to a fresh call. */
export function applyDossierStart(s: GameState): void {
  const p = s.p;
  p.composure = maxComposure(p);
  let startRapport = 0;
  for (const id of p.dossier) {
    const dd = DOSSIER_BY_ID[id];
    if (!dd) continue;
    if (dd.startingRapport) startRapport = Math.max(startRapport, dd.startingRapport);
    if (dd.startingGenerators) {
      for (const [gid, n] of Object.entries(dd.startingGenerators)) {
        p.generators[gid as GeneratorId] = (p.generators[gid as GeneratorId] ?? 0) + (n ?? 0);
      }
    }
  }
  p.rapport = Math.max(p.rapport, startRapport);
}

export function buyDossier(s: GameState, id: string): boolean {
  const p = s.p;
  const dd = DOSSIER_BY_ID[id];
  if (!dd) return false;
  if (!dossierAvailable(p, dd)) return false;
  if (dd.cost > p.notes) return false;
  p.notes -= dd.cost;
  p.dossier.push(id);
  // Head-starts apply immediately, so a purchase is felt now rather than next call.
  applyDossierStart(s);
  s.d = derive(p);
  pushLog(s, dd.flavor, 'intel');
  return true;
}

export function availableDossier(s: GameState): DossierDef[] {
  return DOSSIER.filter((d) => dossierAvailable(s.p, d));
}

/** Milestones fire exactly once, in order, and are recorded as facts. */
function checkMilestones(s: GameState): void {
  const p = s.p;
  for (const m of PHASE1_MILESTONES) {
    if (p.milestones.includes(m.id)) continue;
    if (p.holdTimeCareer < m.at) continue;

    p.milestones.push(m.id);
    if (m.rapportFloor) p.rapport = Math.max(p.rapport, m.rapportFloor);
    pushLog(s, m.line, 'beat');

    // A narrative beat interrupts. The UI reads this and shows the panel.
    if (m.beat && !p.beatsSeen.includes(m.beat)) {
      s.t.activeBeat = m.beat;
      p.beatsSeen.push(m.beat);
    }
  }

  // The endgame announces itself before it arrives, so the spike is foreshadowed rather
  // than a bar silently filling.
  if (
    !s.t.endgameAnnounced &&
    p.phase === 1 &&
    p.holdTimeCareer >= PHASE1_COMPLETION.careerHoldTime * ENDGAME_THRESHOLD
  ) {
    s.t.endgameAnnounced = true;
    pushLog(s, 'He is not keeping up with you any more. He has stopped pretending to read.', 'beat');
  }

  if (phase1Complete(p) && p.phase === 1) {
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
  p.composure = maxComposure(p) * 0.6;
  p.combo = 1;
  s.t.criticalFor = 0;
  s.t.callEndedFor = COMPOSURE.dropNoticeSeconds;
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
  p.holdTimeCareer += gain;
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
    p.rapport + RAPPORT.perStall * s.d.band.rapportMultiplier * s.d.rapportMultiplier,
  );

  // Playing dumb in character is what winds him up.
  p.rage = Math.min(RAGE.max, p.rage + s.d.ragePerStall);

  s.t.sinceStall = 0;
  touch(s, nowMs);
  return gain;
}

/** Cost of taking a breath right now: a floor, scaled by current production. */
export function breathCost(s: GameState): number {
  return Math.max(COMPOSURE.breath.minCost, s.d.hps * COMPOSURE.breath.ppsMultiplier);
}

/** Whether the breath action is currently available. */
export function canTakeBreath(s: GameState): boolean {
  if (s.t.breathCooldown > 0) return false;
  if (s.p.composure >= maxComposure(s.p)) return false;
  return s.p.holdTime >= breathCost(s);
}

/**
 * Spend banked Hold Time to recover composure — the active counter to the drain.
 *
 * In fiction: you put him on hold, and you sit for a moment. It costs you the thing you
 * are trying to accumulate, which is the point; the decision is whether staying on this
 * call is worth what it costs to stay calm on it.
 */
export function takeBreath(s: GameState): boolean {
  if (!canTakeBreath(s)) return false;
  const cost = breathCost(s);
  const max = maxComposure(s.p);
  s.p.holdTime -= cost;
  s.p.composure = Math.min(max, s.p.composure + max * COMPOSURE.breath.restoreFraction);
  s.t.breathCooldown = COMPOSURE.breath.cooldownSeconds;
  s.t.criticalFor = 0;
  pushLog(s, 'You ask him to hold. You sit with it for a moment.', 'system');
  return true;
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
    lifetime: p.holdTimeCareer,
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
      lifetime: p.holdTimeCareer,
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
  s.p.holdTimeCareer += gained;
  s.p.elapsed += capped;
  return gained;
}

export { costOf, costOfN, maxAffordable, isUnlocked };
