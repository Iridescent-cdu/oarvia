import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const revisionKey = "org.opencontainers.image.revision";
const versionKey = "org.opencontainers.image.version";
const sourceKey = "org.opencontainers.image.source";
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const shaPattern = /^[a-f0-9]{40}$/u;
const versionPattern =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<channel>canary|beta)\.(?<sequence>0|[1-9]\d*))?$/u;

export const parseVersion = (value) => {
  const match = value.match(versionPattern);
  if (!match) {
    throw new Error("Unsupported canonical release version");
  }
  return {
    channel: match[4] ?? "latest",
    parts: match.slice(1, 4).map(BigInt),
    sequence: BigInt(match[5] ?? 0),
    version: value,
  };
};

const validateReleaseEvent = (event, sha, parsed) => {
  const expected =
    event.inputs?.expected_sha || event.release?.target_commitish;
  if (event.inputs?.expected_sha && !shaPattern.test(expected)) {
    throw new Error("Expected a complete source SHA");
  }
  if (expected && shaPattern.test(expected) && expected !== sha) {
    throw new Error("Tag and expected source differ");
  }
  if (
    event.release &&
    (event.release.draft ||
      event.release.prerelease !== (parsed.channel !== "latest"))
  ) {
    throw new Error("Release channel does not match its tag");
  }
};

export const resolveSource = async ({ github, context, core }) => {
  const event = context.payload;
  const tag = event.release?.tag_name ?? event.inputs?.tag;
  if (typeof tag !== "string" || !tag.startsWith("v")) {
    throw new Error("Expected an existing version tag");
  }
  const parsed = parseVersion(tag.slice(1));
  const { data: commit } = await github.rest.repos.getCommit({
    ...context.repo,
    ref: `tags/${tag}`,
  });
  if (!shaPattern.test(commit.sha)) {
    throw new Error("Expected a complete tag SHA");
  }
  validateReleaseEvent(event, commit.sha, parsed);
  const branch = parsed.channel === "latest" ? "main" : "canary";
  const { data: target } = await github.rest.repos.getBranch({
    ...context.repo,
    branch,
  });
  if (commit.sha !== target.commit.sha) {
    const { data: comparison } =
      await github.rest.repos.compareCommitsWithBasehead({
        ...context.repo,
        basehead: `${commit.sha}...${target.commit.sha}`,
      });
    if (!["ahead", "identical"].includes(comparison.status)) {
      throw new Error("Tag does not belong to its release branch");
    }
  }
  for (const [key, value] of Object.entries({
    channel: parsed.channel,
    sha: commit.sha,
    tag,
    version: parsed.version,
  })) {
    core.setOutput(key, value);
  }
};

export const validateIdentity = (manifest, identity) => {
  if (!digestPattern.test(manifest.digest)) {
    throw new Error("Registry returned an invalid digest");
  }
  const annotations = manifest.annotations ?? {};
  if (
    annotations[revisionKey] !== identity.sha ||
    annotations[versionKey] !== identity.version ||
    annotations[sourceKey] !== identity.source
  ) {
    throw new Error(
      "Existing image identity differs from the requested release"
    );
  }
  const platforms = new Set(
    (manifest.manifests ?? []).map(
      (m) => `${m.platform?.os}/${m.platform?.architecture}`
    )
  );
  for (const platform of ["linux/amd64", "linux/arm64"]) {
    if (!platforms.has(platform)) {
      throw new Error(`Missing required platform ${platform}`);
    }
  }
  return manifest.digest;
};

export const newer = (a, b) => {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (x.channel !== y.channel) {
    throw new Error("Channel identity differs");
  }
  for (let i = 0; i < 3; i += 1) {
    if (x.parts[i] !== y.parts[i]) {
      return x.parts[i] > y.parts[i];
    }
  }
  return x.sequence > y.sequence;
};

const docker = (args) =>
  execFileSync("docker", ["buildx", "imagetools", ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });

export const dockerHubReader = async (
  image,
  { username, password, fetchImpl = fetch } = {}
) => {
  const repository = image.replace(
    /^(?:docker\.io|registry-1\.docker\.io)\//u,
    ""
  );
  if (!/^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9._-]*$/u.test(repository)) {
    throw new Error("This adapter expects a Docker Hub namespace/image");
  }
  if (Boolean(username) !== Boolean(password)) {
    throw new Error("Incomplete registry credentials");
  }
  const headers = {};
  if (username) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }
  const tokenResponse = await fetchImpl(
    `https://auth.docker.io/token?service=registry.docker.io&scope=${encodeURIComponent(`repository:${repository}:pull`)}`,
    {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!tokenResponse.ok) {
    throw new Error(
      `Registry authentication failed: HTTP ${tokenResponse.status}`
    );
  }
  const { token } = await tokenResponse.json();
  let claims;
  try {
    claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf-8")
    );
  } catch {
    throw new Error("Registry did not provide verifiable pull authorization");
  }
  // These claims come directly from Docker Hub over TLS; never accept a caller-supplied token.
  if (
    !claims.access?.some(
      (a) =>
        a.type === "repository" &&
        a.name === repository &&
        a.actions?.includes("pull")
    )
  ) {
    throw new Error(
      "Registry token does not grant pull access to this repository"
    );
  }
  return async (ref) => {
    if (!ref.startsWith(`${image}:`)) {
      throw new Error("Registry reference escaped the configured image");
    }
    const tag = ref.slice(image.length + 1);
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u.test(tag)) {
      throw new Error("Invalid registry tag");
    }
    const response = await fetchImpl(
      `https://registry-1.docker.io/v2/${repository}/manifests/${tag}`,
      {
        headers: {
          Accept:
            "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
          Authorization: `Bearer ${token}`,
        },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        `Registry manifest lookup failed: HTTP ${response.status}`
      );
    }
    return {
      ...(await response.json()),
      digest: response.headers.get("docker-content-digest"),
    };
  };
};

const promoteChannel = async ({
  image,
  identity,
  digest,
  channelName,
  read,
  run,
}) => {
  const channel = await read(`${image}:${channelName}`);
  let state = "current";
  if (channel?.digest !== digest) {
    if (channel) {
      const prior = channel.annotations ?? {};
      if (
        prior[sourceKey] !== identity.source ||
        !shaPattern.test(prior[revisionKey] ?? "")
      ) {
        throw new Error("Cannot verify the existing channel owner");
      }
      const priorVersion = prior[versionKey];
      parseVersion(priorVersion ?? "");
      if (priorVersion === identity.version) {
        throw new Error("Channel has conflicting bytes for the same version");
      }
      if (newer(priorVersion, identity.version)) {
        state = "superseded";
      }
    }
    if (state !== "superseded") {
      run(["create", "--tag", `${image}:${channelName}`, `${image}@${digest}`]);
      const promoted = await read(`${image}:${channelName}`);
      if (!promoted || validateIdentity(promoted, identity) !== digest) {
        throw new Error(
          "Channel promotion did not preserve the verified digest"
        );
      }
    }
  }
  return state;
};

export const releaseImage = async ({
  mode,
  image,
  sha,
  version,
  source,
  builtDigest,
  run = docker,
  read,
}) => {
  if (
    !/^[a-z0-9][a-z0-9./_:-]*\/[a-z0-9][a-z0-9._/-]*$/u.test(image) ||
    image.includes("@") ||
    image.split("/").at(-1).includes(":")
  ) {
    throw new Error("Expected a registry image path without a tag");
  }
  if (
    !shaPattern.test(sha) ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(source)
  ) {
    throw new Error("Invalid source identity");
  }
  const parsed = parseVersion(version);
  const identity = { sha, source, version };
  if (!read) {
    throw new Error("An authenticated registry reader is required");
  }
  const existing = await read(`${image}:${version}`);
  if (!existing) {
    if (mode !== "lookup") {
      throw new Error("Published version is missing from the registry");
    }
    return { exists: false };
  }
  const digest = validateIdentity(existing, identity);
  if (mode === "lookup") {
    return { digest, exists: true };
  }
  if (mode !== "verify") {
    throw new Error("Unsupported release image mode");
  }
  if (builtDigest && digest !== builtDigest) {
    throw new Error("Version tag differs from the checked build digest");
  }
  const state = await promoteChannel({
    channelName: parsed.channel,
    digest,
    identity,
    image,
    read,
    run,
  });
  return {
    channel: parsed.channel,
    channel_state: state,
    digest,
    exists: true,
    image,
    platforms: ["linux/amd64", "linux/arm64"],
    sha,
    version,
  };
};

export const cli = async (env = process.env, mode = process.argv[2]) => {
  if (mode === "workspace") {
    const root = realpathSync(env.SOURCE_DIRECTORY);
    const file = realpathSync(path.resolve(root, env.DOCKERFILE));
    if (!file.startsWith(root + path.sep)) {
      throw new Error("Dockerfile escapes the source directory");
    }
    const pkg = JSON.parse(
      readFileSync(path.resolve(root, "package.json"), "utf-8")
    );
    if (pkg.version !== env.RELEASE_VERSION) {
      throw new Error("Source package version differs from release version");
    }
    return { checked: true };
  }
  let result;
  try {
    const read = await dockerHubReader(env.REGISTRY_IMAGE, {
      password: env.REGISTRY_PASSWORD,
      username: env.REGISTRY_USER,
    });
    result = await releaseImage({
      builtDigest: env.BUILD_DIGEST,
      image: env.REGISTRY_IMAGE,
      mode,
      read,
      sha: env.SOURCE_SHA,
      source: env.SOURCE_REPOSITORY,
      version: env.RELEASE_VERSION,
    });
  } catch (error) {
    if (mode === "verify") {
      writeFileSync(
        `${env.RUNNER_TEMP}/container-delivery.json`,
        `${JSON.stringify(
          {
            error: error.message,
            image: env.REGISTRY_IMAGE,
            run_id: env.GITHUB_RUN_ID,
            sha: env.SOURCE_SHA,
            state: "incomplete",
            version: env.RELEASE_VERSION,
          },
          null,
          2
        )}\n`
      );
    }
    throw error;
  }
  for (const [key, value] of Object.entries(result)) {
    if (env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  }
  if (mode === "verify") {
    const receipt = {
      ...result,
      run_attempt: env.GITHUB_RUN_ATTEMPT,
      run_id: env.GITHUB_RUN_ID,
    };
    writeFileSync(
      `${env.RUNNER_TEMP}/container-delivery.json`,
      `${JSON.stringify(receipt, null, 2)}\n`
    );
  }
  return result;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await cli();
}
