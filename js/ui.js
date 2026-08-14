/**
 * UI rendering utilities.
 * Handles DOM updates, progressive reveal, and log management.
 */
const UI = (function() {
  const log = document.getElementById('log');

  function addLog(msg) {
    const p = document.createElement('p');
    p.textContent = '> ' + msg;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 80) log.removeChild(log.firstChild);
  }

  function clearLog() {
    log.innerHTML = '';
  }

  function show(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.style.display = '';
  }

  function hide(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.style.display = 'none';
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function setWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function setBarColor(id, pct) {
    const el = document.getElementById(id);
    if (!el) return;
    if (pct < 25) el.style.background = '#e07070';
    else if (pct < 50) el.style.background = '#e8a040';
    else el.style.background = '#e8c46a';
  }

  function setDustOverlay(dust) {
    const el = document.getElementById('dust-overlay');
    if (el) el.style.background = 'rgba(120,100,50,' + Math.min(dust / 8000, 0.25) + ')';
  }

  function setWtlOverlay(wtlPct) {
    let el = document.getElementById('wtl-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wtl-overlay';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:499;background:rgba(180,20,20,0);transition:background 0.5s;';
      document.body.appendChild(el);
    }
    if (wtlPct < 40) {
      const intensity = (40 - wtlPct) / 40 * 0.25;
      el.style.background = 'rgba(180,20,20,' + intensity.toFixed(3) + ')';
    } else {
      el.style.background = 'rgba(180,20,20,0)';
    }
  }

  function showTransition(title, lines, buttonText, callback) {
    const screen = document.getElementById('transition-screen');
    let html = '<h2>' + title + '</h2>';
    lines.forEach(l => { html += '<p>' + l + '</p>'; });
    html += '<button class="btn btn-call" id="transition-btn">' + buttonText + '</button>';
    screen.innerHTML = html;
    screen.style.display = 'block';
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('transition-btn').onclick = () => {
      screen.style.display = 'none';
      document.getElementById('game-area').style.display = 'block';
      if (callback) callback();
    };
  }

  function showWin(bodyHTML, statsHTML) {
    const win = document.getElementById('win-screen');
    win.innerHTML = '<h2>THE HOLD MUSIC STOPS.</h2><div class="win-body">' + bodyHTML + '</div><div id="win-stats">' + statsHTML + '</div>';
    win.classList.add('active');
  }

  function showMilestone(msg, callback) {
    let modal = document.getElementById('milestone-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'milestone-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:950;display:flex;justify-content:center;align-items:center;';
      document.body.appendChild(modal);
    }
    const inner = document.createElement('div');
    inner.style.cssText = 'background:#1a1a2e;border:2px solid #c4a35a;border-radius:8px;padding:30px 40px;max-width:500px;text-align:center;color:#c4a35a;font-family:Courier New,monospace;';
    inner.innerHTML = '<p style="font-size:1.1em;margin-bottom:12px;">★</p><p style="font-size:0.9em;color:#e0e0e0;line-height:1.6;">' + msg + '</p><button id="milestone-ok-btn" style="margin-top:20px;background:#2a2a4a;border:1px solid #c4a35a;color:#c4a35a;padding:8px 24px;font-family:Courier New,monospace;font-size:0.85em;cursor:pointer;border-radius:3px;">OK</button>';
    modal.innerHTML = '';
    modal.appendChild(inner);
    modal.style.display = 'flex';
    document.getElementById('milestone-ok-btn').onclick = () => {
      modal.style.display = 'none';
      if (callback) callback();
    };
  }

  return { addLog, clearLog, show, hide, setText, setHTML, setWidth, setBarColor, setDustOverlay, setWtlOverlay, showTransition, showWin, showMilestone };
})();
