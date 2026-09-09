/**
 * PLEASE HOLD - Logging System (v6)
 * 
 * Comprehensive metrics logging separated from game logic.
 * All console output goes through here.
 */
const Log = (function() {

  function mins() {
    const s = State.get();
    return ((Date.now() - s.realStartTime) / 60000).toFixed(1) + 'm';
  }

  /** Periodic comprehensive log (every 60s) */
  function periodic(effectivePPS) {
    const s = State.get();
    const wtlState = Wtl.getState();
    const drain = Wtl.getDrain();
    const refillCost = Wtl.getRefillCost(effectivePPS);
    const qCost = Queue.getCost();
    const eta = Queue.getETA(effectivePPS);
    const clickPush = Click.getQueuePush(effectivePPS);
    const degradation = Dust.getDegradation();
    const dominance = Generators.getDominance();
    const domStr = Object.entries(dominance).filter(([,v]) => v > 0).map(([k,v]) => k[0] + ':' + v + '%').join(' ');

    console.log('[METRICS] TIME ' + mins() + ' | active:' + (s.activePlayTime / 60).toFixed(1) + 'm | pps:' + effectivePPS.toFixed(0) + ' | q:#' + s.queue + ' | pass:' + s.queuePass + ' | hold:' + NumberFormat.formatHoldTime(Queue.getInGameTime()));
    console.log('[METRICS]   WtL:' + s.wtl.toFixed(1) + '/' + Balance.WTL.max + ' [' + wtlState.name + '] drain:' + drain.toFixed(2) + '/s | refill:' + refillCost + ' | combo:' + s.combo.toFixed(1) + '/' + s.comboCapMax);
    console.log('[METRICS]   Queue: speed=' + (s.queueSpeedMult + Phone.getBonus().queue).toFixed(2) + '×' + wtlState.queueMult + ' | cost=' + qCost + ' | ETA=' + (eta === Infinity ? '∞' : eta.toFixed(1) + 's') + ' | clickPush=' + clickPush.toFixed(0) + '/click');
    console.log('[METRICS]   Dust:' + Math.floor(s.dust) + ' | degrade:' + (degradation * 100).toFixed(1) + '% | rate:' + Dust.getRate(effectivePPS).toFixed(1) + '/s | collectors:' + s.collectorsOwned.length + '/14 | threshold:' + Dust.getThreshold());
    console.log('[METRICS]   Gens: ' + Generators.getDefs().map(d => d.id[0] + ':' + s.generators[d.id].owned).join(' ') + ' | ' + domStr);
    console.log('[METRICS]   Phone:' + s.phoneTier + ' | clicks:' + s.totalClicks + ' | upgrades:' + s.boughtUpgrades.length + '/' + Upgrades.getDefs().length);
  }

  /** Log a specific event */
  function event(type, data) {
    const prefix = '[METRICS] ';
    switch (type) {
      case 'generator_buy':
        console.log(prefix + 'Bought "' + data.name + '" (#' + data.owned + ') at ' + mins() + ' | cost:' + data.cost + ' | pps:' + data.pps.toFixed(1));
        break;
      case 'generator_unlock':
        console.log(prefix + 'GENERATOR UNLOCKED: "' + data.name + '" at ' + mins() + ' | maxP:' + data.maxP);
        break;
      case 'milestone':
        console.log(prefix + 'MILESTONE: ' + data.name + ' x' + data.mult + ' at ' + mins() + ' | ppsBefore:' + data.ppsBefore.toFixed(0) + ' → ppsAfter:' + data.ppsAfter.toFixed(0));
        break;
      case 'upgrade':
        console.log(prefix + 'UPGRADE "' + data.name + '" at ' + mins() + ' | pps:' + data.pps.toFixed(1) + ' | q:#' + data.queue);
        break;
      case 'upgrade_available':
        console.log(prefix + 'UPGRADE AVAILABLE: "' + data.name + '" at ' + mins() + ' | q:#' + data.queue + ' | pps:' + data.pps.toFixed(1));
        break;
      case 'wtl_state':
        console.log(prefix + 'WTL STATE: ' + data.from + ' → ' + data.to + ' | wtl:' + data.wtl.toFixed(1) + ' | drain:' + data.drain.toFixed(2) + '/s | at ' + mins());
        break;
      case 'deep_breath':
        console.log(prefix + 'DEEP BREATH at ' + mins() + ' | cost:' + data.cost + ' | wtl:' + data.before.toFixed(1) + '→' + data.after.toFixed(1) + ' | pps:' + data.pps.toFixed(0));
        break;
      case 'queue_advance':
        console.log(prefix + 'Queue #' + data.position + ' at ' + mins() + ' | cost:' + data.cost + ' | pps:' + data.pps.toFixed(1) + ' | holdTime:' + data.holdTime);
        break;
      case 'transfer':
        console.log(prefix + 'DEPARTMENT TRANSFER at ' + mins() + ' | pps:' + data.pps.toFixed(1));
        break;
      case 'hangup':
        console.log(prefix + 'HANGUP at ' + mins() + ' | q:#' + data.queue + ' | penalty:' + data.penalty + ' → q:#' + data.newQueue);
        break;
      case 'connection_claim':
        console.log(prefix + 'CONNECTION CLAIMED at ' + mins() + ' | pps:' + data.pps.toFixed(0) + ' | buff:x' + Balance.CONNECTION.buffMultiplier + ' for ' + Balance.CONNECTION.buffDuration + 's');
        break;
      case 'collector_buy':
        console.log(prefix + 'DUST COLLECTOR "' + data.name + '" at ' + mins() + ' | cost:' + data.cost + ' | dust:' + data.dustAfter.toFixed(0) + ' | collectors:' + data.count + '/14 | threshold:' + data.threshold);
        break;
      case 'phone_upgrade':
        console.log(prefix + 'PHONE UPGRADE: ' + data.name + ' at ' + mins() + ' | +' + (data.prodBonus * 100) + '% prod, +' + (data.queueBonus * 100) + '% queue');
        break;
      case 'phase1_complete':
        console.log(prefix + '=== PHASE 1 COMPLETE === at ' + mins() + ' | clicks:' + data.clicks + ' | pps:' + data.pps.toFixed(1) + ' | dust:' + data.dust.toFixed(0));
        break;
      default:
        console.log(prefix + type + ' | ' + JSON.stringify(data));
    }
  }

  return { periodic, event, mins };
})();
