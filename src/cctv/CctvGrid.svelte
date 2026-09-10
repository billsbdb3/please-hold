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

  interface Props {
    /** How often the shared clock advances, in ms. Slow by design — this is a
     *  boring office, and a slow tick keeps the whole wall near-free. */
    intervalMs?: number;
    /** Optional subset of camera ids; defaults to all scenes. */
    only?: string[];
    /**
     * Minimum tile width in px. The grid fits as many columns of at least this
     * width as the container allows, so this is effectively "how big is a monitor".
     *
     * It started at 200px, which packed nine tiny columns onto a desktop and read as
     * a contact sheet rather than a wall of monitors. 420 gives three or four
     * genuinely watchable tiles at normal desktop widths.
     */
    tileMin?: number;
  }

  const { intervalMs = 3000, only, tileMin = 420 }: Props = $props();

  const cams = $derived(only ? SCENES.filter((s) => only.includes(s.id)) : SCENES);

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
  style="--tile-min: {tileMin}px"
>
  {#each cams as scene (scene.id)}
    <div class="cell">
      <Cam {scene} {tick} compact />
    </div>
  {/each}
</div>

<style>
  .wall {
    /* Fill the container. NO vh — the parent decides the box. */
    width: 100%;
    height: 100%;
    display: grid;
    /*
     * As many columns of at least --tile-min as fit. The min(100%, …) is what keeps
     * this safe on a narrow screen: without it a 420px minimum would overflow a
     * 360px phone instead of collapsing to one column, so no media query is needed
     * to handle small viewports.
     */
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--tile-min, 420px)), 1fr));
    gap: 8px;
    padding: 8px;
    background: #050505;
    overflow: auto;
    align-content: start;
  }

  .cell {
    /* Fixed CCTV aspect so tiles read as monitors regardless of column width. */
    aspect-ratio: 4 / 3;
    min-height: 0;
    background: #000;
  }
</style>
