/**
 * The intrusion — Phase 2's new verb.
 *
 * WHY THIS EXISTS AT ALL. Phase 2 was attention allocated across six passive streams. Four separate
 * tuning passes failed to make it engaging, and the playtest verdict never moved: too slow, not
 * enough to do. When a mechanic resists four honest attempts at balance, the balance is not the
 * problem — the verb is. Allocation is passive; everything added on top of it (fatigue, looking
 * closer, the chain, more events) was activity bolted to a passive core.
 *
 * What the game is actually about, in the player's words: "looking through files, gaining access to
 * servers, revealing webcams on laptops". These tests hold the properties that make that a real
 * mechanic rather than a differently-shaped idle economy: every action must produce a NAMED result,
 * access must be worth having for its own sake, the map must grow from play rather than from a
 * timer, and nothing may fail silently.
 */

import { describe, it, expect } from 'vitest';
import { freshState } from '../src/engine/state';
import { freshTransient } from '../src/engine/log';
import { derive } from '../src/engine/derive';
import { tick } from '../src/engine/sim';
import { enterPhase2 } from '../src/engine/phase2';
import {
  act, accessOf, knownMachines, takeFoothold, viewMachines, heatOf, networkProgress,
} from '../src/engine/intrusion';
import {
  MACHINES, MACHINE_BY_ID, ACTIONS, ACTION_BY_ID, ENTRY_MACHINE, INTRUSION,
} from '../src/data/intrusion';
import { HEAT } from '../src/data/phase2';
import { SLIPS } from '../src/data/balance';
import { DT } from '../src/engine/loop';
import type { GameState } from '../src/engine/types';

function atPhase2(): GameState {
  const p = freshState();
  const s: GameState = { p, d: derive(p), t: freshTransient(0) };
  enterPhase2(s);
  s.p.intel = 0;
  return s;
}

/** Give a machine full access without going through the economy. */
function own(s: GameState, id: string, admin = false): void {
  s.p.revealed = [...s.p.revealed, id];
  s.p.footholds = [...s.p.footholds, id];
  if (admin) s.p.admin = [...s.p.admin, id];
}

/** Clear every cooldown, for tests that care about outcomes rather than rate limits. */
function ready(s: GameState): void {
  s.t.actionCooldown = {};
}

describe('the network', () => {
  it('starts you on exactly one machine', () => {
    const s = atPhase2();
    expect(knownMachines(s.p)).toEqual([ENTRY_MACHINE]);
    expect(accessOf(s.p, ENTRY_MACHINE)).toBe('user');
  });

  it('is a chain, so every machine is reachable from the entry point', () => {
    // A machine nothing reveals is content nobody will ever see - the same dead-content fault this
    // project has produced four times, in a new shape.
    const reachable = new Set<string>([ENTRY_MACHINE]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const m of MACHINES) {
        if (!reachable.has(m.id)) continue;
        for (const r of m.reveals) {
          if (!reachable.has(r)) {
            reachable.add(r);
            grew = true;
          }
        }
      }
    }
    for (const m of MACHINES) {
      expect(reachable.has(m.id), `${m.host} is unreachable`).toBe(true);
    }
  });

  it('names every machine it reveals', () => {
    for (const m of MACHINES) {
      for (const r of m.reveals) {
        expect(MACHINE_BY_ID[r], `${m.host} reveals a machine that does not exist: ${r}`)
          .toBeDefined();
      }
    }
  });

  it('gives every machine something worth taking', () => {
    for (const m of MACHINES) {
      expect(Object.keys(m.yields).length, `${m.host} yields nothing`).toBeGreaterThan(0);
    }
  });

  it('costs more the deeper in you go', () => {
    // The entry machine is free; the boss's laptop is not.
    expect(MACHINE_BY_ID[ENTRY_MACHINE].footholdCost).toBe(0);
    expect(MACHINE_BY_ID['m.owner'].footholdCost).toBeGreaterThan(
      MACHINE_BY_ID['m.pod7'].footholdCost,
    );
  });
});

describe('taking a foothold', () => {
  it('refuses a machine you have not heard of', () => {
    const s = atPhase2();
    s.p.intel = 1e9;
    expect(takeFoothold(s, 'm.owner')).toBe(false);
  });

  it('refuses when you cannot afford it, and takes nothing', () => {
    const s = atPhase2();
    s.p.revealed = ['m.pod7'];
    s.p.intel = MACHINE_BY_ID['m.pod7'].footholdCost - 1;
    const before = s.p.intel;
    expect(takeFoothold(s, 'm.pod7')).toBe(false);
    expect(s.p.intel).toBe(before);
  });

  it('works once, and not twice', () => {
    const s = atPhase2();
    s.p.revealed = ['m.pod7'];
    s.p.intel = 1e9;
    expect(takeFoothold(s, 'm.pod7')).toBe(true);
    expect(accessOf(s.p, 'm.pod7')).toBe('user');
    expect(takeFoothold(s, 'm.pod7')).toBe(false);
  });
});

describe('acting on a machine', () => {
  it('pays intel of the kinds that machine actually holds', () => {
    const s = atPhase2();
    own(s, 'm.payroll');
    const before = { ...s.p.intelByKind };
    const r = act(s, 'm.payroll', 'files')!;
    expect(r).not.toBeNull();
    // The accounts machine holds money and evidence. It does not hold people.
    expect(s.p.intelByKind.money).toBeGreaterThan(before.money);
    expect(s.p.intelByKind.people).toBe(before.people);
  });

  it('always says what it found', () => {
    // Nothing may resolve without a line: a button that does nothing without saying so is exactly
    // how the soundboard shipped broken.
    const s = atPhase2();
    own(s, 'm.fileserver');
    for (const a of ACTIONS) {
      ready(s);
      if (a.needs === 'admin') s.p.admin = [...s.p.admin, 'm.fileserver'];
      const r = act(s, 'm.fileserver', a.id);
      if (r) expect(r.line.length, `${a.id} returned no line`).toBeGreaterThan(0);
    }
  });

  it('refuses rather than half-working when access is short', () => {
    const s = atPhase2();
    own(s, 'm.fileserver'); // user, not admin
    expect(act(s, 'm.fileserver', 'database')).toBeNull();
  });

  it('rate-limits per machine and per action, not globally', () => {
    // Two machines must be workable at once, or the network is a queue.
    const s = atPhase2();
    own(s, 'm.pod7');
    own(s, 'm.fileserver');
    expect(act(s, 'm.pod7', 'files')).not.toBeNull();
    expect(act(s, 'm.pod7', 'files')).toBeNull();
    expect(act(s, 'm.fileserver', 'files')).not.toBeNull();
    // And a different action on the same machine is still available.
    expect(act(s, 'm.pod7', 'sweep')).not.toBeNull();
  });

  it('recovers when the cooldown elapses', () => {
    const s = atPhase2();
    own(s, 'm.pod7');
    act(s, 'm.pod7', 'files');
    const cd = ACTION_BY_ID.files.cooldown;
    for (let i = 0; i < Math.ceil((cd + 1) / DT); i++) tick(s, DT);
    expect(act(s, 'm.pod7', 'files')).not.toBeNull();
  });

  it('charges suspicion per action, scaled by how watched the machine is', () => {
    // Heat per ACTION rather than per second is the point: risk is a decision each time.
    const quiet = heatOf(MACHINE_BY_ID['m.nvr'], 'files');
    const watched = heatOf(MACHINE_BY_ID['m.owner'], 'files');
    expect(watched).toBeGreaterThan(quiet);

    const s = atPhase2();
    own(s, 'm.pod7');
    const before = s.p.heat;
    act(s, 'm.pod7', 'files');
    expect(s.p.heat).toBeGreaterThan(before);
  });

  it('never pushes suspicion past its ceiling', () => {
    const s = atPhase2();
    own(s, 'm.owner');
    s.p.heat = HEAT.max - 0.2;
    act(s, 'm.owner', 'database');
    expect(s.p.heat).toBeLessThanOrEqual(HEAT.max);
  });
});

describe('escalating', () => {
  it('grants admin and reveals something new', () => {
    const s = atPhase2();
    const r = act(s, ENTRY_MACHINE, 'escalate')!;
    expect(r.escalated).toBe(true);
    expect(accessOf(s.p, ENTRY_MACHINE)).toBe('admin');
    expect(r.revealed).toBeDefined();
    expect(knownMachines(s.p).length).toBeGreaterThan(1);
  });

  it('is worth having for its own sake, not only for the next machine', () => {
    // Otherwise escalation is a key rather than a decision.
    expect(INTRUSION.accessMultiplier.admin).toBeGreaterThan(INTRUSION.accessMultiplier.user);

    const asUser = atPhase2();
    const asAdmin = atPhase2();
    own(asUser, 'm.fileserver');
    own(asAdmin, 'm.fileserver', true);
    const a = act(asUser, 'm.fileserver', 'files')!;
    const b = act(asAdmin, 'm.fileserver', 'files')!;
    expect(b.total).toBeGreaterThan(a.total);
  });

  it('cannot be done twice on the same machine', () => {
    const s = atPhase2();
    act(s, ENTRY_MACHINE, 'escalate');
    ready(s);
    expect(act(s, ENTRY_MACHINE, 'escalate')).toBeNull();
  });

  it('grows the map from play rather than from a clock', () => {
    const s = atPhase2();
    const before = networkProgress(s.p).known;
    act(s, ENTRY_MACHINE, 'escalate');
    expect(networkProgress(s.p).known).toBeGreaterThan(before);
  });
});

describe('the webcam', () => {
  it('turns up a face on an occupied desk, which the roster needs', () => {
    // This is the bridge to corroboration: Phase 1's gate lets a player through with fewer roster
    // entries than Phase 2 requires, so new faces have to come from somewhere.
    const s = atPhase2();
    own(s, 'm.pod7');
    let found: string | undefined;
    for (let i = 0; i < 40 && !found; i++) {
      ready(s);
      found = act(s, 'm.pod7', 'webcam')?.face;
    }
    expect(found, 'no face turned up in forty attempts on an occupied desk').toBeDefined();
    expect(s.p.roster.some((r) => r.fromCamera)).toBe(true);
  });

  it('finds nobody on an empty one, and says so', () => {
    const s = atPhase2();
    own(s, 'm.fileserver'); // a server, not a desk
    for (let i = 0; i < 12; i++) {
      ready(s);
      const r = act(s, 'm.fileserver', 'webcam')!;
      expect(r.face).toBeUndefined();
    }
  });

  it('costs more on an occupied desk, because the light comes on', () => {
    const occupied = heatOf(MACHINE_BY_ID['m.pod7'], 'webcam');
    const empty = heatOf(MACHINE_BY_ID['m.nvr'], 'webcam');
    expect(occupied).toBeGreaterThan(empty);
  });

  it('never records the same slip twice', () => {
    const s = atPhase2();
    own(s, 'm.pod7');
    for (let i = 0; i < 200; i++) {
      ready(s);
      act(s, 'm.pod7', 'webcam');
    }
    const handles = s.p.roster.map((r) => r.handle);
    expect(new Set(handles).size).toBe(handles.length);
    expect(s.p.roster.length).toBeLessThanOrEqual(SLIPS.length);
  });
});

describe('what the player can see', () => {
  it('shows a machine before you are on it, so the map reads as a map', () => {
    const s = atPhase2();
    s.p.revealed = ['m.owner'];
    const view = viewMachines(s).find((v) => v.def.id === 'm.owner')!;
    expect(view.access).toBe('none');
    expect(view.def.note.length).toBeGreaterThan(0);
  });

  it('marks which actions are actually possible', () => {
    const s = atPhase2();
    own(s, 'm.fileserver');
    const view = viewMachines(s).find((v) => v.def.id === 'm.fileserver')!;
    const db = view.available.find((a) => a.def.id === 'database')!;
    const files = view.available.find((a) => a.def.id === 'files')!;
    expect(db.ready).toBe(false); // needs admin
    expect(files.ready).toBe(true);
  });

  it('stops offering escalation once it is done', () => {
    const s = atPhase2();
    act(s, ENTRY_MACHINE, 'escalate');
    ready(s);
    const view = viewMachines(s).find((v) => v.def.id === ENTRY_MACHINE)!;
    expect(view.available.find((a) => a.def.id === 'escalate')!.ready).toBe(false);
  });
});
