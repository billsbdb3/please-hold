<script lang="ts">
  /**
   * The wall of monitors (docs/DESIGN.md §6 P2/§8 surveillance language).
   *
   * A grid of Cam frames sized to its CONTAINER, not to the viewport. The project
   * just fixed a bug where hardcoded vh caps clipped panels, so there are
   * deliberately no viewport-fraction heights here: the grid fills whatever box
   * it is given (100% of the parent) and the tiles keep a fixed aspect ratio.
   *
   * One clock for the whole wall. Every camera derives its frame from the same
   * integer `tick`, so "ambient life" across 14 cameras costs one timer, not 14
   * animation loops, and the frames stay reproducible. The clock is gated behind
   * prefers-reduced-motion: a reduced-motion user gets a single static frame
   * (tick 0) and the interval never starts.
   */
  import { onMount, onDestroy } from 'svelte';
  import Cam from './Cam.svelte';
  import { SCENES } from './scenes';
  import { bestColumns, columnsForTileWidth, heightFor, DEFAULT_METRICS } from './layout';

  interface Props {
    /** How often the shared clock advances, in ms. Slow by design — this is a
     *  boring office, and a slow tick keeps the whole wall near-free. */
    intervalMs?: number;
    /** Optional subset of camera ids; defaults to all scenes. */
    only?: string[];
    /**
     * How the wall is sized.
     *
     * 'fit' computes the column count so EVERY camera fits the container at the largest
     * possible tile — which is what "fit the page" actually means, and is not something a
     * fixed pixel minimum can express. The numeric modes force a tile width instead and
     * let the wall scroll.
     */
    sizing?: 'fit' | number;
    /** Index of the camera currently showing something, or null. */
    litCamera?: number | null;
    /** 0..1 of the claim window remaining, for the depleting border. */
    litRemaining?: number;
    /** Called when the player notices the lit feed. */
    onNotice?: () => void;
  }

  const {
    intervalMs = 3000, only, sizing = 'fit',
    litCamera = null, litRemaining = 1, onNotice,
  }: Props = $props();

  const cams = $derived(only ? SCENES.filter((s) => only.includes(s.id)) : SCENES);

  /** Measured container box, driven by a ResizeObserver. */
  let wallEl = $state<HTMLDivElement | null>(null);
  let boxW = $state(0);
  let boxH = $state(0);

  /**
   * Column count, from the tested pure helpers in ./layout.ts. The maths lives there
   * precisely because it is the part that was wrong twice — a component is hard to test,
   * a function of numbers is not.
   */
  const cols = $derived.by(() => {
    const box = { width: boxW, height: boxH };
    return sizing === 'fit'
      ? bestColumns(cams.length, box, DEFAULT_METRICS)
      : columnsForTileWidth(cams.length, sizing, box, DEFAULT_METRICS);
  });

  /**
   * Whether the chosen layout fits without scrolling. Integer row counts mean the best
   * fitting layout often leaves slack (14 cameras at 5 columns is 3 rows, and 4 columns
   * would overflow), and dumping all that slack at the bottom reads as a rendering fault.
   * When it fits, the rows are centred; when it scrolls, they must start at the top or the
   * first row would be clipped out of reach.
   */
  const fits = $derived.by(() => {
    if (boxW <= 0 || boxH <= 0) return false;
    return heightFor(cams.length, cols, { width: boxW, height: boxH }, DEFAULT_METRICS) <= boxH;
  });

  $effect(() => {
    const el = wallEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      boxW = el.clientWidth;
      boxH = el.clientHeight;
    });
    ro.observe(el);
    boxW = el.clientWidth;
    boxH = el.clientHeight;
    return () => ro.disconnect();
  });

  let tick = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    const reduce =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Reduced motion: hold a single static frame, never start the clock.
    if (reduce) return;
    timer = setInterval(() => {
      tick += 1;
    }, intervalMs);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<div
  class="wall"
  role="group"
  aria-label="Surveillance monitors"
  bind:this={wallEl}
  class:fits
  style="--cols: {cols}"
>
  {#each cams as scene, i (scene.id)}
    {@const lit = litCamera === i}
    <!--
      A lit tile is a real button, not a div with a click handler: it has to be reachable by
      keyboard and announced, and the panel carries a second claim control besides, because
      12-bonus-events.md is clear that a small moving target is not an accessible claim path.
      Signalling is redundant by design - brightness, a border, and a caption - never colour
      alone.
    -->
    <div class="cell" class:lit>
      {#if lit}
        <button
          class="notice"
          style="--left: {litRemaining}"
          onclick={onNotice}
          aria-label="Something is happening on {scene.location}. Claim it."
        >
          <Cam {scene} {tick} />
          <span class="notice-flag" aria-hidden="true">SEE THIS</span>
        </button>
      {:else}
        <Cam {scene} {tick} />
      {/if}
    </div>
  {/each}
</div>

<style>
  .cell.lit {
    /* Outside the .cam absolute-positioning contract, so it cannot reintroduce the row overlap
       that took three rounds to fix. */
    z-index: 2;
  }
  .notice {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 2px solid var(--amber);
    background: none;
    cursor: pointer;
    animation: notice-pulse 1.1s ease-in-out infinite;
  }
  .notice:hover { border-color: var(--amber-text, #ffd9a0); }
  /* The window depleting, drawn as a bar rather than only a colour change. */
  .notice::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: calc(var(--left, 1) * 100%);
    background: var(--amber);
  }
  .notice-flag {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 9px;
    letter-spacing: 0.12em;
    padding: 1px 4px;
    background: var(--amber);
    color: #000;
  }
  @keyframes notice-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 185, 73, 0.55); }
    50% { box-shadow: 0 0 14px 3px rgba(255, 185, 73, 0.35); }
  }
  @media (prefers-reduced-motion: reduce) {
    .notice { animation: none; }
  }

  .wall {
    /* Fill the container. NO vh — the parent decides the box. */
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: repeat(var(--cols, 4), 1fr);
    gap: 8px;
    padding: 8px;
    background: #050505;
    overflow: auto;
    /* Top-aligned by default: when the wall scrolls, centring would push the first row
       out of reach above the scroll origin. */
    align-content: start;
    /*
     * align-items MUST NOT stretch. Grid items default to stretching to the row
     * height, which fought the cell's aspect-ratio: the cells resolved TALLER than
     * their rows, overflowed downward, and the next row's opaque tiles painted over
     * the bottom of the previous row — silently hiding every caption except on
     * cameras 11 and 12, whose overflow happened to sit under the empty columns of a
     * short final row. With `start`, the cell's height comes from its aspect-ratio and
     * the row sizes to the cell, so nothing can overlap.
     */
    align-items: start;
    box-sizing: border-box;
  }

  /*
   * Fits without scrolling: keep the slack at the BOTTOM rather than centring it.
   *
   * Centring looked tidy when the wall was the only thing in its panel. With an event line above
   * it the centred grid drifts down and reads as a large unexplained gap between the caption and
   * the monitors, which is what a playtest screenshot showed.
   */
  .wall.fits {
    align-content: start;
  }

  .cell {
    /* Fixed CCTV aspect so tiles read as monitors regardless of column width. */
    position: relative;
    aspect-ratio: 4 / 3;
    min-height: 0;
    background: #000;
    /* Belt and braces: even if a descendant misbehaves, it cannot escape the tile. */
    overflow: hidden;
  }
</style>
