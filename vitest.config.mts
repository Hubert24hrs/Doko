import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite resolves tsconfig `paths` natively, so the @/* alias works without
  // the vite-tsconfig-paths plugin.
  resolve: { tsconfigPaths: true },

  test: {
    /**
     * Node environment by default: the current suites are pure logic
     * (validation, tree building, URL guards) and do not touch the DOM.
     * Component tests opt into jsdom per file with:
     *   // @vitest-environment jsdom
     */
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],

    /**
     * One forked process, no per-file parallelism. Spawning a worker per file
     * was timing out on this machine, and the suite is small enough that
     * per-file isolation buys nothing.
     */
    pool: "forks",
    fileParallelism: false,

    testTimeout: 20_000,
    hookTimeout: 20_000,

    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/types/**"],
    },
  },
});
