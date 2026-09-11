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
  import { fmt, fmtPct } from './engine/numbers';
  import {
    assignAttention, clearAttention, unlockStream, buyAttention,
    buyTradecraft, availableTradecraft, corroborateNext, deriveP2, claimCameraEvent, freshnessOf,
    lookCloser, claimEvent,
  } from './engine/phase2';
  import {
    STREAMS, HEAT, COVERAGE, INTEL_KINDS, INTEL_KIND_LABEL, TRADECRAFT,
  } from './data/phase2';
  import { FATIGUE } from './data/phase2events';
  import type { StreamId } from './engine/types';
  import CctvGrid from './cctv/CctvGrid.svelte';
  import { audio } from './audio';
  import SessionBar from './phase2/SessionBar.svelte';
  import LogTail from './phase2/LogTail.svelte';
  import { STREAM_EVENT_VOICE } from './data/streamEvents';
  import { eventsFor } from './engine/phase2';

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
  const log = $derived(snap.log);
  const d = $derived.by(() => { void frame.n; return snap.t.p2 ?? deriveP2(snap.p, snap.t.burnedUntil); });

  const heatPct = $derived(p.heat / HEAT.max);
  const tradecraft = $derived.by(() => { void frame.n; return availableTradecraft(game); });
  const lockedStreams = $derived(STREAMS.filter((s) => !p.streams.includes(s.id)));
  const openStreams = $derived(STREAMS.filter((s) => p.streams.includes(s.id)));
  const uncorroborated = $derived(p.roster.filter((r) => !p.corroborated.includes(r.id)));

  /**
   * Which intel kind is holding coverage back, and which streams actually produce it.
   *
   * The readout already said 'HELD BY MONEY'. It did not say that money comes from the dialler
   * console and the spreadsheet, so a playtester sat 38 minutes in at 5% coverage with his whole
   * pool on three streams that produce no money at all, correctly reading a message he could not
   * act on. A gate should name what it wants AND where to get it.
   */
  const bindingKind = $derived.by(() => {
    void frame.n;
    return INTEL_KINDS.find((k) => INTEL_KIND_LABEL[k].toLowerCase() === d.bindingLabel) ?? null;
  });
  const feedsBinding = $derived.by(() => {
    void frame.n;
    const k = bindingKind;
    if (!k) return new Set<string>();
    return new Set(STREAMS.filter((st) => st.yields[k]).map((st) => st.id));
  });

  /** Cameras the player is actually watching, so the wall reflects the allocation. */
  const cctvLive = $derived(
    p.streams.includes('cctv') && (p.attention.cctv ?? 0) > 0 && !(t.burnedUntil.cctv ?? 0),
  );

  /**
   * Everything currently live, oldest first.
   *
   * Several at once, on different streams: a single global slot is why a six-stream console felt
   * empty. Each row carries its own stream's verb, because you HEAR a recording and you READ a
   * chat, and 'SEE THIS' on a spreadsheet is simply wrong.
   */
  const liveList = $derived.by(() => {
    void frame.n;
    return t.liveEvents.map((e) => ({
      ev: e,
      line: eventsFor(e.stream)[e.index]?.line ?? '',
      voice: STREAM_EVENT_VOICE[e.stream],
      name: STREAMS.find((st) => st.id === e.stream)?.name ?? '',
    }));
  });
  const wallEvent = $derived(t.liveEvents.find((e) => e.stream === 'cctv') ?? null);

  /**
   * Freshness in words, not a bare percentage.
   *
   * Fatigue is invisible unless it is stated: a player watching the same stream would otherwise
   * just see the numbers quietly getting worse and reasonably conclude something was broken.
   */
  function freshLabel(fresh: number): string {
    if (fresh >= 0.99) return 'fresh';
    if (fresh <= FATIGUE.floor + 0.01) return 'nothing new here';
    return `${Math.round(fresh * 100)}% new`;
  }

  function notice(stream: StreamId | null = null) {
    const ok = stream !== null ? claimEvent(game, stream) : claimCameraEvent(game);
    if (ok) {
      audio.noteConfirm();
      interacted();
    }
  }

  /**
   * The room, and the three things it reacts to.
   *
   * Phase 1's hold music stops first: these are two different places, and hearing a telephone
   * queue over a server room would say the player is in neither.
   */
  $effect(() => {
    audio.stopHoldMusic();
    audio.startRoom();
    return () => audio.stopRoom();
  });

  // Suspicion closes the room down; coverage walks the drone up. Both are cheap setTargetAtTime
  // ramps, so driving them every frame is fine.
  $effect(() => {
    audio.setSuspicion(heatPct);
  });
  $effect(() => {
    audio.setCoverage(d.progress);
  });

  // A feed lighting up, and getting caught. Tracked by identity rather than by value so the
  // chirp fires once per event rather than once per frame.
  let lastEventCount = $state(0);
  $effect(() => {
    // Chirp when a NEW one appears, not on every frame and not when one is claimed.
    if (t.liveEvents.length > lastEventCount) audio.feedChirp();
    lastEventCount = t.liveEvents.length;
  });
  let lastBurns = $state(0);
  $effect(() => {
    if (p.burns > lastBurns) audio.burnSting();
    lastBurns = p.burns;
  });

  /**
   * A remaining-time estimate, in the tradition of every progress bar ever shipped.
   *
   * Honest arithmetic - elapsed divided by progress - which is exactly why it is useless early
   * and why the line beside it admits as much without changing anything.
   */
  const estimate = $derived.by(() => {
    void frame.n;
    if (d.progress <= 0.004) return 'UNKNOWN';
    const total = p.phase2Elapsed / d.progress;
    const left = Math.max(0, total - p.phase2Elapsed);
    const h = Math.floor(left / 3600);
    const m = Math.round((left % 3600) / 60);
    return h > 0 ? `${h} h ${m} m` : `${m} m`;
  });

  /**
   * Read a stream properly. The always-available action the phase lacked.
   *
   * Deliberately placed on the stream row rather than as one global button: which stream you read
   * is the decision, and it costs that stream's freshness.
   */
  function closer(id: StreamId) {
    if (lookCloser(game, id)) {
      audio.noteConfirm();
      interacted();
    }
  }

  function attend(id: StreamId, delta: number) {
    assignAttention(game, id, delta);
    interacted();
  }
</script>

<!-- The picture destabilises as they get suspicious. Same effect phase 1 uses for his temper,
     driven here by the thing that threatens YOU. -->
<div class="p2" class:glitching={heatPct > 0.55} style="--glitch: {heatPct.toFixed(2)}">
  <SessionBar
    suspicion={heatPct}
    interrupted={d.burned.length > 0}
    elapsed={p.phase2Elapsed}
    rate={d.totalRate}
    onSettings={onSettings}
  />

  <!--
    The readout, in the register of a status page.
    See src/phase2/SessionBar.svelte for why: the comedy is that the tool has no idea what it is
    measuring, and files industrial fraud under NOMINAL.
  -->
  <div class="readout">
    <!-- One decimal below 5%: a flat 0% for the first ten minutes reads as broken, and the
         player has in fact been making progress the whole time. -->
    <span class="r"><span class="k">COVERAGE</span>
      <span class="v num">
        {d.progress < 0.05 ? `${(d.progress * 100).toFixed(1)}%` : fmtPct(d.progress)}
      </span></span>
    <span class="r"><span class="k">HELD BY</span> <span class="v">{d.bindingLabel.toUpperCase()}</span></span>
    <span class="r"><span class="k">INTEL</span> <span class="v num">{fmt(p.intel)}</span></span>
    <span class="r"><span class="k">ATTENTION</span>
      <span class="v num" class:over={d.assigned > d.pool}>{d.assigned}/{d.pool}</span></span>
    <span class="r"><span class="k">RUN</span>
      <span class="v num" class:chain-on={p.chain > 0.5}>×{d.chainMultiplier.toFixed(2)}</span>
      {#if d.hotLead}<span class="hot">HOT</span>{/if}</span>
    <span class="r"><span class="k">SUSPICION</span>
      <span class="v num">{p.heat.toFixed(0)}</span>
      <span class="k">YIELD</span>
      <span class="v num">×{d.heatYieldMultiplier.toFixed(2)}</span></span>
    {#if p.burns > 0}
      <span class="r"><span class="k">INTERRUPTIONS</span> <span class="v num">{p.burns}</span></span>
    {/if}
    <span class="spacer"></span>
    <!-- An estimate, offered without confidence and without being asked. -->
    <span class="r dim-note">
      ESTIMATED TIME REMAINING {estimate}. This estimate has not been accurate.
    </span>
  </div>

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
            <div class="stream" class:dark class:wanted={feedsBinding.has(s.id) && a === 0}>
              <div class="stream-head">
                <span class="row-name">{s.name}</span>
                {#if feedsBinding.has(s.id)}
                  <!-- Names where the binding requirement actually comes from. -->
                  <span class="wanted-tag">{d.bindingLabel}</span>
                {/if}
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
              <div class="stream-act">
                <button
                  class="closer"
                  onclick={() => closer(s.id)}
                  disabled={dark || a <= 0 || (t.closerCooldown[s.id] ?? 0) > 0}
                  title="Read this stream properly. Costs freshness."
                >
                  {(t.closerCooldown[s.id] ?? 0) > 0
                    ? `${Math.ceil(t.closerCooldown[s.id] ?? 0)}s`
                    : 'Look closer'}
                </button>
                <span class="fresh" class:stale={freshnessOf(p, s.id) < 0.75}>
                  {freshLabel(freshnessOf(p, s.id))}
                </span>
              </div>
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
              <span class="row-side">
                {#if feedsBinding.has(s.id)}<span class="wanted-tag">{d.bindingLabel}</span>{/if}
                <span class="cost num">{fmt(s.unlockCost)}</span>
              </span>
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
        {#if liveList.length > 0}
          <!-- A claim path that does not require hitting a small pulsing tile: a keyboard user or
               a player looking at another panel needs a real button. -->
          {#each liveList as item (item.ev.stream)}
            <div class="notice-bar">
              <span class="notice-flag">{item.voice.flag}</span>
              <button class="notice-claim" onclick={() => notice(item.ev.stream)}>
                {item.voice.claim}
              </button>
              <span class="notice-line">{item.line}</span>
              <span class="notice-clock num">{Math.ceil(item.ev.remaining)}s</span>
            </div>
          {/each}
        {:else if t.lastEventNote}
          <div class="notice-bar quiet">
            <span class="notice-line">{t.lastEventNote}</span>
          </div>
        {/if}
        <div class="wall-body" class:unwatched={!cctvLive}>
          <CctvGrid
            sizing="fit"
            litCamera={wallEvent ? wallEvent.camera : null}
            litRemaining={wallEvent ? wallEvent.remaining / wallEvent.window : 1}
            onNotice={() => notice('cctv')}
          />
        </div>
      </div>

      <div class="tail-slot">
        <LogTail lines={log} rate={d.totalRate} suspicion={heatPct} />
      </div>
    </section>

    <!-- --------------------------------------------------- coverage / roster -->
    <section class="col">
      <div class="panel">
        <div class="panel-title"><span>What You Have</span></div>
        <div class="pad">
          {#each INTEL_KINDS as k (k)}
            <div class="meter-row" class:binding-row={d.bindingLabel === INTEL_KIND_LABEL[k].toLowerCase()}>
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
          <div class="meter-row" class:binding-row={d.bindingLabel === 'corroboration'}>
            <span class="meter-label">
              Corroboration
              <span class="dim num">{p.corroborated.length}/{COVERAGE.corroborated}</span>
            </span>
            <div class="meter">
              <div
                class="meter-fill"
                class:done={d.identifiedFraction >= 1}
                style="width: {d.identifiedFraction * 100}%"
              ></div>
            </div>
          </div>
          <p class="hint">
            Coverage is the worst of these five, not the total. One good stream will not finish
            it, and the one holding you back is marked.
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
    scrollbar-color: var(--edge) transparent;
  }
  .col::-webkit-scrollbar { width: 8px; }
  .col::-webkit-scrollbar-thumb { background: var(--edge); }
  /* The wall must not scroll internally — it sizes itself to the box it is given. */
  .wall-col { overflow: hidden; }

  /* The tail gets a fixed slice of the centre column; the wall takes the rest. */
  .tail-slot {
    flex: 0 0 auto;
    height: 26%;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tail-slot :global(.tail) { flex: 1 1 auto; min-height: 0; }

  .readout {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    flex-wrap: wrap;
    padding: 4px 8px;
    border-bottom: 1px solid var(--edge);
    background: var(--surface);
    font-size: 10px;
    letter-spacing: 0.05em;
    flex: 0 0 auto;
  }
  .readout .k { color: var(--ink-deep); }
  .readout .v { color: var(--ink-text); }
  .readout .r { display: inline-flex; gap: 4px; align-items: baseline; }
  .readout .spacer { flex: 1; }
  .readout .over { color: var(--red); }
  .readout .chain-on { color: var(--green); }
  .readout .hot { color: var(--red); }
  .dim-note { color: var(--ink-deep); }

  .notice-flag {
    background: var(--accent);
    color: #000;
    padding: 0 5px;
    font-size: 9px;
    letter-spacing: 0.12em;
  }

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

  .hint-block { border-bottom: 1px solid var(--edge); }

  .stream {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 0.6rem var(--pad);
    border-bottom: 1px solid var(--edge);
  }
  .stream.dark { opacity: 0.4; }
  /* A stream that feeds the binding requirement and has no attention on it: the single most
     useful thing the panel can point at. */
  .stream.wanted {
    border-left: 2px solid var(--accent);
    padding-left: calc(var(--pad) - 2px);
  }
  .wanted-tag {
    font-size: 8.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #000;
    background: var(--accent);
    padding: 0 4px;
    align-self: center;
  }
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
  .alloc { font-size: 14px; color: var(--ink); }

  .stream-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    font-size: 10px;
    color: var(--ink-deep);
    font-variant-numeric: tabular-nums;
  }
  .yield { color: var(--ink-dim); }
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

  .notice-bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem var(--pad);
    border-bottom: 1px solid var(--edge);
    font-size: 11px;
  }
  .notice-bar.quiet { opacity: 0.55; }
  .notice-line { flex: 1; min-width: 0; }
  .notice-claim { white-space: nowrap; }
  .notice-clock { color: var(--ink-deep); }

  .stream-act {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 2px 0 1px;
  }
  .closer {
    font-size: 10px;
    padding: 1px 6px;
    min-width: 5.5rem;
  }
  .fresh { color: var(--ink-deep); }
  .fresh.stale { color: var(--red-dim); }
  /* The requirement actually holding coverage back, so the panel answers 'what now'. */
  .binding-row .meter-label { color: var(--ink); }
  .binding-row .meter-fill { background: var(--ink); }
  .binding-row::after {
    content: '←';
    color: var(--ink);
    font-size: 10px;
    align-self: center;
  }
  .binding-row { grid-template-columns: 1fr 1.1fr auto; }

  .roster-list { max-height: none; }
  .roster-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem var(--pad);
    border-bottom: 1px solid var(--edge);
    font-size: 11px;
    color: var(--ink-deep);
  }
  .roster-row.named {
    color: var(--ink-text);
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
    color: var(--ink-dim);
    font-style: italic;
  }
  .roster-role { text-transform: uppercase; font-size: 9px; letter-spacing: 0.1em; }

  @media (max-width: 1100px) {
    .p2-grid { grid-template-columns: 1fr; overflow-y: auto; }
    .wall-col { overflow: visible; min-height: 60vh; }
  }</style>
