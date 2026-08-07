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
    if (el) el.style.background = 'rgba(160,130,80,' + Math.min(dust / 5000, 0.3) + ')';
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

  function showMilestone(msg) {
    let banner = document.getElementById('milestone-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'milestone-banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:16px 20px;background:#1a1a0a;border-bottom:2px solid #c4a35a;color:#c4a35a;text-align:center;font-family:Courier New,monospace;font-size:0.95em;z-index:900;transition:opacity 1.5s;text-shadow:0 0 10px rgba(196,163,90,0.3);';
      document.body.appendChild(banner);
    }
    banner.textContent = '★ ' + msg;
    banner.style.opacity = '1';
    banner.style.display = 'block';
    setTimeout(() => { banner.style.opacity = '0'; }, 10000);
    setTimeout(() => { banner.style.display = 'none'; }, 12000);
    addLog('★ ' + msg);
  }

  return { addLog, clearLog, show, hide, setText, setHTML, setWidth, setBarColor, setDustOverlay, showTransition, showWin, showMilestone };
})();
