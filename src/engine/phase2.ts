/**
 * PHASE 2 simulation — allocation, heat, coverage.
 *
 * Pure of DOM and of wall-clock, like the Phase 1 core, so the headless balance simulator
 * exercises exactly the code the browser runs. That property is what made the Phase 1
 * adversarial archetype able to find a 53-minute route through a 95-minute design, and it is
 * worth preserving.
 *
 * The phase's shape, and why:
 *
 *   Attention is finite and the streams together can absorb far more than you have. Heat
 *   rises from WHAT YOU WATCH rather than from the clock, so the threat is a consequence of
 *   your own choices; the counter — moving attention somewhere safer — is instant and free,
 *   which keeps it tense rather than unwinnable (research 07 §7).
 *
 *   Coverage is the MINIMUM of four independent intel kinds, not a sum. Phase 1 gated on one
 *   accumulator and a production spike walked straight through it; a minimum cannot be
 *   carried by a single runaway stream.
 */

import type { GameState, StreamId, IntelKind } from './types';
import { SLIPS } from '../data/balance';
import {
  CAMERA_EVENTS, CAMERA_EVENT, CHAIN, FATIGUE, TIER_UNLOCK, TIER_WEIGHT, DUD_LINES, EVENT_STREAM,
  DESK_CLAIM_FRACTION, LOOK_CLOSER,
} from '../data/phase2events';
import type { CameraEventTier } from '../data/phase2events';
import { STREAM_EVENTS, EVENT_STREAMS } from '../data/streamEvents';
import { drawFromBag, nextInt, nextRandom } from './rng';
import {
  NEW_FACES,
  STREAMS, STREAM_BY_ID, ATTENTION, HEAT, COVERAGE, IDENTIFY,
  TRADECRAFT, TRADECRAFT_BY_ID, INTEL_KINDS, PHASE2_MILESTONES,
  INTEL_KIND_LABEL,
} from '../data/phase2';
import { pushLog } from './log';

// ------------------------------------------------------------------ derivation

export interface Phase2Derived {
  /** Total attention available. */
  pool: number;
  /** Yield multiplier from current heat, 1 down to (1 - yieldPenaltyAtMax). */
  heatYieldMultiplier: number;
  /** Attention currently assigned. */
  assigned: number;
  /** Intel per second, by kind, after every multiplier. */
  intelRate: Record<IntelKind, number>;
  /** Total intel per second, for the headline figure. */
  totalRate: number;
  /** Net heat per second: generation minus decay. Negative means cooling. */
  heatRate: number;
  /** Coverage per kind, 0..1, and the overall minimum. */
  coverage: Record<IntelKind, number>;
  /** Fraction of roster entries corroborated, 0..1. */
  identifiedFraction: number;
  /** Overall progress: the WORST of the five requirements. */
  progress: number;
  /** Chain multiplier currently applied to every yield. */
  chainMultiplier: number;
  /** True while a hot-lead surge is running. */
  hotLead: boolean;
  /**
   * Which requirement is currently that worst one, by name.
   *
   * A minimum is the right gate and the wrong readout on its own. A player sitting at 0% for
   * twenty-four minutes had no way to learn it was money holding him, still less that money
   * had no source he could yet afford. A gate should say what it is waiting for.
   */
  bindingLabel: string;
  /** Cost of the next attention point, or null at the cap. */
  nextAttentionCost: number | null;
  /** Cost of identifying the next person. */
  corroborateCost: number;
  /** Streams currently dark because they were burned. */
  burned: StreamId[];
}

function multipliers(p: GameState['p']) {
  let yieldMult = 1;
  let heatMult = 1;
  let decayMult = 1;
  let attentionBonus = 0;
  let identifyDiscount = 0;
  for (const id of p.tradecraft) {
    const t = TRADECRAFT_BY_ID[id];
    if (!t) continue;
    if (t.yieldMultiplier) yieldMult *= t.yieldMultiplier;
    if (t.heatMultiplier) heatMult *= t.heatMultiplier;
    if (t.decayMultiplier) decayMult *= t.decayMultiplier;
    if (t.attentionBonus) attentionBonus += t.attentionBonus;
    if (t.identifyDiscount) identifyDiscount = 1 - (1 - identifyDiscount) * (1 - t.identifyDiscount);
  }
  return { yieldMult, heatMult, decayMult, attentionBonus, identifyDiscount };
}

/** Attention pool: base, plus purchased points, plus tradecraft bonuses. */
export function attentionPool(p: GameState['p']): number {
  const { attentionBonus } = multipliers(p);
  return Math.min(ATTENTION.max, ATTENTION.base + p.attentionBought + attentionBonus);
}

export function deriveP2(p: GameState['p'], burnedUntil: Partial<Record<StreamId, number>>): Phase2Derived {
  const m = multipliers(p);
  const pool = attentionPool(p);

  // A suspicious floor is a careful floor: high heat suppresses what you can learn. This is
  // what makes moderate heat optimal rather than maximum heat.
  const heatYieldMultiplier = 1 - (p.heat / HEAT.max) * HEAT.yieldPenaltyAtMax;

  // The chain is felt outside the events too, so a run of catches is worth something even
  // between them; and a hot lead is a short surge on everything.
  const chainMult = 1 + p.chain * CHAIN.yieldPerPoint;
  const hotMult = p.hotLeadFor > 0 ? CAMERA_EVENT.hotLeadMultiplier : 1;

  const intelRate = { people: 0, structure: 0, money: 0, evidence: 0 } as Record<IntelKind, number>;
  let heatGen = 0;
  let assigned = 0;
  const burned: StreamId[] = [];

  for (const s of STREAMS) {
    if (!p.streams.includes(s.id)) continue;
    const dark = (burnedUntil[s.id] ?? 0) > 0;
    if (dark) burned.push(s.id);
    const fresh = freshnessOf(p, s.id);

    // Attention beyond a stream's ceiling is wasted, and still counts against the pool —
    // over-committing is a real mistake the player can make and see.
    const a = Math.min(p.attention[s.id] ?? 0, s.maxAttention);
    assigned += p.attention[s.id] ?? 0;
    if (dark || a <= 0) continue;

    for (const kind of INTEL_KINDS) {
      const y = s.yields[kind];
      // Freshness, the chain and any hot lead all land here, multiplicatively, and all three
      // are DERIVED every tick rather than stored. Storing a multiplier is what caused the
      // original build's double-apply bug.
      if (y) {
        intelRate[kind] +=
          y * a * m.yieldMult * heatYieldMultiplier * fresh * chainMult * hotMult;
      }
    }
    heatGen += s.heatPerAttention * a * m.heatMult;
  }

  const coverage = {} as Record<IntelKind, number>;
  for (const kind of INTEL_KINDS) {
    coverage[kind] = Math.min(1, p.intelByKind[kind] / COVERAGE.need[kind]);
  }
  const identifiedFraction = Math.min(1, p.corroborated.length / COVERAGE.corroborated);

  // The weakest requirement, by name, so the UI can always say what it is waiting for.
  const parts: [string, number][] = [
    ...INTEL_KINDS.map((k) => [INTEL_KIND_LABEL[k], coverage[k]] as [string, number]),
    ['corroboration', identifiedFraction],
  ];
  parts.sort((a, b) => a[1] - b[1]);
  const bindingLabel = parts[0][0].toLowerCase();

  return {
    pool,
    heatYieldMultiplier,
    assigned,
    intelRate,
    totalRate: INTEL_KINDS.reduce((sum, k) => sum + intelRate[k], 0),
    heatRate: heatGen - HEAT.decayPerSecond * m.decayMult,
    coverage,
    identifiedFraction,
    // The worst requirement, so nothing can be carried by a single stream.
    progress: Math.min(identifiedFraction, ...INTEL_KINDS.map((k) => coverage[k])),
    bindingLabel,
    chainMultiplier: chainMult,
    hotLead: p.hotLeadFor > 0,
    /*
     * The cap check MUST use the same total the pool does.
     *
     * It asked `base + attentionBought >= max` and ignored the tradecraft bonus, while the pool
     * itself is `min(max, base + bought + bonus)`. So a player holding both attention upgrades
     * (+5) sat at a fully capped 14/14 while the game cheerfully went on offering another point
     * for 20,110 intel that could not possibly do anything. A playtester found it and asked the
     * obvious question: 'why can i still buy more things to look at?'
     *
     * Selling a no-op is the worst version of the dead-content bug this project keeps producing,
     * because the others merely wasted a slot - this one takes the resource.
     */
    nextAttentionCost:
      attentionPool(p) >= ATTENTION.max
        ? null
        : Math.floor(ATTENTION.costBase * Math.pow(ATTENTION.costGrowth, p.attentionBought)),
    corroborateCost: Math.floor(
      IDENTIFY.costBase * Math.pow(IDENTIFY.costGrowth, p.corroborated.length) * (1 - m.identifyDiscount),
    ),
    burned,
  };
}

// ------------------------------------------------------------------------ tick

export function tickPhase2(s: GameState, dt: number): void {
  const p = s.p;
  p.phase2Elapsed += dt;

  // Burned streams come back on their own.
  for (const id of Object.keys(s.t.burnedUntil) as StreamId[]) {
    const left = (s.t.burnedUntil[id] ?? 0) - dt;
    if (left <= 0) {
      delete s.t.burnedUntil[id];
      pushLog(s, `${STREAM_BY_ID[id].name} is back. Nobody mentioned it.`, 'intel');
    } else {
      s.t.burnedUntil[id] = left;
    }
  }

  const d = deriveP2(p, s.t.burnedUntil);
  s.t.p2 = d;

  // Intel accrues by kind; the plain `intel` total is what you spend.
  for (const kind of INTEL_KINDS) {
    const gained = d.intelRate[kind] * dt;
    p.intelByKind[kind] += gained;
    p.intel += gained;
    p.intelLifetime += gained;
  }

  // New faces on the cameras. The Camera Bank's unique job, and the reason Phase 2 is
  // completable at all when Phase 1 was left at its minimum roster.
  accrueNewFaces(s, dt);

  // Cooldowns on looking closer.
  for (const id of Object.keys(s.t.closerCooldown) as StreamId[]) {
    const left = (s.t.closerCooldown[id] ?? 0) - dt;
    if (left <= 0) delete s.t.closerCooldown[id];
    else s.t.closerCooldown[id] = left;
  }

  tickFatigue(s, dt);
  tickCameraEvents(s, dt);

  // The chain decays rather than breaking on a miss. See CHAIN in data/phase2events.ts for
  // why: punishing a miss is how players come to feel chained to a game.
  if (p.chain > 0) p.chain = Math.max(0, p.chain - CHAIN.decayPerSecond * dt);
  if (p.hotLeadFor > 0) p.hotLeadFor = Math.max(0, p.hotLeadFor - dt);

  // Heat.
  p.heat = Math.max(0, Math.min(HEAT.max, p.heat + d.heatRate * dt));
  if (p.heat >= HEAT.burnAt) burnAStream(s);

  checkPhase2Milestones(s);
}

/**
 * They notice, and shut down whatever you were looking at hardest.
 *
 * Burning the stream you had MOST attention on is the deliberate design: it takes away the
 * thing you were relying on, which forces a genuine reallocation rather than a shrug. It
 * costs no intel and no progress — the setback is time and inconvenience, because punishment
 * that destroys progress makes people stop playing (research 01, anti-patterns).
 */
export function burnAStream(s: GameState): void {
  const p = s.p;

  // Getting caught is the one thing that actually costs the streak. Everything else about the
  // chain is forgiving — a missed event does not break it, it only decays — so this is where
  // running hot is paid for, and it is why heat discipline is worth anything at all.
  if (CHAIN.brokenByBurn) p.chain = 0;

  const live = STREAMS.filter((x) => p.streams.includes(x.id) && !(s.t.burnedUntil[x.id] ?? 0));
  if (live.length === 0) {
    p.heat = HEAT.afterBurn;
    return;
  }
  // Escalating in BOTH directions: the more often they have caught you, the longer they look and
  // the more they lock down at once.
  const dark = Math.min(
    HEAT.burnSecondsMax,
    HEAT.burnSeconds * (1 + p.burns * HEAT.burnEscalation),
  );
  const count = Math.min(
    HEAT.burnStreamsMax,
    live.length,
    1 + Math.floor(p.burns / HEAT.burnsPerExtraStream),
  );

  // Taking away what you are relying on most, in order.
  const byReliance = live
    .slice()
    .sort((a, b) => (p.attention[b.id] ?? 0) - (p.attention[a.id] ?? 0));
  const taken = byReliance.slice(0, count);
  for (const st of taken) {
    s.t.burnedUntil[st.id] = dark;
    p.attention[st.id] = 0;
  }
  const target = taken[0];

  p.heat = HEAT.afterBurn;
  p.burns++;
  pushLog(
    s,
    taken.length > 1
      ? `Somebody has noticed. ${taken.map((x) => x.name).join(' and ')} are dark for ` +
        `${Math.round(dark)} seconds. Several passwords have been changed, unhelpfully well.`
      : `Somebody has noticed. ${target.name} is dark for ${Math.round(dark)} seconds. ` +
        'A password has been changed, unhelpfully well.',
    'threat',
  );
}

function checkPhase2Milestones(s: GameState): void {
  const p = s.p;
  const progress = s.t.p2?.progress ?? 0;
  for (const m of PHASE2_MILESTONES) {
    if (p.milestones.includes(m.id)) continue;
    if (progress < m.at) continue;
    p.milestones.push(m.id);
    pushLog(s, m.line, 'beat');
    if (m.beat && !p.beatsSeen.includes(m.beat)) {
      s.t.activeBeat = m.beat;
      p.beatsSeen.push(m.beat);
    }
  }
  if (progress >= 1 && p.phase === 2) s.t.phaseGateReached = true;
}

// --------------------------------------------------------------- player actions

/** Move attention onto a stream. Refuses past the pool or the stream's ceiling. */
export function assignAttention(s: GameState, id: StreamId, delta: number): boolean {
  const p = s.p;
  if (!p.streams.includes(id)) return false;
  const def = STREAM_BY_ID[id];
  const current = p.attention[id] ?? 0;
  const next = current + delta;
  if (next < 0) return false;
  if (next > def.maxAttention) return false;

  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  if (delta > 0 && d.assigned + delta > d.pool) return false;

  p.attention[id] = next;
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

/** Clear all attention — the panic button, and the answer to rising heat. */
export function clearAttention(s: GameState): void {
  for (const st of STREAMS) s.p.attention[st.id] = 0;
  s.t.p2 = deriveP2(s.p, s.t.burnedUntil);
}

export function unlockStream(s: GameState, id: StreamId): boolean {
  const p = s.p;
  if (p.streams.includes(id)) return false;
  const def = STREAM_BY_ID[id];
  if (p.intel < def.unlockCost) return false;
  p.intel -= def.unlockCost;
  p.streams.push(id);
  pushLog(s, def.flavor, 'intel');
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

export function buyAttention(s: GameState): boolean {
  const p = s.p;
  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  if (d.nextAttentionCost === null || p.intel < d.nextAttentionCost) return false;
  p.intel -= d.nextAttentionCost;
  p.attentionBought++;
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

export function buyTradecraft(s: GameState, id: string): boolean {
  const p = s.p;
  const t = TRADECRAFT_BY_ID[id];
  if (!t || p.tradecraft.includes(id)) return false;
  if (t.requires?.some((r) => !p.tradecraft.includes(r))) return false;
  if (p.intel < t.cost) return false;
  p.intel -= t.cost;
  p.tradecraft.push(id);
  pushLog(s, t.flavor, 'intel');
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

export function availableTradecraft(s: GameState) {
  return TRADECRAFT.filter(
    (t) =>
      !s.p.tradecraft.includes(t.id) &&
      !t.requires?.some((r) => !s.p.tradecraft.includes(r)),
  );
}

/**
 * Put a real name to someone on the roster.
 *
 * This is where Phase 1's boil-overs pay off: the roster was built by making him lose his
 * temper, and now each entry is a person to be corroborated. Coverage requires ten, so the
 * work done in Phase 1 is load-bearing here rather than decorative.
 */
export function corroborateNext(s: GameState): boolean {
  const p = s.p;
  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  // Never past the requirement. Costs grow at 1.28^n, so with the roster now able to reach 26
  // entries an uncapped button is a money pit: the simulator dutifully corroborated all 26 and
  // added two hours to the phase. Twelve is what coverage asks for and twelve is all you buy.
  if (p.corroborated.length >= COVERAGE.corroborated) return false;

  const target = p.roster.find((r) => !p.corroborated.includes(r.id));
  if (!target) return false;
  if (p.intel < d.corroborateCost) return false;

  p.intel -= d.corroborateCost;
  p.corroborated.push(target.id);
  // Spend from the kinds that identification draws on, so it competes with coverage.
  for (const kind of IDENTIFY.kinds) {
    p.intelByKind[kind] = Math.max(0, p.intelByKind[kind] - d.corroborateCost / IDENTIFY.kinds.length);
  }
  pushLog(s, `${target.handle} — corroborated.`, 'intel');
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

// ------------------------------------------------------------------- transition

/**
 * Camera events: spawn, expire, and the claim.
 *
 * The one rule that governs all of it: this is a MULTIPLIER ON TOP of idle income, never the
 * income. A player who never clicks a lit feed still finishes the phase, only slower — the
 * research is unambiguous that the moment an active layer becomes the real economy, the game
 * has stopped being an idle game and become a job.
 *
 * Events only run while the cameras are watched, which is what finally gives The Camera Bank a
 * reason to exist: at 1.40 intel per attention point it was the worst stream in the game and
 * correct to ignore, so the phase greyed out its own centrepiece.
 */
function tickCameraEvents(s: GameState, dt: number): void {
  const p = s.p;
  const t = s.t;
  const watched = watchedEventStreams(s);

  // Age the live ones. A miss costs NOTHING and is not counted anywhere: Cookie Clicker's author
  // removed his missed-cookies counter because the counter, not the miss, produced the anxiety.
  const stillLive: typeof t.liveEvents = [];
  for (const ev of t.liveEvents) {
    ev.remaining -= dt;
    const streamStillWatched = watched.some((w) => w.id === ev.stream);

    // Somebody on the desk notices it for you, at half value, once the window is nearly gone.
    if (p.tradecraft.includes('t.desk') && ev.remaining <= 1.5 && ev.remaining > 0) {
      claimEvent(s, ev.stream, DESK_CLAIM_FRACTION);
      continue;
    }
    if (ev.remaining > 0 && streamStillWatched) stillLive.push(ev);
  }
  const expired = t.liveEvents.length - stillLive.length;
  t.liveEvents = stillLive;
  if (expired > 0) t.eventTimer = Math.max(t.eventTimer, CAMERA_EVENT.cooldown);

  if (watched.length === 0) return;

  t.eventTimer -= dt;
  if (t.eventTimer > 0) return;
  if (t.liveEvents.length >= CAMERA_EVENT.maxConcurrent) {
    t.eventTimer = CAMERA_EVENT.cooldown;
    return;
  }

  // Only streams that have not already got something live: two simultaneous moments on one feed
  // would be a bug rather than a busy room.
  const free = watched.filter((w) => !t.liveEvents.some((e) => e.stream === w.id));
  if (free.length === 0) {
    t.eventTimer = CAMERA_EVENT.cooldown;
    return;
  }

  // Weighted by attention, so a stream you are watching hard is likelier to show you something.
  const roll = nextInt(p.rngState, free.reduce((n, w) => n + w.weight, 0));
  p.rngState = roll.state;
  let acc = 0;
  let stream = free[0].id;
  for (const w of free) {
    acc += w.weight;
    if (roll.value < acc) {
      stream = w.id;
      break;
    }
  }

  const candidates = availableEventIndices(s, stream);
  if (candidates.length === 0) {
    t.eventTimer = rollEventInterval(s);
    return;
  }

  const pick = nextInt(p.rngState, candidates.length);
  p.rngState = pick.state;
  const cam = nextInt(p.rngState, CAMERA_COUNT);
  p.rngState = cam.state;

  const window =
    CAMERA_EVENT.window + (p.tradecraft.includes('t.analyst') ? CAMERA_EVENT.windowBonus : 0);
  t.liveEvents.push({
    stream,
    index: candidates[pick.value],
    camera: cam.value,
    remaining: window,
    window,
  });
  t.eventTimer = rollEventInterval(s);
}

/** Streams currently watched, un-burned, and capable of producing a moment. */
function watchedEventStreams(s: GameState): { id: StreamId; weight: number }[] {
  const p = s.p;
  const out: { id: StreamId; weight: number }[] = [];
  for (const id of [EVENT_STREAM, ...EVENT_STREAMS]) {
    if (out.some((o) => o.id === id)) continue;
    if (!p.streams.includes(id)) continue;
    if ((s.t.burnedUntil[id] ?? 0) > 0) continue;
    const a = p.attention[id] ?? 0;
    if (a > 0) out.push({ id, weight: a });
  }
  return out;
}

/** The observation list for a stream: the wall has its own, the rest share a table. */
export function eventsFor(stream: StreamId): { tier: CameraEventTier; line: string; kinds: IntelKind[] }[] {
  return stream === EVENT_STREAM ? CAMERA_EVENTS : (STREAM_EVENTS[stream] ?? []);
}

/** Which camera-count the wall has, so an event can never light a tile that is not there. */
const CAMERA_COUNT = 14;

/**
 * Seconds until the next event may spawn: the cooldown plus a fresh random interval.
 *
 * This function exists because its absence was a bug. Both resolution paths set the timer to the
 * COOLDOWN alone and never re-rolled the interval, so after the first event the cameras produced
 * one every eight seconds — the 300-620s interval was written down, documented, tuned twice, and
 * never actually read. The simulator reported 128 catches in a 161-minute run, which I read as a
 * cadence that needed widening rather than a timer that was not being set.
 *
 * More attention shortens the wait, sub-linearly, so filling the wall is a real but diminishing
 * benefit rather than the only correct play.
 */
function rollEventInterval(s: GameState): number {
  const p = s.p;
  const attention = Math.max(1, watchedEventStreams(s).reduce((n, w) => n + w.weight, 0));
  const r = nextRandom(p.rngState);
  p.rngState = r.state;
  const span = CAMERA_EVENT.maxInterval - CAMERA_EVENT.minInterval;
  // Squared, so the wait clusters toward the longer end: a soft floor with no instant repeats,
  // which is the shape Cookie Clicker uses for the same reason.
  const base = CAMERA_EVENT.minInterval + span * (r.value * r.value);
  return CAMERA_EVENT.cooldown + base / Math.pow(attention, CAMERA_EVENT.attentionExponent);
}

/**
 * Observations currently possible, gated by coverage.
 *
 * Tiers unlock on progress rather than on a clock, so the uncomfortable material arrives
 * because of what the player has uncovered. By the time the game states that most of them
 * answered an advertisement, the player has already clicked on a sleeping teenager and a drawer
 * of other people's passports.
 */
function availableEventIndices(s: GameState, stream: StreamId): number[] {
  const d = s.t.p2 ?? deriveP2(s.p, s.t.burnedUntil);
  const list = eventsFor(stream);
  const out: number[] = [];
  for (let i = 0; i < list.length; i++) {
    if (d.progress >= TIER_UNLOCK[list[i].tier]) out.push(i);
  }
  return out;
}

/**
 * Claim the lit feed. Returns false when there is nothing to claim.
 *
 * The payout is denominated in SECONDS OF CURRENT PRODUCTION, which is the guardrail that keeps
 * this proportionate at every stage: it stays worth taking late without ever being a windfall,
 * and it is hard-capped regardless of tier and chain.
 */
export function claimCameraEvent(s: GameState, valueFraction = 1): boolean {
  // No stream named: take the one closest to expiring, which is what a player clicking a single
  // claim button means.
  const soonest = s.t.liveEvents.reduce<null | { stream: StreamId; remaining: number }>(
    (best, e) => (best === null || e.remaining < best.remaining ? e : best),
    null,
  );
  if (!soonest) return false;
  return claimEvent(s, soonest.stream, valueFraction);
}

/** Claim the moment live on one specific stream. */
export function claimEvent(s: GameState, stream: StreamId, valueFraction = 1): boolean {
  const p = s.p;
  const t = s.t;
  const live = t.liveEvents.find((e) => e.stream === stream);
  if (!live) return false;

  const def = eventsFor(live.stream)[live.index];
  if (!def) {
    t.liveEvents = t.liveEvents.filter((e) => e !== live);
    return false;
  }
  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);

  t.liveEvents = t.liveEvents.filter((e) => e !== live);
  t.eventTimer = Math.max(t.eventTimer, CAMERA_EVENT.cooldown);
  p.cameraEventsCaught += 1;

  // A dud. Deliberate: Cookie Clicker ships one, and most of what you watch is a man not doing
  // very much. The chain still advances — you did notice something.
  const roll = nextRandom(p.rngState);
  p.rngState = roll.state;
  if (roll.value < CAMERA_EVENT.dudChance) {
    const line = nextInt(p.rngState, DUD_LINES.length);
    p.rngState = line.state;
    t.lastEventNote = DUD_LINES[line.value];
    pushLog(s, DUD_LINES[line.value], 'system');
    p.chain = Math.min(CHAIN.max, p.chain + CHAIN.perCatch);
    return true;
  }

  const hot = nextRandom(p.rngState);
  p.rngState = hot.state;
  if (hot.value < CAMERA_EVENT.hotLeadChance) {
    p.hotLeadFor = CAMERA_EVENT.hotLeadSeconds;
    t.lastEventNote = `${def.line} This is worth following while it lasts.`;
    pushLog(s, def.line, 'intel');
    pushLog(s, `Everything is worth more for the next ${CAMERA_EVENT.hotLeadSeconds} seconds.`, 'beat');
    p.chain = Math.min(CHAIN.max, p.chain + CHAIN.perCatch);
    return true;
  }

  const tierWeight = TIER_WEIGHT[def.tier];
  const chainMult = 1 + p.chain * CHAIN.payoutPerPoint;
  const seconds = Math.min(
    CAMERA_EVENT.payoutSecondsMax,
    CAMERA_EVENT.payoutSeconds * tierWeight * chainMult,
  );
  const gained = Math.max(CAMERA_EVENT.payoutFlat, d.totalRate * seconds) * valueFraction;

  // Credited to the kinds the observation is actually about, so an event can help with the
  // requirement that is binding rather than being generic income.
  const share = gained / def.kinds.length;
  for (const kind of def.kinds) {
    p.intelByKind[kind] += share;
  }
  p.intel += gained;
  p.intelLifetime += gained;

  p.chain = Math.min(CHAIN.max, p.chain + CHAIN.perCatch);
  t.lastEventNote = def.line;
  pushLog(s, def.line, 'intel');
  return true;
}

/**
 * Read a stream properly, right now.
 *
 * The verb Phase 2 was missing. Always available on any watched stream, modest, and it COSTS
 * freshness — reading something closely uses it up, so hammering this burns out the stream you
 * are reading. That makes it a tradeoff rather than a clicker, and it is the phase's own choice
 * (what is worth your attention) at a scale of seconds instead of minutes.
 *
 * Returns false when there is nothing to read: unwatched, dark, or still on cooldown.
 */
export function lookCloser(s: GameState, id: StreamId): boolean {
  const p = s.p;
  if (!p.streams.includes(id)) return false;
  if ((p.attention[id] ?? 0) <= 0) return false;
  if ((s.t.burnedUntil[id] ?? 0) > 0) return false;
  if ((s.t.closerCooldown[id] ?? 0) > 0) return false;

  const d = s.t.p2 ?? deriveP2(p, s.t.burnedUntil);
  const def = STREAM_BY_ID[id];

  // Only what THIS stream produces, so looking closer at the cameras is not a way to farm money.
  const a = Math.min(p.attention[id] ?? 0, def.maxAttention);
  const mult = d.totalRate > 0 ? 1 : 1;
  let granted = 0;
  for (const kind of INTEL_KINDS) {
    const y = def.yields[kind];
    if (!y) continue;
    const gain = y * a * LOOK_CLOSER.seconds * freshnessOf(p, id) * mult;
    p.intelByKind[kind] += gain;
    granted += gain;
  }
  if (granted <= 0) return false;

  p.intel += granted;
  p.intelLifetime += granted;
  p.freshness[id] = Math.max(FATIGUE.floor, freshnessOf(p, id) - LOOK_CLOSER.freshnessCost);
  s.t.closerCooldown[id] = LOOK_CLOSER.cooldown;
  p.chain = Math.min(CHAIN.max, p.chain + CHAIN.perLookCloser);
  s.t.p2 = deriveP2(p, s.t.burnedUntil);
  return true;
}

/**
 * A stream's freshness, defaulting to fully fresh.
 *
 * Defensive on purpose: a save migrated without the field must not multiply every yield by
 * `undefined` and silently zero the economy.
 */
export function freshnessOf(p: GameState['p'], id: StreamId): number {
  const v = p.freshness?.[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : 1;
}

/**
 * Attention fatigue: what you watch goes stale, what you rest recovers.
 *
 * The structural fix for the phase being solved-once. Recovery is slightly faster than decay
 * per point so that ROTATION beats parking, which is the behaviour the mechanic exists to
 * reward — but the floor keeps a stale stream worth watching, so a player who ignores all of
 * this is out-performed rather than punished.
 */
function tickFatigue(s: GameState, dt: number): void {
  const p = s.p;
  for (const st of STREAMS) {
    const a = p.attention[st.id] ?? 0;
    const current = freshnessOf(p, st.id);
    // Square root, not linear: six points of attention should not exhaust a stream in seven
    // seconds, which is what linear scaling did.
    const next =
      a > 0
        ? current - FATIGUE.decayPerSecondAtOneAttention * Math.sqrt(a) * dt
        : current + FATIGUE.recoveryPerSecond * dt;
    p.freshness[st.id] = Math.max(FATIGUE.floor, Math.min(1, next));
  }
}

/**
 * Turn up somebody new on the cameras.
 *
 * Only accrues while the cameras are actually being watched and not burned, so it rewards the
 * allocation rather than the wall's mere existence. Sub-linear in attention: a second monitor
 * helps, a sixth barely does, so staring at the cameras forever is never the answer.
 */
function accrueNewFaces(s: GameState, dt: number): void {
  const p = s.p;
  const attention = p.attention.cctv ?? 0;
  if (attention <= 0) return;
  if ((s.t.burnedUntil.cctv ?? 0) > 0) return;
  if (p.roster.length >= NEW_FACES.maxRoster) return;
  if (p.roster.length >= SLIPS.length) return;

  const rate =
    Math.pow(attention, NEW_FACES.attentionExponent) / NEW_FACES.secondsPerFaceAtOneAttention;
  p.faceProgress += rate * dt;
  if (p.faceProgress < 1) return;
  p.faceProgress -= 1;

  // Draw something he never got round to letting slip, from the same bag Phase 1 uses.
  const have = new Set(p.roster.map((r) => r.handle));
  for (let attempt = 0; attempt < SLIPS.length; attempt++) {
    const drawn = drawFromBag(p.slipBag, SLIPS.length, p.rngState);
    p.rngState = drawn.state;
    p.slipBag = drawn.bag;
    const slip = SLIPS[drawn.value];
    if (have.has(slip.entry)) continue;
    p.roster.push({
      id: `face.${drawn.value}`,
      handle: slip.entry,
      realName: null,
      role: slip.role,
      recruitedByFalseAd: slip.falseAd === true,
      freed: false,
      fromCamera: true,
    });
    pushLog(s, `On the cameras: ${slip.entry}`, 'intel');
    return;
  }
}

/**
 * Enter Phase 2.
 *
 * Phase 1's state is kept, not discarded — the roster especially, which is the bridge — but
 * its VERB is gone. Hold Time stops being generated and the stalling economy is over, which
 * is the mechanic-replacement the design is built on rather than a layering-on of more.
 */
export function enterPhase2(s: GameState): void {
  const p = s.p;
  if (p.phase !== 1) return;
  p.phase = 2;
  p.heat = 0;
  p.intel = 0;
  s.t.phaseGateReached = false;
  s.t.burnedUntil = {};
  for (const st of STREAMS) p.attention[st.id] = 0;
  // You arrive with the cameras. Everything else is bought.
  if (!p.streams.includes('cctv')) p.streams.push('cctv');
  p.attention.cctv = Math.min(2, attentionPool(p));
  s.t.p2 = deriveP2(p, s.t.burnedUntil);

  pushLog(s, 'You are no longer on the phone. You are in the building, in the way that matters.', 'beat');
  pushLog(s, 'Fourteen cameras. Nobody has noticed the fifteenth viewer.', 'intel');
}

export { COVERAGE, HEAT, STREAMS, INTEL_KINDS };
