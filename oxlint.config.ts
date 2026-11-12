import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  env: core.env,
  extends: [core],
  ignorePatterns: [...(core.ignorePatterns ?? []), ".agents/**"],
  overrides: (vitest.overrides ?? []).map((override) => ({
    ...override,
    files: ["apps/api/src/**/*.test.ts", "packages/contract/src/**/*.test.ts"],
  })),
  settings: core.settings,
});
