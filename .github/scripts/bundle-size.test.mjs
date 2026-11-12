import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { compareReports, measure, validateReport } from "./bundle-size.mjs";

const baseSha = "a".repeat(40);
const currentSha = "b".repeat(40);
const report = (sha, raw = 10_000, gzip = 3000) => ({
  measurement: "api-mjs-gzip9-v1",
  metrics: { "api-js-bytes": raw, "api-js-gzip": gzip },
  schema: 1,
  sha,
});

test("measurement includes nested mjs files, excludes maps and records gzip bytes", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "api-size-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  mkdirSync(path.join(directory, "chunks"));
  const main = Buffer.from("console.log('main');");
  const chunk = Buffer.from("export const value = 42;");
  writeFileSync(path.join(directory, "main.mjs"), main);
  writeFileSync(path.join(directory, "chunks/helper.mjs"), chunk);
  writeFileSync(path.join(directory, "main.mjs.map"), "not bundled JavaScript");
  const measured = measure(directory, currentSha);
  assert.equal(measured.sha, currentSha);
  assert.deepEqual(measured.metrics, {
    "api-js-bytes": main.length + chunk.length,
    "api-js-gzip":
      gzipSync(main, { level: 9 }).length +
      gzipSync(chunk, { level: 9 }).length,
  });
});

test("missing or empty production entry fails measurement", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "api-size-empty-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  assert.throws(() => measure(directory, currentSha));
  writeFileSync(path.join(directory, "main.mjs"), "");
  assert.throws(() => measure(directory, currentSha), /empty/iu);
});

test("unchanged, smaller and threshold-equal reports pass; an excess fails", () => {
  const baseline = report(baseSha);
  for (const raw of [9000, 10_000, 11_024]) {
    assert.equal(
      compareReports(baseline, report(currentSha, raw), baseSha, currentSha)
        .passed,
      true
    );
  }
  const result = compareReports(
    baseline,
    report(currentSha, 11_025),
    baseSha,
    currentSha
  );
  assert.equal(result.passed, false);
  assert.match(result.markdown, /api-js-bytes/u);
});

test("gzip budget and relative budget are independently enforced", () => {
  assert.equal(
    compareReports(
      report(baseSha),
      report(currentSha, 10_000, 3513),
      baseSha,
      currentSha
    ).passed,
    false
  );
  assert.equal(
    compareReports(
      report(baseSha, 100_000),
      report(currentSha, 103_000),
      baseSha,
      currentSha
    ).passed,
    true
  );
  assert.equal(
    compareReports(
      report(baseSha, 100_000),
      report(currentSha, 103_001),
      baseSha,
      currentSha
    ).passed,
    false
  );
});

test("invalid numbers, missing or unexpected metrics and schema changes fail", () => {
  for (const value of [-1, 0, Number.NaN, Infinity, 0.5, "123"]) {
    assert.throws(() => validateReport(report(baseSha, value), baseSha));
  }
  assert.throws(() =>
    validateReport({ ...report(baseSha), schema: 2 }, baseSha)
  );
  assert.throws(() =>
    validateReport({ ...report(baseSha), measurement: "different" }, baseSha)
  );
  assert.throws(() =>
    validateReport({ ...report(baseSha), metrics: {} }, baseSha)
  );
  assert.throws(() =>
    validateReport(
      { ...report(baseSha), metrics: { ...report(baseSha).metrics, extra: 1 } },
      baseSha
    )
  );
});

test("reports must match the exact baseline and current SHA", () => {
  assert.throws(() => validateReport(report(baseSha), currentSha), /SHA/u);
  assert.throws(() => validateReport(report("canary"), "canary"), /SHA/u);
  assert.throws(
    () =>
      compareReports(report(currentSha), report(baseSha), baseSha, currentSha),
    /SHA/u
  );
});

test("measurement rejects symlinks instead of reading outside the build", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "api-size-link-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  writeFileSync(path.join(directory, "main.mjs"), "export {};");
  symlinkSync("main.mjs", path.join(directory, "alias.mjs"));
  assert.throws(() => measure(directory, currentSha), /symlinks/iu);
});

test("CLI keeps budget failures nonzero after writing a report and rejects missing input", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "api-size-cli-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const baseline = path.join(directory, "baseline.json");
  const current = path.join(directory, "current.json");
  const markdown = path.join(directory, "report.md");
  writeFileSync(baseline, JSON.stringify(report(baseSha)));
  writeFileSync(current, JSON.stringify(report(currentSha, 12_000)));
  const run = () =>
    spawnSync(
      process.execPath,
      [
        new URL("bundle-size.mjs", import.meta.url).pathname,
        "check",
        "--baseline",
        baseline,
        "--current",
        current,
        "--report",
        markdown,
      ],
      {
        env: {
          ...process.env,
          SIZE_BASE_SHA: baseSha,
          SIZE_CURRENT_SHA: currentSha,
        },
      }
    );
  assert.equal(run().status, 1);
  assert.match(readFileSync(markdown, "utf-8"), /FAIL/u);
  writeFileSync(current, JSON.stringify(report(currentSha)));
  assert.equal(run().status, 0);
  rmSync(baseline);
  assert.equal(run().status, 1);
});
