<script lang="ts">
  /**
   * A single CCTV camera frame.
   *
   * Draws one Scene as a monochrome, low-fidelity 1990s security image: crude
   * blobby silhouettes, heavy grain, scanlines, a soft vignette, and a burned-in
   * timestamp + camera id in blocky styling. It is deliberately generic — it
   * knows only the declarative Shape vocabulary from scenes.ts, so every camera,
   * present and future, renders through this one component.
   *
   * Performance (docs requirement): everything static is one SVG paint. The grain
   * and scanlines are a fixed SVG filter + CSS overlay, NOT redrawn per frame.
   * "Ambient life" is driven by the `tick` prop — the parent advances one slow
   * clock and every camera derives its frame from it; there is no per-camera
   * requestAnimationFrame. Real positional motion is gated behind
   * prefers-reduced-motion via the parent (it simply stops advancing tick), and
   * the CSS flicker here is gated by the same media query in theme.css spirit.
   */
  import type { Scene, Shape } from './scenes';
  import { formatTimestamp } from './scenes';

  interface Props {
    scene: Scene;
    tick: number;
    /** Larger frames get a slightly bigger HUD; purely cosmetic. */
    compact?: boolean;
  }

  const { scene, tick, compact = false }: Props = $props();

  // Deriving the shape list from (scene, tick) is the whole reactive surface.
  // Same tick -> same shapes (deterministic stepper in scenes.ts).
  const shapes = $derived(scene.describe(tick));
  const stamp = $derived(formatTimestamp(tick));
  const dead = $derived(scene.behaviour === 'dead');

  // A stable per-instance filter id so multiple cameras on one page do not
  // collide on the SVG filter definition. Derived from the scene id only.
  function sceneSeed(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 100000;
  }
  const uid = `cam-${scene.id}-${sceneSeed(scene.id)}`;
</script>

<div class="cam" class:dead class:compact aria-label={`Camera ${scene.id}, ${scene.location}. ${scene.caption}`}>
  {#if dead}
    <!-- Broken camera: no signal. Just the HUD over static. -->
    <div class="nosignal">
      <span>NO SIGNAL</span>
    </div>
  {:else}
    <svg class="frame" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img">
      <defs>
        <!-- Grain: fractal noise burned into the image, static (not per-frame). -->
        <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={sceneSeed(scene.id)} result="n" />
          <feColorMatrix in="n" type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0" result="grain" />
          <feComposite in="grain" in2="SourceGraphic" operator="over" />
        </filter>
        <!-- Slight fisheye/vignette darkening at the edges. -->
        <radialGradient id={`vig-${uid}`} cx="50%" cy="46%" r="72%">
          <stop offset="55%" stop-color="rgba(0,0,0,0)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.7)" />
        </radialGradient>
      </defs>

      <!-- Background wash: low-contrast monochrome, faintly amber-tinted glass. -->
      <rect x="0" y="0" width="100" height="100" fill="#1b1712" />

      <g filter={`url(#grain-${uid})`}>
        {#each shapes as shape, i (i)}
          {@render shapeEl(shape)}
        {/each}
      </g>

      <!-- Vignette on top of the scene. -->
      <rect x="0" y="0" width="100" height="100" fill={`url(#vig-${uid})`} />
    </svg>
  {/if}

  <!-- Scanlines + flicker overlay, CSS-only, gated behind reduced-motion. -->
  <div class="scan" aria-hidden="true"></div>

  <!-- Burned-in HUD: camera id + location top-left, timestamp bottom-right. -->
  <div class="hud hud-tl">CAM {scene.id} · {scene.location}</div>
  <div class="hud hud-br">{stamp}</div>
  <div class="rec" aria-hidden="true">● REC</div>
</div>

{#snippet shapeEl(s: Shape)}
  <!-- Crude, blobby, low-fidelity primitives. Everything is a soft monochrome
       silhouette; detail would break the 1990s-hardware read. -->
  {#if s.kind === 'floor'}
    <rect x="0" y={s.y} width="100" height={100 - s.y} fill="#0f0d0a" />
    <line x1="0" y1={s.y} x2="100" y2={s.y} stroke="#2c261d" stroke-width="0.6" />
  {:else if s.kind === 'wall'}
    <rect x={s.x} y="0" width={s.w} height="100" fill="#141210" />
  {:else if s.kind === 'door'}
    <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.open ? '#050403' : '#241f18'} stroke="#3a3226" stroke-width="0.7" />
    {#if s.open}
      <rect x={s.x + s.w * 0.55} y={s.y} width={s.w * 0.5} height={s.h} fill="#000" opacity="0.6" transform={`skewY(-4)`} />
    {/if}
  {:else if s.kind === 'desk'}
    <rect x={s.x} y={s.y} width={s.w} height="6" rx="1" fill="#2a231a" />
    <rect x={s.x + 2} y={s.y + 6} width="3" height="14" fill="#221c15" />
    <rect x={s.x + s.w - 5} y={s.y + 6} width="3" height="14" fill="#221c15" />
  {:else if s.kind === 'chair'}
    <ellipse cx={s.x + (s.pushedBack ? 6 : 0)} cy={s.y} rx="5" ry="3" fill="#241d15" />
    <rect x={s.x - 3 + (s.pushedBack ? 6 : 0)} y={s.y - 8} width="6" height="8" rx="2" fill="#2a2118" />
  {:else if s.kind === 'figure'}
    {@render figure(s.x, s.y, s.pose)}
  {:else if s.kind === 'blob'}
    <circle cx={s.x} cy={s.y} r={s.r} fill="#3a3024" />
  {:else if s.kind === 'kettle'}
    <path d={`M${s.x} ${s.y} q6 -4 12 0 l-1 8 q-5 2 -10 0 z`} fill="#33291d" />
    <rect x={s.x + 3} y={s.y - 4} width="6" height="3" fill="#2a2016" />
  {:else if s.kind === 'monitor'}
    <rect x={s.x} y={s.y} width="12" height="9" rx="1" fill={s.on ? '#4a3d24' : '#161009'} stroke="#2a2016" stroke-width="0.6" />
    <rect x={s.x + 4} y={s.y + 9} width="4" height="3" fill="#221a11" />
  {:else if s.kind === 'box'}
    <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#2b2418" stroke="#3a3020" stroke-width="0.6" />
    <line x1={s.x} y1={s.y + s.h / 2} x2={s.x + s.w} y2={s.y + s.h / 2} stroke="#1c160e" stroke-width="0.5" />
  {:else if s.kind === 'whiteboard'}
    <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#c9c2b0" stroke="#4a4234" stroke-width="0.8" />
    {#each s.text.split('\n') as line, li (li)}
      <text x={s.x + 3} y={s.y + 8 + li * 9} font-size="6" fill="#2a2419" font-family="monospace">{line}</text>
    {/each}
  {:else if s.kind === 'plant'}
    <rect x={s.x} y={s.y} width="6" height="7" fill="#2a2016" />
    <circle cx={s.x + 3} cy={s.y - 3} r="6" fill="#26301c" />
  {:else if s.kind === 'ceilingTile'}
    <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#1e1a14" stroke="#2e281e" stroke-width="0.8" />
    <circle cx={s.x + s.w / 2} cy={s.y + s.h / 2} r="1.4" fill="#141009" />
  {:else if s.kind === 'car'}
    <path d={`M${s.x} ${s.y + 10} l3 -7 h${s.w - 6} l3 7 z`} fill="#241f18" />
    <rect x={s.x} y={s.y + 8} width={s.w} height="6" rx="2" fill="#2a231a" />
    <circle cx={s.x + 5} cy={s.y + 14} r="2.4" fill="#0d0a07" />
    <circle cx={s.x + s.w - 5} cy={s.y + 14} r="2.4" fill="#0d0a07" />
  {:else if s.kind === 'poster'}
    <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#221c14" stroke="#3a3020" stroke-width="0.6" />
    {#each s.text.split('\n') as line, li (li)}
      <text x={s.x + 2} y={s.y + 6 + li * 6} font-size="4" fill="#6b5a38" font-family="monospace">{line}</text>
    {/each}
  {:else if s.kind === 'clock'}
    <circle cx={s.x} cy={s.y} r="5" fill="#1e1912" stroke="#3a3020" stroke-width="0.7" />
    <line x1={s.x} y1={s.y} x2={s.x} y2={s.y - 3} stroke="#5a4a30" stroke-width="0.7" />
    <line x1={s.x} y1={s.y} x2={s.x + 2} y2={s.y} stroke="#5a4a30" stroke-width="0.7" />
  {/if}
{/snippet}

{#snippet figure(x: number, y: number, pose: 'stand' | 'sit' | 'slump' | 'walk' | 'lean')}
  <!-- Crude silhouette: a blob head on a trapezoid body. Pose only shifts the
       body a little — never detailed, because detail reads as fake. -->
  {#if pose === 'slump'}
    <circle cx={x} cy={y + 4} r="3.4" fill="#3f3324" />
    <path d={`M${x - 4} ${y + 14} q4 -6 8 0 z`} fill="#372d20" />
  {:else if pose === 'sit'}
    <circle cx={x} cy={y} r="3.4" fill="#3f3324" />
    <rect x={x - 3.5} y={y + 3} width="7" height="9" rx="2" fill="#372d20" />
  {:else if pose === 'lean'}
    <circle cx={x + 1} cy={y - 6} r="3.2" fill="#3f3324" />
    <path d={`M${x - 3} ${y + 8} l2 -14 h4 l3 14 z`} fill="#372d20" transform={`rotate(6 ${x} ${y})`} />
  {:else if pose === 'walk'}
    <circle cx={x} cy={y - 8} r="3.2" fill="#3f3324" />
    <path d={`M${x - 3} ${y + 8} l2 -16 h3 l3 16 z`} fill="#372d20" />
    <line x1={x} y1={y + 8} x2={x - 3} y2={y + 14} stroke="#372d20" stroke-width="1.6" />
    <line x1={x} y1={y + 8} x2={x + 3} y2={y + 13} stroke="#372d20" stroke-width="1.6" />
  {:else}
    <!-- stand -->
    <circle cx={x} cy={y - 8} r="3.2" fill="#3f3324" />
    <path d={`M${x - 3} ${y + 10} l2 -18 h3 l3 18 z`} fill="#372d20" />
  {/if}
{/snippet}

<style>
  .cam {
    position: relative;
    width: 100%;
    height: 100%;
    background: #0b0906;
    overflow: hidden;
    border: 1px solid var(--line);
    /* Contain paint so 9+ cameras cannot invalidate each other's layout. */
    contain: layout paint;
    /* Low-contrast, faintly monochrome CCTV wash sits over the SVG. */
    filter: contrast(0.82) brightness(0.92) saturate(0.35);
  }

  .frame {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Scanlines: a repeating gradient, no texture file. Static by default. */
  .scan {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(
      180deg,
      rgba(0, 0, 0, 0) 0px,
      rgba(0, 0, 0, 0) 2px,
      rgba(0, 0, 0, 0.28) 3px,
      rgba(0, 0, 0, 0.28) 4px
    );
    mix-blend-mode: multiply;
    /* A very slow brightness flicker, gated below. */
    animation: cctv-flicker 5.5s steps(1) infinite;
  }

  @keyframes cctv-flicker {
    0%, 96%, 100% { opacity: 1; }
    97% { opacity: 0.82; }
    98% { opacity: 1; }
    99% { opacity: 0.9; }
  }

  .hud {
    position: absolute;
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.08em;
    color: #d8c9a0;
    text-shadow: 0 0 2px #000, 1px 1px 0 #000;
    pointer-events: none;
    user-select: none;
  }
  .compact .hud { font-size: 7px; }

  .hud-tl { top: 4px; left: 5px; }
  .hud-br { bottom: 4px; right: 5px; }

  .rec {
    position: absolute;
    top: 4px;
    right: 5px;
    font-family: var(--mono);
    font-size: 9px;
    color: var(--red);
    letter-spacing: 0.06em;
    text-shadow: 0 0 2px #000;
    pointer-events: none;
    animation: rec-blink 2s steps(1) infinite;
  }
  .compact .rec { font-size: 7px; }

  @keyframes rec-blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0.25; }
  }

  /* Broken camera. */
  .cam.dead {
    filter: contrast(0.6) brightness(0.5);
  }
  .nosignal {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      repeating-linear-gradient(0deg, #050505 0, #050505 2px, #101010 2px, #101010 4px);
    color: #6b5a38;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.2em;
  }

  /* Accessibility: switch off every animation for reduced-motion users. The
     positional "ambient life" is separately gated by the parent freezing tick. */
  @media (prefers-reduced-motion: reduce) {
    .scan { animation: none; }
    .rec { animation: none; opacity: 1; }
  }
</style>
