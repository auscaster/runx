import { spawnSync } from "node:child_process";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const repoRoot = path.resolve(String(inputs.repo_root || process.env.RUNX_CWD || process.cwd()));

const result = spawnSync("git", ["-C", repoRoot, "status", "--short", "--branch"], {
  encoding: "utf8",
  shell: false,
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.status ?? 1);
}

const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
const branch = lines[0]?.startsWith("## ") ? lines[0].slice(3) : undefined;
const entries = branch ? lines.slice(1) : lines;

process.stdout.write(JSON.stringify({
  repo_root: repoRoot,
  branch,
  clean: entries.length === 0,
  entries,
}));
