import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Svelte 5 runes mode, explicitly. Fine-grained reactivity is the entire
    // reason this framework was chosen: a 20 Hz tick touching hundreds of values
    // must patch individual text nodes, not re-render component trees.
    runes: true,
  },
};
