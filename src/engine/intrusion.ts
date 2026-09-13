/**
 * THE INTRUSION ENGINE.
 *
 * Phase 2's verb: you act on a named machine and something specific happens. See
 * src/data/intrusion.ts for why this replaced attention allocation rather than being layered on
 * top of it.
 *
 * The invariant that governs everything here is the same one the rest of the codebase follows:
 * persisted state holds FACTS — which machines you have a foothold on, what access you hold, what
 * you have taken — and every multiplier is derived. Nothing stores a computed rate.
 */

import type { GameState, IntelKind } from './types';
import {
  ACTION_BY_ID, ACTIONS, INTRUSION, MACHINES, MACHINE_BY_ID, ENTRY_MACHINE,
  type Access, type ActionId, type MachineDef,
} from '../data/intrusion';
import { COVERAGE, HEAT } from '../data/phase2';
import { SLIPS } from '../data/balance';
import { nextRandom, drawFromBag } from './rng';
import { pushLog } from './log';

/** What the player can see about one machine right now. */
export interface MachineView {
  def: MachineDef;
  /** none = revealed but not yet footholded. */
  access: Access;
  /** True once revealed by another machine (or the entry machine). */
  known: boolean;
  /** Cooldowns remaining per action, seconds. */
  cooling: Partial<Record<ActionId, number>>;
  /** Actions currently possible, with what each would cost and roughly yield. */
  available: { def: (typeof ACTIONS)[number]; heat: number; ready: boolean }[];
}

/** Access held on a machine. */
export function accessOf(p: GameState['p'], id: string): Access {
  if (p.admin?.includes(id)) return 'admin';
  if (p.footholds?.includes(id)) return 'user';
  return 'none';
}

/** Machines the player knows about: the entry machine plus everything revealed. */
export function knownMachines(p: GameState['p']): string[] {
  const known = new Set<string>([ENTRY_MACHINE]);
  for (const id of p.revealed ?? []) known.add(id);
  return MACHINES.filter((m) => known.has(m.id)).map((m) => m.id);
}

/** Heat one action would add on one machine, before any tradecraft reduction. */
export function heatOf(machine: MachineDef, action: ActionId): number {
  const def = ACTION_BY_ID[action];
  let h = def.heat * machine.exposure;
  // A camera on a machine somebody is sitting at: the light comes on and they are there to see it.
  if (action === 'webcam' && machine.occupied) h += INTRUSION.webcamOccupiedHeat;
  return h;
}

/**
 * Everything the player can see and do, rebuilt each frame.
 *
 * Derived rather than stored, for the same reason every other multiplier in this codebase is: the
 * original build shipped a double-apply bug by persisting one.
 */
export function viewMachines(s: GameState): MachineView[] {
  const p = s.p;
  const out: MachineView[] = [];
  for (const id of knownMachines(p)) {
    const def = MACHINE_BY_ID[id];
    const access = accessOf(p, id);
    const cooling = s.t.actionCooldown?.[id] ?? {};
    out.push({
      def,
      access,
      known: true,
      cooling,
      available: ACTIONS.map((a) => ({
        def: a,
        heat: heatOf(def, a.id),
        ready:
          canDo(access, a.needs)
          && (cooling[a.id] ?? 0) <= 0
          && !(a.id === 'escalate' && access === 'admin'),
      })),
    });
  }
  return out;
}

function canDo(held: Access, needs: Access): boolean {
  if (needs === 'none') return true;
  if (needs === 'user') return held === 'user' || held === 'admin';
  return held === 'admin';
}

/** Establish a foothold on a revealed machine. */
export function takeFoothold(s: GameState, id: string): boolean {
  const p = s.p;
  const def = MACHINE_BY_ID[id];
  if (!def) return false;
  if (!knownMachines(p).includes(id)) return false;
  if (accessOf(p, id) !== 'none') return false;
  if (p.intel < def.footholdCost) return false;

  p.intel -= def.footholdCost;
  p.footholds = [...(p.footholds ?? []), id];
  pushLog(s, `${def.host} — you are on it. ${def.note}`, 'intel');
  return true;
}

/**
 * Do something to a machine.
 *
 * Returns what was taken, or null when the action was not possible. Never fails silently: the
 * caller reports either the haul or the refusal, because a button that does nothing without saying
 * so is how the soundboard shipped broken.
 */
export interface ActionResult {
  machine: string;
  action: ActionId;
  /** Intel gained by kind. Empty when the action found nothing. */
  gained: Partial<Record<IntelKind, number>>;
  total: number;
  heat: number;
  /** One line describing what happened, for the log. */
  line: string;
  /** A new machine this action revealed. */
  revealed?: string;
  /** A new roster entry this action turned up. */
  face?: string;
  /** Access gained. */
  escalated?: boolean;
}

export function act(s: GameState, id: string, action: ActionId): ActionResult | null {
  const p = s.p;
  const def = MACHINE_BY_ID[id];
  const adef = ACTION_BY_ID[action];
  if (!def || !adef) return null;

  const access = accessOf(p, id);
  if (!canDo(access, adef.needs)) return null;
  if ((s.t.actionCooldown?.[id]?.[action] ?? 0) > 0) return null;
  if (action === 'escalate' && access === 'admin') return null;

  // Cooldown first, so every path below is rate-limited whatever it returns.
  s.t.actionCooldown ??= {};
  s.t.actionCooldown[id] ??= {};
  s.t.actionCooldown[id][action] = adef.cooldown;

  const heat = heatOf(def, action);
  p.heat = Math.min(HEAT.max, p.heat + heat);

  const result: ActionResult = {
    machine: id, action, gained: {}, total: 0, heat, line: '',
  };

  // --- Escalation: access, and the map growing.
  if (action === 'escalate') {
    p.admin = [...(p.admin ?? []), id];
    const fresh = def.reveals.filter((r) => !(p.revealed ?? []).includes(r));
    if (fresh.length > 0) {
      const roll = nextRandom(p.rngState);
      p.rngState = roll.state;
      const found = fresh[Math.floor(roll.value * fresh.length)];
      p.revealed = [...(p.revealed ?? []), found];
      result.revealed = found;
      result.line =
        `Administrator on ${def.host}. ${MACHINE_BY_ID[found].host} is reachable from here.`;
    } else {
      result.line = `Administrator on ${def.host}. Nothing new is reachable from it.`;
    }
    result.escalated = true;
    pushLog(s, result.line, 'intel');
    return result;
  }

  // --- A camera on an occupied desk: a face, which is a roster entry.
  if (action === 'webcam') {
    const roll = nextRandom(p.rngState);
    p.rngState = roll.state;
    if (def.occupied && roll.value < INTRUSION.webcamFaceChance && p.roster.length < SLIPS.length) {
      const drawn = drawFromBag(p.slipBag, SLIPS.length, p.rngState);
      p.rngState = drawn.state;
      p.slipBag = drawn.bag;
      const slip = SLIPS[drawn.value];
      if (!p.roster.some((r) => r.handle === slip.entry)) {
        p.roster.push({
          id: `face.${drawn.value}`,
          handle: slip.entry,
          realName: null,
          role: slip.role,
          recruitedByFalseAd: slip.falseAd === true,
          freed: false,
          fromCamera: true,
        });
        result.face = slip.entry;
      }
    }
    result.line = def.occupied
      ? result.face
        ? `The camera on ${def.host} comes on. Somebody is at the desk. ${result.face}`
        : `The camera on ${def.host} comes on. Somebody is at the desk, and does not look up.`
      : `The camera on ${def.host} comes on. An empty chair, and a wall.`;
  }

  // --- The rest: a haul, weighted by what this machine holds and how much access you have.
  const scale = INTRUSION.accessMultiplier[access];
  const weight = actionWeight(action);
  const seconds = INTRUSION.actionSeconds;
  let total = 0;

  if (action === 'sweep') {
    const roll = nextRandom(p.rngState);
    p.rngState = roll.state;
    if (roll.value < INTRUSION.sweepDudChance) {
      result.line = `Nothing on ${def.host}. Somebody has been tidy, once.`;
      pushLog(s, result.line, 'system');
      return result;
    }
  }

  for (const kind of Object.keys(def.yields) as IntelKind[]) {
    const y = def.yields[kind] ?? 0;
    const gain = y * scale * weight * seconds;
    if (gain <= 0) continue;
    p.intelByKind[kind] += gain;
    result.gained[kind] = gain;
    total += gain;
  }
  p.intel += total;
  p.intelLifetime += total;
  result.total = total;

  if (!result.line) result.line = describe(def, action);
  pushLog(s, result.line, 'intel');
  return result;
}

/** How much of a machine's worth each action extracts. */
function actionWeight(action: ActionId): number {
  switch (action) {
    case 'files': return 1.0;
    case 'screen': return 0.75;
    case 'webcam': return 0.5;
    case 'database': return 3.2;
    case 'sweep': return 0.3;
    default: return 0;
  }
}

/** What the action found, said flatly. */
function describe(def: MachineDef, action: ActionId): string {
  switch (action) {
    case 'files':
      return `The folders on ${def.host}. ${def.note}`;
    case 'screen':
      return `What is on ${def.host} right now, belonging to ${def.who}.`;
    case 'database':
      return `The records from ${def.host}. All of them, which takes a while.`;
    case 'sweep':
      return `A look around ${def.host}. Enough to know what it is.`;
    default:
      return `${def.host}.`;
  }
}

/** Tick the per-machine action cooldowns. */
export function tickIntrusion(s: GameState, dt: number): void {
  const all = s.t.actionCooldown;
  if (!all) return;
  for (const machine of Object.keys(all)) {
    const per = all[machine];
    for (const action of Object.keys(per) as ActionId[]) {
      const left = (per[action] ?? 0) - dt;
      if (left <= 0) delete per[action];
      else per[action] = left;
    }
    if (Object.keys(per).length === 0) delete all[machine];
  }
}

/** How much of the network is in hand, for the readout. */
export function networkProgress(p: GameState['p']): { known: number; footholds: number; admin: number; total: number } {
  return {
    known: knownMachines(p).length,
    footholds: (p.footholds ?? []).length,
    admin: (p.admin ?? []).length,
    total: MACHINES.length,
  };
}

/** Corroboration still needs a roster; the cameras are still where new faces come from. */
export const CORROBORATION_TARGET = COVERAGE.corroborated;
