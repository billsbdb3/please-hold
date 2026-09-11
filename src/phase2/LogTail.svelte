<script lang="ts">
  /**
   * THE LOG TAIL.
   *
   * A console that scrolls whether or not you are looking at it. The control-room research is
   * specific that this is what separates "monitoring" from "browsing": in a SOC the log runs
   * without you, and the operator's job is to notice.
   *
   * It also carries the second half of Phase 2's comedy. The tool narrates the dismantling of a
   * criminal enterprise in the register of a build log — timestamps, severities, and a cheerful
   * refusal to draw any conclusion from what it is reporting. It never editorialises, which is
   * both the house style (DESIGN §9) and the joke: a log that said 'this is terrible' would be
   * far less funny than one that files it under INFO.
   */
  import { fmtRate } from '../engine/numbers';
  import type { LogLine } from '../engine/types';

  interface Props {
    lines: LogLine[];
    /** Intel per second, reported as though it were a throughput metric. */
    rate?: number;
    /** Suspicion 0..1, reported as a link-quality problem rather than a moral one. */
    suspicion?: number;
  }

  const { lines, rate = 0, suspicion = 0 }: Props = $props();

  /** Newest last, tail-capped. A log pane does not need a thousand rows in the DOM. */
  const tail = $derived(lines.slice(-90));

  /**
   * Severity, in the register of a machine that has no idea what it is looking at.
   *
   * A recording of someone being defrauded is filed as INFO because it arrived without error.
   * This is the whole comic engine, and it works precisely because nothing draws attention to it.
   */
  function severity(kind: LogLine['kind']): string {
    switch (kind) {
      case 'threat': return 'WARN';
      case 'beat': return 'NOTE';
      case 'intel': return 'INFO';
      case 'system': return 'DEBUG';
      default: return 'INFO';
    }
  }

  function stamp(i: number): string {
    // Monotonic and meaningless, like every log you have ever read.
    const t = 41_000 + i * 137;
    const m = Math.floor(t / 60_000) % 60;
    const s = Math.floor(t / 1000) % 60;
    const ms = t % 1000;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }
</script>

<div class="tail" role="log" aria-label="Session log" aria-live="polite">
  <div class="tail-head">
    <span>SESSION LOG</span>
    <span class="metrics">
      <span class="k">INGEST</span> <span class="num">{fmtRate(rate)}/s</span>
      <span class="k">LINK</span> <span class="num">{Math.round((1 - suspicion) * 100)}%</span>
    </span>
  </div>
  <div class="rows">
    {#if tail.length === 0}
      <!-- An empty state that says nothing is wrong, which is technically accurate. -->
      <p class="empty">Nothing has been logged. The operation continues.</p>
    {:else}
      {#each tail as l, i (l.id)}
        <div class="row {l.kind}">
          <span class="ts num">{stamp(i)}</span>
          <span class="sev">{severity(l.kind)}</span>
          <span class="msg">{l.text}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .tail {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--edge);
    background: var(--surface);
  }
  .tail-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 3px 8px;
    border-bottom: 1px solid var(--edge);
    font-size: 9px;
    letter-spacing: 0.14em;
    color: var(--ink-deep);
    flex: 0 0 auto;
  }
  .metrics {
    display: flex;
    gap: 0.5rem;
  }
  .metrics .k {
    color: var(--ink-deep);
  }
  .metrics .num {
    color: var(--ink-dim);
  }

  .rows {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    /* Newest at the bottom, pinned there, so it reads as a tail rather than a list. */
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    scrollbar-width: thin;
    scrollbar-color: var(--edge) transparent;
  }
  .rows::-webkit-scrollbar { width: 7px; }
  .rows::-webkit-scrollbar-thumb { background: var(--edge); }

  .row {
    display: grid;
    grid-template-columns: 4.6rem 3.2rem 1fr;
    gap: 0.5rem;
    padding: 1px 8px;
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--ink-dim);
  }
  .ts { color: var(--ink-deep); }
  .sev { color: var(--ink-deep); letter-spacing: 0.08em; }
  .row.threat .sev, .row.threat .msg { color: var(--red); }
  .row.intel .msg { color: var(--ink-text); }
  .row.beat .msg { color: var(--ink); }
  .msg { min-width: 0; overflow-wrap: anywhere; }

  .empty {
    margin: 0;
    padding: 0.6rem 8px;
    font-size: 10.5px;
    color: var(--ink-deep);
  }
</style>
