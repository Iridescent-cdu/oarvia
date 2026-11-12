// Loaded only from the trusted workflow revision, never from PR-head code.
const stable = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const fullSha = /^[a-f0-9]{40}$/u;

export const compareVersions = (a, b) => {
  if (!stable.test(a) || !stable.test(b)) {
    throw new Error("Expected canonical stable SemVer");
  }
  const x = a.split(".").map(BigInt);
  const y = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) {
      return x[i] > y[i] ? 1 : -1;
    }
  }
  return 0;
};

export const releaseIntent = (pr) => {
  const exact = pr.title.match(
    /^🚀\s+release:\s*v(?<version>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/u
  );
  if (exact) {
    return { version: exact[1] };
  }
  if (
    /^🚀\s+release:/u.test(pr.title) &&
    !/^🚀\s+release:\s*\d{8}$/u.test(pr.title)
  ) {
    throw new Error(
      "Malformed release title: use a stable vX.Y.Z or an eight-digit weekly date"
    );
  }
  const patch =
    /^(?:release|hotfix)\//u.test(pr.head.ref) ||
    /^(?:(?:💄|✨|🐛|♻️|🩹|👷)\s*)?(?:style|feat|fix|refactor|hotfix|build)(?:\([^)]*\))?:/u.test(
      pr.title
    );
  return patch ? {} : null;
};

const eligible = (pr, repo) =>
  pr.base.ref === "main" &&
  pr.head.repo?.full_name.toLowerCase() ===
    `${repo.owner}/${repo.repo}`.toLowerCase();

const checkSha = (sha) => {
  if (!fullSha.test(sha)) {
    throw new Error("Expected a complete source SHA");
  }
  return sha;
};

const optional = async (call) => {
  try {
    const response = await call();
    return response.data;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
};

const packageAt = async (github, repo, sha) => {
  const { data } = await github.rest.repos.getContent({
    ...repo,
    path: "package.json",
    ref: checkSha(sha),
  });
  if (
    Array.isArray(data) ||
    data.encoding !== "base64" ||
    typeof data.content !== "string"
  ) {
    throw new Error("Expected an ordinary root package.json file");
  }
  const pkg = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  if (!stable.test(pkg.version)) {
    throw new Error("Root package.json must contain a stable version");
  }
  return pkg;
};

const contained = async (github, repo, ancestor, head) => {
  if (ancestor === head) {
    return true;
  }
  const { data } = await github.rest.repos.compareCommitsWithBasehead({
    ...repo,
    basehead: `${checkSha(ancestor)}...${checkSha(head)}`,
  });
  return data.status === "ahead" || data.status === "identical";
};

export const latestStable = async (github, repo, baseSha) => {
  const refs = await github.paginate(github.rest.git.listMatchingRefs, {
    ...repo,
    ref: "tags/v",
  });
  const versions = refs
    .map((ref) => ref.ref.slice("refs/tags/v".length))
    .filter((v) => stable.test(v));
  versions.sort((a, b) => compareVersions(b, a));
  const findReachable = async (index) => {
    const version = versions[index];
    if (!version) {
      return null;
    }
    const { data: commit } = await github.rest.repos.getCommit({
      ...repo,
      ref: `tags/v${version}`,
    });
    if (await contained(github, repo, commit.sha, baseSha)) {
      return { sha: commit.sha, version };
    }
    return findReachable(index + 1);
  };
  return findReachable(0);
};

const desiredVersion = (intent, latest) => {
  if (!intent.version && !latest) {
    throw new Error("The first release needs an explicit version title");
  }
  const version =
    intent.version ??
    latest.version.replace(/\d+$/u, (p) => String(BigInt(p) + 1n));
  if (latest && compareVersions(version, latest.version) <= 0) {
    throw new Error("Version is not newer than its release baseline");
  }
  return version;
};

const ensureSettled = (base, latest) => {
  if (latest && base.version !== latest.version) {
    throw new Error(
      "Main has an unfinalized version; recover that release before preparing another"
    );
  }
};

const ensurePublishedBaseline = async (github, repo, latest) => {
  if (!latest) {
    return;
  }
  const release = await optional(() =>
    github.rest.repos.getReleaseByTag({ ...repo, tag: `v${latest.version}` })
  );
  if (
    !release ||
    release.draft ||
    release.prerelease ||
    !release.body?.trim()
  ) {
    throw new Error(
      "The baseline tag has no complete published Release; recover it first"
    );
  }
};

const planPath = ".github/release.json";
const planAt = async (github, repo, sha) => {
  const file = await optional(() =>
    github.rest.repos.getContent({
      ...repo,
      path: planPath,
      ref: checkSha(sha),
    })
  );
  if (!file) {
    return null;
  }
  if (file.encoding !== "base64" || typeof file.content !== "string") {
    throw new Error("Invalid release plan file");
  }
  return JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
};
const samePlan = (a, b) =>
  a &&
  b &&
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(b).every((key) => a[key] === b[key]);
const frozenPlan = (plan, repo, pr, baseSha) => {
  if (
    plan.schema !== 1 ||
    plan.repository !== `${repo.owner}/${repo.repo}` ||
    plan.pull_number !== pr.number ||
    plan.base_sha !== baseSha ||
    !["patch", "explicit"].includes(plan.mode) ||
    !stable.test(plan.version)
  ) {
    throw new Error(
      "Frozen release plan does not match the merged PR and base"
    );
  }
  if (typeof plan.notes !== "string" || !plan.notes.trim()) {
    throw new Error("Release notes must not be empty");
  }
  return plan.mode === "explicit" ? { version: plan.version } : {};
};
const requireReadiness = async (github, repo, pr, expectedAppId) => {
  if (!Number.isSafeInteger(expectedAppId) || expectedAppId < 1) {
    throw new Error("Expected the release App ID");
  }
  const checks = await github.paginate(github.rest.checks.listForRef, {
    ...repo,
    check_name: "Release Ready",
    filter: "all",
    ref: pr.head.sha,
  });
  const [latest] = checks
    .filter(
      (c) =>
        c.name === "Release Ready" &&
        c.head_sha === pr.head.sha &&
        c.app?.id === expectedAppId
    )
    .toSorted((a, b) => b.id - a.id);
  if (latest?.status !== "completed" || latest.conclusion !== "success") {
    throw new Error(
      "Merged PR has no successful readiness check from the release App"
    );
  }
};

const writeVersion = async ({ github, core, repo, pr, intent }) => {
  const { data: main } = await github.rest.repos.getBranch({
    ...repo,
    branch: "main",
  });
  const baseSha = checkSha(main.commit.sha);
  if (!(await contained(github, repo, baseSha, pr.head.sha))) {
    throw new Error(
      "Release source must contain current main; synchronize before preparing"
    );
  }
  const latest = await latestStable(github, repo, baseSha);
  ensureSettled(await packageAt(github, repo, baseSha), latest);
  await ensurePublishedBaseline(github, repo, latest);
  const version = desiredVersion(intent, latest);
  const occupied = await optional(() =>
    github.rest.repos.getCommit({ ...repo, ref: `tags/v${version}` })
  );
  if (occupied) {
    throw new Error("Target version tag is already occupied");
  }
  const pkg = await packageAt(github, repo, pr.head.sha);
  if (!pr.body?.trim()) {
    throw new Error("Release notes must not be empty");
  }
  const plan = {
    base_sha: baseSha,
    mode: intent.version ? "explicit" : "patch",
    notes: pr.body.trim(),
    pull_number: pr.number,
    repository: `${repo.owner}/${repo.repo}`,
    schema: 1,
    title: pr.title,
    version,
  };
  const existingPlan = await planAt(github, repo, pr.head.sha);
  core.setOutput("version", version);
  if (pkg.version === version && samePlan(existingPlan, plan)) {
    return { sha: pr.head.sha, updated: false, version };
  }
  pkg.version = version;
  // expectedHeadOid makes the version update an atomic compare-and-swap.
  const result = await github.graphql(
    `mutation($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) { commit { oid } }
  }`,
    {
      input: {
        branch: {
          branchName: pr.head.ref,
          repositoryNameWithOwner: `${repo.owner}/${repo.repo}`,
        },
        expectedHeadOid: checkSha(pr.head.sha),
        fileChanges: {
          additions: [
            {
              contents: Buffer.from(
                `${JSON.stringify(pkg, null, 2)}\n`
              ).toString("base64"),
              path: "package.json",
            },
            {
              contents: Buffer.from(
                `${JSON.stringify(plan, null, 2)}\n`
              ).toString("base64"),
              path: planPath,
            },
          ],
        },
        message: { headline: `🔖 chore(release): release version v${version}` },
      },
    }
  );
  const committed = checkSha(result.createCommitOnBranch.commit.oid);
  core.setOutput("commit", committed);
  return { sha: committed, updated: true, version };
};

const unchangedVersion = async (github, repo, pr) => {
  const { data: main } = await github.rest.repos.getBranch({
    ...repo,
    branch: "main",
  });
  const base = await packageAt(github, repo, main.commit.sha);
  const head = await packageAt(github, repo, pr.head.sha);
  if (head.version !== base.version) {
    throw new Error("A non-release PR cannot change the root version");
  }
  const basePlan = await planAt(github, repo, main.commit.sha);
  const headPlan = await planAt(github, repo, pr.head.sha);
  if (
    !(basePlan === null && headPlan === null) &&
    !samePlan(basePlan, headPlan)
  ) {
    throw new Error("A non-release PR cannot change the frozen release plan");
  }
  return { sha: pr.head.sha, updated: false, version: head.version };
};

export const prepare = async ({ github, context, core }) => {
  const { repo } = context;
  const { data: pr } = await github.rest.pulls.get({
    ...repo,
    pull_number: context.payload.pull_request.number,
  });
  if (pr.state !== "open" || !eligible(pr, repo)) {
    return;
  }
  const { data: check } = await github.rest.checks.create({
    ...repo,
    head_sha: checkSha(pr.head.sha),
    name: "Release Ready",
    status: "in_progress",
  });
  try {
    const intent = releaseIntent(pr);
    const prepared = intent
      ? await writeVersion({ core, github, intent, pr, repo })
      : await unchangedVersion(github, repo, pr);
    const output = {
      summary: `Version ${prepared.version}, source ${prepared.sha}`,
      title: "Version metadata validated",
    };
    await github.rest.checks.update({
      ...repo,
      check_run_id: check.id,
      conclusion: prepared.updated ? "action_required" : "success",
      output,
      status: "completed",
    });
    if (prepared.updated) {
      await github.rest.checks.create({
        ...repo,
        conclusion: "success",
        head_sha: prepared.sha,
        name: "Release Ready",
        output,
        status: "completed",
      });
    }
  } catch (error) {
    await github.rest.checks.update({
      ...repo,
      check_run_id: check.id,
      conclusion: "failure",
      output: {
        summary: error.message,
        title: "Version metadata is not ready",
      },
      status: "completed",
    });
    throw error;
  }
};

const publicationPlan = async ({
  github,
  repo,
  pr,
  sha,
  baseSha,
  pullNumber,
  eventPr,
}) => {
  const plan = await planAt(github, repo, sha);
  if (!plan || plan.pull_number !== pr.number) {
    if (pullNumber) {
      throw new Error("Recovery PR does not describe a release");
    }
    const baseline = await planAt(github, repo, baseSha);
    const unchanged =
      (plan === null && baseline === null) || samePlan(plan, baseline);
    if (unchanged && !releaseIntent(eventPr)) {
      const base = await packageAt(github, repo, baseSha);
      const mergedPackage = await packageAt(github, repo, sha);
      if (base.version !== mergedPackage.version) {
        throw new Error("A non-release merge changed the root version");
      }
      return null;
    }
    throw new Error("Merged release has no matching frozen plan");
  }
  if (!pullNumber) {
    const intent = releaseIntent(eventPr);
    if (
      !intent ||
      eventPr.title !== plan.title ||
      (intent.version ? "explicit" : "patch") !== plan.mode ||
      (intent.version && intent.version !== plan.version) ||
      eventPr.body?.trim() !== plan.notes
    ) {
      throw new Error(
        "Merge-event metadata differs from the frozen plan; explicitly recover the frozen release after review"
      );
    }
  }
  return plan;
};

const publication = async ({ github, context, pullNumber, expectedAppId }) => {
  const { repo } = context;
  const { data: pr } = await github.rest.pulls.get({
    ...repo,
    pull_number: pullNumber ?? context.payload.pull_request.number,
  });
  if (!pr.merged || !eligible(pr, repo)) {
    if (pullNumber) {
      throw new Error(
        "Recovery requires a merged same-repository PR targeting main"
      );
    }
    return;
  }
  const sha = checkSha(pr.merge_commit_sha);
  const { data: merge } = await github.rest.repos.getCommit({
    ...repo,
    ref: sha,
  });
  const baseSha = checkSha(merge.parents?.[0]?.sha);
  const plan = await publicationPlan({
    baseSha,
    eventPr: context.payload.pull_request,
    github,
    pr,
    pullNumber,
    repo,
    sha,
  });
  if (!plan) {
    return;
  }
  await requireReadiness(github, repo, pr, expectedAppId);
  const intent = frozenPlan(plan, repo, pr, baseSha);
  const { data: main } = await github.rest.repos.getBranch({
    ...repo,
    branch: "main",
  });
  if (!(await contained(github, repo, sha, main.commit.sha))) {
    throw new Error("Merged source is not on main");
  }
  const latest = await latestStable(github, repo, baseSha);
  ensureSettled(await packageAt(github, repo, baseSha), latest);
  await ensurePublishedBaseline(github, repo, latest);
  const expected = desiredVersion(intent, latest);
  const pkg = await packageAt(github, repo, sha);
  if (pkg.version !== expected) {
    throw new Error(
      `Merged version ${pkg.version} differs from expected ${expected}`
    );
  }
  if (plan.version !== expected) {
    throw new Error(
      "Frozen plan version differs from the expected release version"
    );
  }
  const tag = `v${expected}`;
  return {
    expected,
    mainSha: main.commit.sha,
    notes: plan.notes,
    repo,
    sha,
    tag,
  };
};

const ensureTag = async (github, repo, tag, sha) => {
  let tagged = await optional(() =>
    github.rest.repos.getCommit({ ...repo, ref: `tags/${tag}` })
  );
  if (tagged && tagged.sha !== sha) {
    throw new Error("Tag belongs to another commit");
  }
  if (!tagged) {
    try {
      await github.rest.git.createRef({
        ...repo,
        ref: `refs/tags/${tag}`,
        sha,
      });
    } catch (error) {
      if (error.status !== 422) {
        throw error;
      }
    }
    const response = await github.rest.repos.getCommit({
      ...repo,
      ref: `tags/${tag}`,
    });
    tagged = response.data;
    if (tagged.sha !== sha) {
      throw new Error("Concurrent tag creation changed source identity");
    }
  }
};

const ensureRelease = async (
  github,
  { repo, notes, sha, tag, expected, mainSha }
) => {
  let release = await optional(() =>
    github.rest.repos.getReleaseByTag({ ...repo, tag })
  );
  if (!release) {
    const current = await latestStable(github, repo, mainSha);
    try {
      const response = await github.rest.repos.createRelease({
        ...repo,
        body: notes,
        draft: false,
        make_latest: current?.version === expected ? "true" : "false",
        name: `🚀 Release ${tag}`,
        prerelease: false,
        tag_name: tag,
        target_commitish: sha,
      });
      release = response.data;
    } catch (error) {
      if (error.status !== 422) {
        throw error;
      }
      const response = await github.rest.repos.getReleaseByTag({
        ...repo,
        tag,
      });
      release = response.data;
    }
  }
  return release;
};

export const publish = async (args) => {
  const state = await publication(args);
  if (!state) {
    return;
  }
  const { repo, sha, tag, expected } = state;
  await ensureTag(args.github, repo, tag, sha);
  const release = await ensureRelease(args.github, state);
  const { core, github } = args;
  const response = await github.rest.repos.getCommit({
    ...repo,
    ref: `tags/${tag}`,
  });
  const finalTag = response.data;
  if (
    finalTag.sha !== sha ||
    release.tag_name !== tag ||
    release.draft ||
    release.prerelease ||
    !release.body?.trim() ||
    release.body.trim() !== state.notes.trim()
  ) {
    throw new Error(
      "Release read-back did not confirm the expected published identity"
    );
  }
  for (const [key, value] of Object.entries({
    release_url: release.html_url,
    sha,
    tag,
    version: expected,
  })) {
    core.setOutput(key, value);
  }
};
