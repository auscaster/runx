#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = path.join(packageRoot, "dist", "index.js");
const sourceEntry = path.join(packageRoot, "src", "index.ts");

if (existsSync(distEntry)) {
  const { runCreateSkill } = await import(pathToFileURL(distEntry).href);
  const exitCode = await runCreateSkill(process.argv.slice(2), {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exitCode = exitCode;
} else {
  const fallback = spawnSync(
    process.execPath,
    ["--import", "tsx", sourceEntry, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  if (fallback.error) {
    const hint = [
      "create-skill: packaged dist is missing and source fallback failed.",
      "If this is a linked workspace checkout, run `pnpm --dir /home/kam/dev/runx/oss build`.",
      `Fallback error: ${fallback.error.message}`,
    ].join("\n");
    process.stderr.write(`${hint}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = fallback.status ?? 1;
  }
}
