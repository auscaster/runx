import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const files = Array.isArray(inputs.files) ? inputs.files : null;
if (!files) {
  throw new Error("files must be an array.");
}

const repoRoot = path.resolve(
  String(inputs.repo_root || inputs.project || inputs.fixture || process.env.RUNX_CWD || process.cwd()),
);
const written = [];

for (const entry of files) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("each files entry must be an object.");
  }
  const targetPath = String(entry.path || "");
  if (!targetPath) {
    throw new Error("each files entry must include path.");
  }
  if (typeof entry.contents !== "string") {
    throw new Error(`files entry '${targetPath}' must include string contents.`);
  }

  const resolvedPath = path.resolve(repoRoot, targetPath);
  if (!resolvedPath.startsWith(`${repoRoot}${path.sep}`) && resolvedPath !== repoRoot) {
    throw new Error(`path escapes repo_root: ${targetPath}`);
  }

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, entry.contents, "utf8");
  written.push({
    path: targetPath,
    bytes_written: Buffer.byteLength(entry.contents, "utf8"),
    sha256: createHash("sha256").update(entry.contents).digest("hex"),
  });
}

process.stdout.write(
  JSON.stringify({
    repo_root: repoRoot,
    file_count: written.length,
    files: written,
  }),
);
