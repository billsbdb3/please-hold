/**
 * Phase 1: The Call
 * Core loop: click to endure, manage WtL, build automation engine.
 * ~1.5-2 hours of gameplay.
 */
const Phase1 = (function() {
  // Phase 1 upgrade definitions
  const upgrades = [
    { id: 'p1_speakerphone', name: 'Speakerphone', desc: '+0.3 patience/sec', cost: 40, currency: 'patience', revealAt: 20, phase: 1,
      effect(s) { s.patiencePerSec += 0.3; } },
    { id: 'p1_snack', name: 'Snack Drawer', desc: 'Deep Breath: 3 patience → +12 WtL', cost: 80, currency: 'patience', revealAt: 40, phase: 1,
      effect(s) { s.refillCost = 3; s.refillAmount = 12; } },
    { id: 'p1_tolerance', name: 'Hold Music Tolerance', desc: '+1 patience/click', cost: 150, currency: 'patience', revealAt: 80, phase: 1,
      effect(s) { s.patiencePerClick += 1; } },
    { id: 'p1_chair', name: 'Comfortable Chair', desc: '+0.8 patience/sec, +5 max WtL', cost: 300, currency: 'patience', revealAt: 150, phase: 1,
      effect(s) { s.patiencePerSec += 0.8; s.wtlMax += 5; } },
    { id: 'p1_caffeine', name: 'Caffeine IV Drip', desc: '+2 patience/click, -0.5 WtL/click', cost: 500, currency: 'patience', revealAt: 300, phase: 1,
      effect(s) { s.patiencePerClick += 2; s.wtlPerClick = Math.max(0.5, s.wtlPerClick - 0.5); } },
    { id: 'p1_autodialer', name: 'Autodialer', desc: '+2 patience/sec', cost: 800, currency: 'patience', revealAt: 500, phase: 1,
      effect(s) { s.patiencePerSec += 2; } },
    { id: 'p1_speeddialer', name: 'Speed Dialer', desc: '+5 patience/sec', cost: 1500, currency: 'patience', revealAt: 800, phase: 1,
      effect(s) { s.patiencePerSec += 5; } },
    { id: 'p1_robocaller', name: 'Robo-Caller', desc: '+12 patience/sec, starts dust accumulation', cost: 3000, currency: 'patience', revealAt: 1500, phase: 1,
      effect(s) { s.patiencePerSec += 12; s.dustPerSec = 0.3; s.flags.dustStarted = true; } },
    { id: 'p1_timewarp', name: 'Time Perception Decay', desc: 'In-game time accelerates x60', cost: 5000, currency: 'patience', revealAt: 3000, phase: 1,
      effect(s) { s.timeMultiplier *= 60; } },
    { id: 'p1_insider', name: 'Corporate Insider', desc: '+20 patience/sec, clicking costs 0 WtL', cost: 10000, currency: 'patience', revealAt: 5000, phase: 1,
      effect(s) { s.patiencePerSec += 20; s.wtlPerClick = 0; s.flags.noWtlCost = true; } },
  ];

  // Queue: 150 positions, cost = 20 * 1.07^advances
  const QUEUE_START = 150;
  const QUEUE_BASE_COST = 20;
  const QUEUE_GROWTH = 1.07;

  function getAdvanceCost(advances) {
    return Math.floor(QUEUE_BASE_COST * Math.pow(QUEUE_GROWTH, advances));
  }

  function getUpgrades() { return upgrades; }
  function getQueueStart() { return QUEUE_START; }

  // Milestone messages at queue thresholds
  const milestones = [
    { at: 120, msg: 'You have been transferred to the Department of Alarm Clock Calibration.' },
    { at: 100, msg: '"A representative will be with you shortly." Shortly is a relative term.' },
    { at: 80, msg: 'A recorded voice apologizes. It is not sorry.' },
    { at: 60, msg: 'The hold music has changed. You liked the old one better. You hate yourself for this.' },
    { at: 40, msg: '"Your call is very important to us." The emphasis on "very" is new. Suspicious.' },
    { at: 20, msg: 'You can feel it. The end is near. Probably.' },
    { at: 10, msg: 'Your queue position is: ten. You can taste it.' },
    { at: 5, msg: 'Single digits. This is real. This is happening.' },
    { at: 1, msg: 'Next in line.' },
  ];

  function checkMilestones(queue, triggered) {
    milestones.forEach(m => {
      if (queue <= m.at && !triggered.has(m.at)) {
        triggered.add(m.at);
        UI.addLog(m.msg);
      }
    });
  }

  return { upgrades, getAdvanceCost, getQueueStart, checkMilestones, QUEUE_START, QUEUE_BASE_COST, QUEUE_GROWTH };
})();
