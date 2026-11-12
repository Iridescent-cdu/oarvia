import { pathToFileURL } from "node:url";

import {
  dockerHubReader,
  resolveSource,
  validateIdentity,
} from "./container-release.mjs";

export const resolveDeployment = async ({ github, context, core }) => {
  const runId = context.payload.inputs.delivery_run;
  if (!/^[1-9][0-9]*$/u.test(runId ?? "")) {
    throw new Error("Expected a delivery run ID");
  }
  const { data: run } = await github.rest.actions.getWorkflowRun({
    ...context.repo,
    run_id: Number(runId),
  });
  if (
    run.path !== ".github/workflows/release-docker.yml" ||
    run.conclusion !== "success" ||
    run.repository?.full_name !==
      `${context.repo.owner}/${context.repo.repo}` ||
    !["release", "workflow_dispatch"].includes(run.event)
  ) {
    throw new Error("Untrusted or unsuccessful delivery run");
  }
  const outputs = {};
  await resolveSource({
    context,
    core: {
      setOutput: (key, value) => {
        outputs[key] = value;
      },
    },
    github,
  });
  if (outputs.channel !== "latest") {
    throw new Error("Only stable releases are deployed by this workflow");
  }
  const artifacts = await github.paginate(
    github.rest.actions.listWorkflowRunArtifacts,
    { ...context.repo, run_id: Number(runId) }
  );
  const matches = artifacts.filter(
    (a) =>
      a.name === `container-delivery-${runId}-${run.run_attempt}` && !a.expired
  );
  if (matches.length !== 1) {
    throw new Error("Expected one current delivery receipt");
  }
  const result = {
    ...outputs,
    artifact_id: String(matches[0].id),
    run_attempt: String(run.run_attempt),
    run_id: runId,
  };
  for (const [key, value] of Object.entries(result)) {
    core.setOutput(key, value);
  }
};

export const verifyRegistryTarget = async ({
  digest,
  image,
  sha,
  version,
  source,
  target,
  read,
}) => {
  const manifest = await read(`${image}:${version}`);
  if (
    !manifest ||
    validateIdentity(manifest, { sha, source, version }) !== digest
  ) {
    throw new Error("Delivered digest no longer matches registry");
  }
  if (target === "production") {
    const latest = await read(`${image}:latest`);
    if (!latest || latest.digest !== digest) {
      throw new Error("Production requires the current stable channel");
    }
  }
  return `${image}@${digest}`;
};

export const verifyReceipt = async ({
  receipt,
  image,
  sha,
  version,
  source,
  runId,
  runAttempt,
  target,
  read,
}) => {
  if (
    !image ||
    receipt.state === "incomplete" ||
    receipt.exists !== true ||
    receipt.channel_state !== "current" ||
    receipt.channel !== "latest" ||
    receipt.image !== image ||
    receipt.sha !== sha ||
    receipt.version !== version ||
    String(receipt.run_id) !== runId ||
    String(receipt.run_attempt) !== runAttempt
  ) {
    throw new Error("Delivery receipt identity mismatch");
  }
  return await verifyRegistryTarget({
    digest: receipt.digest,
    image,
    read,
    sha,
    source,
    target,
    version,
  });
};

export const verifyDeploymentReceipt = async ({ core, env = process.env }) => {
  // 只解析 JSON 回执，不执行交付 artifact 中的代码。
  const { readFileSync } = await import("node:fs");
  const receipt = JSON.parse(
    readFileSync(`${env.RECEIPT_DIR}/container-delivery.json`, "utf-8")
  );
  const read = await dockerHubReader(env.REGISTRY_IMAGE, {
    password: env.DEPLOY_REGISTRY_PASSWORD,
    username: env.DEPLOY_REGISTRY_USER,
  });
  const image = await verifyReceipt({
    image: env.REGISTRY_IMAGE,
    read,
    receipt,
    runAttempt: env.DELIVERY_ATTEMPT,
    runId: env.DELIVERY_RUN,
    sha: env.SOURCE_SHA,
    source: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`,
    target: env.DEPLOY_TARGET,
    version: env.RELEASE_VERSION,
  });
  core.setOutput("image", image);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { env } = process;
  const prefix = `${env.IMAGE_REPOSITORY}@`;
  if (!env.DEPLOY_IMAGE?.startsWith(prefix)) {
    throw new Error("Deployment image differs from configured repository");
  }
  const read = await dockerHubReader(env.IMAGE_REPOSITORY, {
    password: env.DEPLOY_REGISTRY_PASSWORD,
    username: env.DEPLOY_REGISTRY_USER,
  });
  await verifyRegistryTarget({
    digest: env.DEPLOY_IMAGE.slice(prefix.length),
    image: env.IMAGE_REPOSITORY,
    read,
    sha: env.EXPECTED_SHA,
    source: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`,
    target: env.DEPLOY_TARGET,
    version: env.RELEASE_VERSION,
  });
}
