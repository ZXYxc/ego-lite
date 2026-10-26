#!/usr/bin/env node

// Hosts that install a plugin straight from Git drop links that leave the
// plugin root, so each plugin keeps a copy of the canonical Skills it ships.
import { cp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const [name] = process.argv.slice(2);
if (!name) {
  console.error("Usage: node plugins/scripts/sync-skills.mjs <plugin>");
  process.exit(1);
}

const skillsRoot = join(repositoryRoot, "plugins", name, "skills");
for (const skill of await readdir(skillsRoot)) {
  if (skill.startsWith(".")) continue;
  const copy = join(skillsRoot, skill);
  await rm(copy, { recursive: true, force: true });
  await cp(join(repositoryRoot, "skills", skill), copy, { recursive: true });
  console.log(`Synced skills/${skill} -> plugins/${name}/skills/${skill}`);
}
