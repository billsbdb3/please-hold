# PLEASE HOLD

An incremental game about wasting a scammer's time, and then his entire operation.

You are the one making the call. You are pretending to be someone who does not know
what a browser is, because the longer he believes that, the longer he is not talking
to somebody's grandmother.

Then it stops being about the phone call.

---

## Status

**Phase 1 — THE MARK: playable and complete.** ~102 minutes for an engaged player,
measured rather than guessed.

The loop: stall the caller to bank Hold Time, buy tactics that waste his time
passively, catch opportunity windows when they open, and — once a call has run deep
enough — **hang up and call back**. A redial costs you the call and pays you Notes,
which buy permanent entries in a dossier that makes every future call shorter. Which
is, more or less, the actual job.

Phases 2 and 3 are designed but not built. See `docs/DESIGN.md`.

> The previous version of this game (a corporate hold-music idle game) is preserved
> under `legacy/` for reference. Its saves are deliberately discarded rather than
> migrated — its upgrade multipliers were corrupt by construction, and importing
> them would import the corruption. See `docs/DESIGN.md` §1.

## Running it

```
npm install
npm run dev
```

Then open the URL it prints. There is no server, no account, and no analytics. The
save lives in your own browser's localStorage and nowhere else.

```
npm run build      # typecheck, then production bundle (~20 kB gzipped)
npm run check      # svelte-check, strict TypeScript
npm test           # 40 tests
npm run sim        # headless balance simulation
```

## The balance simulator

Balance is engineered, not felt out. The simulator imports the *real* balance data
and calls the *real* tick function, so it cannot drift from the game the way the
previous version's two simulators both did.

```
npm run sim
npm run sim -- --curve --archetype=active    # growth curve, minute by minute
npm run sim -- --archetype=optimal --verbose # milestone-by-milestone timings
```

Current measurements:

| Archetype | Reaches the gate | Redials | Dossier | Events caught | Longest gap |
|---|---|---|---|---|---|
| optimal | 58 min | 45 | 12/12 | 29/29 | 0.3 min |
| active | 102 min | 30 | 12/12 | 36/47 | 0.4 min |
| casual | 282 min | 23 | 12/12 | 34/93 | 8.2 min |
| idle | 642 min | 10 | 8/12 | 3/54 | 40.0 min |

"Longest gap" is the dead-time detector: the longest stretch with nothing affordable
to buy. An earlier build of this phase measured 35 minutes of play followed by an hour
of flat curve, which is the most common way an incremental dies. It also reports any
generator tier no archetype ever buys, and three tiers were moved out of Phase 1 on
that evidence.

`npm test` fails the build if the active archetype's duration leaves its target
window. This is deliberate: the previous version was hand-tuned across seven
revisions with no automated check, and its documentation ended up disagreeing with
its code in 34 of 40 parameters.

## Architecture

```
src/
  engine/
    loop.ts      fixed-timestep loop, decoupled from rendering
    types.ts     state shape — and the rule that keeps it correct
    state.ts     the initial fact set
    derive.ts    facts -> conclusions. Pure. Called every tick.
    sim.ts       the simulation and the player actions
    save.ts      versioned envelope, migration chain, A/B slots
    numbers.ts   formatting, including notation-as-difficulty-signal
    log.ts       the transcript, which is also the narration
  data/
    balance.ts   every tunable number: tiers, milestones, redial, dossier, events
    upgrades.ts  the in-call upgrade graph (30 entries, gated 3 different ways)
  store.svelte.ts  the one-way bridge from simulation to UI
  App.svelte       the console
tools/
  simulate.ts   headless balance simulator
tests/          save round-trip and balance regression gates
docs/DESIGN.md  the design document. Start here.
```

**Two currencies that look alike and are not:** `holdTimeLifetime` is *this call* and
is wiped by a redial; `holdTimeCareer` never resets. Tier unlocks and upgrade gates
read the career total (discovery is permanent — you do not re-learn that your nephew
exists), while affordability is paid from the current call. Getting this backwards made
narrative milestones unreachable and stranded three generator tiers as dead content.

**The one rule worth knowing before editing anything:** persisted state contains
only *facts* — what you own, what you bought, how long it has been. Every multiplier
is derived from those facts on every tick and is never stored. The previous version
persisted its multipliers *and* re-applied them on load, so every reload doubled all
twelve numeric upgrades until the save reached `Infinity` and then `NaN`. There is a
test that fails if anyone reintroduces it.

## Tech

TypeScript, Svelte 5 (runes), Vite. No backend. Fine-grained reactivity because a
20 Hz tick touching hundreds of values has to patch individual text nodes rather
than re-render component trees.

Accessibility: every flicker, scanline and particle is gated behind
`prefers-reduced-motion`, the primary action is keyboard-operable, and phosphor text
is held above WCAG AA on its panel background.

## Content note

The game is fiction. It contains no operational instructions for compromising
systems, and the research behind it was scoped to exclude them. "You gain access" is
a narrative state and a number. The domain research is journalistic — how these
operations are structured, how the money moves, and what actually shuts one down.
