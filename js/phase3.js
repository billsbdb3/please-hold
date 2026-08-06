/**
 * Phase 3: The Geological
 * Core loop: resource allocation strategy, balance competing systems.
 * ~1-2 hours of gameplay.
 */
const Phase3 = (function() {
  // TODO: Full implementation in next iteration
  // Placeholder structure for phase 3 mechanics

  const upgrades = [];

  const QUEUE_START = 50;
  const QUEUE_BASE_COST = 100000;
  const QUEUE_GROWTH = 1.15;

  function getAdvanceCost(advances) {
    return Math.floor(QUEUE_BASE_COST * Math.pow(QUEUE_GROWTH, advances));
  }

  function getQueueStart() { return QUEUE_START; }

  return { upgrades, getAdvanceCost, getQueueStart, QUEUE_START };
})();
