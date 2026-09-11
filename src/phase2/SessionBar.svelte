<script lang="ts">
  /**
   * THE SESSION BAR.
   *
   * The single element that says "you are not on your own machine", and the highest
   * impact-per-effort item in the control-room research: their hostname, a live round-trip
   * time, throughput, uptime, and a connection state that can degrade.
   *
   * It is also where Phase 2's comedy lives, and that needed diagnosing rather than guessing.
   * Phase 1 is funny because a man is losing his temper at someone patiently useless — there is
   * a victim, an escalation and a straight man. My Phase 2 writing was merely FLAT: mundane
   * descriptions of mundane things, which is dry without being funny. The fix is to give the
   * deadpan something absurd to report, and the most absurd thing available is that the
   * dismantling of a criminal enterprise is being conducted through enterprise software with
   * opinions about its own uptime.
   *
   * So this bar reports a felony in the register of a status page. It never winks (DESIGN §9)
   * and it never acknowledges what it is measuring.
   */
  import { onMount } from 'svelte';

  interface Props {
    /** Suspicion 0..1 — degrades the reported link quality. */
    suspicion?: number;
    /** True while a stream is dark, which the session reports as its own problem. */
    interrupted?: boolean;
    /** Seconds inside the session. */
    elapsed?: number;
    /** Intel per second, reported as throughput because that is what a session would call it. */
    rate?: number;
    /** Opens the shared settings drawer. */
    onSettings?: () => void;
  }

  const { suspicion = 0, interrupted = false, elapsed = 0, rate = 0, onSettings }: Props = $props();

  /**
   * Their machine's name.
   *
   * Fixed, not random: it is the same machine every session, and a name that changed on reload
   * would quietly tell the player none of this is real. The naming is deliberately the
   * default-hostname-nobody-changed kind.
   */
  const HOST = 'DESKTOP-4471QK';
  const USER = 'admin';

  /** Round-trip time, wandering. A flat number reads as a decoration; a wandering one reads live. */
  let rtt = $state(38);
  let jitter = $state(2);

  onMount(() => {
    const id = setInterval(() => {
      // Suspicion makes the link worse. They are not throttling you; they are busy being careful.
      const base = 34 + suspicion * 120;
      const drift = (Math.random() - 0.5) * (6 + suspicion * 40);
      rtt = Math.max(11, Math.round(base + drift));
      jitter = Math.max(1, Math.round(Math.abs(drift) / 2));
    }, 1600);
    return () => clearInterval(id);
  });

  const linkState = $derived(
    interrupted ? 'REESTABLISHING' : suspicion > 0.85 ? 'DEGRADED' : 'ESTABLISHED',
  );

  /** Throughput, in the units a session monitor would use. */
  const kbps = $derived(Math.max(0.1, rate * 0.6));

  function clock(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
</script>

<div class="session" class:degraded={linkState !== 'ESTABLISHED'}>
  <span class="dot" class:bad={linkState !== 'ESTABLISHED'} aria-hidden="true"></span>
  <span class="label">REMOTE SESSION</span>
  <span class="host">{USER}@{HOST}</span>

  <span class="sep" aria-hidden="true">│</span>
  <span class="field"><span class="k">RTT</span> <span class="v num">{rtt}ms</span></span>
  <span class="field"><span class="k">JIT</span> <span class="v num">±{jitter}</span></span>
  <span class="field"><span class="k">TX</span> <span class="v num">{kbps.toFixed(1)}kb/s</span></span>
  <span class="field"><span class="k">UP</span> <span class="v num">{clock(elapsed)}</span></span>

  <span class="sep" aria-hidden="true">│</span>
  <span class="state">{linkState}</span>

  <span class="spacer"></span>
  <!--
    The joke, stated without comment. A status page cannot tell the difference between a healthy
    build pipeline and industrial-scale fraud, and this one has decided everything is fine.
  -->
  <span class="field health">
    <span class="k">SESSION HEALTH</span>
    <span class="v">{interrupted ? 'ATTENTION REQUIRED' : 'NOMINAL'}</span>
  </span>
  {#if onSettings}
    <button class="gear" onclick={onSettings} aria-label="Settings" title="Settings">⚙</button>
  {/if}
</div>

<style>
  .session {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 4px 8px;
    border-bottom: 1px solid var(--edge);
    background: var(--surface-raised);
    font-size: 10px;
    letter-spacing: 0.06em;
    white-space: nowrap;
    overflow: hidden;
    flex: 0 0 auto;
  }

  .dot {
    width: 7px;
    height: 7px;
    background: var(--green);
    /* Square, not round: this is a status LED on a rack, not a chat presence indicator. */
    flex: 0 0 auto;
  }
  .dot.bad {
    background: var(--red);
    /* steps() rather than a smooth fade — mechanical, not decorative. */
    animation: blink 1s steps(2, end) infinite;
  }
  @keyframes blink {
    50% { opacity: 0.15; }
  }

  .label {
    color: var(--ink-deep);
  }
  .host {
    color: var(--ink);
  }
  .sep {
    color: var(--edge);
  }
  .field {
    display: inline-flex;
    gap: 4px;
  }
  .k {
    color: var(--ink-deep);
  }
  .v {
    color: var(--ink-dim);
  }
  .state {
    color: var(--green);
  }
  .session.degraded .state {
    color: var(--red);
  }
  .spacer {
    flex: 1;
  }
  .health .v {
    color: var(--ink-text);
  }

  .gear {
    padding: 0 5px;
    font-size: 12px;
    line-height: 1.5;
    border-color: transparent;
    color: var(--ink-deep);
  }
  .gear:hover {
    color: var(--ink);
    border-color: var(--edge);
  }

  @media (prefers-reduced-motion: reduce) {
    .dot.bad { animation: none; }
  }
</style>
