import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { verifyDeployment } from "./verify-deployment.mjs";

const current = "a".repeat(40);
const previous = "b".repeat(40);
const image = `example/app@sha256:${"a".repeat(64)}`;
const oldImage = `example/app@sha256:${"b".repeat(64)}`;

test("waits for readiness and exact revision, rather than accepting HTTP 200", async () => {
  let calls = 0;
  await verifyDeployment({
    attempts: 3,
    pause: () => {},
    request: () => {
      const states = [
        { ready: true, revision: previous },
        { ready: false, revision: current },
        { ready: true, revision: current },
      ];
      return {
        json: () => {
          const state = states[calls];
          calls += 1;
          return state;
        },
        ok: true,
      };
    },
    revision: current,
    url: "https://example.com/version",
  });
  assert.equal(calls, 3);
});

test("network failures exhaust the retry budget and fail", async () => {
  let calls = 0;
  await assert.rejects(
    verifyDeployment({
      attempts: 2,
      pause: () => {},
      request: () => {
        calls += 1;
        throw new Error("offline");
      },
      revision: current,
      url: "https://example.com",
    })
  );
  assert.equal(calls, 2);
});

test("invalid deployment identity fails before a request", async () => {
  await assert.rejects(
    verifyDeployment({ revision: "main", url: "https://example.com" })
  );
  await assert.rejects(
    verifyDeployment({
      revision: current,
      url: "https://user:secret@example.com",
    })
  );
});

const simulate = (mode, overrides = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), "deployment-test-"));
  const bin = path.join(dir, "bin");
  // 独立临时目录，不访问真实 Docker、服务器或网络；flock 仅模拟获取结果。
  const mkdir = spawnSync("/bin/mkdir", [bin]);
  assert.equal(mkdir.status, 0);
  writeFileSync(path.join(dir, "compose.yaml"), "services: {}\n");
  writeFileSync(
    path.join(dir, "production params.env"),
    "COMPOSE_PROJECT_NAME=example\nSERVICE_PORT=3100\nSERVICE_RUNTIME_ENV=apps/service/.env\nSERVICE_IMAGE=example/app:old\n"
  );
  const originalParams = readFileSync(
    path.join(dir, "production params.env"),
    "utf-8"
  );
  if (mode === "pending") {
    writeFileSync(path.join(dir, "deployment-pending.txt"), "interrupted");
  }
  if (mode === "old-report") {
    writeFileSync(path.join(dir, "deployment-result.txt"), "status=verified\n");
  }
  writeFileSync(
    path.join(bin, "flock"),
    `#!/bin/sh\nexit "\${FAKE_LOCK_RESULT:-0}"\n`,
    { mode: 0o755 }
  );
  writeFileSync(
    path.join(bin, "node"),
    '#!/bin/sh\ncase "$1" in *deployment-source.mjs) [ "$FAKE_MODE" != stale-target ]; exit $? ;; esac\nif [ "$EXPECTED_SHA" = "$OLD_SHA" ]; then exit 0; fi\n[ "$FAKE_MODE" = success ] || [ "$FAKE_MODE" = wrong-running-image ]\n',
    { mode: 0o755 }
  );
  writeFileSync(
    path.join(bin, "docker"),
    `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2), e = process.env;
const selectedImage = e[e.IMAGE_VARIABLE];
appendFileSync(e.LOG_FILE, JSON.stringify({ args, image: selectedImage }) + '\\n');
const stateFile = e.LOG_FILE + '.state';
const running = existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : e.OLD_IMAGE;
if (args[0] === 'image') console.log(args[3] === '{{.Id}}' ? args.at(-1) : (e.FAKE_MODE === 'wrong-image' ? 'invalid' : e.NEW_SHA));
else if (args[0] === 'inspect') console.log(args[2].includes('revision') ? e.OLD_SHA : running);
else if (args.includes('ps') && e.FAKE_MODE !== 'first-fails') console.log('old-container');
else if (args.includes('up') && ((e.FAKE_MODE === 'update-command-fails' && selectedImage === e.NEW_IMAGE) || (e.FAKE_MODE === 'rollback-fails' && selectedImage === e.OLD_IMAGE))) process.exit(1);
else if (args.includes('up')) writeFileSync(stateFile, e.FAKE_MODE === 'wrong-running-image' ? e.OLD_IMAGE : selectedImage);
`,
    { mode: 0o755 }
  );
  const log = path.join(dir, "commands.log");
  try {
    const result = spawnSync(
      "bash",
      [fileURLToPath(new URL("deploy-container.sh", import.meta.url))],
      {
        encoding: "utf-8",
        env: {
          ...process.env,
          COMPOSE_ENV_FILE: "production params.env",
          COMPOSE_FILE_PATH: "compose.yaml",
          COMPOSE_SERVICE: "api",
          DEPLOYMENT_HEALTH_URL: "https://example.com/version",
          DEPLOY_DIR: dir,
          DEPLOY_IMAGE: image,
          EXPECTED_SHA: current,
          FAKE_MODE: mode,
          IMAGE_REPOSITORY: "example/app",
          IMAGE_VARIABLE: "SERVICE_IMAGE",
          LOG_FILE: log,
          NEW_IMAGE: image,
          NEW_SHA: current,
          OLD_IMAGE: oldImage,
          OLD_SHA: previous,
          PATH: `${bin}:${process.env.PATH}`,
          ...(mode === "old-report"
            ? { DEPLOY_RESULT_FILE: path.join(dir, "this-attempt.txt") }
            : {}),
          ...overrides,
        },
      }
    );
    return {
      attemptReport: existsSync(path.join(dir, "this-attempt.txt")),
      commands: existsSync(log)
        ? readFileSync(log, "utf-8").trim().split("\n").map(JSON.parse)
        : [],
      paramsUnchanged:
        readFileSync(path.join(dir, "production params.env"), "utf-8") ===
        originalParams,
      pending: existsSync(path.join(dir, "deployment-pending.txt")),
      report: existsSync(path.join(dir, "deployment-result.txt"))
        ? readFileSync(path.join(dir, "deployment-result.txt"), "utf-8")
        : "",
      status: result.status,
      stderr: result.stderr,
    };
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
};

test("successful update records verified state and clears pending", () => {
  const result = simulate("success");
  assert.equal(result.status, 0);
  assert.equal(result.pending, false);
  assert.match(result.report, /status=verified/u);
});

for (const mode of [
  "verify-fails",
  "update-command-fails",
  "wrong-running-image",
]) {
  test(`${mode}: restores original digest and retains failed exit status`, () => {
    const result = simulate(mode);
    assert.equal(result.status, 1);
    assert.equal(result.pending, false);
    assert.match(result.report, /status=failed-restored/u);
    assert.deepEqual(
      result.commands.filter((c) => c.args.includes("up")).map((c) => c.image),
      [image, oldImage]
    );
  });
}

test("failed first installation and failed restoration retain pending state", () => {
  for (const mode of ["first-fails", "rollback-fails"]) {
    const result = simulate(mode);
    assert.equal(result.status, 1);
    assert.equal(result.pending, true);
    assert.match(result.report, /status=failed-needs-inspection/u);
  }
});

test("wrong image identity, mutable input and a busy lock never update containers", () => {
  for (const result of [
    simulate("wrong-image"),
    simulate("success", { DEPLOY_IMAGE: "example/app:latest" }),
    simulate("success", { FAKE_LOCK_RESULT: "1" }),
  ]) {
    assert.notEqual(result.status, 0, JSON.stringify(result));
    assert.equal(
      result.commands.some((c) => c.args.includes("up")),
      false
    );
  }
});

test("interrupted deployment blocks reentry; old report does not become this attempt result", () => {
  const pending = simulate("pending");
  assert.notEqual(pending.status, 0);
  assert.equal(pending.pending, true);
  assert.equal(pending.commands.length, 0);
  const failed = simulate("old-report", { DEPLOY_IMAGE: "example/app:latest" });
  assert.notEqual(failed.status, 0);
  assert.equal(failed.attemptReport, false);
  assert.match(failed.report, /verified/u);
});

test("update and rollback reuse the selected Compose files without changing parameter env", () => {
  const result = simulate("verify-fails", { IMAGE_VARIABLE: "API_IMAGE" });
  assert.equal(result.status, 1);
  assert.match(result.report, /failed-restored/u);
  assert.equal(result.paramsUnchanged, true);
  const calls = result.commands.filter((c) => c.args[0] === "compose");
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.deepEqual(call.args.slice(0, 5), [
      "compose",
      "--env-file",
      "production params.env",
      "-f",
      "compose.yaml",
    ]);
  }
  assert.deepEqual(
    calls.filter((c) => c.args.includes("up")).map((c) => c.image),
    [image, oldImage]
  );
});

test("missing parameter file and invalid image variable stop before Docker operations", () => {
  for (const result of [
    simulate("success", { COMPOSE_ENV_FILE: "missing.env" }),
    simulate("success", { IMAGE_VARIABLE: "PATH" }),
    simulate("success", { IMAGE_VARIABLE: "DEPLOY_IMAGE" }),
    simulate("success", { IMAGE_VARIABLE: "API_IMAGE;echo injected" }),
  ]) {
    assert.notEqual(result.status, 0);
    assert.equal(result.commands.length, 0);
  }
});

test(
  "real Compose resolves parameter env and business env separately with a digest override",
  {
    skip: spawnSync("docker", ["compose", "version"]).status !== 0,
  },
  () => {
    const dir = mkdtempSync(path.join(tmpdir(), "compose config test "));
    try {
      mkdirSync(path.join(dir, "apps/api"), { recursive: true });
      const params = `COMPOSE_PROJECT_NAME=example-production\nAPI_IMAGE=${oldImage}\nAPI_PORT=3100\nAPI_RUNTIME_ENV=./apps/api/.env\n`;
      const business =
        "DATABASE_URL=postgres://example/db\nLITERAL='$(touch should-not-exist)'\n";
      writeFileSync(path.join(dir, "production params.env"), params);
      writeFileSync(path.join(dir, "apps/api/.env"), business);
      writeFileSync(
        path.join(dir, "docker-compose.yml"),
        `services:\n  api:\n    image: \${API_IMAGE:?}\n    env_file:\n      - \${API_RUNTIME_ENV:?}\n    ports:\n      - "127.0.0.1:\${API_PORT}:3000"\n`
      );
      const env = { ...process.env };
      delete env.COMPOSE_PROJECT_NAME;
      delete env.API_IMAGE;
      delete env.API_PORT;
      delete env.API_RUNTIME_ENV;
      for (const target of [image, oldImage]) {
        const result = spawnSync(
          "docker",
          [
            "compose",
            "--env-file",
            "production params.env",
            "-f",
            "docker-compose.yml",
            "config",
            "--format",
            "json",
          ],
          {
            cwd: dir,
            encoding: "utf-8",
            env: { ...env, API_IMAGE: target },
          }
        );
        assert.equal(result.status, 0, result.stderr);
        const config = JSON.parse(result.stdout);
        assert.equal(config.name, "example-production");
        assert.equal(config.services.api.image, target);
        assert.equal(config.services.api.ports[0].published, "3100");
        assert.equal(
          config.services.api.environment.DATABASE_URL,
          "postgres://example/db"
        );
        // config 会把字面 $ 转义为 $$；核验值保留且没有执行其中的命令。
        assert.equal(
          config.services.api.environment.LITERAL.replaceAll("$$", "$"),
          "$(touch should-not-exist)"
        );
      }
      assert.equal(
        readFileSync(path.join(dir, "production params.env"), "utf-8"),
        params
      );
      assert.equal(
        readFileSync(path.join(dir, "apps/api/.env"), "utf-8"),
        business
      );
      assert.equal(existsSync(path.join(dir, "should-not-exist")), false);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  }
);

test("stale target fails the final check without updating a container", () => {
  const result = simulate("stale-target");
  assert.notEqual(result.status, 0);
  assert.equal(result.pending, false);
  assert.equal(
    result.commands.some((entry) => entry.args.includes("up")),
    false
  );
});
