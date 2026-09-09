# PLEASE HOLD

An incremental game about wasting a scammer's time, and then his entire operation.

You are the one making the call. You are pretending to be someone who does not know
what a browser is, because the longer he believes that, the longer he is not talking
to somebody's grandmother.

Then it stops being about the phone call.

---

## Status

**Phase 1 — THE MARK: playable.** Roughly 35 minutes, measured rather than guessed.

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
npm test           # 25 tests
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

| Archetype | Reaches the gate | Stalls | Final rate |
|---|---|---|---|
| optimal | 28 min | 13.5K | 1.25M/s |
| active | 35 min | 6.7K | 1.73M/s |
| casual | 57 min | 1.6K | 2.64M/s |
| idle | 152 min | 229 | 2.54M/s |

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
    balance.ts   every tunable number in the game
    upgrades.ts  the upgrade graph
  store.svelte.ts  the one-way bridge from simulation to UI
  App.svelte       the console
tools/
  simulate.ts   headless balance simulator
tests/          save round-trip and balance regression gates
docs/DESIGN.md  the design document. Start here.
```

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
