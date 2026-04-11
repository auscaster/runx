import { chmod, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageRoot = path.join(workspaceRoot, "packages");
const packageSearchRoots = [packageRoot, path.join(workspaceRoot, "plugins")];
const tscPath = require.resolve("typescript/bin/tsc");

const packageDirs = (await Promise.all(packageSearchRoots.map(findPackageDirs))).flat();

for (const directory of packageDirs) {
  await buildPackage(directory);
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

async function buildPackage(directory) {
  const src = path.join(directory, "src");
  const entry = path.join(src, "index.ts");
  if (!(await exists(entry))) {
    return;
  }

  const dist = path.join(directory, "dist");
  await rm(dist, { recursive: true, force: true });

  const packageJson = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const sources = await findRuntimeSources(src);
  await runTsc([
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--strict",
    "--declaration",
    "--sourceMap",
    "--types",
    "node",
    "--skipLibCheck",
    "--outDir",
    dist,
    ...sources,
  ]);

  const compiledEntry = await findCompiledEntry(directory, dist);
  if (!compiledEntry) {
    throw new Error(`No compiled entry found for ${directory}`);
  }

  if (path.resolve(compiledEntry) !== path.resolve(path.join(dist, "index.js"))) {
    await writeEntryWrapper({
      dist,
      compiledEntry,
      executable: Boolean(packageJson.bin?.runx),
    });
  }

  if (packageJson.bin?.runx) {
    await chmod(path.join(dist, "index.js"), 0o755);
  }
}

async function findRuntimeSources(directory) {
  const sources = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...(await findRuntimeSources(candidate)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      sources.push(candidate);
    }
  }
  return sources.sort();
}

async function findCompiledEntry(directory, dist) {
  const directEntry = path.join(dist, "index.js");
  if (await exists(directEntry)) {
    return directEntry;
  }

  const relativePackagePath = toPosix(path.relative(packageRoot, directory));
  const nestedEntry = path.join(dist, ...relativePackagePath.split("/"), "src", "index.js");
  if (await exists(nestedEntry)) {
    return nestedEntry;
  }

  const packageParent = path.dirname(directory);
  const relativeLocalPath = toPosix(path.relative(packageParent, directory));
  const localNestedEntry = path.join(dist, relativeLocalPath, "src", "index.js");
  if (await exists(localNestedEntry)) {
    return localNestedEntry;
  }

  const workspaceRelativePath = toPosix(path.relative(workspaceRoot, directory));
  const workspaceNestedEntry = path.join(dist, ...workspaceRelativePath.split("/"), "src", "index.js");
  if (await exists(workspaceNestedEntry)) {
    return workspaceNestedEntry;
  }

  return undefined;
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

async function runTsc(args) {
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
