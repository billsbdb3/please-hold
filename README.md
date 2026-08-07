# PLEASE HOLD

An incremental game about being on hold, losing your mind, and accidentally ending the universe.

## The Premise

You need to dispute a charge on your statement. It's $1.47. It's the principle of the thing.

You call Meridian Solutions Inc. You are placed on hold.

What follows is a journey across three phases of escalating absurdity — from clicking to survive, to raging at bureaucracy, to managing geological-scale entropy — all while the hold music plays and the dust accumulates.

## How to Play

Open `index.html` in a browser. No build step, no dependencies, no server required.

## Game Structure

**Phase 1: The Call** (~1.5-2 hours)
- Click [ ENDURE ] to generate Patience
- Manage your Will to Live (it drains — the hold music is getting to you)
- Buy Coping Mechanisms (generators) for passive Patience income
- Purchase upgrades that multiply your generators
- Advance through the queue toward the front of the line
- Watch as dust accumulates and time slips away from you

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
│   ├── ui.js           — DOM utilities, overlays, modals
│   ├── flavor.js       — all flavor text pools
│   ├── save.js         — localStorage auto-save
│   └── numbers.js      — big number + dust formatting
└── README.md
```

## Save System

Game auto-saves to localStorage every 30 seconds. Close the tab and come back later.

## Credits

Built with dry humor and excessive research into incremental game design.
