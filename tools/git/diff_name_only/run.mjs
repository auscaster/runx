import { spawnSync } from "node:child_process";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const repoRoot = path.resolve(String(inputs.repo_root || process.env.RUNX_CWD || process.cwd()));
const base = String(inputs.base || "HEAD");

const result = spawnSync("git", ["-C", repoRoot, "diff", "--name-only", "--relative", base], {
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

process.stdout.write(JSON.stringify({
  repo_root: repoRoot,
  base,
  files: result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
}));
