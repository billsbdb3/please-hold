---
inclusion: auto
---

# IMPLEMENTATION PLAN - Phase 1: The 10-Year Journey

## Status: READY TO IMPLEMENT
Last updated: August 2026

---

## PHASE TIMELINE (LOCKED IN)

- Phase 1: 0 → 10 years on hold. ~90-120 min real time. Ends at EXACTLY 10 years.
- Phase 2: 11 → 100 years. (Future)
- Phase 3: 101+ years. (Future)

Phase 1 ends when in-game time hits 10 years. The queue is a mechanic within that frame, not the sole win condition.

---

## THREE ACTS OF PHASE 1

| Act | In-game time | Real time | Player activity |
|-----|-------------|-----------|-----------------|
| Act 1: The Wait | 0 → 1 year | 0-30 min | Clicking, building generators, first queue advances |
| Act 2: The Grind | 1 → 9 years | 30-75 min | Production ramps, dust flows, upgrades unlock via queue gates |
| Act 3: The Push | 9 → 10 years | 75-100 min | Time frozen. Each queue advance = time + dust chunk. Deliberate. |

---

## 1. TIME MULTIPLIER CALIBRATION

Target: reach 9 years by ~75 min real time, then freeze.

- Base time mult: 1x (first 30 min)
- Time Blur I (at 30 min active): x10
- Time Blur II (at 45 min active): x10 → cumulative x100
- Time Blur III (at 60 min active): x12 → cumulative x1200
- Dust time factor adds on top (capped at x30 for dust accumulation)

---

## 2. DEPARTMENT TRANSFER (Safety Valve)

**Trigger:** Queue hits 0 AND in-game time < 9 years.

**What happens:**
- Modal: "Thank you for holding. I'm transferring you to our Specialist Department."
- Beat: *click*
- "Your queue position is: seventy-five."
- "The hold music changes. It's worse."
- Queue resets to 75
- All upgrades, generators, dust, production STAY
- queueAdvances stays the same (costs don't reset, continue scaling)

**Prevents:** Speed-running by hoarding then bulldozing.

**Feel:** Gut punch. Dry humor. But you're powerful now — new 75 positions fall fast.

---

## 3. TIME FREEZE (Act 3)

**Trigger:** In-game time hits 9 years.

**What changes:**
- Time stops ticking from dt (timeMultiplier effective → 0 for passive)
- Generators still produce patience (needed for queue costs)
- Dust does NOT accumulate passively
- WtL drain continues (Deep Breath still needed)
- Click combo still works

**What advances time + dust:**
- Each queue advance adds: `(10_years_seconds - currentInGameSeconds) / remainingQueuePositions`
- Each queue advance gives dust: `dustPerSec × timeChunkAdded` (raw, no time cap)

**Narrative:** "The clock on the wall has stopped. You've been here so long that time itself has given up. Only forward movement matters now."

**Feel:** Each advance is deliberate. Time JUMPS. Dust BURSTS. Queue TICKS. Final advance → exactly 10.0 years → phase transition.

---

## 4. QUEUE-GATED UPGRADES

Upgrades that only REVEAL at specific queue positions:

| Queue Position | Upgrade |
|---------------|---------|
| #150 (5 min real time) | Advance button unlocks |
| #120 | Second Phone Line (ALL x2) |
| #100 | Overclocked Modem (Speed x3) |
| #80 | Entropy Noticed (dust starts) |
| #60 | Machine Learning (Robo x3) + Muscle Memory (combo lock) |
| #40 | Conference Call (ALL x2) |
| #20 | Corporate Insider (no WtL click cost) |

Early upgrades (Snack Drawer, Chair, Rhythmic Clicking, Titanium Bearings, etc.) keep patience-based reveals.

Queue Familiarity: reveals at queue #50 (between Machine Learning and Conference Call).

**Key insight:** Player MUST advance queue to unlock power. Can't hoard forever.

---

## 5. TIME BLUR GATING + HIDDEN COMBO BOOST

**Time Blurs gated by REAL active time:**
- Time Blur I: 30 min active play required + 200K cost
- Time Blur II: 45 min active play required + 600K cost
- Time Blur III: 60 min active play required + 2.5M cost

They don't appear until the time gate is met.

**Hidden combo cap boost (UNDOCUMENTED):**
- Requires Muscle Memory first (combo must be locked)
- Time Blur I: combo cap 4 → 5
- Time Blur II: combo cap 5 → 6
- Time Blur III: combo cap 6 → 8

Player discovers on their own. Never mentioned in descriptions.

---

## 6. UI IMPROVEMENTS

### A. Dust Overlay
- Increase opacity max from 0.3 to 0.4
- Add CSS grain/noise texture for dusty feel
- Ensure all text remains readable

### B. Text Size
- Body font minimum: 0.95em
- Buttons: slightly larger text
- Rates bar: 1em

### C. Purchased Upgrade Tooltips
- Minimized upgrades ("Name ✓") get `title` attribute with description
- Hover shows what it does
- Clean UI, information accessible

### D. Layout
- Dust Collectors appear below Upgrades in same column (scrollable)
- Or: tabbed interface (Coping | Upgrades | Collectors)
- Prevent cramming

### E. Number Formatting
- Billions: "1.2B"
- Trillions: "1.2T"
- Update NumberFormat module

---

## 7. QUEUE COST REBALANCE

With endgame pps in billions, final positions need to cost billions.

Formula: `30 × 1.095^advances × lateMultiplier`

Late multiplier (advances >= 120): `1 + depth^2.2 / 10`
- depth 0: 1x (position #30)
- depth 10: 16x (position #20)
- depth 20: 177x (position #10)
- depth 29: ~1300x (position #1)

At advance 149 base cost: ~45M × 1300 = ~58B for final position.
At 1B pps: ~58 seconds. Perfect tension.

Tune in simulator once gating is implemented.

---

## 8. CASCADING BOOST SYSTEM (Current)

Each tier boosts ALL tiers below:
- Shadow Call Center: +3% per owned to all below
- Robo-Caller: +2% per owned to all below
- Speed Dialer: +1.5% per owned to all below
- Autodialer: +0.8% per owned to all below
- Fidget Spinner: +0.3% per owned to all below

Soft caps: Doodle 25, Fidget 25, Auto 22, Speed 20, Robo 15, Shadow 12.

---

## 9. EXISTING SYSTEMS (Unchanged)

- WtL drain: uses activePlayTime, pauses when idle (180s threshold)
- Welcome Back modal: 25% rewards on AFK return
- Click streak: locks with Muscle Memory (750K, reveal at queue #60)
- Queue Familiarity: 2% per advance, max 25%, decays 15s (purchased upgrade)
- Dust pps-linked: dustPerSec += totalPPS × 0.0001
- Dust time cap: x30

---

## 10. IMPLEMENTATION ORDER

1. ~~Save plan to steering doc~~ ✓
2. Queue-gated upgrades (change reveal logic in phase1.js)
3. Time Blur real-time gates (add activePlayTime requirement)
4. Hidden combo cap boost (modify Time Blur effects + tick logic)
5. Department Transfer mechanic (new function in main.js)
6. Time Freeze at 9 years (modify tick loop)
7. Dust-per-advance during freeze
8. Queue cost rebalance (depth^2.2/10)
9. UI improvements (CSS + tooltips + layout + number formatting)
10. Sim update + verify 10-year landing
11. Advance button locked first 5 min

---

## KEY DESIGN PRINCIPLES

- Player cannot skip time investment (department transfer prevents)
- Player must engage with queue to unlock upgrades (queue gating)
- Endgame is deliberate, not passive (time freeze)
- Hidden rewards for active play (combo cap boost)
- Always something to discover (queue milestones, undocumented boosts)
- 10 years is sacred. Phase 1 ALWAYS ends at 10 years.
- ~90-120 min real time, ~10K clicks, all upgrades/collectors attainable
