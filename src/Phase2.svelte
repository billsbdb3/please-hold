<script lang="ts">
  /**
   * PHASE 2 — THE MAP.
   *
   * A different console, not more panels on the old one. Phase 1's handset, composure meter
   * and voice changer are gone entirely, because its verb is gone: this is the
   * mechanic-replacement the design is built on (docs/DESIGN.md §3), and letting the old UI
   * linger would undercut it.
   *
   * The layout is the surveillance language from §8: a wall of monitors as the centrepiece,
   * with the allocation controls beside it. The thing you are doing — pointing finite
   * attention at too many things — is the thing the screen is mostly made of.
   */
  import { frame, game, interacted } from './store.svelte';
  import { snapshot } from './engine/snapshot';
  import { fmt, fmtRate, fmtPct, fmtDuration } from './engine/numbers';
  import {
    assignAttention, clearAttention, unlockStream, buyAttention,
    buyTradecraft, availableTradecraft, corroborateNext, deriveP2,
  } from './engine/phase2';
  import {
    STREAMS, HEAT, COVERAGE, INTEL_KINDS, INTEL_KIND_LABEL, TRADECRAFT,
  } from './data/phase2';
  import type { StreamId } from './engine/types';
  import CctvGrid from './cctv/CctvGrid.svelte';

  /**
   * Opens the shared settings drawer, which lives in App. Phase 2 needs its own way in:
   * the gear was in Phase 1's status bar, so crossing into Phase 2 would otherwise strip
   * the player of save export, import and reset entirely.
   */
  const { onSettings }: { onSettings: () => void } = $props();

  // Through snapshot(), never `game.p` directly — see the comment at the top of
  // src/engine/snapshot.ts. Handing Svelte the same mutated object reference each frame
  // freezes every bound value, which is exactly how this component shipped: a live camera
  // wall beside an attention counter stuck on 0/3 and a rate stuck on 0/s.
  const snap = $derived.by(() => { void frame.n; return snapshot(game); });
  const p = $derived(snap.p);
  const t = $derived(snap.t);
  const d = $derived.by(() => { void frame.n; return snap.t.p2 ?? deriveP2(snap.p, snap.t.burnedUntil); });

  const heatPct = $derived(p.heat / HEAT.max);
  const tradecraft = $derived.by(() => { void frame.n; return availableTradecraft(game); });
  const lockedStreams = $derived(STREAMS.filter((s) => !p.streams.includes(s.id)));
  const openStreams = $derived(STREAMS.filter((s) => p.streams.includes(s.id)));
  const uncorroborated = $derived(p.roster.filter((r) => !p.corroborated.includes(r.id)));

  /** Cameras the player is actually watching, so the wall reflects the allocation. */
  const cctvLive = $derived(
    p.streams.includes('cctv') && (p.attention.cctv ?? 0) > 0 && !(t.burnedUntil.cctv ?? 0),
  );

  function attend(id: StreamId, delta: number) {
    assignAttention(game, id, delta);
    interacted();
  }
</script>

<!-- The picture destabilises as they get suspicious. Same effect phase 1 uses for his temper,
     driven here by the thing that threatens YOU. -->
<div class="p2" class:glitching={heatPct > 0.55} style="--glitch: {heatPct.toFixed(2)}">
  <!-- ------------------------------------------------------------------ header -->
  <header class="statusbar panel">
    <div class="stat">
      <span class="stat-label">Intel</span>
      <span class="stat-value phosphor num">{fmt(p.intel)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Rate</span>
      <span class="stat-value num">{fmtRate(d.totalRate)}/s</span>
    </div>
    <div class="stat">
      <span class="stat-label">Attention</span>
      <span class="stat-value num" class:over={d.assigned > d.pool}>
        {d.assigned}/{d.pool}
      </span>
    </div>
    <div class="stat">
      <span class="stat-label">Inside</span>
      <span class="stat-value num">{fmtDuration(p.phase2Elapsed)}</span>
    </div>

    <div class="stat grow">
      <span class="stat-label">
        Coverage {fmtPct(d.progress)}
        {#if p.burns > 0}<span class="dim">· {p.burns} burns</span>{/if}
      </span>
      <div class="meter">
        <div class="meter-fill" style="width: {d.progress * 100}%"></div>
      </div>
    </div>

    <button class="gear" onclick={onSettings} aria-label="Settings" title="Settings">⚙</button>

    <div class="stat heat-stat">
      <span class="stat-label">
        Suspicion
        {#if d.heatRate > 0}<span class="rising">rising</span>
        {:else}<span class="dim">cooling</span>{/if}
      </span>
      <div class="meter">
        <div
          class="meter-fill {heatPct > 0.85 ? 'danger' : heatPct > HEAT.warnAt / 100 ? 'warn' : ''}"
          style="width: {heatPct * 100}%"
        ></div>
      </div>
      <span class="heat-note num">
        {p.heat.toFixed(0)} · intel ×{d.heatYieldMultiplier.toFixed(2)}
      </span>
    </div>
  </header>

  {#if d.burned.length > 0}
    <div class="drop-bar">
      <span>
        Dark: {d.burned.map((id) => STREAMS.find((s) => s.id === id)?.name).join(', ')}.
        Somebody changed a password, unhelpfully well.
      </span>
    </div>
  {/if}

  <div class="p2-grid">
    <!-- ------------------------------------------------------- streams / attention -->
    <section class="col">
      <div class="panel">
        <div class="panel-title">
          <span>Attention</span>
          <button class="link" onclick={() => { clearAttention(game); interacted(); }}>
            look away
          </button>
        </div>
        <div class="pad hint-block">
          <p class="hint">
            You cannot watch everything. Suspicion rises with what you watch, not with time —
            and a suspicious floor is a careful floor, so intel is worth less while they are
            nervous.
          </p>
        </div>
        <div class="list">
          {#each openStreams as s (s.id)}
            {@const a = p.attention[s.id] ?? 0}
            {@const dark = (t.burnedUntil[s.id] ?? 0) > 0}
            <div class="stream" class:dark>
              <div class="stream-head">
                <span class="row-name">{s.name}</span>
                <span class="stream-alloc">
                  <button onclick={() => attend(s.id, -1)} disabled={a <= 0} aria-label="less">−</button>
                  <span class="num alloc">{a}<span class="dim">/{s.maxAttention}</span></span>
                  <button
                    onclick={() => attend(s.id, 1)}
                    disabled={dark || a >= s.maxAttention || d.assigned >= d.pool}
                    aria-label="more"
                  >+</button>
                </span>
              </div>
              <span class="row-flavor">{s.flavor}</span>
              <span class="stream-stats">
                {#each INTEL_KINDS as k (k)}
                  {#if s.yields[k]}
                    <span class="yield">{INTEL_KIND_LABEL[k].toLowerCase()} {s.yields[k]}</span>
                  {/if}
                {/each}
                <span class="heat-cost">suspicion {s.heatPerAttention.toFixed(2)}/pt</span>
                {#if dark}
                  <span class="dark-note">dark {Math.ceil(t.burnedUntil[s.id] ?? 0)}s</span>
                {/if}
              </span>
            </div>
          {/each}

          {#each lockedStreams as s (s.id)}
            <button
              class="row locked-stream"
              onclick={() => { unlockStream(game, s.id); interacted(); }}
              disabled={p.intel < s.unlockCost}
            >
              <span class="row-main">
                <span class="row-name">{s.name}</span>
                <span class="row-effect">
                  {INTEL_KINDS.filter((k) => s.yields[k]).map((k) => INTEL_KIND_LABEL[k]).join(' · ')}
                </span>
              </span>
              <span class="row-side"><span class="cost num">{fmt(s.unlockCost)}</span></span>
            </button>
          {/each}
        </div>
        {#if d.nextAttentionCost !== null}
          <div class="pad">
            <button
              class="btn-wide"
              onclick={() => { buyAttention(game); interacted(); }}
              disabled={p.intel < d.nextAttentionCost}
            >
              One more thing at once — {fmt(d.nextAttentionCost)}
            </button>
          </div>
        {/if}
      </div>
    </section>

    <!-- ------------------------------------------------------------ the wall -->
    <section class="col wall-col">
      <div class="panel fill">
        <div class="panel-title">
          <span>The Camera Bank</span>
          <span class="dim">
            {#if !p.streams.includes('cctv')}no feed
            {:else if (t.burnedUntil.cctv ?? 0) > 0}dark
            {:else if !cctvLive}not being watched
            {:else}live{/if}
          </span>
        </div>
        <div class="wall-body" class:unwatched={!cctvLive}>
          <CctvGrid sizing="fit" />
        </div>
      </div>
    </section>

    <!-- --------------------------------------------------- coverage / roster -->
    <section class="col">
      <div class="panel">
        <div class="panel-title"><span>What You Have</span></div>
        <div class="pad">
          {#each INTEL_KINDS as k (k)}
            <div class="meter-row">
              <span class="meter-label">
                {INTEL_KIND_LABEL[k]}
                <span class="dim num">{fmt(p.intelByKind[k])}/{fmt(COVERAGE.need[k])}</span>
              </span>
              <div class="meter">
                <div
                  class="meter-fill"
                  class:done={d.coverage[k] >= 1}
                  style="width: {d.coverage[k] * 100}%"
                ></div>
              </div>
            </div>
          {/each}
          <p class="hint">
            Coverage is the worst of these, not the total. One good stream will not finish it.
          </p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">
          <span>What He Let Slip</span>
          <span class="num dim">{p.corroborated.length}/{COVERAGE.corroborated}</span>
        </div>
        <div class="pad">
          <p class="hint">
            Everything here is something he told you while he was angry. None of it is evidence
            yet — it is only his word. Corroborating one means finding the thing he described
            on a screen you control.
          </p>
          {#if uncorroborated.length > 0}
            <button
              class="btn-wide"
              onclick={() => { corroborateNext(game); interacted(); }}
              disabled={p.intel < d.corroborateCost}
            >
              Corroborate the next one — {fmt(d.corroborateCost)}
            </button>
            <p class="next-slip">{uncorroborated[0].handle}</p>
          {:else}
            <p class="hint">
              Everything he said has been checked against something you can see. He would have
              to lose his temper again, and he is no longer on the line.
            </p>
          {/if}
        </div>
        <div class="scroll list roster-list">
          {#each p.roster as r (r.id)}
            <div class="roster-row" class:named={p.corroborated.includes(r.id)}>
              <span class="roster-handle">{r.handle}</span>
              <span class="roster-role dim">{r.role}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="panel">
        <div class="panel-title"><span>Tradecraft</span></div>
        <div class="scroll list">
          {#each tradecraft as tc (tc.id)}
            <button
              class="row"
              onclick={() => { buyTradecraft(game, tc.id); interacted(); }}
              disabled={p.intel < tc.cost}
            >
              <span class="row-main">
                <span class="row-name">{tc.name}</span>
                <span class="row-effect">{tc.effect}</span>
                <span class="row-flavor">{tc.flavor}</span>
              </span>
              <span class="row-side"><span class="cost num">{fmt(tc.cost)}</span></span>
            </button>
          {:else}
            <p class="locked">
              {p.tradecraft.length === TRADECRAFT.length
                ? 'You have learned everything this operation can teach you.'
                : 'Nothing new suggests itself yet.'}
            </p>
          {/each}
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  .p2 {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--pad);
    gap: var(--pad);
    min-height: 0;
  }

  .statusbar {
    display: flex;
    gap: 1.5rem;
    padding: 0.55rem var(--pad);
    align-items: center;
    flex-wrap: wrap;
    flex: 0 0 auto;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .stat.grow {
    flex: 0 1 240px;
    min-width: 160px;
    margin-left: auto;
  }
  .heat-stat { flex: 0 1 220px; min-width: 190px; }
  .stat-label {
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--amber-deep);
  }
  .stat-value { font-size: 15px; }
  .stat-value.over { color: var(--red); }
  .rising { color: var(--red); }
  .heat-note { font-size: 10px; color: var(--amber-deep); }

  /* Three columns, with the wall taking the space it deserves as the centrepiece. */
  .p2-grid {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(360px, 1.7fr) minmax(300px, 1.1fr);
    gap: var(--pad);
    min-height: 0;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--pad);
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
  }
  .col::-webkit-scrollbar { width: 8px; }
  .col::-webkit-scrollbar-thumb { background: var(--line); }
  /* The wall must not scroll internally — it sizes itself to the box it is given. */
  .wall-col { overflow: hidden; }

  .wall-body {
    flex: 1 1 auto;
    min-height: 0;
    transition: opacity var(--t-med), filter var(--t-med);
  }
  /* Not being watched: the feed is there, you simply are not looking at it. */
  .wall-body.unwatched {
    opacity: 0.35;
    filter: grayscale(1);
  }

  .hint-block { border-bottom: 1px solid var(--line); }

  .gear {
    padding: 0.2rem 0.5rem;
    font-size: 15px;
    line-height: 1;
    border-color: transparent;
    color: var(--amber-deep);
    order: 99;
  }
  .gear:hover { color: var(--amber); border-color: var(--line); }

  .stream {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0.6rem var(--pad);
    border-bottom: 1px solid var(--line);
  }
  .stream.dark { opacity: 0.4; }
  .stream-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .stream-alloc {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .stream-alloc button {
    padding: 0 7px;
    font-size: 14px;
    line-height: 1.4;
  }
  .alloc { font-size: 14px; color: var(--amber); }

  .stream-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    font-size: 10px;
    color: var(--amber-deep);
    font-variant-numeric: tabular-nums;
  }
  .yield { color: var(--amber-dim); }
  .heat-cost { color: var(--red-dim); }
  .dark-note { color: var(--red); }

  .locked-stream { opacity: 0.75; }

  .meter-row {
    display: grid;
    grid-template-columns: 1fr 1.1fr;
    gap: 0.6rem;
    align-items: center;
    margin-bottom: 0.45rem;
  }
  .meter-label {
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }
  .meter-fill.done { background: var(--green); }

  .roster-list { max-height: none; }
  .roster-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem var(--pad);
    border-bottom: 1px solid var(--line);
    font-size: 11px;
    color: var(--amber-deep);
  }
  .roster-row.named {
    color: var(--amber-text);
  }
  .roster-row.named .roster-handle::before {
    content: '✓ ';
    color: var(--green);
  }
  /* The slip about to be checked, quoted rather than jammed into the button label - these
     run to a dozen words and read as nonsense inside a verb. */
  .next-slip {
    margin: 0.4rem 0 0;
    font-size: 11px;
    color: var(--amber-dim);
    font-style: italic;
  }
  .roster-role { text-transform: uppercase; font-size: 9px; letter-spacing: 0.1em; }

  @media (max-width: 1100px) {
    .p2-grid { grid-template-columns: 1fr; overflow-y: auto; }
    .wall-col { overflow: visible; min-height: 60vh; }
  }
</style>
