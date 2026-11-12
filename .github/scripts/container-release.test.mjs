import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseVersion,
  resolveSource,
  validateIdentity,
  releaseImage,
  dockerHubReader,
  newer,
  cli,
} from "./container-release.mjs";

const sha = "a".repeat(40);
const digest = `sha256:${"a".repeat(64)}`;
const image = "example/app";
const source = "https://github.com/example/app";
const identity = { sha, source, version: "1.2.4" };
const manifest = (version = "1.2.4", hash = digest, revision = sha) => ({
  annotations: {
    "org.opencontainers.image.revision": revision,
    "org.opencontainers.image.source": source,
    "org.opencontainers.image.version": version,
  },
  digest: hash,
  manifests: ["amd64", "arm64"].map((architecture) => ({
    platform: { architecture, os: "linux" },
  })),
});
const registry = ({
  version = manifest(),
  channel = null,
  badPromotion = false,
} = {}) => {
  const values = new Map();
  if (version) {
    values.set(
      `${image}:${version.annotations["org.opencontainers.image.version"]}`,
      version
    );
  }
  if (channel) {
    values.set(`${image}:latest`, channel);
  }
  const writes = [];
  const run = (args) => {
    assert.equal(args[0], "create");
    writes.push(args);
    if (!badPromotion) {
      values.set(args[2], version);
    }
    return "";
  };
  return { read: (ref) => values.get(ref) ?? null, run, values, writes };
};
const resolve = async (payload, { outside = false } = {}) => {
  const outputs = {};
  const github = {
    rest: {
      repos: {
        compareCommitsWithBasehead: () => ({
          data: { status: outside ? "diverged" : "ahead" },
        }),
        getBranch: ({ branch }) => {
          assert.ok(["main", "canary"].includes(branch));
          return { data: { commit: { sha: "b".repeat(40) } } };
        },
        getCommit: ({ ref }) => {
          assert.ok(ref.startsWith("tags/v"));
          return { data: { sha } };
        },
      },
    },
  };
  await resolveSource({
    context: { payload, repo: { owner: "example", repo: "app" } },
    core: {
      setOutput: (k, v) => {
        outputs[k] = v;
      },
    },
    github,
  });
  return outputs;
};

test("stable, canary and beta versions are canonical", () => {
  assert.equal(parseVersion("1.2.4").channel, "latest");
  assert.equal(parseVersion("1.2.4-canary.2").channel, "canary");
  assert.throws(() => parseVersion("01.2.4"), /canonical/u);
  assert.throws(() => parseVersion("1.2.4-beta.01"), /canonical/u);
});
test("manual tag and a normal branch-target Release freeze the tag SHA", async () => {
  const manual = await resolve({ inputs: { tag: "v1.2.4" } });
  const release = await resolve({
    release: {
      prerelease: false,
      tag_name: "v1.2.4",
      target_commitish: "main",
    },
  });
  assert.equal(manual.sha, sha);
  assert.equal(release.sha, sha);
});

test("wrong expected source or release channel stops delivery", async () => {
  await assert.rejects(
    resolve({ inputs: { expected_sha: "b".repeat(40), tag: "v1.2.4" } }),
    /differ/u
  );
  await assert.rejects(
    resolve({ inputs: { expected_sha: "main", tag: "v1.2.4" } }),
    /complete/u
  );
  await assert.rejects(
    resolve({ release: { prerelease: false, tag_name: "v1.2.4-beta.1" } }),
    /channel/u
  );
});
test("tag must belong to the designated release branch", async () => {
  await assert.rejects(
    resolve({ inputs: { tag: "v1.2.4" } }, { outside: true }),
    /release branch/u
  );
});
test("manifest verifies source, version, digest and every required architecture", () => {
  assert.equal(validateIdentity(manifest(), identity), digest);
  const wrong = manifest();
  wrong.manifests.pop();
  assert.throws(() => validateIdentity(wrong, identity), /platform/u);
  assert.throws(
    () => validateIdentity(manifest("1.2.5"), identity),
    /identity/u
  );
  assert.throws(
    () => validateIdentity(manifest("1.2.4", "invalid"), identity),
    /digest/u
  );
});
test("an absent version can be built but an existing mismatch cannot be overwritten", async () => {
  const a = registry({ version: null });
  assert.deepEqual(
    await releaseImage({
      image,
      mode: "lookup",
      ...identity,
      read: a.read,
      run: a.run,
    }),
    { exists: false }
  );
  const b = registry({ version: manifest("1.2.4", digest, "b".repeat(40)) });
  await assert.rejects(
    releaseImage({
      image,
      mode: "lookup",
      ...identity,
      read: b.read,
      run: b.run,
    }),
    /identity/u
  );
  assert.equal(b.writes.length, 0);
});
const httpFixture = ({ status = 404, tokenStatus = 200, pull = true } = {}) => {
  const calls = [];
  const claims = {
    access: pull
      ? [{ actions: ["pull"], name: image, type: "repository" }]
      : [],
  };
  const token = `header.${Buffer.from(JSON.stringify(claims)).toString(
    "base64url"
  )}.signature`;
  const fetchImpl = (url, options) => {
    calls.push({ options, url });
    if (url.startsWith("https://auth.docker.io/")) {
      return {
        json: () => ({ token }),
        ok: tokenStatus === 200,
        status: tokenStatus,
      };
    }
    return {
      headers: { get: () => digest },
      json: () => manifest(),
      ok: status === 200,
      status,
    };
  };
  return { calls, fetchImpl };
};
test("HTTP 404 with confirmed pull authority is an absent version", async () => {
  const h = httpFixture();
  const read = await dockerHubReader(image, { fetchImpl: h.fetchImpl });
  assert.equal(await read(`${image}:1.2.4`), null);
  assert.equal(h.calls.length, 2);
});
test("authentication, permission and throttling errors cannot masquerade as absence", async () => {
  await Promise.all(
    [401, 403, 429, 500].map(async (status) => {
      const h = httpFixture({ status });
      const read = await dockerHubReader(image, { fetchImpl: h.fetchImpl });
      await assert.rejects(
        read(`${image}:1.2.4`),
        new RegExp(`HTTP ${status}`, "u")
      );
    })
  );
  const denied = httpFixture({ pull: false });
  await assert.rejects(
    dockerHubReader(image, { fetchImpl: denied.fetchImpl }),
    /pull access/u
  );
  assert.equal(denied.calls.length, 1);
  const auth = httpFixture({ tokenStatus: 401 });
  await assert.rejects(
    dockerHubReader(image, { fetchImpl: auth.fetchImpl }),
    /authentication/u
  );
});
test("registry reader validates its service before sending credentials", async () => {
  let fetched = false;
  const fetchImpl = () => {
    fetched = true;
    throw new Error("Unexpected request");
  };
  await assert.rejects(
    dockerHubReader("ghcr.io/example/app", {
      fetchImpl,
      password: "secret",
      username: "user",
    }),
    /Docker Hub/u
  );
  assert.equal(fetched, false);
});
test("channel promotion happens only after validating the version digest", async () => {
  const r = registry();
  const result = await releaseImage({
    image,
    mode: "verify",
    ...identity,
    builtDigest: digest,
    read: r.read,
    run: r.run,
  });
  assert.equal(result.digest, digest);
  assert.deepEqual(result.platforms, ["linux/amd64", "linux/arm64"]);
  assert.equal(r.writes.length, 1);
  assert.equal(r.writes[0].at(-1), `${image}@${digest}`);
});
test("repeat delivery reuses the same bytes without another push", async () => {
  const r = registry({ channel: manifest() });
  await releaseImage({
    image,
    mode: "verify",
    ...identity,
    read: r.read,
    run: r.run,
  });
  assert.equal(r.writes.length, 0);
});
test("a changed version pointer fails before promoting a channel", async () => {
  const r = registry();
  await assert.rejects(
    releaseImage({
      image,
      mode: "verify",
      ...identity,
      builtDigest: `sha256:${"b".repeat(64)}`,
      read: r.read,
      run: r.run,
    }),
    /checked build/u
  );
  assert.equal(r.writes.length, 0);
});
test("late delivery never rolls back a newer channel", async () => {
  const r = registry({
    channel: manifest("1.2.5", `sha256:${"b".repeat(64)}`),
  });
  const result = await releaseImage({
    image,
    mode: "verify",
    ...identity,
    read: r.read,
    run: r.run,
  });
  assert.equal(result.channel_state, "superseded");
  assert.equal(r.writes.length, 0);
});
test("same-version channel conflict is not silently replaced", async () => {
  const r = registry({
    channel: manifest("1.2.4", `sha256:${"b".repeat(64)}`),
  });
  await assert.rejects(
    releaseImage({
      image,
      mode: "verify",
      ...identity,
      read: r.read,
      run: r.run,
    }),
    /conflicting bytes/u
  );
  assert.equal(r.writes.length, 0);
});
test("a failed promotion cannot report complete delivery", async () => {
  const r = registry({ badPromotion: true });
  await assert.rejects(
    releaseImage({
      image,
      mode: "verify",
      ...identity,
      read: r.read,
      run: r.run,
    }),
    /promotion/u
  );
});
test("prerelease sequence comparison is numeric and channels cannot mix", () => {
  assert.ok(newer("1.2.4-canary.10", "1.2.4-canary.9"));
  assert.throws(() => newer("1.2.4-beta.1", "1.2.4-canary.1"), /Channel/u);
});
test("workspace metadata must match and Dockerfile cannot escape source", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "container-workspace-"));
  try {
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ version: "1.2.4" })
    );
    writeFileSync(path.join(dir, "Dockerfile"), "FROM scratch");
    assert.deepEqual(
      await cli(
        {
          DOCKERFILE: "Dockerfile",
          RELEASE_VERSION: "1.2.4",
          SOURCE_DIRECTORY: dir,
        },
        "workspace"
      ),
      { checked: true }
    );
    await assert.rejects(
      cli(
        {
          DOCKERFILE: "Dockerfile",
          RELEASE_VERSION: "1.2.5",
          SOURCE_DIRECTORY: dir,
        },
        "workspace"
      ),
      /version/u
    );
    await assert.rejects(
      cli(
        { DOCKERFILE: "../", RELEASE_VERSION: "1.2.4", SOURCE_DIRECTORY: dir },
        "workspace"
      ),
      /escapes/u
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("verification errors produce an incomplete receipt and remain failures", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "container-receipt-"));
  try {
    await assert.rejects(
      cli(
        {
          REGISTRY_IMAGE: "invalid",
          RELEASE_VERSION: "1.2.4",
          RUNNER_TEMP: dir,
          SOURCE_SHA: sha,
        },
        "verify"
      )
    );
    assert.equal(
      JSON.parse(readFileSync(path.join(dir, "container-delivery.json"))).state,
      "incomplete"
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
