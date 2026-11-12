import {
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Copy to <skill-library>/scripts/link.mjs; optionally select skill names.
const [project, ...selection] = process.argv.slice(2);
if (!project) {
  throw new Error(
    "Usage: node scripts/link.mjs <project-root> [skill-name ...]"
  );
}
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
// --preserve-symlinks-main keeps installed links on the stable package path.
const sourceRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const library = await realpath(sourceRoot);
const root = await realpath(path.resolve(project));
const skills = JSON.parse(
  await readFile(path.join(library, "skills.json"), "utf-8")
);
if (!Array.isArray(skills)) {
  throw new TypeError("skills.json must be an array");
}
const names = new Set();
for (const name of skills) {
  if (typeof name !== "string" || !slug.test(name) || names.has(name)) {
    throw new Error(`Invalid or duplicate skill name: ${name}`);
  }
  names.add(name);
}
const selected = selection.length ? [...new Set(selection)] : skills;
for (const name of selected) {
  if (!names.has(name)) {
    throw new Error(`Unknown skill: ${name}`);
  }
}
const existing = async (file) => {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};
const destination = path.join(root, ".agents", "skills");
await Promise.all(
  [path.join(root, ".agents"), destination].map(async (directory) => {
    const info = await existing(directory);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) {
      throw new Error(`Expected a real directory: ${directory}`);
    }
  })
);
const assertContained = (target, name) => {
  const relative = path.relative(library, target);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Skill source escapes the library: ${name}`);
  }
};
const candidates = await Promise.all(
  selected.map(async (name) => {
    const source = path.join(sourceRoot, name);
    const target = await realpath(source);
    assertContained(target, name);
    const entry = await realpath(path.join(target, "SKILL.md"));
    assertContained(entry, name);
    const entryInfo = await stat(entry);
    if (!entryInfo.isFile()) {
      throw new Error(`Missing SKILL.md: ${name}`);
    }
    const link = path.join(destination, name);
    const info = await existing(link);
    if (!info) {
      return { link, source };
    }
    if (!info.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite installed skill: ${name}`);
    }
    let resolved;
    try {
      resolved = await realpath(link);
    } catch (error) {
      throw new Error(`Broken skill link: ${name}`, { cause: error });
    }
    if (resolved !== target) {
      throw new Error(`Conflicting skill link: ${name}`);
    }
    return null;
  })
);
const plan = candidates.filter(Boolean);
// Finish all preflight checks before creating links. Never replace destinations.
await mkdir(destination, { recursive: true });
await Promise.all(
  plan.map(({ link, source }) =>
    symlink(path.relative(destination, source), link, "dir")
  )
);
console.log(
  `Linked ${plan.length} skills from ${selected.join(", ")} into ${destination}`
);
