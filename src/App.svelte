<script lang="ts">
  /**
   * The console. Phase 1 layout.
   *
   * Deliberately small: a softphone, a call timer, a notepad, two meters. The screen
   * is mostly empty because you are on hold, and the emptiness is the joke. The shell
   * grows in later phases (docs/DESIGN.md §8) — panes are added to this same frame
   * rather than replacing it, so the interface visibly accrues capability.
   *
   * Every component here reads `frame.n` first to establish its reactive dependency,
   * then reads the plain game object. One invalidation per animation frame.
   */
  import { onMount } from 'svelte';
  import {
    frame, game, startGame, interacted,
    hardReset, exportCurrent, importFromString,
  } from './store.svelte';
  import { fmt, fmtRate, fmtDuration, fmtPct } from './engine/numbers';
  import {
    stall, buyGenerator, buyUpgrade,
    catchEvent, redial, canRedial, buyDossier, availableDossier,
    takeBreath, canTakeBreath, breathCost,
    switchPersona, availablePersonas, phase1Progress, phase1Complete,
  } from './engine/sim';
  import {
    GENERATORS, COMPOSURE, RAPPORT, REDIAL, DOSSIER,
    RAGE, PERSONA_SWITCH_COST, PHASE1_COMPLETION,
  } from './data/balance';
  import { UPGRADES, statusOf, excludedBy } from './data/upgrades';
  import { isUnlocked, maxComposure } from './engine/derive';
  import { snapshot } from './engine/snapshot';
  import type { GeneratorId } from './engine/types';

  let started = $state(false);
  let bulk = $state<BulkMode>(1);
  let showSettings = $state(false);
  let confirmWipe = $state(false);
  let exportText = $state('');
  let importText = $state('');
  let importError = $state('');

  function openSettings() {
    // Snapshot the current save into the textbox when the drawer opens, so it is there to
    // copy without a separate button press.
    exportText = exportCurrent();
    importText = '';
    importError = '';
    confirmWipe = false;
    showSettings = true;
  }

  function doImport() {
    if (!importText.trim()) return;
    if (!importFromString(importText.trim())) {
      importError = 'That is not a save. Nothing was changed.';
    }
    // On success the page reloads, so no further handling is needed.
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportText);
    } catch {
      // Clipboard can be blocked; the textarea is selectable as a fallback.
    }
  }
  let showDossier = $state(false);
  let confirmRedial = $state(false);

  type BulkMode = 1 | 10 | 'max';
  const BULK_MODES: BulkMode[] = [1, 10, 'max'];

  /**
   * `frame.n` is the single reactive dependency (see store.svelte.ts), and every value
   * below comes from a fresh SNAPSHOT rather than the live state object.
   *
   * Deriving the live object directly is what froze the whole UI once: `game.p` is
   * mutated in place, so it is the same reference every frame, Svelte sees no change,
   * and nothing re-evaluates. engine/snapshot.ts has the full account.
   */
  const snap = $derived.by(() => { void frame.n; return snapshot(game); });
  const p = $derived(snap.p);
  const d = $derived(snap.d);
  const t = $derived(snap.t);
  const logLines = $derived(snap.log);

  const cMax = $derived(maxComposure(p));
  const composurePct = $derived(p.composure / cMax);
  const rapportPct = $derived(p.rapport / RAPPORT.max);
  const progress = $derived.by(() => { void frame.n; return phase1Progress(p); });
  const complete = $derived.by(() => { void frame.n; return phase1Complete(p); });
  /** Overall access is the WORST of the three conditions, not an average — you are only as
   *  far along as your least-finished requirement, which is what makes the bar honest. */
  const gatePct = $derived(Math.min(progress.time, progress.trust, progress.slips));

  /**
   * Every upgrade with its status, so the road-not-taken stays on screen. Filtering
   * excluded ones out is what made Be Sympathetic silently vanish when a player bought Be
   * Difficult.
   */
  const upgradeRows = $derived.by(() => {
    void frame.n;
    const owned = new Set(p.upgrades);
    const opts = {
      lifetime: p.holdTimeCareer, rapport: p.rapport, activeTime: p.activeElapsed, owned,
    };
    return UPGRADES
      .map((u) => ({ u, status: statusOf(u, opts), closedBy: excludedBy(u, owned) }))
      .filter((r) => r.status === 'available' || r.status === 'excluded');
  });

  /** Where production actually comes from. The answer to "what did I do". */
  const breakdown = $derived.by(() => {
    void frame.n;
    const rows: Array<[string, number]> = [
      ['upgrades + milestones', d.globalMultiplier / d.dossierMultiplier],
      ['dossier (permanent)', d.dossierMultiplier],
      ['voice', d.persona.stallMultiplier],
      ['rhythm', p.combo],
    ];
    if (t.burstFor > 0) rows.push(['burst', t.burstMultiplier]);
    return rows.filter(([, v]) => v > 1.001);
  });

  const unlockedGens = $derived(GENERATORS.filter((g) => isUnlocked(p, g.id)));
  const dossier = $derived.by(() => { void frame.n; return availableDossier(game); });
  const redialReady = $derived.by(() => { void frame.n; return canRedial(game); });
  const breathReady = $derived.by(() => { void frame.n; return canTakeBreath(game); });
  const breathPrice = $derived.by(() => { void frame.n; return breathCost(game); });
  const personas = $derived.by(() => { void frame.n; return availablePersonas(game); });
  const ragePct = $derived(p.rage / RAGE.max);

  function onPersona(id: string) {
    switchPersona(game, id);
    interacted();
  }

  function onCatch() {
    catchEvent(game);
    interacted();
  }

  function onBreath() {
    takeBreath(game);
    interacted();
  }

  function onRedial() {
    redial(game);
    confirmRedial = false;
    // The dossier is where the Notes go, so open it rather than making the player
    // hunt for the reason the reset was worth it.
    showDossier = true;
    interacted();
  }

  /**
   * The diegetic audio unlock. Browsers block autoplay until a real gesture, so
   * rather than a "click to enable sound" modal we make the first gesture part of
   * the fiction: you pick up the handset.
   */
  function begin() {
    started = true;
    startGame();
  }

  function onStall(e: MouseEvent) {
    const gained = stall(game, Date.now());
    interacted();
    if (gained > 0) spawnPopup(e, `+${fmt(gained)}`);
  }

  // Popups are rendered outside Svelte's reactive graph on purpose: they are
  // ephemeral, there can be many per second, and none of them are game game.
  let popupLayer = $state<HTMLDivElement | null>(null);
  let logEl = $state<HTMLDivElement | null>(null);

  /**
   * Keep the transcript pinned to the newest line — but only if the player is already at the
   * bottom. Yanking someone away while they are reading back through what he said would be
   * worse than not scrolling at all.
   */
  $effect(() => {
    void logLines.length;
    const el = logEl;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom) queueMicrotask(() => { el.scrollTop = el.scrollHeight; });
  });
  function spawnPopup(e: MouseEvent, text: string) {
    if (!popupLayer) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    const rect = popupLayer.getBoundingClientRect();
    el.style.left = `${e.clientX - rect.left + (Math.random() * 24 - 12)}px`;
    el.style.top = `${e.clientY - rect.top - 8}px`;
    popupLayer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function buy(id: GeneratorId) {
    buyGenerator(game, id, bulk);
    interacted();
  }

  // Keyboard: space stalls. An incremental that requires a mouse excludes people
  // and also hurts after two hours.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) return;
      if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        stall(game, Date.now());
        interacted();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

</script>

{#if !started}
  <!-- Cold open. No tutorial, no menu, no logo animation. -->
  <main class="cold-open">
    <h1 class="phosphor">PLEASE HOLD</h1>
    <p>A number you do not recognise has called you four times this week.</p>
    <p>You have decided to answer it.</p>
    <p class="fine">
      You will be pretending to be someone who does not know what a browser is. This
      is the entire job.
    </p>
    <button class="btn-stall" onclick={begin}>Pick up the handset</button>
  </main>
{:else}
  <div class="console" style="--glitch: {p.heat > 0 ? 1 : 0}">
    <!-- ------------------------------------------------------------ header -->
    <header class="statusbar panel">
      <div class="stat">
        <span class="stat-label">Time Wasted</span>
        <span class="stat-value phosphor num">{fmtDuration(p.holdTime)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Rate</span>
        <span class="stat-value num">{fmtRate(d.hps)}/s</span>
      </div>
      <div class="stat">
        <span class="stat-label">Lifetime</span>
        <span class="stat-value num">{fmt(p.holdTimeLifetime)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">On The Line</span>
        <span class="stat-value num">{fmtDuration(p.elapsed)}</span>
      </div>
      <div class="stat grow access">
        <span class="stat-label">Access {fmtPct(gatePct)}</span>
        <div class="access-conditions">
          <span class="cond" class:met={progress.time >= 1} title="Career time wasted">
            time <span class="num">{fmtPct(progress.time)}</span>
          </span>
          <span class="cond" class:met={progress.trust >= 1} title="He has to believe you">
            trust <span class="num">{p.rapport.toFixed(0)}/{PHASE1_COMPLETION.rapport}</span>
          </span>
          <span class="cond" class:met={progress.slips >= 1} title="Things he has let slip">
            slips <span class="num">{p.roster.length}/{PHASE1_COMPLETION.rosterEntries}</span>
          </span>
        </div>
      </div>
      {#if p.redials > 0 || p.notes > 0}
        <div class="stat">
          <span class="stat-label">Notes</span>
          <span class="stat-value phosphor num">{fmt(p.notes)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Calls</span>
          <span class="stat-value num">{p.redials + 1}</span>
        </div>
      {/if}
      <button class="gear" onclick={openSettings} aria-label="Settings" title="Settings">
        ⚙
      </button>
    </header>

    <!-- Opportunity window. Penalty-free: missing it costs nothing at all. -->
    {#if t.event}
      <button class="event-bar" onclick={onCatch}>
        <span>{t.event.label}</span>
        <span class="event-meta num">
          ×{t.event.multiplier} · {t.event.expiresIn.toFixed(1)}s
        </span>
      </button>
    {/if}
    <!-- The line went dead. A notice, not a dead end: composure is restored and play
         continues immediately. -->
    {#if t.callEndedFor > 0}
      <div class="drop-bar">
        <span>The line goes dead. You redial. A different voice answers.</span>
        <span class="num">{t.callEndedFor.toFixed(0)}s</span>
      </div>
    {/if}
    {#if t.burstFor > 0}
      <div class="burst-bar">
        <span>Production ×{t.burstMultiplier}</span>
        <span class="num">{t.burstFor.toFixed(1)}s</span>
      </div>
    {/if}

    <div class="grid">
      <!-- ---------------------------------------------------------- left -->
      <section class="col">
        <div class="panel handset">
          <div class="panel-title">
            <span>Handset</span>
            <span class="dim">{t.idle ? 'muted' : 'live'}</span>
          </div>
          <div class="handset-body">
            <button
              class="btn-stall"
              onclick={onStall}
              aria-label="Stall. Waste the caller's time."
            >
              Stall
            </button>
            <div class="handset-meta">
              <span>+{fmt(d.stallValue)} per stall</span>
              {#if p.combo > 1.01}
                <span class="phosphor">×{p.combo.toFixed(2)} rhythm</span>
              {/if}
            </div>
            <p class="hint">Space bar also works.</p>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title"><span>Condition</span></div>
          <div class="pad">
            <div class="meter-row">
              <span class="meter-label">
                Composure
                <span class="dim">{d.band.label}</span>
              </span>
              <div class="meter">
                <div
                  class="meter-fill {composurePct < 0.15 ? 'danger' : composurePct < 0.4 ? 'warn' : ''}"
                  style="width: {composurePct * 100}%"
                ></div>
              </div>
              <span class="num dim">{p.composure.toFixed(0)}</span>
            </div>

            {#if d.band.stallMultiplier !== 1}
              <p class="tradeoff">
                Stalls ×{d.band.stallMultiplier.toFixed(2)} · rapport ×{d.band.rapportMultiplier.toFixed(2)}
              </p>
            {/if}

            <div class="meter-row">
              <span class="meter-label">
                His Temper
                <span class="dim">+{d.ragePerStall.toFixed(2)}/stall</span>
              </span>
              <div class="meter">
                <div
                  class="meter-fill rage {ragePct > 0.85 ? 'boiling' : ''}"
                  style="width: {ragePct * 100}%"
                ></div>
              </div>
              <span class="num dim">{p.rage.toFixed(0)}</span>
            </div>
            <p class="hint">
              At the top he loses it — and says something he shouldn't.
              {#if p.boilOvers > 0}<span class="phosphor"> {p.boilOvers} so far.</span>{/if}
            </p>

            <div class="meter-row">
              <span class="meter-label">Rapport</span>
              <div class="meter">
                <div class="meter-fill" style="width: {rapportPct * 100}%"></div>
              </div>
              <span class="num dim">{p.rapport.toFixed(0)}</span>
            </div>
            <p class="hint">Rapport cannot be bought. He has to believe you.</p>

            {#if t.criticalFor > 0}
              <p class="alarm">
                He is becoming suspicious. {(COMPOSURE.criticalGraceSeconds - t.criticalFor).toFixed(0)}s
              </p>
            {/if}

            <!--
              The active counter to composure drain. Without this the only way to recover
              was to stop playing, which made the drain a countdown rather than a
              decision.
            -->
            <button
              class="btn-wide btn-breath"
              onclick={onBreath}
              disabled={!breathReady}
            >
              {#if t.breathCooldown > 0}
                Catching your breath…
              {:else}
                Take a breath — {fmt(breathPrice)}
              {/if}
            </button>
            <p class="hint">
              Puts him on hold and restores {fmtPct(COMPOSURE.breath.restoreFraction)} composure.
            </p>
          </div>
        </div>

        <!-- ------------------------------------------------------ voice changer -->
        <div class="panel">
          <div class="panel-title">
            <span>Voice Changer</span>
            <span class="dim">−{PERSONA_SWITCH_COST} composure to switch</span>
          </div>
          <div class="scroll list persona-list">
            {#each personas as v (v.id)}
              <button
                class="row persona {p.persona === v.id ? 'active' : ''}"
                onclick={() => onPersona(v.id)}
                disabled={p.persona === v.id || p.composure <= PERSONA_SWITCH_COST}
              >
                <span class="row-main">
                  <span class="row-name">{v.name}</span>
                  <span class="row-flavor">{v.flavor}</span>
                  <span class="persona-stats">
                    stall ×{v.stallMultiplier} · temper ×{v.rageMultiplier} ·
                    rapport ×{v.rapportMultiplier} · strain ×{v.drainMultiplier}
                  </span>
                </span>
                {#if p.persona === v.id}<span class="row-side phosphor">live</span>{/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- ------------------------------------------------- redial / dossier -->
        <div class="panel">
          <div class="panel-title">
            <span>The Dossier</span>
            {#if p.notes > 0}<span class="phosphor num">{fmt(p.notes)} pages</span>{/if}
          </div>
          <div class="pad">
            {#if !redialReady}
              <p class="hint">
                Hang up and call back once you have wasted {fmt(REDIAL.minLifetimeToRedial)}
                seconds on a single call. You keep what you wrote down.
              </p>
            {:else if confirmRedial}
              <p class="warn-text">
                You lose this call: every tactic, every approach, the {fmt(p.holdTime)} seconds
                you are holding. You keep the dossier and {fmt(d.notesOnRedial)} new pages.
              </p>
              <div class="btn-row">
                <button class="btn-danger" onclick={onRedial}>Hang up</button>
                <button onclick={() => (confirmRedial = false)}>Stay on the line</button>
              </div>
            {:else}
              <button class="btn-wide" onclick={() => (confirmRedial = true)}>
                Hang up and call back — {fmt(d.notesOnRedial)} pages
              </button>
            {/if}

            {#if d.dossierMultiplier > 1}
              <p class="tradeoff">Permanent production ×{d.dossierMultiplier.toFixed(2)}</p>
            {/if}

            {#if p.dossier.length > 0 || p.notes > 0}
              <button class="link" onclick={() => (showDossier = !showDossier)}>
                {showDossier ? 'Close' : 'Open'} the file ({p.dossier.length}/{DOSSIER.length})
              </button>
            {/if}
          </div>

          {#if showDossier}
            <div class="scroll list dossier-list">
              {#each dossier as dd (dd.id)}
                <button
                  class="row"
                  onclick={() => { buyDossier(game, dd.id); interacted(); }}
                  disabled={dd.cost > p.notes}
                >
                  <span class="row-main">
                    <span class="row-name">{dd.name}</span>
                    <span class="row-effect">{dd.effect}</span>
                    <span class="row-flavor">{dd.flavor}</span>
                  </span>
                  <span class="row-side"><span class="cost num">{fmt(dd.cost)}p</span></span>
                </button>
              {:else}
                <p class="locked">The file is complete. There is nothing left to write down.</p>
              {/each}
            </div>
          {/if}
        </div>
      </section>

      <!-- -------------------------------------------------------- centre -->
      <section class="col">
        <div class="panel fill">
          <div class="panel-title">
            <span>Tactics</span>
            <span class="bulk">
              {#each BULK_MODES as b (b)}
                <button class:active={bulk === b} onclick={() => (bulk = b)}>
                  {b === 'max' ? 'max' : `×${b}`}
                </button>
              {/each}
            </span>
          </div>
          <div class="scroll list">
            {#each unlockedGens as g (g.id)}
              {@const owned = p.generators[g.id] ?? 0}
              {@const cost = d.nextCost[g.id]}
              {@const out = d.perGenerator[g.id]}
              <button class="row" onclick={() => buy(g.id)} disabled={cost > p.holdTime}>
                <span class="row-main">
                  <span class="row-name">{g.name}</span>
                  <span class="row-effect">{g.effect}</span>
                </span>
                <span class="row-side">
                  <span class="row-owned num">{owned}</span>
                  <span class="cost num">{fmt(cost)}</span>
                  {#if out > 0}<span class="row-out num dim">{fmtRate(out)}/s</span>{/if}
                </span>
              </button>
            {/each}
            {#if unlockedGens.length < GENERATORS.length}
              <p class="locked">
                Something else will occur to you.
              </p>
            {/if}
          </div>
        </div>
      </section>

      <!-- --------------------------------------------------------- right -->
      <section class="col">
        <div class="panel">
          <div class="panel-title"><span>Approach</span></div>
          <div class="scroll list upgrades">
            {#each upgradeRows as row (row.u.id)}
              {#if row.status === 'excluded'}
                <!-- The road not taken. Kept on screen deliberately: this used to vanish
                     the instant you bought its sibling, so a player never learned a choice
                     had been made, only that something disappeared. -->
                <div class="row closed">
                  <span class="row-main">
                    <span class="row-name">{row.u.name}</span>
                    <span class="row-effect">{row.u.effect}</span>
                    <span class="row-closed">
                      not taken — you chose {row.closedBy?.name ?? 'the other approach'}
                    </span>
                  </span>
                </div>
              {:else}
                <button
                  class="row"
                  onclick={() => { buyUpgrade(game, row.u.id); interacted(); }}
                  disabled={row.u.cost > p.holdTime}
                >
                  <span class="row-main">
                    <span class="row-name">
                      {row.u.name}
                      {#if row.u.excludes?.length}
                        <span class="fork" title="Taking this closes off the alternative">
                          — a choice
                        </span>
                      {/if}
                    </span>
                    <span class="row-effect">{row.u.effect}</span>
                    <span class="row-flavor">{row.u.flavor}</span>
                  </span>
                  <span class="row-side"><span class="cost num">{fmt(row.u.cost)}</span></span>
                </button>
              {/if}
            {:else}
              <p class="locked">Nothing has occurred to you yet.</p>
            {/each}
          </div>
        </div>

        {#if breakdown.length > 0}
          <div class="panel">
            <div class="panel-title">
              <span>Why It Is {fmtRate(d.hps)}/s</span>
            </div>
            <div class="pad breakdown">
              {#each breakdown as [label, value] (label)}
                <div class="breakdown-row">
                  <span>{label}</span>
                  <span class="num phosphor">×{value < 10 ? value.toFixed(2) : fmt(value)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="panel fill">
          <div class="panel-title"><span>Transcript</span></div>
          <div class="scroll log" bind:this={logEl}>
            {#each logLines as line (line.id)}
              <p class="log-line {line.kind}">
                {line.text}{#if line.repeat}<span class="dim"> ×{line.repeat}</span>{/if}
              </p>
            {/each}
          </div>
        </div>
      </section>
    </div>

    <div class="popup-layer" bind:this={popupLayer}></div>

    {#if complete}
      <div class="modal-scrim"></div>
      <div class="ending panel" role="dialog" aria-label="Phase complete">
        <div class="panel-title"><span>Two Hundred And Six Extensions</span></div>
        <div class="pad ending-body">
          <p>You have the switchboard.</p>
          <p>
            Every extension in the building rings somewhere, and you can now reach all of
            them without asking anyone. He does not know this. He is still on the line,
            explaining something about a refund.
          </p>
          <p class="ending-stat">
            {fmtDuration(p.holdTimeCareer)} of their working time, across
            {p.redials + 1} calls. {p.roster.length} things written down. He trusts you
            completely, which is the part you will think about later.
          </p>
          <p class="hint">
            Phase 2 — THE MAP — is not built yet. This is where it begins: the roster you
            have, filled in.
          </p>
          <button class="btn-stall" onclick={() => (showSettings = false)}>
            [ Stay on the line ]
          </button>
        </div>
      </div>
    {/if}

    {#if showSettings}
      <div
        class="modal-scrim"
        onclick={() => (showSettings = false)}
        onkeydown={(e) => { if (e.key === 'Escape') showSettings = false; }}
        role="button"
        tabindex="-1"
        aria-label="Close settings"
      ></div>
      <div class="settings panel" role="dialog" aria-label="Settings">
        <div class="panel-title">
          <span>Settings</span>
          <button class="link" onclick={() => (showSettings = false)}>close</button>
        </div>
        <div class="pad settings-body">
          <section>
            <h3>Your save</h3>
            <p class="hint">
              This game saves in your browser and nowhere else. Copy this string to keep a
              backup or move it to another machine.
            </p>
            <textarea class="save-box" readonly rows="3" value={exportText}></textarea>
            <button onclick={copyExport}>Copy save</button>
          </section>

          <section>
            <h3>Load a save</h3>
            <p class="hint">Paste a save string and load it. This replaces your current game.</p>
            <textarea
              class="save-box"
              rows="3"
              placeholder="Paste a save string…"
              bind:value={importText}
            ></textarea>
            {#if importError}<p class="alarm">{importError}</p>{/if}
            <button onclick={doImport} disabled={!importText.trim()}>Load save</button>
          </section>

          <section>
            <h3>Start over</h3>
            <p class="hint">
              Deletes everything — the current call, every dossier page, every call you have
              made. There is no undo.
            </p>
            {#if confirmWipe}
              <p class="warn-text">This erases the entire dossier and cannot be undone.</p>
              <div class="btn-row">
                <button class="btn-danger" onclick={hardReset}>Erase everything</button>
                <button onclick={() => (confirmWipe = false)}>Keep my save</button>
              </div>
            {:else}
              <button class="btn-danger" onclick={() => (confirmWipe = true)}>
                Delete save and start fresh
              </button>
            {/if}
          </section>
        </div>
      </div>
    {/if}
  </div>

  <div class="crt-scanlines" aria-hidden="true"></div>
  <div class="crt-vignette" aria-hidden="true"></div>
{/if}

<style>
  .cold-open {
    max-width: 44ch;
    margin: 0 auto;
    padding: 18vh 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .cold-open h1 {
    font-size: 2rem;
    letter-spacing: 0.3em;
    margin: 0;
    font-weight: 500;
  }
  .cold-open p {
    margin: 0;
    color: var(--amber-text);
  }
  .cold-open .fine {
    color: var(--amber-deep);
    font-size: 12px;
  }

  .console {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--pad);
    gap: var(--pad);
    position: relative;
  }

  .statusbar {
    display: flex;
    gap: 1.5rem;
    padding: 0.55rem var(--pad);
    align-items: center;
    flex-wrap: wrap;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .stat.grow {
    flex: 1;
    min-width: 140px;
  }
  .stat-label {
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--amber-deep);
  }
  .stat-value {
    font-size: 15px;
  }

  .grid {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(240px, 1fr) minmax(300px, 1.4fr) minmax(280px, 1.2fr);
    gap: var(--pad);
    min-height: 0;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--pad);
    min-height: 0;
    /* The column scrolls, so no combination of open panes can be cut off. */
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
  }
  .col::-webkit-scrollbar { width: 8px; }
  .col::-webkit-scrollbar-thumb { background: var(--line); }
  .panel.fill {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .pad {
    padding: var(--pad);
  }
  .handset-body {
    padding: var(--pad);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .handset-meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--amber-dim);
  }
  .hint,
  .locked {
    font-size: 11px;
    color: var(--amber-deep);
    margin: 0;
  }
  .locked {
    padding: var(--pad);
  }

  .meter-row {
    display: grid;
    grid-template-columns: 1fr 1.1fr auto;
    gap: 0.6rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  .meter-label {
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }
  .tradeoff {
    font-size: 11px;
    color: var(--amber-dim);
    margin: -0.25rem 0 0.6rem;
  }
  .alarm {
    color: var(--red);
    font-size: 12px;
    margin: 0.4rem 0 0;
  }

  .list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  /* Panes size to their content; the column scrolls. Fixed viewport fractions were what
     cut the dossier off at the bottom. */
  .upgrades,
  .persona-list,
  .dossier-list {
    max-height: none;
  }
  .dossier-list {
    border-top: 1px solid var(--line);
  }


  .row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    text-align: left;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    padding: 0.6rem var(--pad);
    align-items: flex-start;
  }
  .row:hover:not(:disabled) {
    background: var(--panel-raised);
  }
  .row-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .row-name {
    color: var(--amber);
  }
  .row-effect {
    font-size: 11px;
    color: var(--amber-dim);
  }
  .row-flavor {
    font-size: 11px;
    color: var(--amber-deep);
    font-style: italic;
  }
  .row-side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    white-space: nowrap;
  }
  .row-owned {
    font-size: 15px;
    color: var(--amber);
  }
  .cost {
    font-size: 12px;
    color: var(--amber-dim);
  }
  .row-out {
    font-size: 10px;
  }

  .bulk {
    display: flex;
    gap: 2px;
  }
  .bulk button {
    padding: 1px 6px;
    font-size: 10px;
  }
  .bulk button.active {
    border-color: var(--amber);
    color: var(--amber);
  }

  .log {
    padding: var(--pad);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 1;
  }
  .log-line {
    margin: 0;
    font-size: 12px;
    color: var(--amber-dim);
  }
  .log-line.beat {
    color: var(--amber);
  }
  .log-line.threat {
    color: var(--red);
  }
  .log-line.system {
    color: var(--amber-deep);
  }

  .dim {
    color: var(--amber-deep);
  }

  /* --------------------------------------------------- opportunity windows */

  /**
   * The event bar. Deliberately loud relative to everything else on the screen,
   * because it is the one element with a deadline — and deliberately never a modal,
   * because missing it must cost nothing and interrupting play to say "you missed
   * something" would be a punishment.
   */
  .event-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.7rem var(--pad);
    background: var(--amber-deep);
    border: 1px solid var(--amber);
    color: var(--amber-text);
    letter-spacing: 0.04em;
    animation: event-pulse 1s ease-in-out infinite;
  }
  .event-meta {
    color: var(--amber);
  }
  @keyframes event-pulse {
    0%, 100% { background: var(--amber-deep); }
    50% { background: #8f6220; }
  }
  @media (prefers-reduced-motion: reduce) {
    .event-bar { animation: none; }
  }

  .meter-fill.rage {
    background: var(--red-dim);
  }
  .meter-fill.rage.boiling {
    background: var(--red);
  }


  .row.persona.active {
    background: #17140d;
    border-left: 2px solid var(--amber);
  }
  .persona-stats {
    font-size: 10px;
    color: var(--amber-deep);
    font-variant-numeric: tabular-nums;
  }

  .gear {
    padding: 0.2rem 0.5rem;
    font-size: 15px;
    line-height: 1;
    border-color: transparent;
    color: var(--amber-deep);
  }
  .gear:hover {
    color: var(--amber);
    border-color: var(--line);
  }

  .modal-scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 100;
  }
  .settings {
    position: fixed;
    z-index: 101;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, 460px);
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    background: var(--panel);
  }
  .settings-body {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }
  .settings-body section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .settings-body h3 {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--amber);
  }
  .save-box {
    width: 100%;
    resize: vertical;
    background: #000;
    color: var(--amber-text);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 11px;
    padding: 0.5rem;
    word-break: break-all;
  }
  .settings-body button {
    align-self: flex-start;
  }

  .access-conditions {
    display: flex;
    gap: 0.75rem;
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--amber-deep);
  }
  .cond {
    display: flex;
    gap: 0.25rem;
    align-items: baseline;
    border-bottom: 1px solid var(--line-hot);
    padding-bottom: 1px;
  }
  .cond.met {
    color: var(--green);
    border-bottom-color: var(--green);
  }

  .row.closed {
    opacity: 0.45;
    cursor: default;
  }
  .row.closed .row-name,
  .row.closed .row-effect {
    text-decoration: line-through;
  }
  .row-closed {
    font-size: 10px;
    color: var(--red-dim);
    font-style: italic;
  }
  .fork {
    font-size: 10px;
    color: var(--amber-deep);
    font-style: italic;
  }

  .breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 11px;
  }
  .breakdown-row {
    display: flex;
    justify-content: space-between;
    color: var(--amber-dim);
  }

  .ending {
    position: fixed;
    z-index: 101;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, 520px);
    max-height: 86vh;
  }
  .ending-body {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    overflow-y: auto;
  }
  .ending-body p {
    margin: 0;
  }
  .ending-stat {
    color: var(--amber);
    border-left: 2px solid var(--amber-deep);
    padding-left: 0.7rem;
  }

  .drop-bar {
    display: flex;
    justify-content: space-between;
    padding: 0.55rem var(--pad);
    border: 1px solid var(--red-dim);
    background: #1a0f0d;
    color: var(--red);
    font-size: 12px;
  }

  .btn-breath {
    margin-top: 0.6rem;
  }

  .burst-bar {
    display: flex;
    justify-content: space-between;
    padding: 0.4rem var(--pad);
    border: 1px solid var(--green);
    color: var(--green);
    font-size: 12px;
  }

  /* ---------------------------------------------------------- redial panel */

  .btn-wide {
    width: 100%;
    text-align: center;
  }
  .btn-danger {
    border-color: var(--red-dim);
    color: var(--red);
  }
  .btn-danger:hover:not(:disabled) {
    background: #2a1512;
    border-color: var(--red);
  }
  .btn-row {
    display: flex;
    gap: 0.4rem;
  }
  .btn-row button {
    flex: 1;
  }
  .warn-text {
    font-size: 11px;
    color: var(--amber-text);
    margin: 0 0 0.6rem;
  }
  .link {
    background: none;
    border: none;
    padding: 0.4rem 0 0;
    font-size: 11px;
    color: var(--amber-dim);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .link:hover {
    color: var(--amber);
    background: none;
  }


  .popup-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
      overflow-y: auto;
    }
  }
</style>
