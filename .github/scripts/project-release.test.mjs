import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cli, parseVersion } from "./container-release.mjs";

test("the project manifest and API Dockerfile satisfy the release input contract", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf-8")
  );
  assert.equal(parseVersion(pkg.version).channel, "latest");
  const result = await cli(
    {
      DOCKERFILE: "apps/api/Dockerfile",
      RELEASE_VERSION: pkg.version,
      SOURCE_DIRECTORY: root,
    },
    "workspace"
  );
  assert.deepEqual(result, { checked: true });
});
