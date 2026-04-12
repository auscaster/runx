import { chmod, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageRoot = path.join(workspaceRoot, "packages");
const packageSearchRoots = [packageRoot, path.join(workspaceRoot, "plugins")];
const runtimeOutDir = path.join(workspaceRoot, ".build", "runtime");
const tscPath = require.resolve("typescript/bin/tsc");

const mode = process.argv.includes("--pack") ? "pack" : "dev";

await runTscBuild(["-b", "tsconfig.runtime.json"]);

const packageDirs = (await Promise.all(packageSearchRoots.map(findPackageDirs))).flat();
for (const directory of packageDirs) {
  await finalizePackage(directory);
}

async function findPackageDirs(root) {
  const directories = [];
  if (!(await exists(root))) {
    return directories;
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = path.join(root, entry.name);
    if (await exists(path.join(candidate, "package.json"))) {
      directories.push(candidate);
      continue;
    }

    for (const nested of await readdir(candidate, { withFileTypes: true })) {
      if (!nested.isDirectory()) {
        continue;
      }
      const nestedCandidate = path.join(candidate, nested.name);
      if (await exists(path.join(nestedCandidate, "package.json"))) {
        directories.push(nestedCandidate);
      }
    }
  }
  return directories.sort();
}

async function finalizePackage(directory) {
  const entry = path.join(directory, "src", "index.ts");
  if (!(await exists(entry))) {
    return;
  }

  const packageJson = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const workspaceRelativePath = toPosix(path.relative(workspaceRoot, directory));
  const runtimeEntry = path.join(runtimeOutDir, workspaceRelativePath, "src", "index.js");

  if (!(await exists(runtimeEntry))) {
    throw new Error(`No compiled runtime entry found for ${directory}`);
  }

  const dist = path.join(directory, "dist");
  const isCli = packageJson.name === "@runxai/cli";
  const isExecutable = Boolean(packageJson.bin?.runx);

  if (isCli && mode === "pack") {
    await writeCliPackDist({ directory, dist });
    return;
  }

  // Dev mode: write a thin wrapper that imports from .build/runtime.
  // No copying, no duplication. Idempotent and race-free.
  await mkdir(dist, { recursive: true });
  await writeEntryWrapper({
    dist,
    compiledEntry: runtimeEntry,
    executable: isExecutable,
  });
  if (isExecutable) {
    await chmod(path.join(dist, "index.js"), 0o755);
  }
  if (isCli) {
    await syncCliAssets(directory);
  }
}

async function writeCliPackDist({ directory, dist }) {
  // Publish mode: produce a self-contained CLI dist that can be packed
  // and installed without .build/runtime on disk.
  await rm(dist, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  await mkdir(dist, { recursive: true });
  await copyIntoDist(path.join(runtimeOutDir, "packages"), path.join(dist, "packages"));
  await writeEntryWrapper({
    dist,
    compiledEntry: path.join(dist, "packages", "cli", "src", "index.js"),
    executable: true,
  });
  await chmod(path.join(dist, "index.js"), 0o755);
  await syncCliAssets(directory);
}

async function syncCliAssets(directory) {
  for (const assetName of ["skills", "tools"]) {
    const source = path.join(workspaceRoot, assetName);
    const target = path.join(directory, assetName);
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    if (await exists(source)) {
      await cp(source, target, { recursive: true });
    }
  }
}

async function writeEntryWrapper({ dist, compiledEntry, executable }) {
  const specifier = `./${toPosix(path.relative(dist, compiledEntry))}`;
  const js = executable
    ? `#!/usr/bin/env node
export * from ${JSON.stringify(specifier)};
import { realpathSync } from "node:fs";
import { stderr, stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { runCli } from ${JSON.stringify(specifier)};

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const exitCode = await runCli(process.argv.slice(2), { stdin, stdout, stderr });
  process.exitCode = exitCode;
}
`
    : `export * from ${JSON.stringify(specifier)};
`;
  await writeFile(path.join(dist, "index.js"), js, { mode: executable ? 0o755 : 0o644 });
  await writeFile(path.join(dist, "index.d.ts"), `export * from ${JSON.stringify(specifier)};\n`);
}

async function runTscBuild(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tscPath, ...args], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tsc exited with ${code}`));
      }
    });
  });
}

async function copyIntoDist(source, target) {
  if (!(await exists(source))) {
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
