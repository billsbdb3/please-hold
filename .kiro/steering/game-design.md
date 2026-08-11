---
inclusion: auto
---

# PLEASE HOLD - Game Design Document

## Overview
An incremental/idle game about being on hold, losing your mind, and accidentally ending the universe. Built as a vanilla JS browser game (no frameworks, no build tools). Target: 4-6 hours total (3 phases).

## Repository
- GitHub: https://github.com/billsbdb3/please-hold
- GitHub Pages: https://billsbdb3.github.io/please-hold/
- Git user: billsbdb3 <billsbdb3@users.noreply.github.com>

## Architecture
```
please-hold/
├── index.html          — shell, layout, script imports
├── css/
│   ├── main.css        — base styles, all shared UI
│   ├── phase1.css      — phase 1 specific
│   ├── phase2.css      — phase 2 (placeholder)
│   └── phase3.css      — phase 3 (placeholder)
├── js/
│   ├── main.js         — game loop, state, idle detection, phase transitions
│   ├── phase1.js       — generators, upgrades, queue, milestones, cost formulas
│   ├── phase2.js       — placeholder
│   ├── phase3.js       — placeholder
│   ├── dust.js         — dust system (collectors, accumulation, pps-linked, UI)
│   ├── ui.js           — DOM utilities, overlays, modals, milestone display
│   ├── flavor.js       — all flavor text pools
│   ├── save.js         — localStorage auto-save (every 30s)
│   └── numbers.js      — big number formatting + dust unit formatting
├── tools/
│   └── simulate.js     — Node.js balance simulator
└── README.md
```

**Design principle:** Separate concerns. Each system is its own module.

## Phase Timeline (LOCKED)

| Phase | In-game time | Real time | Theme |
|-------|-------------|-----------|-------|
| Phase 1 | 0 → 10 years | ~90-120 min | The Call. Clicking + light management. |
| Phase 2 | 11 → 100 years | ~90-120 min | The Escalation. Rage mechanic. |
| Phase 3 | 101+ years | ~60-120 min | The Geological. Pure strategy. |

---

## PHASE 1: THE CALL (Current Implementation)

### Three Acts

| Act | In-game time | Real time | Activity |
|-----|-------------|-----------|----------|
| Act 1: The Wait | 0 → 1 year | 0-30 min | Click, build generators, first queue advances |
| Act 2: The Grind | 1 → 9 years | 30-75 min | Production ramps, dust flows, queue-gated upgrades |
| Act 3: The Push | 9 → 10 years | 75-100 min | Time frozen. Queue advances = time chunks. |

### Resources
- **Patience:** Primary currency. Clicks + generators. Spent on everything.
- **Will to Live (WtL):** Gate. Clicks cost WtL. Passive drain starts at 5 active min.
- **Dust (particles):** Secondary. Accumulates on in-game time (cap x30) + pps-linked bonus.

### Generators ("Coping Mechanisms")

CASCADING BOOST: Each tier boosts ALL tiers below it.

| Name | Base Cost | Growth | Production | Soft Cap | Boost % |
|------|-----------|--------|------------|----------|---------|
| Doodle Pad | 15 | 1.18 | 0.1/s | 25 | — |
| Fidget Spinner | 100 | 1.17 | 0.35/s | 25 | +0.3% all below |
| Autodialer | 600 | 1.16 | 2.0/s | 22 | +0.8% all below |
| Speed Dialer | 5000 | 1.15 | 10.0/s | 20 | +1.5% all below |
| Robo-Caller | 40000 | 1.14 | 50.0/s | 15 | +2% all below |
| Shadow Call Center | 350000 | 1.13 | 300.0/s | 12 | +3% all below |

Soft cap: `growthRate^8` per unit after threshold.

### Queue System
- Start: #150. Cost: `30 × 1.095^advances`
- Super-exponential last 30 positions: `× (1 + depth^2.2 / 10)`
- Queue Familiarity upgrade: -2% per rapid advance (max -25%, decays 15s)
- Advance button locked first 5 min of real time

### Department Transfer (Safety Valve)
If queue hits 0 before 9 years in-game:
- Queue resets to 75. Costs don't reset (queueAdvances unchanged).
- All upgrades/generators/dust stay.
- Narrative: "Transferred to Specialist Department."

### Time Freeze (Act 3)
At 9 years in-game:
- Passive time accumulation STOPS
- Generators still produce patience
- Dust stops passively
- Each queue advance adds: `(10yr - current) / remainingPositions` time
- Each queue advance gives: `dustPerSec × timeChunk` dust
- Final advance = exactly 10 years = phase transition

### Queue-Gated Upgrades

| Queue Position | Upgrade Unlocked |
|---------------|-----------------|
| #120 | Second Phone Line (ALL x2) |
| #100 | Overclocked Modem (Speed x3) |
| #80 | Entropy Noticed (dust starts) |
| #60 | Machine Learning (Robo x3) + Muscle Memory |
| #50 | Queue Familiarity |
| #40 | Conference Call (ALL x2) |
| #20 | Corporate Insider (no WtL click cost) |

### Time Blur Upgrades (Real-Time Gated)

| Upgrade | Active Time Required | Cost | Time Effect | Hidden: Combo Cap |
|---------|---------------------|------|-------------|-------------------|
| Time Blur I | 30 min | 200K | x10 | 4 → 5 |
| Time Blur II | 45 min | 600K | x10 | 5 → 6 |
| Time Blur III | 60 min | 2.5M | x12 | 6 → 8 |

Combo cap boost is UNDOCUMENTED. Player discovers it.

### Click System
- Base: +1 patience per click, -1 WtL per click
- Rhythmic Clicking: unlocks combo (max x4, +0.3/click, decays 0.4/s)
- Muscle Memory (750K, queue #60): combo LOCKS (no decay)
- Time Blurs: secretly raise cap to x5/x6/x8
- Caffeine IV Drip: +2/click, halve WtL cost
- Corporate Insider: 0 WtL cost per click

### WtL System
- Max: 15 (base) → 20 (Chair) → 25 (HEPA collector)
- Drain: `0.15 × log2(activeMinutes - 4)` starts at 5 min active
- Late drain: `+ (activeMinutes - 30) × 0.02` after 30 min
- Cap: 1.5/s max drain
- Regen: Chair (+0.3), Dust Mask (+0.3), Vacuum (+0.5), Industrial (+1)
- Deep Breath: spend 3 patience → +12 WtL (after Snack Drawer)
- Hangup at wtl < 0.1: lose patience, fall back in queue, keep upgrades

### Dust System
- Base rate: 0.2/s (set by Entropy Noticed)
- PPS-linked bonus: `+totalPPS × 0.0001` dust/sec
- Time cap: `min(30, effectiveTimeMult)` applied to dust accumulation
- Collectors: 11 items, costs 300-120K particles
- Reveal threshold: 200 particles (shop appears)
- Time factor for display: `min(50000, 1 + log10(maxDust+1)² × 10)`

### Idle Detection
- Threshold: 180 seconds without interaction
- Interactions: click, purchase, advance, mousemove, keypress, touchstart
- When idle: generators produce 0, dust stops, WtL drain pauses
- Welcome Back modal on return: 25% of pps × idle time (cap 24h)

### Dust Collectors (11 items)

| Name | Cost | Effect |
|------|------|--------|
| Microfiber Cloth | 300 | +10% patience/sec |
| Dust Mask | 800 | +0.3 WtL regen |
| Air Filter | 2000 | +25% patience/sec |
| Industrial Broom | 4000 | +0.5 dust/sec |
| Phone Tree Map | 7000 | Queue -15% cost |
| Robotic Vacuum | 12000 | +50% pps, +0.5 WtL regen |
| HEPA System | 20000 | +1 dust/sec, +5 max WtL |
| Static Collector | 32000 | +100% pps (x2) |
| Executive Direct Line | 50000 | Queue -30% cost |
| Industrial Extraction | 75000 | +3 dust/sec, +1 WtL regen |
| Dust Singularity | 120000 | ALL production x3 |

### Phone Tiers (cosmetic + small bonus)
- Tin Can & String (start)
- Rotary Phone (1 week in-game): +0.5 pps
- Landline (3 months): +2 patience/click
- Cordless Phone (5 years): +1.0 pps

---

## PHASE 2: THE ESCALATION (Planned, Not Built)

- In-game: 11 → 100 years
- Real time: ~90-120 min
- Theme: Extended warranty pitch. You're furious.
- Click button → [ DEMAND ]
- Deep Breath → "Compose Yourself"
- WtL → Composure
- New resource: Rage
- Multiple department transfers
- Dust: meters → global scale

## PHASE 3: THE GEOLOGICAL (Planned, Not Built)

- In-game: 101+ years
- Real time: ~60-120 min
- No clicking. Pure strategy/allocation.
- Resources: Dust (cosmic), Patience (massive), Inertia (idle), Entropy (threat)
- Win condition: cosmic resolution of the $1.47

## THE ENDING

Hold music stops. "Your refund has been processed." Timestamp: before the universe began. Time on hold: 13.8 billion years. "It was the principle of the thing."

## TONE

Dry, absurd humor. Played completely straight. Mundane horror of bureaucracy at cosmic scale.

## SIMULATOR

Run: `node tools/simulate.js --player=active`
Options: `--player=active|casual|idle`

Target results: 90-120 min, ~10K clicks, 10 years in-game, all upgrades/collectors attainable.
