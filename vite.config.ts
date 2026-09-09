import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * GitHub Pages serves this repo at /please-hold/, so `base` must match or every
 * asset 404s in production while working perfectly in dev. This is the single most
 * common Pages deployment failure and it is silent locally.
 */
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/please-hold/' : '/',
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
