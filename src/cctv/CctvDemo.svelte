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
</script>

<div class="demo">
  <header class="demo-bar">
    <span class="phosphor">PLEASE HOLD</span>
    <span class="sub">SURVEILLANCE — 14 CAMERAS — DEV PREVIEW</span>
    <span class="note">nothing is happening on any of them</span>
  </header>

  <main class="demo-body">
    <CctvGrid />
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
