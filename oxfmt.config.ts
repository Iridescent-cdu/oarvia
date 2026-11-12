import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [".agents/**", "skills-lock.json", "pnpm-lock.yaml"],
});
