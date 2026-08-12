---
inclusion: auto
---

# IMPLEMENTATION PLAN - Phase 1 Redesign v3

## Status: IMPLEMENTING
Last updated: August 2026

---

## CORE ARCHITECTURE CHANGE: TIME = QUEUE

In-game time is a FUNCTION of queue position. No independent clock.
No time multipliers. No dustTimeFactor on time. The clock moves ONLY when the queue moves.

### Time-to-Queue Mapping

Queue position maps to in-game hold time via a curve:
```
inGameTime = interpolate(queuePosition, QUEUE_START, 0, 0, NINE_YEARS)
```

The curve is non-linear (exponential feel):
- Queue #150 → 0 seconds (just dialed)
- Queue #120 → 5 minutes
- Queue #100 → 1 hour
- Queue #80 → 1 day
- Queue #60 → 1 week
- Queue #40 → 1 month
- Queue #20 → 1 year
- Queue #10 → 3 years
- Queue #5 → 6 years
- Queue #1 → 8.5 years
- Queue #0 → 9 years (triggers time freeze/dept transfer)

Each queue advance = the time delta between current and next position.
Display updates immediately on advance. No passive ticking.

### What This Eliminates
- timeMultiplier state variable (gone)
- dustTimeFactor applied to time (gone)
- Time running while idle/AFK impacting display (gone)
- Time Blur upgrades as "time accelerators" (repurposed)
- The disconnect between time display and progress

### Time Blur Upgrades → Repurposed
Since time is now queue-based, Time Blurs become production/mechanical boosts:
- Time Blur I (30 min active): "Hold perception shifts" → +100% all production (x2)
- Time Blur II (45 min active): "Days merge" → +100% all production (x2)  
- Time Blur III (60 min active): "Calendar irrelevant" → +100% all production (x2)
- Hidden: still raise combo cap (x5/x6/x8)

These are the ONLY x2-all multipliers in the game. Spaced 15 min apart.

---

## UI: SINGLE-SCREEN DASHBOARD (NO SCROLL)

### Layout (fits 1080p without scrolling)

```
┌─────────────────────────────────────────────────┐
│  PLEASE HOLD                  Tin Can & String   │
│  patience/sec: 55.7 | Streak x2.3 | 3h 18m     │
├────────────────────┬────────────────────────────┤
│ Patience: 6,045    │ WtL: 15/20 ████████░░     │
│ Queue: #119        │ Dust: 244 particles        │
├────────────────────┴────────────────────────────┤
│ [  ENDURE  ]  [ Deep Breath ]  [ Advance +1 ]  │
├──────────────────────┬──────────────────────────┤
│ COPING MECHANISMS    │ UPGRADES                 │
│ Doodle Pad (10)  78  │ Snack Drawer ✓          │
│ Fidget Spin (9) 410  │ Hold Music Tol ✓        │
│ Autodialer (4)  1.1K │ Colored Pencils ✓       │
│ Speed Dial (3)  7.6K │ Caffeine Drip  3K       │
│ Robo-Call (0)   40K  │ ─── Collectors ───      │
│ Shadow CC (0)  350K  │ Microfiber    300d      │
│                      │ Dust Mask     800d      │
├──────────────────────┴──────────────────────────┤
│ > Advanced to #121.                             │
│ > "Your call is important to us."              │
│ > Bought: Speed Dialer (3)                      │
└─────────────────────────────────────────────────┘
```

### UI Rules
- Body font: 15px (slightly smaller for density, but monospace = readable)
- Generator items: ONE LINE each (name, count, cost)
- Upgrade items: ONE LINE each (name + cost, or name + ✓)
- Descriptions shown on HOVER ONLY (title tooltip)
- Actions: horizontal row (not stacked)
- Log: 3-4 visible lines, auto-scroll
- Flavor text: merged into log (not separate box)
- No separate "flavor box" — saves vertical space
- Dust overlay: subtle (max 0.25 opacity)
- Text contrast via text-shadow, not font size

---

## BALANCE: CONSTANT RHYTHM

### Queue Costs: Dynamic (Scale with PPS)

```
advanceCost = baseCost × 1.095^advances × (1 + totalPPS / scalingDivisor)
```

scalingDivisor tuned so each advance = ~30-45 seconds of current production.
At 50 pps: divisor makes multiplier negligible (~1.1x)
At 5000 pps: multiplier ~11x  
At 500K pps: multiplier ~1001x
Queue is NEVER free. Always a decision.

### Click Value: Scales with Production

```
patiencePerClick = baseClick + (totalPPS × clickScaleFactor)
```

clickScaleFactor = 0.05 (each click = 5% of 1 second of production)
With combo at x4: effective = 20% of 1 second per click
With combo at x8: effective = 40% of 1 second per click
Clicking is ALWAYS relevant.

### Upgrade Pacing: One Every 3-5 Minutes

All upgrades gated by ACTIVE TIME (primary) + queue position (some):
- Min 0-5: Snack Drawer (patience gate only)
- Min 5-8: Hold Music Tolerance, Colored Pencils  
- Min 8-12: Comfortable Chair, Rhythmic Clicking
- Min 12-16: Titanium Bearings
- Min 16-20: Caffeine IV (reworked: click boost)
- Min 20-25: Parallel Lines (Autodialer x2)
- Min 25-30: Queue gates start mattering
- Min 30: Time Blur I (x2 all, combo cap 5)
- Min 30-35: Overclocked Modem (queue #80)
- Min 35-40: Entropy Noticed (queue #60), Machine Learning
- Min 40-45: Muscle Memory (queue #50)
- Min 45: Time Blur II (x2 all, combo cap 6)
- Min 45-55: Conference Call (queue #30), Queue Familiarity
- Min 55-60: Corporate Insider (queue #10)
- Min 60: Time Blur III (x2 all, combo cap 8)
- Min 60-90+: Time freeze endgame push

### No x2-ALL Multipliers Except Time Blurs

Remove: Second Phone Line (x2), Conference Call (x2)
Replace with: specific tier boosts (+50% one tier, +30% another)
Time Blurs are the ONLY global multipliers. 3 total = x8 maximum from globals.

### Cascading Boost Cap

Total cascade bonus per generator capped at +150% (2.5x max from cascading).
Prevents infinite compounding. Formula:
```
nestedBoost = Math.min(2.5, 1 + sumOfAllHigherTierBoosts)
```

### Generator Cost Smoothing

Reduce soft cap harshness: growthRate^4 instead of growthRate^8 post-cap.
Allows more units to be purchased (feels better), but total production stays bounded by cascade cap.

### Dust System (Simplified)

- Dust accumulates based on REAL active time × dustPerSec (no time factor)
- pps-linked bonus stays: dustPerSec += totalPPS × 0.0001
- 10 collectors (reduced from 14 — fewer but more meaningful)
- Some collectors are repeatable (buy multiple): Broom, HEPA, Industrial (+dust/sec each time)
- Dust has NO impact on time display (time = queue only)

---

## DEPARTMENT TRANSFER

Trigger: Queue hits 0 AND inGameTime < 9 years (shouldn't happen with time=queue, but safety)

Actually with time=queue, hitting queue 0 = 9 years ALWAYS. So department transfer triggers differently:

New trigger: If player clears first 75 positions in under 20 min active time (rushing).
Effect: Queue resets to 75. Costs reset to advance 60 level.
"You're too efficient. They noticed. Transferred."

OR: Remove department transfer entirely since time=queue makes it unnecessary.
The time freeze at queue #0 IS the endgame.

Actually — keep it simple. Queue 0 = 9 years = time freeze. No transfer needed.
If we want the transfer narrative beat, make it happen at a FIXED queue position (#50 or #30) as a mandatory story event that doesn't reset anything, just plays a narrative.

---

## IMPLEMENTATION ORDER

1. Rewrite time system (time = function of queue position)
2. Rewrite UI (single-screen dashboard, compact items)
3. Implement dynamic queue costs (scale with pps)
4. Implement scaled click value (pps × 0.05)
5. Repurpose Time Blurs (x2 all, no time acceleration)
6. Restructure upgrade gating (active time primary)
7. Cap cascade at 2.5x, reduce soft cap to ^4
8. Simplify dust (no time factor, real-time only)
9. Remove/replace x2-ALL upgrades
10. Update simulator + verify rhythm
11. Push + test

---

## KEY PRINCIPLES

1. Time-to-next-purchase: always 20-60 seconds
2. Something new every 3-5 minutes
3. Clicking always relevant (5% of 1 second per click)
4. No scrolling. Everything visible.
5. Queue = progress = time. One unified concept.
6. 90-120 minutes total. Always. No fast-forwarding.
