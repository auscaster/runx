import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");

const targetPath = String(inputs.path || "");
if (!targetPath) {
  throw new Error("path is required.");
}

if (typeof inputs.contents !== "string") {
  throw new Error("contents must be a string.");
}

const repoRoot = path.resolve(
  String(inputs.repo_root || inputs.project || inputs.fixture || process.env.RUNX_CWD || process.cwd()),
);
const resolvedPath = path.resolve(repoRoot, targetPath);
if (!resolvedPath.startsWith(`${repoRoot}${path.sep}`) && resolvedPath !== repoRoot) {
  throw new Error(`path escapes repo_root: ${targetPath}`);
}

await mkdir(path.dirname(resolvedPath), { recursive: true });
await writeFile(resolvedPath, inputs.contents, "utf8");

process.stdout.write(
  JSON.stringify({
    path: targetPath,
    repo_root: repoRoot,
    bytes_written: Buffer.byteLength(inputs.contents, "utf8"),
    sha256: createHash("sha256").update(inputs.contents).digest("hex"),
  }),
);
