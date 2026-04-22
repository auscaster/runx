import { spawnSync } from "node:child_process";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const repoRoot = path.resolve(String(inputs.repo_root || process.env.RUNX_CWD || process.cwd()));

const branch = spawnSync("git", ["-C", repoRoot, "symbolic-ref", "--short", "HEAD"], {
  encoding: "utf8",
  shell: false,
});
let value = branch.stdout.trim();
let detached = false;

if (branch.status !== 0 || !value) {
  const fallback = spawnSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
    shell: false,
  });
  if (fallback.error) {
    throw fallback.error;
  }
  if (fallback.status !== 0) {
    if (fallback.stderr) {
      process.stderr.write(fallback.stderr);
    }
    process.exit(fallback.status ?? 1);
  }
  value = fallback.stdout.trim();
  detached = true;
}

process.stdout.write(JSON.stringify({
  repo_root: repoRoot,
  branch: value,
  detached,
}));
