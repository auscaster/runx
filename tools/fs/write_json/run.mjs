import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");

const targetPath = String(inputs.path || "");
if (!targetPath) {
  throw new Error("path is required.");
}

if (!("data" in inputs)) {
  throw new Error("data is required.");
}

const indent = Number.parseInt(String(inputs.indent ?? "2"), 10);
if (!Number.isFinite(indent) || indent < 0) {
  throw new Error("indent must be a non-negative integer.");
}

const repoRoot = path.resolve(
  String(inputs.repo_root || inputs.project || inputs.fixture || process.env.RUNX_CWD || process.cwd()),
);
const resolvedPath = path.resolve(repoRoot, targetPath);
if (!resolvedPath.startsWith(`${repoRoot}${path.sep}`) && resolvedPath !== repoRoot) {
  throw new Error(`path escapes repo_root: ${targetPath}`);
}

const contents = `${JSON.stringify(inputs.data, null, indent)}\n`;
await mkdir(path.dirname(resolvedPath), { recursive: true });
await writeFile(resolvedPath, contents, "utf8");

process.stdout.write(
  JSON.stringify({
    path: targetPath,
    repo_root: repoRoot,
    bytes_written: Buffer.byteLength(contents, "utf8"),
    sha256: createHash("sha256").update(contents).digest("hex"),
  }),
);
