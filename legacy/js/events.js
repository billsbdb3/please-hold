/**
 * PLEASE HOLD - Events System (v6)
 * 
 * Handles: Connection Opportunity (production x3 buff),
 * queue milestone narratives, and other timed events.
 */
const Events = (function() {

  // Queue position milestones (narrative flavor)
  const QUEUE_MILESTONES = [
    { at: 180, msg: '"Your call is important to us." You doubt this.' },
    { at: 150, msg: '"A representative will be with you shortly." Shortly is relative.' },
    { at: 120, msg: 'A recorded voice apologizes. It is not sorry.' },
    { at: 90, msg: 'The hold music has changed. You liked the old one better.' },
    { at: 60, msg: '"Your call is EXTREMELY important." The emphasis is suspicious.' },
    { at: 30, msg: 'You can feel it. The end is near. Probably.' },
    { at: 15, msg: 'The recording stutters. Almost.' },
    { at: 8, msg: 'Single digits. This is real. This is happening.' },
    { at: 3, msg: 'Almost there. Almost.' },
    { at: 1, msg: 'Next in line.' },
  ];

  /**
   * Check if a queue milestone should fire.
   * Returns the message string if triggered, null otherwise.
   */
  function checkQueueMilestone() {
    const s = State.get();
    for (const m of QUEUE_MILESTONES) {
      if (s.queue <= m.at && !s.triggeredMilestones.includes(m.at)) {
        s.triggeredMilestones.push(m.at);
        return m.msg;
      }
    }
    return null;
  }

  /**
   * Schedule the next Connection Opportunity event.
   */
  function scheduleNext() {
    const s = State.get();
    const delay = Balance.CONNECTION.minInterval + Math.random() * (Balance.CONNECTION.maxInterval - Balance.CONNECTION.minInterval);
    s.nextConnectionTime = Date.now() + (delay * 1000);
    s.connectionActive = false;
  }

  /**
   * Check if a Connection event should appear or expire.
   * Returns: 'appear' | 'expire' | null
   */
  function checkConnection(now) {
    const s = State.get();

    // Don't show events before first few queue advances
    if (s.queueAdvances < 5) return null;

    if (!s.connectionActive) {
      if (now >= s.nextConnectionTime) {
        s.connectionActive = true;
        s.connectionExpires = now + (Balance.CONNECTION.windowDuration * 1000);
        return 'appear';
      }
    } else {
      if (now >= s.connectionExpires) {
        s.connectionActive = false;
        scheduleNext();
        return 'expire';
      }
    }
    return null;
  }

  /**
   * Claim the Connection Opportunity. Activates the x3 buff.
   * Returns true if claimed.
   */
  function claimConnection() {
    const s = State.get();
    if (!s.connectionActive) return false;

    s.connectionActive = false;
    s.connectionBuffExpires = Date.now() + (Balance.CONNECTION.buffDuration * 1000);
    scheduleNext();
    return true;
  }

  /**
   * Get the connection buff multiplier (1 if not active, buffMultiplier if active).
   */
  function getConnectionMult(now) {
    const s = State.get();
    if (s.connectionBuffExpires && now < s.connectionBuffExpires) {
      return Balance.CONNECTION.buffMultiplier;
    }
    return 1;
  }

  /**
   * Get remaining buff time in seconds (0 if not active).
   */
  function getBuffRemaining(now) {
    const s = State.get();
    if (s.connectionBuffExpires && now < s.connectionBuffExpires) {
      return (s.connectionBuffExpires - now) / 1000;
    }
    return 0;
  }

  /**
   * Is a connection event currently showing?
   */
  function isConnectionActive() {
    return State.get().connectionActive;
  }

  return {
    checkQueueMilestone, scheduleNext, checkConnection,
    claimConnection, getConnectionMult, getBuffRemaining, isConnectionActive,
  };
})();
