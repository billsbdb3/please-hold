---
inclusion: auto
---

# IMPLEMENTATION PLAN - Phase 1 Comprehensive Rework

## Status: IN PROGRESS
Last updated: August 2026

## Priority Order
1. Nested Generators (biggest impact - fixes dead zone)
2. WtL Active Session Time (fixes AFK drain bug)
3. Dust Pacing (fixes too fast/too slow)
4. Queue Momentum → Upgrade (fixes cost fluctuation)
5. Offline/AFK Rewards (welcome back modal)
6. UI Fixes (WtL display, click multiplier visibility, text rewording)
7. Simulator updates

---

## 1. NESTED GENERATORS

Each coping mechanism tier provides a bonus to the tier below:
- Shadow Call Center: each gives all Robo-Callers +5% production
- Robo-Caller: each gives all Speed Dialers +3% production
- Speed Dialer: each gives all Autodialers +2% production
- Autodialer: each gives all Fidget Spinners +1% production
- Fidget Spinner: each gives all Doodle Pads +0.5% production

Implementation in phase1.js calcGeneratorPPS:
```
For each generator tier (starting from top):
  bonus = tier.owned * tier.boostPercent
  Apply bonus to all generators one tier below
```

Display: Each generator button shows "Boosts [tier below] by X%"

---

## 2. WTL ACTIVE SESSION TIME

Replace `realElapsed` with `activePlayTime`:
- Track `lastInteractionTime` (any click, purchase, advance)
- If `now - lastInteractionTime > 60000ms`: set `isIdle = true`
- When `isIdle`: drain PAUSES, generators still run at 25% rate
- On next interaction: `isIdle = false`, drain resumes
- `activePlayTime` only increments during non-idle periods

WtL drain formula uses `activePlayTime / 60` instead of `realElapsed / 60`

### WtL Display Fix
After Deep Breath:
- Set `wtlDisplayHold = true` and `wtlDisplayHoldUntil = now + 1000`
- While held: display shows `wtlMax/wtlMax` regardless of actual value
- After 1s: resume normal display

### Corporate Insider Text
Old: "Clicking no longer costs WtL"
New: "Clicking no longer costs WtL. The hold music still wears on you."

---

## 3. DUST PACING

- Base dustPerSec: 0.2 (was 1.0) when Entropy Noticed bought
- Dust time cap: x30 (was x10)
- Dust collectors provide dust/sec boosts (primary way to increase rate)
- First collector available: ~3-5 min after Entropy Noticed

### Collector Costs (11 items, ALL attainable in Phase 1)
300, 800, 2000, 5000, 10000, 20000, 40000, 70000, 100000, 140000, 180000

### Dust Reveal Threshold
Show dust shop when dust >= 200 (gives time between Entropy popup and shop popup)

---

## 4. QUEUE MOMENTUM → UPGRADE

Remove automatic momentum from game loop.
Add upgrade: "Queue Familiarity"
- Cost: 500K patience
- RevealAt: 300K maxPatience
- Effect: each advance reduces next cost by 2% (max 25%), resets after 15s no advance
- Display: text under Advance button "Momentum: -X%"
- This is a PURCHASED ability, not automatic

---

## 5. OFFLINE/AFK REWARDS

When player returns after being idle > 60s:
- Calculate idle duration (cap at 24 hours)
- Award: patience × pps × 0.25 × seconds_idle
- Award: dust × dustPerSec × 0.25 × seconds_idle
- WtL: restore to max
- Show "Welcome Back" modal with earnings summary
- NO queue advancement while idle

---

## 6. UI FIXES

### Click Multiplier Visibility
After Rhythmic Clicking purchased:
- Show HUD: "Streak: x2.3" that pulses when active
- Positioned near the ENDURE button or rates bar
- Fades/dims when combo decays to 1.0

### Time Upgrade Text
- "Minutes Feel Like Hours" → "Time Blur I: Hold perception shifts. (x10)"
- "Time Perception Decay" → "Time Blur II: Days merge. (x10)"  
- "Days Blur Into Weeks" → "Time Blur III: Calendar irrelevant. (x12)"

### Doodle Pad Production
Already fixed: 0.1 (was 0.08)

---

## 7. SIMULATOR UPDATES

- Add 3-5 second "thinking time" between purchases
- Add occasional 5-10s idle periods (player reading)
- Click rate: 1.85/sec average organic
- Add AFK simulation option
- Use `activePlayTime` for drain calculation

---

## Files to Modify
- js/phase1.js — nested generator bonus, new upgrade, text fixes
- js/main.js — WtL active time, idle detection, display hold, remove momentum
- js/dust.js — cost adjustments, base rate, time cap
- js/ui.js — welcome back modal, streak display
- tools/simulate.js — behavior updates

## Key Design Principles
- Never punish player for being away
- Always have something to buy/decide (nested generators ensure this)
- Visible feedback for all mechanics (streak, momentum, drain)
- Everything in Phase 1 should be attainable in Phase 1
- Target: 90-120 min active play, ~10 years in-game time at end
