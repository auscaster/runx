import fs from "node:fs";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const repoRoot = path.resolve(
  String(inputs.repo_root || inputs.project || inputs.fixture || process.env.RUNX_CWD || process.cwd()),
);
const targetPath = String(inputs.path || "");
if (!targetPath) {
  throw new Error("path is required.");
}

const resolvedPath = path.resolve(repoRoot, targetPath);
const content = fs.readFileSync(resolvedPath, "utf8");

process.stdout.write(JSON.stringify({
  path: targetPath,
  repo_root: repoRoot,
  contents: content,
}));
