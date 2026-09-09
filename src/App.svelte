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
  import { frame, game, startGame, interacted } from './store.svelte';
  import { fmt, fmtRate, fmtDuration, fmtPct } from './engine/numbers';
  import { stall, buyGenerator, buyUpgrade, availableUpgrades } from './engine/sim';
  import { GENERATORS, PHASE1_GATE, COMPOSURE, RAPPORT } from './data/balance';
  import { isUnlocked } from './engine/derive';
  import type { GeneratorId } from './engine/types';

  let started = $state(false);
  let bulk = $state<BulkMode>(1);

  type BulkMode = 1 | 10 | 'max';
  const BULK_MODES: BulkMode[] = [1, 10, 'max'];

  /**
   * `frame.n` is the single reactive dependency (see store.svelte.ts). Touching it
   * inside each $derived.by is what schedules that value to recompute once per
   * animation frame, while the values themselves are read from the plain,
   * non-reactive game object.
   */
  const p = $derived.by(() => { void frame.n; return game.p; });
  const d = $derived.by(() => { void frame.n; return game.d; });
  const t = $derived.by(() => { void frame.n; return game.t; });

  const composurePct = $derived(p.composure / COMPOSURE.max);
  const rapportPct = $derived(p.rapport / RAPPORT.max);
  const gatePct = $derived(Math.min(1, p.holdTimeLifetime / PHASE1_GATE));

  const unlockedGens = $derived(GENERATORS.filter((g) => isUnlocked(p, g.id)));
  const upgrades = $derived.by(() => { void frame.n; return availableUpgrades(game); });
  const logLines = $derived(t.log);

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

  const logEl = $derived(logLines);
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
      <div class="stat grow">
        <span class="stat-label">
          Access {fmtPct(gatePct)}
        </span>
        <div class="meter"><div class="meter-fill" style="width: {gatePct * 100}%"></div></div>
      </div>
    </header>

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
              disabled={t.callEnded}
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
          </div>
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
            {#each upgrades as u (u.id)}
              <button
                class="row"
                onclick={() => { buyUpgrade(game, u.id); interacted(); }}
                disabled={u.cost > p.holdTime}
              >
                <span class="row-main">
                  <span class="row-name">{u.name}</span>
                  <span class="row-effect">{u.effect}</span>
                  <span class="row-flavor">{u.flavor}</span>
                </span>
                <span class="row-side"><span class="cost num">{fmt(u.cost)}</span></span>
              </button>
            {:else}
              <p class="locked">Nothing has occurred to you yet.</p>
            {/each}
          </div>
        </div>

        <div class="panel fill">
          <div class="panel-title"><span>Transcript</span></div>
          <div class="scroll log">
            {#each logEl as line (line.id)}
              <p class="log-line {line.kind}">
                {line.text}{#if line.repeat}<span class="dim"> ×{line.repeat}</span>{/if}
              </p>
            {/each}
          </div>
        </div>
      </section>
    </div>

    <div class="popup-layer" bind:this={popupLayer}></div>
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
  }
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
  .upgrades {
    max-height: 42vh;
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
