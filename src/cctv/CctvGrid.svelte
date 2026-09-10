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
  }

  const { intervalMs = 3000, only }: Props = $props();

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

<div class="wall" role="group" aria-label="Surveillance monitors">
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
    /* Responsive: as many ~220px columns as fit, sizing down to the container. */
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px;
    padding: 6px;
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

  @media (max-width: 560px) {
    .wall {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }
</style>
