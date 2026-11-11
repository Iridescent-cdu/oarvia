import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const asset =
  process.env.SKILL_LINK_SCRIPT ??
  fileURLToPath(new URL("../assets/link.mjs", import.meta.url));
const defaultSkills = ["alpha", "beta", "gamma"];
const fixture = (t, skills = defaultSkills) => {
  const dir = mkdtempSync(path.join(tmpdir(), "project-skill-links-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const library = path.join(dir, "skill library");
  const project = path.join(dir, "new project");
  mkdirSync(path.join(library, "scripts"), { recursive: true });
  mkdirSync(project);
  cpSync(asset, path.join(library, "scripts/link.mjs"));
  writeFileSync(path.join(library, "skills.json"), JSON.stringify(skills));
  if (Array.isArray(skills)) for (const name of new Set(skills)) {
    if (typeof name !== "string" || !/^[a-z0-9-]+$/u.test(name)) continue;
    const source = path.join(library, name);
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "SKILL.md"), `# ${name}\n`);
  }
  const destination = path.join(project, ".agents/skills");
  return {
    destination,
    dir,
    library,
    project,
    run: (...selection) =>
      spawnSync(
        process.execPath,
        [path.join(library, "scripts/link.mjs"), project, ...selection],
        { encoding: "utf-8" }
      ),
  };
};
const exists = (file) => {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

test("creates relative readable links and repeated runs leave them unchanged", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const link = path.join(f.destination, "alpha");
  const before = readlinkSync(link);
  assert.equal(path.isAbsolute(before), false);
  assert.equal(readFileSync(path.join(link, "SKILL.md"), "utf-8"), "# alpha\n");
  assert.equal(f.run().status, 0);
  assert.equal(readlinkSync(link), before);
});
test("limits selected skills", (t) => {
  const f = fixture(t);
  assert.equal(f.run("gamma").status, 0);
  assert.equal(exists(path.join(f.destination, "gamma")), true);
  assert.equal(exists(path.join(f.destination, "alpha")), false);
});
test("preserves third-party directory and source lock", (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "third-party"), { recursive: true });
  writeFileSync(
    path.join(f.destination, "third-party/SKILL.md"),
    "vendor-original"
  );
  writeFileSync(path.join(f.project, "skills-lock.json"), "vendor-lock");
  assert.equal(f.run().status, 0);
  assert.equal(
    lstatSync(path.join(f.destination, "third-party")).isSymbolicLink(),
    false
  );
  assert.equal(
    readFileSync(path.join(f.destination, "third-party/SKILL.md"), "utf-8"),
    "vendor-original"
  );
  assert.equal(
    readFileSync(path.join(f.project, "skills-lock.json"), "utf-8"),
    "vendor-lock"
  );
});
test("same-name installed directory blocks the whole plan without partial links", (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.destination, "beta"), { recursive: true });
  const result = f.run("alpha", "beta");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to overwrite/u);
  assert.equal(exists(path.join(f.destination, "alpha")), false);
  assert.equal(lstatSync(path.join(f.destination, "beta")).isDirectory(), true);
});
test("wrong existing link is preserved", (t) => {
  const f = fixture(t);
  mkdirSync(f.destination, { recursive: true });
  symlinkSync(
    path.join(f.library, "gamma"),
    path.join(f.destination, "beta"),
    "dir"
  );
  assert.notEqual(f.run("alpha", "beta").status, 0);
  assert.equal(exists(path.join(f.destination, "alpha")), false);
  assert.equal(
    readFileSync(path.join(f.destination, "beta/SKILL.md"), "utf-8"),
    "# gamma\n"
  );
});
test("broken existing link is preserved", (t) => {
  const f = fixture(t);
  mkdirSync(f.destination, { recursive: true });
  symlinkSync("missing-target", path.join(f.destination, "beta"), "dir");
  assert.notEqual(f.run("alpha", "beta").status, 0);
  assert.equal(
    readlinkSync(path.join(f.destination, "beta")),
    "missing-target"
  );
  assert.equal(exists(path.join(f.destination, "alpha")), false);
});
test("duplicate names are rejected before creating the destination", (t) => {
  const f = fixture(t, ["alpha", "alpha"]);
  assert.notEqual(f.run().status, 0);
  assert.equal(exists(f.destination), false);
});
test("path traversal in manifest is rejected", (t) => {
  const f = fixture(t, ["../escape"]);
  assert.notEqual(f.run().status, 0);
  assert.equal(exists(f.destination), false);
});
test("missing SKILL.md is rejected before creating links", (t) => {
  const f = fixture(t);
  rmSync(path.join(f.library, "beta/SKILL.md"));
  assert.notEqual(f.run().status, 0);
  assert.equal(exists(f.destination), false);
});
test("whole discovery-directory symlink is rejected", (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.project, ".agents"));
  const outside = path.join(f.dir, "other skill store");
  mkdirSync(outside);
  symlinkSync(outside, f.destination, "dir");
  assert.notEqual(f.run().status, 0);
  assert.equal(exists(path.join(outside, "alpha")), false);
});
test("source escaping the library is rejected", (t) => {
  const f = fixture(t);
  const source = path.join(f.library, "beta");
  rmSync(source, { recursive: true });
  const outside = path.join(f.dir, "outside source");
  mkdirSync(outside);
  writeFileSync(path.join(outside, "SKILL.md"), "# external");
  symlinkSync(outside, source, "dir");
  assert.notEqual(f.run("alpha", "beta").status, 0);
  assert.equal(exists(f.destination), false);
});
test("unknown skills are rejected without partial links", (t) => {
  const f = fixture(t);
  assert.notEqual(f.run("alpha", "unknown").status, 0);
  assert.equal(exists(f.destination), false);
});
test("installed organization library links survive a pnpm package version change", (t) => {
  const f = fixture(t);
  const installed = path.join(f.project, "node_modules/@acme");
  mkdirSync(installed, { recursive: true });
  const packageEntry = path.join(installed, "skills");
  symlinkSync(f.library, packageEntry, "dir");
  const run = () =>
    spawnSync(
      process.execPath,
      [
        "--preserve-symlinks-main",
        path.join(packageEntry, "scripts/link.mjs"),
        f.project,
        "alpha",
      ],
      { encoding: "utf-8" }
    );
  assert.equal(run().status, 0);
  const link = path.join(f.destination, "alpha");
  const before = readlinkSync(link);
  assert.match(before, /node_modules/u);
  const updated = path.join(f.dir, "library-v2");
  cpSync(f.library, updated, { recursive: true });
  writeFileSync(
    path.join(updated, "alpha/SKILL.md"),
    "# updated"
  );
  rmSync(packageEntry);
  symlinkSync(updated, packageEntry, "dir");
  rmSync(f.library, { recursive: true });
  assert.equal(run().status, 0);
  assert.equal(readlinkSync(link), before);
  assert.equal(readFileSync(path.join(link, "SKILL.md"), "utf-8"), "# updated");
});
