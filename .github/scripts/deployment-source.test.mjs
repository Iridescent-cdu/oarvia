import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeployment, verifyReceipt } from "./deployment-source.mjs";

const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const image = "example/oarvia";
const source = "https://github.com/example/oarvia";
const manifest = {
  annotations: {
    "org.opencontainers.image.revision": sha,
    "org.opencontainers.image.source": source,
    "org.opencontainers.image.version": "1.0.0",
  },
  digest,
  manifests: ["amd64", "arm64"].map((architecture) => ({
    platform: { architecture, os: "linux" },
  })),
};
const receipt = {
  channel: "latest",
  channel_state: "current",
  digest,
  exists: true,
  image,
  run_attempt: "2",
  run_id: "123",
  sha,
  version: "1.0.0",
};
const args = {
  image,
  read: () => manifest,
  receipt,
  runAttempt: "2",
  runId: "123",
  sha,
  source,
  target: "production",
  version: "1.0.0",
};

test("verified receipt resolves to the exact delivered digest", async () => {
  assert.equal(await verifyReceipt(args), `${image}@${digest}`);
});

test("incomplete, wrong-run, altered and stale receipts cannot deploy", async () => {
  await Promise.all(
    [
      { state: "incomplete" },
      { run_id: "124" },
      { run_attempt: "1" },
      { digest: `sha256:${"c".repeat(64)}` },
      { sha: "c".repeat(40) },
      { image: "other/image" },
      { channel_state: "superseded" },
    ].map((patch) =>
      assert.rejects(
        verifyReceipt({ ...args, receipt: { ...receipt, ...patch } })
      )
    )
  );
  await assert.rejects(
    verifyReceipt({
      ...args,
      read: (ref) =>
        ref.endsWith(":latest")
          ? { ...manifest, digest: `sha256:${"c".repeat(64)}` }
          : manifest,
    })
  );
  await assert.rejects(verifyReceipt({ ...args, read: () => null }));
});

test("delivery source requires successful trusted workflow and current artifact attempt", async () => {
  const run = {
    conclusion: "success",
    event: "release",
    path: ".github/workflows/release-docker.yml",
    repository: { full_name: "example/oarvia" },
    run_attempt: 2,
  };
  const artifact = { expired: false, id: 7, name: "container-delivery-123-2" };
  const context = {
    payload: { inputs: { delivery_run: "123", tag: "v1.0.0" } },
    repo: { owner: "example", repo: "oarvia" },
  };
  const outputs = {};
  const github = {
    paginate: () => [artifact],
    rest: {
      actions: {
        getWorkflowRun: () => ({ data: run }),
        listWorkflowRunArtifacts: () => {},
      },
      repos: {
        getBranch: () => ({ data: { commit: { sha } } }),
        getCommit: () => ({ data: { sha } }),
      },
    },
  };
  const invoke = () =>
    resolveDeployment({
      context,
      core: {
        setOutput: (k, v) => {
          outputs[k] = v;
        },
      },
      github,
    });
  await invoke();
  assert.equal(outputs.sha, sha);
  assert.equal(outputs.artifact_id, "7");
  artifact.expired = true;
  await assert.rejects(invoke());
  artifact.expired = false;
  run.conclusion = "failure";
  await assert.rejects(invoke());
  run.conclusion = "success";
  run.path = ".github/workflows/untrusted.yml";
  await assert.rejects(invoke());
});
