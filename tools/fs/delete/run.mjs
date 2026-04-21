import { lstat, rm } from "node:fs/promises";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");

const targetPath = String(inputs.path || "");
if (!targetPath) {
  throw new Error("path is required.");
}

const repoRoot = path.resolve(
  String(inputs.repo_root || inputs.project || inputs.fixture || process.env.RUNX_CWD || process.cwd()),
);
const resolvedPath = path.resolve(repoRoot, targetPath);
if (!resolvedPath.startsWith(`${repoRoot}${path.sep}`) && resolvedPath !== repoRoot) {
  throw new Error(`path escapes repo_root: ${targetPath}`);
}
if (resolvedPath === repoRoot) {
  throw new Error("refusing to delete repo_root");
}

let existed = false;
let kind = "missing";
try {
  const stats = await lstat(resolvedPath);
  existed = true;
  if (stats.isDirectory()) {
    throw new Error(`path resolves to a directory, not a file: ${targetPath}`);
  }
  kind = stats.isSymbolicLink() ? "symlink" : "file";
  await rm(resolvedPath, { force: true });
} catch (error) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
    existed = false;
    kind = "missing";
  } else {
    throw error;
  }
}

process.stdout.write(
  JSON.stringify({
    path: targetPath,
    repo_root: repoRoot,
    existed,
    deleted: existed,
    kind,
  }),
);
