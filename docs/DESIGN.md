# PLEASE HOLD — Design Document (v8, "Payback" overhaul)

> The title is not decoration. It is the payload of the game's largest reveal.
> See §7, Twist 5.

---

## 0. One paragraph

You are a scambaiter. You call a scam call centre pretending to be a confused
person with a computer problem, and you waste their time. That is the whole game
for the first ninety minutes. Then you are inside their network, and it becomes a
different game about mapping an organisation. Then it becomes a third game about
convincing institutions to act, which is slower and worse and has paperwork.
At the end the operation is dismantled and you learn what the hold music was.

The tone is flat. Nothing in the interface is ever excited.

---

## 1. What is wrong with the current build (audit summary)

Full audit: `../please-hold-research/06-code-audit.md`. Headlines:

| # | Severity | Defect |
|---|---|---|
| 1 | **CRITICAL** | `state.js:133-160` + `main.js:33` — save restores multipliers *and* `Upgrades.reapplyAll()` re-applies them. All 12 numeric upgrades **double on every reload**. Compounds to `Infinity`/`NaN`. |
| 2 | HIGH | `tools/simulate.js:18` — `--player` never parsed. All three archetypes emit byte-identical output. The balance tool was measuring nothing. |
| 3 | HIGH | `tools/sim_v7.js` — reports `Completed: YES` on a run that stalled at queue #0 for 60 minutes. False green. |
| 4 | HIGH | `main.js:197-213` — offline/idle progress is dead code; `mousemove` clears `isIdle` before the welcome-back branch reads it. |
| 5 | MED | `events.js:52,67` — event scheduling persists absolute `Date.now()`; reload rapid-fires buffs. |
| 6 | MED | `queue.js:100` — load-order trap: `queue.js` calls into `upgrades.js`, which loads after it. |
| 7 | LOW | `css/phase1.css`, `phase2.css`, `phase3.css` are **never loaded**. `js/phase1.js` etc. are referenced by both docs and **do not exist**. |

**~34 of 40 documented parameters disagree with `js/balance.js`.** The docs describe
one game, the two simulators model two others, and `balance.js` is the only truth.
Neither simulator imports it.

**Verdict: the engine is rebuilt, the good ideas are kept.** Keep click/combo feel,
cascading tier boosts, softcaps, the threat-resource concept, the activity log,
number formatting. Bin the save system, both simulators, the offline path, and all
flavour text (theme change).

---

## 2. Tech stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript**, strict | 4,300 lines of untyped globals is how bug #1 survived. |
| Framework | **Svelte 5 (runes)** | Fine-grained reactivity: a 20 Hz tick touching hundreds of values patches individual text nodes instead of re-rendering trees. Smallest bundle of the serious options. |
| Build | **Vite** | GitHub Pages via Actions, `base` set to the repo path. |
| Loop | **Fixed timestep + accumulator**, decoupled from render | Deterministic ticks make offline catch-up exact and replayable. Render notified once per rAF, never per tick. |
| State | Plain module store, nanostores bridge to UI | The loop owns truth. Nothing couples to component lifecycles, so a 6-hour session does not leak. |
| Big numbers | `break_infinity.js`, introduced only past ~1e300 | Antimatter Dimensions measured 4.5× faster than decimal.js. Plain floats until Phase 3 needs more. |
| Save | Single versioned JSON envelope + migration chain, base64 export, A/B rolling backup | Schema version is mandatory from commit one. |
| Audio | Howler, unlocked by a diegetic "pick up the headset" button | Sidesteps autoplay policy *in fiction* rather than with a modal. |
| Tests | Vitest + a headless balance simulator with a **regression gate** | A phase drifting outside its target duration window fails the build. |

Rejected: React (coarse-grained, needs constant memoisation for this workload);
BigInt (integer-only, slow); real anti-cheat (single-player local save — a checksum
flags corruption and nothing more).

---

## 3. Structure: three phases that replace each other

The single most valuable finding in the research is that *Universal Paperclips*
does not **layer** mechanics, it **retires** them. When you release the
hypnodrones, money stops existing. The player's mastery is taken away and
replaced, and that is why it is the most respected game in the genre.

So each phase here retires its own core verb.

| Phase | Title | Verb | Real time | In-fiction |
|---|---|---|---|---|
| 1 | **THE MARK** | `STALL` | 90–120 min | You are on the phone, playing a victim. |
| 2 | **THE MAP** | `ALLOCATE` | 150–200 min | You are inside. You are watching them. |
| 3 | **THE COLLAPSE** | `PETITION` | 180–240 min | You are filing paperwork that ends people's lives. |

Total ≈ 8.2 h active, ≈ 6.5 h optimal, ≈ 10 h casual.

**Clicking exists only in Phase 1.** Phase 2 replaces it with allocation across
surveillance streams. Phase 3 removes direct production entirely: you spend
Evidence on institutions that act on their own schedule, with latency you cannot
control. Difficulty escalates by *adding constraints*, not by adding zeroes.

---

## 4. Resources

| Phase | Primary | Spent | Gate (meta) | Threat |
|---|---|---|---|---|
| 1 | **Hold Time** `H` — seconds of their time you have wasted | Personas, tactics | **Rapport** — how much the scammer trusts you | **Composure** — drains; break character and the call ends |
| 2 | **Intel** `I` | Access, tooling | **Coverage** — how much of the operation is mapped | **Heat** — their suspicion; scales with your own progress |
| 3 | **Evidence** `E` | Institutional petitions | **Credibility** — whether agencies believe you | **Warning** — the operation's awareness; it *reacts* |

`Rapport` is the Paperclips `Trust` lesson: the true bottleneck is never money, it
is a meta-resource that gates what you are *allowed* to do. You cannot buy your way
past a scammer who does not believe you.

`Composure` is the old Will-to-Live, re-skinned and improved: it drains while you
are in character, and the low-composure band *raises* click value while *lowering*
Rapport gain — a real tradeoff instead of a pure penalty.

---

## 5. Balance skeleton

Derived in `../please-hold-research/07-balance-math.md`. Cost model
`cost = base · r^owned`; production `prod = base · owned · mult`.

| Phase | `r` | Mult budget | Gate | Escalation lever |
|---|---|---|---|---|
| 1 | 1.08 | 6 decades | 1e6 `H` | none — teach the loop |
| 2 | 1.11 | 9 decades | 1e12 `I` | Heat decay `∝ √lifetime` + allocation tension |
| 3 | 1.14 | 12 decades | 1e21 `E` | responsive opposition `∝ production^0.7` + soft timer |

**The threat must grow in a strictly lower class than production** (`α < 1`),
or the game becomes unwinnable. This is the standard fatal mistake and the
existing build's dust system flirts with it.

Six milestones per phase, each carrying a *known* multiplier so the decade budget
sums exactly. Display stays in the M–T letter band until Phase 3's climax, which
is the only part of the game that lives in scientific notation — deliberately, so
the notation change itself reads as escalation.

Each transition grants enough global multiplier that re-clearing the previous
phase's gate takes ≤ ⅓ the original time. The simulator asserts this monotone
shrink.

---

## 6. Milestones

### Phase 1 — THE MARK
1. **First contact.** They pick up. You have a name and a callback number.
2. **The remote session.** They install their tool. You let them.
3. **Screen share.** You can see their desktop. (First real intel.)
4. **The quota** — *point of no return, see Twist 1.*
5. **Persistent access.** You no longer need them to let you in.
6. **The switchboard.** Admin on the PBX. → Phase 2.

### Phase 2 — THE MAP
1. **CCTV.** Fourteen cameras. You watch them work.
2. **The roster.** Shift schedule, then names.
3. **The denominator** — *Twist 2.*
4. **The money.** Mule accounts, wallet trail, the shared spreadsheet.
5. **The manifest** — *Twist 3.*
6. **The owner.** A front company and a name. → Phase 3.

### Phase 3 — THE COLLAPSE
1. **First freeze.** A bank acts. It takes four hours of game time.
2. **Brand protection.** Microsoft's team is interested but slow.
3. **The node** — *Twist 4.*
4. **Cross-border.** Two agencies who dislike each other.
5. **The warrant.** Soft timer starts. The operation is packing up.
6. **The raid.** → Ending.

---

## 7. Twists

Ranked by earned-ness. All are *mechanical* where possible — in an incremental,
a twist should change the rules, not deliver a paragraph.

1. **Release the Quota** (P1, milestone 4) — *point of no return.* To deepen
   access you must stay in character while a real mark loses money. The game does
   not let you save them. Your Rapport income depends on it. Mechanically: this is
   the moment `Hold Time` stops being harmless.
2. **The Denominator** (P2) — the "Scammers Neutralised" counter has been silently
   accumulating *names*. It reformats into a roster. Some entries carry a flag you
   have not seen before: `RECRUITED — FALSE ADVERTISEMENT`.
3. **The Manifest** (P2) — the org chart you built to convict them is
   simultaneously proof that most of them answered a fake job ad. Your evidence is
   their alibi. Both remain true; the game does not resolve it for you.
4. **The Boss Was a Node** (P3) — the boss you spent two phases assembling from
   fragments is a promoted coerced worker. The actual owner is a shell company in a
   jurisdiction with no extradition treaty, and you cannot reach him. Ever.
5. **PLEASE HOLD** (P3, climax) — the hold music that has looped since the title
   screen is a real recording. It is not library music. It is a call that was
   already in progress when the game started, and the endgame is the only place
   you are allowed to hear how it ends.
6. **Trust, Inverted** (ending gate) — `Rapport`, the resource you spent the whole
   game extracting from scammers, is mirrored: the extraction contact needs *you*
   to trust *them*. Bookends Paperclips' Trust arc.
7. **The Reactive Floor** (P3, continuous) — the opposition observes your dominant
   tactic and closes it, in the boss's voice. Grounded in reality: real syndicates
   ran fibre across a river, and when that was cut, switched to Starlink.

**Endings** are gated on a *worker-harm vs infrastructure-disruption* axis, not on
score. The maximally aggressive path and the maximally careful path produce
different final rosters. The game never tells you which was correct.

---

## 8. UI: the console upgrades itself

A fake operator console. Not a webpage with buttons.

**Phase 1** is deliberately tiny: a softphone, a call timer, a notepad. Four
elements. The screen is mostly empty and that is the joke — you are on hold.

**Phase 2** the shell grows: CCTV grid, a live waveform, a node graph that
physically expands as you gather intel, an evidence board where linking two clues
is a manual drag.

**Phase 3** is a command centre: map with pins, agency panels each with their own
latency clock, the roster, the timer.

Ideas taken from the visual research:

- **Hypnospace Outlaw** — fake-OS shell with a taskbar and draggable windows as the entire frame.
- **Frostpunk** — diegetic HUD: every control is an object on the desk.
- **Antimatter Dimensions** — progressive tab disclosure; later systems do not exist in the DOM until unlocked.
- **NOC dashboards** — monochrome grid where one threshold breach flips a tile red.
- **Maltego / Palantir** — the node graph is both mechanic and progress bar.
- **There Is No Game** — the interface is a character; it glitches under Heat.

Palette: phosphor amber on near-black for the terminal panes, cold institutional
grey-blue for the Phase 3 agency panels — the visual argument that bureaucracy is
colder than crime. CRT flicker and particles gated behind `prefers-reduced-motion`.
Phosphor text held above WCAG AA.

---

## 9. Tone: the style guide

Full corpus (120+ verbatim examples): `../please-hold-research/03-dry-humor-corpus.md`.
The single best structural reference is the **Cookie Clicker news ticker**: a fixed
frame applied to escalating catastrophe that the frame never once acknowledges.

The rules, non-negotiable:

1. No exclamation marks — unless quoting an institution being falsely upbeat.
2. Never wink at the audience.
3. No memes, no pop-culture references.
4. Dry is specific and plausible-adjacent, never zany.
5. Never explain the joke. Cut the follow-up clause.
6. No emoji. An emoji is a laugh track.
7. Short setups. Kill the runway.
8. Prefer the period. Distrust the ellipsis.
9. Understate the catastrophe. Procedural language for disaster.
10. Real numbers. "Between 2 and 1,001", not "a lot".
11. Register mismatch — write catastrophe in office voice.
12. If a line sounds pleased with itself, flatten it.
13. Attribute the absurd to a bored, unbothered source.
14. Withhold the payoff. Let the flat fact end the line. Stop; do not resolve.
15. One fixed frame, never broken. The container is the straight man.

Calibration target:

> `A fire has been noted. It is spreading at an acceptable rate.`

---

## 10. Scope boundary (deliberate)

The game is fiction. It contains no operational instructions for compromising
real systems, and the research was scoped to exclude them. "You gain access" is
a narrative state and a number, exactly as "you build a rocket" is in Paperclips.
The domain research is journalistic: org charts, money flow, and the documented
takedown ladder — the things that make the *world* feel real.

---

## 11. Build order

1. Engine core: types, fixed-timestep loop, store, save + migrations, number formatting.
2. Balance config as data, plus the headless simulator and its regression gate.
3. Phase 1 complete and shippable on its own.
4. Console shell + theme system.
5. Phase 2.
6. Phase 3 + endings.
7. Audio, accessibility pass, Pages deploy.

Phase 1 must be genuinely finished and fun before Phase 2 starts. The existing
repo's failure mode was three half-built phases and a doc describing none of them.

---

## 12. Phase 1: target met (and what it cost)

The design target was 90–120 minutes. Phase 1 now measures **102 minutes** for the
active archetype. The route there is worth recording, because every wrong turn was
found by the simulator rather than by playing.

| Pass | Active | What was actually wrong |
|---|---|---|
| 1 | 2 min | Multiplier chain stacked to ~1e5× against a 6-decade budget. Two tiers unlocked *above* the gate and were unreachable. |
| 2 | 8 min | Multipliers cut to ~160×; still far too generous. |
| 3 | 35 min | Softcaps tightened, growth steepened to 1.13–1.18, softcap exponent softened 0.7→0.85. Curve then **flatlined from minute 45** — a content problem, not a tuning one. |
| 4 | 102 min | Content added: 3 more tiers, 16→33 upgrades, penalty-free opportunity windows, and the **redial** soft reset with a 12-entry dossier. |

What closed the gap was **not** the extra generator tiers. It was the redial loop, the
upgrade count, and the events. The tiers turned out to be dead weight (below).

### The four bugs the expansion introduced

Adding prestige broke things in ways that were only visible in simulation:

1. **Milestones became unreachable.** They gated on `holdTimeLifetime`, which a redial
   resets — so beats 4–6 could never fire. Fixed by splitting the currency:
   `holdTimeLifetime` is *this call*, `holdTimeCareer` never resets. Milestones and the
   phase gate read the career total; tier unlocks and upgrade gates read the call.
2. **Two simulators disagreed again.** The curve mode claimed the gate fell at minute
   105 while the summary measured 173 — the *exact* sin the old build committed. There
   is now one `run()` function and both outputs derive from it.
3. **A circular dependency in tuning.** Milestones grant multipliers, so respacing them
   changes the curve their positions were read off. Fixed by defining milestone
   positions as *fractions* of the gate, reducing tuning to bisecting one constant.
4. **Three tiers were dead content.** The Other Line, The Neighbour and The Filing
   Cabinet were never bought once by any archetype. Generator cost comes out of banked
   Hold Time, a redial zeroes it, and a player redialling every few minutes never banks
   enough to reach rung nine. Moved to `PHASE2_RESERVED_GENERATORS`, where an economy
   with no reset can use them. A test now fails the build if any live tier goes unbought.

### Measured

| Archetype | Gate | Redials | Dossier | Events caught | Longest gap with nothing to buy |
|---|---|---|---|---|---|
| optimal | 58 min | 45 | 12/12 | 29/29 | 0.3 min |
| active | **102 min** | 30 | 12/12 | 36/47 | 0.4 min |
| casual | 282 min | 23 | 12/12 | 34/93 | 8.2 min |
| idle | 642 min | 10 | 8/12 | 3/54 | 40.0 min |

The "longest gap" column is the dead-time detector. At 0.4 minutes for an active
player, the flatline that made pass 3 unshippable is gone.

Casual at 282 minutes is longer than ideal for one phase of a ~10-hour game and is the
next thing I would tune.
