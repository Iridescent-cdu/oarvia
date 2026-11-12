import assert from "node:assert/strict";
import test from "node:test";

import {
  prepare,
  publish,
  releaseIntent,
  compareVersions,
} from "./release.mjs";

const sha = (n) => String(n).repeat(40);
const absent = () => Object.assign(new Error("Missing"), { status: 404 });
const fixture = (options = {}) => {
  const tags = new Map(Object.entries(options.tags ?? { "1.2.3": sha(0) }));
  const releases = new Map();
  if (!options.missingBaselineRelease) {
    releases.set("v1.2.3", {
      body: "Previous stable release",
      draft: false,
      prerelease: false,
      tag_name: "v1.2.3",
    });
  }
  const writes = [];
  const checks = [];
  const outputs = {};
  const pr = {
    base: { ref: "main" },
    body: "Verified release notes",
    head: {
      ref: "release/weekly-20261111",
      repo: { full_name: "example/app" },
      sha: sha(2),
    },
    merge_commit_sha: sha(3),
    merged: false,
    number: 7,
    state: "open",
    title: "🚀 release: 20261111",
    ...options.pr,
  };
  const explicit = pr.title.startsWith("🚀 release: v");
  const releasePlan = {
    base_sha: sha(1),
    mode: explicit ? "explicit" : "patch",
    notes: (pr.body ?? "").trim(),
    pull_number: pr.number,
    repository: "example/app",
    schema: 1,
    title: pr.title,
    version:
      options.planVersion ??
      (explicit ? pr.title.slice("🚀 release: v".length) : "1.2.4"),
  };
  const plans = new Map([
    [sha(1), null],
    [sha(2), options.headPlan ? { ...releasePlan } : null],
    [
      sha(3),
      pr.title.startsWith("📝 docs:") || options.noPlan
        ? null
        : { ...releasePlan, ...options.plan },
    ],
  ]);
  const checkRuns = new Map();
  const contents = new Map([
    [sha(1), options.baseVersion ?? "1.2.3"],
    [sha(2), options.headVersion ?? "1.2.3"],
    [sha(3), options.version ?? "1.2.4"],
  ]);
  const ancestors = new Set([
    `${sha(0)}...${sha(1)}`,
    `${sha(0)}...${sha(3)}`,
    `${sha(1)}...${sha(3)}`,
    `${sha(3)}...${sha(4)}`,
    `${sha(0)}...${sha(4)}`,
  ]);
  if (!options.missingMain) {
    ancestors.add(`${sha(1)}...${sha(2)}`);
  }
  const repo = { owner: "example", repo: "app" };
  const github = {
    graphql: (_query, { input }) => {
      assert.equal(input.expectedHeadOid, pr.head.sha);
      if (options.headChanged) {
        throw new Error("expectedHeadOid no longer matches");
      }
      writes.push(input);
      for (const file of input.fileChanges.additions) {
        const value = JSON.parse(Buffer.from(file.contents, "base64"));
        if (file.path === "package.json") {
          contents.set(sha(5), value.version);
        } else if (file.path === ".github/release.json") {
          plans.set(sha(5), value);
        } else {
          throw new Error("Unexpected atomic commit path");
        }
      }
      pr.head.sha = sha(5);
      ancestors.add(`${sha(1)}...${sha(5)}`);
      return { createCommitOnBranch: { commit: { oid: sha(5) } } };
    },
    paginate: (method) =>
      method === github.rest.checks.listForRef
        ? [
            ...(options.noReadyCheck
              ? []
              : [
                  {
                    app: { id: options.readyAppId ?? 42 },
                    conclusion: options.readyConclusion ?? "success",
                    head_sha: pr.head.sha,
                    id: 0,
                    name: "Release Ready",
                    status: "completed",
                  },
                ]),
            ...checkRuns.values(),
          ]
        : [...tags.keys()].map((v) => ({ ref: `refs/tags/v${v}` })),
    rest: {
      checks: {
        create: (value) => {
          if (options.checksDenied) {
            throw new Error("Missing Checks write permission");
          }
          checks.push(value);
          const id = checks.length;
          checkRuns.set(id, { ...value, app: { id: 42 }, id });
          return { data: { id } };
        },
        listForRef: () => ({}),
        update: (value) => {
          checks.push(value);
          checkRuns.set(value.check_run_id, {
            ...checkRuns.get(value.check_run_id),
            ...value,
          });
          return { data: value };
        },
      },
      git: {
        createRef: ({ ref, sha: commit }) => {
          const v = ref.slice("refs/tags/v".length);
          if (options.tagRace) {
            tags.set(v, sha(9));
            throw Object.assign(new Error("Conflict"), { status: 422 });
          }
          assert.ok(!tags.has(v));
          tags.set(v, commit);
          writes.push({ sha: commit, tag: v });
          return { data: {} };
        },
        listMatchingRefs() {},
      },
      pulls: { get: () => ({ data: pr }) },
      repos: {
        compareCommitsWithBasehead: ({ basehead }) => ({
          data: { status: ancestors.has(basehead) ? "ahead" : "diverged" },
        }),
        createRelease: (input) => {
          if (options.releaseFailure) {
            options.releaseFailure = false;
            throw new Error("Temporary release API failure");
          }
          const value = {
            ...input,
            html_url: `https://github.com/example/app/releases/tag/${input.tag_name}`,
          };
          releases.set(input.tag_name, value);
          writes.push({ release: input });
          return { data: value };
        },
        getBranch: () => ({
          data: {
            commit: { sha: options.mainSha ?? (pr.merged ? sha(3) : sha(1)) },
          },
        }),
        getCommit: ({ ref }) => {
          if (ref.startsWith("tags/v")) {
            const found = tags.get(ref.slice("tags/v".length));
            if (!found) {
              throw absent();
            }
            return { data: { sha: found } };
          }
          return { data: { parents: [{ sha: sha(1) }], sha: ref } };
        },
        getContent: ({ ref, path }) => {
          if (path === ".github/release.json") {
            const plan = plans.get(ref);
            if (!plan) {
              throw absent();
            }
            return {
              data: {
                content: Buffer.from(JSON.stringify(plan)).toString("base64"),
                encoding: "base64",
              },
            };
          }
          assert.ok(contents.has(ref), ref);
          return {
            data: {
              content: Buffer.from(
                JSON.stringify({ name: "app", version: contents.get(ref) })
              ).toString("base64"),
              encoding: "base64",
            },
          };
        },
        getReleaseByTag: ({ tag }) => {
          const found = releases.get(tag);
          if (!found) {
            throw absent();
          }
          return { data: found };
        },
      },
    },
  };
  const context = { payload: { pull_request: structuredClone(pr) }, repo };
  const core = {
    setOutput: (k, v) => {
      outputs[k] = v;
    },
  };
  return {
    checks,
    contents,
    context,
    core,
    expectedAppId: 42,
    github,
    outputs,
    plans,
    pr,
    releases,
    tags,
    writes,
  };
};
const prepared = (options) => fixture(options);
const merged = (options = {}) => {
  const f = fixture(options);
  f.pr.merged = true;
  f.pr.state = "closed";
  return f;
};

test("numeric SemVer and malformed release titles", () => {
  assert.ok(compareVersions("1.10.0", "1.9.9") > 0);
  assert.throws(
    () =>
      releaseIntent({
        head: { ref: "release/test" },
        title: "🚀 release: v01.2.3",
      }),
    /Malformed/u
  );
  assert.throws(
    () =>
      releaseIntent({
        head: { ref: "release/test" },
        title: "🚀 release: v1.2.3-beta.1",
      }),
    /Malformed/u
  );
});
test("prepare atomically freezes the version and release plan", async () => {
  const f = prepared();
  await prepare(f);
  assert.equal(f.outputs.version, "1.2.4");
  assert.deepEqual(
    f.writes[0].fileChanges.additions.map((x) => x.path),
    ["package.json", ".github/release.json"]
  );
  assert.equal(f.writes[0].branch.branchName, f.pr.head.ref);
});
test("already prepared PR is a no-op", async () => {
  const f = prepared({ headPlan: true, headVersion: "1.2.4" });
  await prepare(f);
  assert.equal(f.writes.length, 0);
});
test("unrelated higher tags do not pollute the main release line", async () => {
  const f = prepared({ tags: { "1.2.3": sha(0), "9.0.0": sha(9) } });
  await prepare(f);
  assert.equal(f.outputs.version, "1.2.4");
});
test("first release requires an explicit stable version", async () => {
  await assert.rejects(prepare(prepared({ tags: {} })), /first release/u);
  const f = prepared({ pr: { title: "🚀 release: v0.1.0" }, tags: {} });
  await prepare(f);
  assert.equal(f.outputs.version, "0.1.0");
});
test("explicit minor is preserved", async () => {
  const f = prepared({ pr: { title: "🚀 release: v1.3.0" } });
  await prepare(f);
  assert.equal(f.outputs.version, "1.3.0");
});
test("first release freezes an already prepared initial version without incrementing it", async () => {
  const f = prepared({
    baseVersion: "0.0.0",
    headVersion: "0.1.0",
    pr: { title: "🚀 release: v0.1.0" },
    tags: {},
  });
  await prepare(f);
  assert.equal(f.outputs.version, "0.1.0");
  assert.equal(f.writes.length, 1);
  assert.equal(f.plans.get(sha(5)).version, "0.1.0");
});
test("first finish an unfinalized main release", async () => {
  await assert.rejects(
    prepare(prepared({ baseVersion: "1.2.4" })),
    /unfinalized/u
  );
});
test("a tag without a published baseline Release must be recovered first", async () => {
  await assert.rejects(
    prepare(prepared({ missingBaselineRelease: true })),
    /published Release/u
  );
});
test("occupied version on another branch fails closed", async () => {
  const f = prepared({ tags: { "1.2.3": sha(0), "1.2.4": sha(9) } });
  await assert.rejects(prepare(f), /occupied/u);
});
test("a concurrent head change cannot be overwritten", async () => {
  const f = prepared({ headChanged: true });
  await assert.rejects(prepare(f), /expectedHeadOid/u);
  assert.equal(f.writes.length, 0);
});
test("release preparation rejects a source missing current main", async () => {
  await assert.rejects(
    prepare(prepared({ missingMain: true })),
    /contain current main/u
  );
});
test("manual recovery refuses an unmerged PR", async () => {
  const f = prepared();
  await assert.rejects(publish({ ...f, pullNumber: 7 }), /Recovery requires/u);
});
test("manual recovery refuses a merged non-release PR", async () => {
  const f = merged({ pr: { title: "📝 docs: update guide" } });
  f.pr.head.ref = "docs/guide";
  await assert.rejects(
    publish({ ...f, pullNumber: 7 }),
    /does not describe a release/u
  );
});
test("docs and fork PRs do not write versions", async () => {
  const a = prepared();
  a.pr.title = "📝 docs: update guide";
  a.pr.head.ref = "docs/guide";
  await prepare(a);
  assert.equal(a.writes.length, 0);
  const b = prepared();
  b.pr.head.repo.full_name = "contributor/app";
  await prepare(b);
  assert.equal(b.writes.length, 0);
});
test("publish binds the actual merge SHA and verifies the Release", async () => {
  const f = merged();
  await publish(f);
  assert.equal(f.tags.get("1.2.4"), sha(3));
  assert.equal(f.outputs.sha, sha(3));
  assert.equal(f.releases.get("v1.2.4").target_commitish, sha(3));
});
test("patch may not skip versions even after merge", async () => {
  const f = merged({ version: "1.2.9" });
  await assert.rejects(publish(f), /expected 1.2.4/u);
  assert.equal(f.writes.length, 0);
});
test("explicit title must match merged package version", async () => {
  const f = merged({ pr: { title: "🚀 release: v1.3.0" } });
  await assert.rejects(publish(f), /expected 1.3.0/u);
});
test("empty notes never create a tag", async () => {
  const f = merged({ pr: { body: " " } });
  await assert.rejects(publish(f), /empty/u);
  assert.equal(f.writes.length, 0);
});
test("conflicting existing tag never creates a Release", async () => {
  const f = merged({ tags: { "1.2.3": sha(0), "1.2.4": sha(9) } });
  await assert.rejects(publish(f), /another commit/u);
  assert.equal(f.releases.has("v1.2.4"), false);
});
test("concurrent tag creation is read back before publishing", async () => {
  const f = merged({ tagRace: true });
  await assert.rejects(publish(f), /Concurrent tag/u);
  assert.equal(f.releases.has("v1.2.4"), false);
});
test("recover failure between tag and Release without incrementing again", async () => {
  const f = merged({ releaseFailure: true });
  await assert.rejects(publish(f), /Temporary/u);
  assert.equal(f.tags.get("1.2.4"), sha(3));
  await publish(f);
  assert.equal(f.releases.size, 2);
  const writes = f.writes.length;
  await publish(f);
  assert.equal(f.writes.length, writes);
});
test("late recovery cannot replace a newer latest Release", async () => {
  const f = merged({
    mainSha: sha(4),
    tags: { "1.2.3": sha(0), "1.2.5": sha(4) },
  });
  await publish(f);
  assert.equal(f.releases.get("v1.2.4").make_latest, "false");
});
test("merged source must still belong to main", async () => {
  const f = merged({ mainSha: sha(9) });
  await assert.rejects(publish(f), /not on main/u);
});

test("readiness follows the bot commit SHA and does not bless the prior head", async () => {
  const f = prepared();
  await prepare(f);
  assert.equal(f.checks[1].conclusion, "action_required");
  assert.equal(f.checks[2].head_sha, sha(5));
  assert.equal(f.checks[2].conclusion, "success");
});
test("non-release version changes fail before merge", async () => {
  const f = prepared({ headVersion: "1.2.9" });
  f.pr.title = "📝 docs: update guide";
  f.pr.head.ref = "docs/guide";
  await assert.rejects(prepare(f), /cannot change the root version/u);
  assert.equal(f.checks.at(-1).conclusion, "failure");
  assert.equal(f.writes.length, 0);
});
test("missing readiness-check permission does not write a version", async () => {
  const f = prepared({ checksDenied: true });
  await assert.rejects(prepare(f), /Checks write/u);
  assert.equal(f.writes.length, 0);
});

test("post-check PR title and body edits do not change frozen publication data", async () => {
  const f = merged();
  f.pr.title = "🚀 release: v9.0.0";
  f.pr.body = "Unreviewed edited notes";
  await publish(f);
  assert.equal(f.outputs.version, "1.2.4");
  assert.equal(f.releases.get("v1.2.4").body, "Verified release notes");
});
test("metadata changes require a new atomic head commit", async () => {
  const f = prepared({ headPlan: true, headVersion: "1.2.4" });
  f.pr.body = "Updated release notes";
  await prepare(f);
  assert.equal(f.writes.length, 1);
  assert.equal(f.plans.get(sha(5)).notes, "Updated release notes");
});
test("a frozen plan must bind the actual main merge parent", async () => {
  const f = merged({ plan: { base_sha: sha(9) } });
  await assert.rejects(publish(f), /Frozen release plan/u);
});
test("publication requires the latest readiness check from the expected App", async () => {
  await Promise.all(
    [
      { noReadyCheck: true },
      { readyAppId: 99 },
      { readyConclusion: "failure" },
    ].map(async (options) => {
      const f = merged(options);
      await assert.rejects(publish(f), /readiness check/u);
      assert.equal(f.tags.has("1.2.4"), false);
    })
  );
});
test("a non-release PR may not change a frozen plan", async () => {
  const f = prepared();
  f.pr.title = "📝 docs: update guide";
  f.pr.head.ref = "docs/guide";
  f.plans.set(sha(2), { schema: 1 });
  await assert.rejects(prepare(f), /cannot change the frozen/u);
});

test("merge-event metadata edits stop automatic publishing but explicit recovery preserves the plan", async () => {
  const f = merged();
  f.context.payload.pull_request.body = "Changed before merge";
  await assert.rejects(publish(f), /Merge-event metadata/u);
  assert.equal(f.tags.has("1.2.4"), false);
  await publish({ ...f, pullNumber: 7 });
  assert.equal(f.releases.get("v1.2.4").body, "Verified release notes");
});
test("a release merged without its own plan fails instead of silently skipping", async () => {
  const f = merged({ plan: { pull_number: 6 } });
  await assert.rejects(publish(f), /no matching frozen plan/u);
  assert.equal(f.tags.has("1.2.4"), false);
});
test("a docs-only merge preserving prior metadata does not create another release", async () => {
  const f = merged({
    pr: {
      head: {
        ref: "docs/guide",
        repo: { full_name: "example/app" },
        sha: sha(2),
      },
      title: "📝 docs: update guide",
    },
  });
  const prior = { pull_number: 6, schema: 1, version: "1.2.3" };
  f.plans.set(sha(1), prior);
  f.plans.set(sha(3), { ...prior });
  f.contents.set(sha(3), "1.2.3");
  await publish(f);
  assert.equal(f.outputs.tag, undefined);
});
test("an existing Release with different notes cannot be accepted as the same delivery", async () => {
  const f = merged();
  await publish(f);
  f.releases.get("v1.2.4").body = "Different notes";
  await assert.rejects(publish(f), /read-back/u);
});

test("a non-release merge cannot silently change its package version", async () => {
  const f = merged({
    pr: {
      head: {
        ref: "docs/guide",
        repo: { full_name: "example/app" },
        sha: sha(2),
      },
      title: "📝 docs: update guide",
    },
  });
  await assert.rejects(publish(f), /non-release merge changed/u);
});
