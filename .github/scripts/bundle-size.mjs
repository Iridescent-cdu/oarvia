import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const shaPattern = /^[a-f0-9]{40}$/u;
const measurement = "api-mjs-gzip9-v1";
const readReport = (file) => JSON.parse(readFileSync(file, "utf-8"));
const budgets = {
  "api-js-bytes": { floor: 1024, percent: 3 },
  "api-js-gzip": { floor: 512, percent: 3 },
};

export const validateReport = (report, expectedSha) => {
  assert.ok(shaPattern.test(expectedSha), "Expected a complete source SHA");
  assert.equal(report?.sha, expectedSha, "Report SHA does not match source");
  assert.equal(report.schema, 1, "Unsupported report schema");
  assert.equal(report.measurement, measurement, "Incompatible measurement");
  assert.deepEqual(
    Object.keys(report.metrics).toSorted(),
    Object.keys(budgets).toSorted(),
    "Unexpected metrics; configure budgets before changing targets"
  );
  for (const value of Object.values(report.metrics)) {
    assert.ok(
      Number.isSafeInteger(value) && value > 0,
      "Metric must contain positive byte counts"
    );
  }
};

export const measure = (directory, sha) => {
  const metrics = { "api-js-bytes": 0, "api-js-gzip": 0 };
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      assert.ok(
        !entry.isSymbolicLink(),
        "Build output must not contain symlinks"
      );
      if (entry.isDirectory()) {
        visit(target);
      } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
        const bytes = readFileSync(target);
        assert.ok(
          bytes.length > 0,
          "Build output contains an empty JavaScript file"
        );
        metrics["api-js-bytes"] += bytes.length;
        metrics["api-js-gzip"] += gzipSync(bytes, { level: 9 }).length;
      }
    }
  };
  visit(directory);
  assert.ok(
    readFileSync(path.join(directory, "main.mjs")).length > 0,
    "Production entry is empty"
  );
  const report = { measurement, metrics, schema: 1, sha };
  validateReport(report, sha);
  return report;
};

export const compareReports = (baseline, current, baseSha, currentSha) => {
  validateReport(baseline, baseSha);
  validateReport(current, currentSha);
  let passed = true;
  const rows = [];
  for (const [metric, budget] of Object.entries(budgets)) {
    const base = baseline.metrics[metric];
    const value = current.metrics[metric];
    const delta = value - base;
    const limit = Math.max((base * budget.percent) / 100, budget.floor);
    const withinBudget = delta <= limit;
    passed &&= withinBudget;
    rows.push(
      `| ${metric} | ${base} | ${value} | ${delta} | ${limit} | ${withinBudget ? "pass" : "FAIL"} |`
    );
  }
  return {
    markdown: [
      "# API bundle size",
      `Baseline: ${baseSha}; current: ${currentSha}.`,
      "Measures emitted .mjs files only; excludes source maps and external runtime dependencies. Gzip is level 9 per file.",
      "",
      "| Metric (bytes) | Baseline | Current | Growth | Allowed growth | Result |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n"),
    passed,
  };
};

const cli = () => {
  const command = process.argv.at(2);
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      baseline: { type: "string" },
      current: { type: "string" },
      out: { type: "string" },
      report: { type: "string" },
    },
  });
  if (command === "measure") {
    assert.ok(values.out, "Missing --out");
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf-8",
    }).trim();
    assert.equal(
      process.env.SIZE_SOURCE_SHA || sha,
      sha,
      "Measurement source SHA differs from checkout"
    );
    writeFileSync(
      values.out,
      `${JSON.stringify(measure(path.join(root, "apps/api/dist"), sha), null, 2)}\n`
    );
    return;
  }
  assert.equal(command, "check", "Expected measure or check command");
  assert.ok(
    values.baseline && values.current && values.report,
    "Missing comparison paths"
  );
  const result = compareReports(
    readReport(values.baseline),
    readReport(values.current),
    process.env.SIZE_BASE_SHA,
    process.env.SIZE_CURRENT_SHA
  );
  writeFileSync(values.report, result.markdown);
  if (!result.passed) {
    process.exitCode = 1;
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  cli();
}
