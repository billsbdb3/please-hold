import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * GitHub Pages serves this repo from a subpath (/please-hold/), so `base` must match
 * or every asset 404s in production while working perfectly in dev. This is the most
 * common Pages deployment failure and it is completely silent locally.
 *
 * `BASE_PATH` is set explicitly by .github/workflows/deploy.yml rather than sniffed
 * from `GITHUB_ACTIONS`, so the exact production build can be reproduced — and
 * therefore tested — on a laptop:
 *
 *     BASE_PATH=/please-hold/ npm run build && npm run preview:pages
 */
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte()],
  build: {
    target: 'es2022',
    // Content-hashed filenames so a returning player is never served a stale
    // bundle against a fresh save schema.
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    port: 5173,
    // Loopback only. Never expose a dev server on all interfaces.
    host: '127.0.0.1',
    strictPort: false,
  },
});
