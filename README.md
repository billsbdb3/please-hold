# PLEASE HOLD

An incremental game about being on hold, losing your mind, and accidentally ending the universe.

## The Premise

You need to dispute a charge on your statement. It's $1.47. It's the principle of the thing.

You call Meridian Solutions Inc. You are placed on hold.

What follows is a journey across three phases of escalating absurdity — from clicking to survive, to raging at bureaucracy, to managing geological-scale entropy — all while the hold music plays and the dust accumulates.

## How to Play

Open `index.html` in a browser. No build step, no dependencies, no server required.

## Game Structure

**Phase 1: The Call** (~90-120 minutes)
- Click [ ENDURE ] to generate Patience
- Manage your Will to Live (it drains — the hold music is getting to you)
- Buy Coping Mechanisms (generators) for passive Patience income
- Purchase upgrades that multiply your generators
- Advance through a 150-position queue toward the front of the line
- Watch as dust particles accumulate and time perception decays
- In-game time reaches ~10 years by Phase 1 end
- 17 upgrades + 11 dust collectors to discover

**Phase 2: The Escalation** (coming soon)
- Someone answers. They want to talk about your car's extended warranty.
- Rage becomes a resource. Composure replaces Will to Live.
- New mechanics. New absurdity. Dust goes global.

**Phase 3: The Geological** (coming soon)
- You are beyond clicking. You are a system now.
- Resource allocation strategy. Balance competing forces.
- Dust reaches cosmic scale. Time loses meaning.
- The $1.47 gets resolved. Eventually.

## Technical Details

Vanilla JavaScript. No frameworks. No build tools. Just open the HTML file.

```
please-hold/
├── index.html          — shell, layout
├── css/
│   ├── main.css        — base styles
│   ├── phase1.css      — phase 1 specific
│   ├── phase2.css      — phase 2 specific
│   └── phase3.css      — phase 3 specific
├── js/
│   ├── main.js         — game loop, state, coordination
│   ├── phase1.js       — generators, upgrades, queue
│   ├── phase2.js       — (placeholder)
│   ├── phase3.js       — (placeholder)
│   ├── dust.js         — dust system (collectors, accumulation, time factor)
│   ├── ui.js           — DOM utilities, overlays, modals
│   ├── flavor.js       — all flavor text pools
│   ├── save.js         — localStorage auto-save
│   └── numbers.js      — big number + dust unit formatting
├── tools/
│   └── simulate.js     — Node.js balance simulator
└── README.md
```

## Balance Simulator

Tune game balance without manual playtesting:

```
node tools/simulate.js --player=active    # ~98 min, matches real player
node tools/simulate.js --player=casual    # ~101 min
node tools/simulate.js --player=idle      # cannot complete (by design)
```

## Save System

Game auto-saves to localStorage every 30 seconds. Close the tab and come back later.

## Credits

Built with dry humor and excessive research into incremental game design.
