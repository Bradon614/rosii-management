import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

/**
 * Test configuration: the application config (aliases, React and Tailwind
 * plugins) plus a jsdom environment. Tests live next to the code they cover,
 * as `*.test.ts(x)`.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      restoreMocks: true,
      unstubGlobals: true,
    },
  }),
);
