import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifact = new URL("../artifacts/api-e2e/", import.meta.url);

const waitForReady = async (server, origin, deadline) => {
  assert.equal(
    server.exitCode,
    null,
    "Production process exited before becoming ready"
  );
  assert.equal(
    server.signalCode,
    null,
    "Production process was killed before becoming ready"
  );
  assert.ok(Date.now() < deadline, "Production API did not become ready");
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(500),
    });
    await response.arrayBuffer();
    if (response.ok) {
      return;
    }
  } catch {
    // The production listener may not yet be bound.
  }
  await delay(50);
  return waitForReady(server, origin, deadline);
};

test(
  "built API starts in Node, serves public transports and shuts down cleanly",
  { timeout: 30_000 },
  async (t) => {
    mkdirSync(artifact, { recursive: true });
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const { port } = reservation.address();
    const released = once(reservation, "close");
    reservation.close();
    await released;
    const server = spawn(process.execPath, ["apps/api/dist/main.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        NODE_ENV: "production",
        OARVIA_BUILD_REVISION: "f".repeat(40),
        PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(server, "exit");
    const log = new URL("server.log", artifact);
    server.stdout.on("data", (chunk) => appendFileSync(log, chunk));
    server.stderr.on("data", (chunk) => appendFileSync(log, chunk));
    t.after(async () => {
      if (server.exitCode === null && server.signalCode === null) {
        server.kill("SIGTERM");
        const force = setTimeout(() => server.kill("SIGKILL"), 2000);
        try {
          await exited;
        } finally {
          clearTimeout(force);
        }
      }
    });
    const origin = `http://127.0.0.1:${port}`;
    await waitForReady(server, origin, Date.now() + 10_000);
    const version = await fetch(
      `${origin}/api/version?revision=${"e".repeat(40)}`
    );
    assert.equal(version.headers.get("cache-control"), "no-store");
    assert.deepEqual(await version.json(), {
      ready: Boolean(process.env.BUILD_SOURCE_SHA),
      revision: process.env.BUILD_SOURCE_SHA || null,
    });
    const health = await fetch(`${origin}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      service: "oarvia-api",
      status: "ok",
    });
    const spec = await fetch(`${origin}/api/spec.json`);
    assert.equal(spec.status, 200);
    const specification = await spec.json();
    assert.ok(specification.paths["/health"].get.responses["200"]);
    const invalid = await fetch(`${origin}/rpc/system/health`, {
      body: "{",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(invalid.status, 400);
    await invalid.arrayBuffer();
    const recovered = await fetch(`${origin}/api/health`);
    assert.equal(recovered.status, 200);
    await recovered.arrayBuffer();
    const missing = await fetch(`${origin}/missing`);
    assert.equal(missing.status, 404);
    await missing.arrayBuffer();
    server.kill("SIGTERM");
    assert.deepEqual(
      await exited,
      [0, null],
      "Production process did not shut down cleanly"
    );
  }
);
