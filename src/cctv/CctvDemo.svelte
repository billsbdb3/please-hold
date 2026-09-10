<script lang="ts">
  /**
   * Dev-only CCTV demo (docs requirement 5).
   *
   * A standalone view so a human can look at the wall of monitors before Phase 2
   * exists to host it. This is NOT wired into the live game — it is reached only
   * via the `#cctv` URL hash (see main.ts) and Phase 2 will mount CctvGrid itself.
   *
   * It renders the grid inside the game's own console chrome (scanlines +
   * vignette from theme.css) so the CCTV reads as being viewed THROUGH the
   * operator console, per docs/DESIGN.md §8.
   */
  import CctvGrid from './CctvGrid.svelte';

  /**
   * Monitor sizing. 'fit' computes the column count so every camera fits the box at the
   * largest tile that will fit — the honest reading of "fit the page", and something a
   * fixed pixel width cannot express at an arbitrary window size. The rest force a tile
   * width and let the wall scroll.
   */
  const SIZES = [
    { label: 'fit', value: 'fit' as const },
    { label: 'wall', value: 260 },
    { label: 'large', value: 420 },
    { label: 'focus', value: 620 },
  ] as const;

  let sizing = $state<'fit' | number>('fit');
</script>

<div class="demo">
  <header class="demo-bar">
    <span class="phosphor">PLEASE HOLD</span>
    <span class="sub">SURVEILLANCE — 14 CAMERAS — DEV PREVIEW</span>
    <span class="sizes">
      {#each SIZES as size (size.label)}
        <button class:active={sizing === size.value} onclick={() => (sizing = size.value)}>
          {size.label}
        </button>
      {/each}
    </span>
    <span class="note">nothing is happening on any of them</span>
  </header>

  <main class="demo-body">
    <CctvGrid {sizing} />
  </main>

  <!-- Console chrome: the same CRT recipe the live game uses. -->
  <div class="crt-scanlines" aria-hidden="true"></div>
  <div class="crt-vignette" aria-hidden="true"></div>
</div>

<style>
  .demo {
    /* Fills the app root. Height comes from #app (100%), not from vh. */
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--void);
  }

  .demo-bar {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--line);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    flex: 0 0 auto;
  }
  .demo-bar .sub { color: var(--amber-deep); }
  .demo-bar .sizes {
    display: flex;
    gap: 2px;
    margin-left: 0.5rem;
  }
  .demo-bar .sizes button {
    padding: 1px 8px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .demo-bar .sizes button.active {
    border-color: var(--amber);
    color: var(--amber);
  }

  .demo-bar .note {
    margin-left: auto;
    color: var(--steel-dim);
    text-transform: none;
    letter-spacing: 0.04em;
  }

  .demo-body {
    /* The grid fills the remaining space. min-height:0 lets it shrink inside
       the flex column instead of overflowing — this is the correct replacement
       for a hardcoded vh cap. */
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
