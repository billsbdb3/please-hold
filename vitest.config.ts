import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * The balance suite runs full phase simulations — deterministic, but genuinely
     * seconds of arithmetic each. vitest's 5s default is tuned for unit tests and a
     * GitHub runner measured ~2.4x slower than local, which failed a passing assertion
     * on time alone rather than on its result.
     *
     * The simulations are also memoised in tests/balance.test.ts, which is the actual
     * fix; this is headroom so a slow or noisy runner cannot produce a red build for a
     * test that is behaving correctly.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Node environment: the save tests install a minimal localStorage stand-in rather
    // than paying for jsdom, and nothing else in the suite touches the DOM.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
