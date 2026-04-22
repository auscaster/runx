import { cp, mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getRepoRoot, parseJsonInput, prune } from "../common.mjs";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const repoRoot = getRepoRoot(inputs);
const previewPlan = unwrapArtifactData(inputs.preview_plan, "preview_plan");

if (previewPlan.should_generate !== true) {
  process.stdout.write(JSON.stringify({
    repo_root: repoRoot,
    staged_repo_root: null,
    output_dir: null,
    staged: false,
  }));
  process.exit(0);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "runx-docs-preview-"));
const stagedRepoRoot = path.join(tempRoot, path.basename(repoRoot));
await mkdir(stagedRepoRoot, { recursive: true });
await cp(repoRoot, stagedRepoRoot, {
  recursive: true,
  verbatimSymlinks: false,
  filter: (source) => {
    const relativePath = path.relative(repoRoot, source).replace(/\\/g, "/");
    if (relativePath === "") {
      return true;
    }
    const topLevel = relativePath.split("/")[0];
    return ![
      ".git",
      "node_modules",
      "dist",
      "build",
      ".next",
      ".nuxt",
      ".sourcey",
      ".runx",
      "coverage",
    ].includes(topLevel);
  },
});

const outputDir = path.resolve(
  stagedRepoRoot,
  String(previewPlan.sourcey_inputs?.output_dir || ".sourcey/runx-preview"),
);

process.stdout.write(JSON.stringify(prune({
  repo_root: repoRoot,
  staged_repo_root: stagedRepoRoot,
  output_dir: outputDir,
  staged: true,
})));

function unwrapArtifactData(value, label) {
  const record = parseJsonInput(value);
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${label} must be an object.`);
  }
  return record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data
    : record;
}
