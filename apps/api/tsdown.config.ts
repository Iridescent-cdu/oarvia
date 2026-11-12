import { defineConfig } from "tsdown";

const revision = process.env.BUILD_SOURCE_SHA || null;
if (revision && !/^[a-f0-9]{40}$/u.test(revision)) {
  throw new Error("BUILD_SOURCE_SHA must be a full commit SHA");
}

export default defineConfig({
  clean: true,
  define: {
    "process.env.OARVIA_BUILD_REVISION": JSON.stringify(revision),
  },
  deps: {
    alwaysBundle: ["@oarvia/contract"],
    onlyBundle: [/^@orpc\//u, /^@standard-server\//u],
  },
  entry: ["src/main.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
});
