import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const forwardedArgs = process.argv.slice(2);
const cliPackageTestTargets = forwardedArgs.filter(isCliPackageTarget);
const forwardedArgsWithoutCliPackageTest = forwardedArgs.filter((arg) => !isCliPackageTarget(arg));

if (forwardedArgs.length > 0) {
  if (cliPackageTestTargets.length > 0 && hasExplicitTarget(forwardedArgsWithoutCliPackageTest)) {
    await runVitest(["run", ...forwardedArgsWithoutCliPackageTest]);
    await runVitest(["run", ...sharedOptions(forwardedArgsWithoutCliPackageTest), ...cliPackageTestTargets]);
  } else {
    await runVitest(["run", ...forwardedArgs]);
  }
} else {
  await runVitest(["run", "--exclude", "tests/cli-package.test.ts"]);
  await runVitest(["run", "tests/cli-package.test.ts"]);
}

async function runVitest(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(pnpm, ["exec", "vitest", ...args], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`vitest ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function isCliPackageTarget(arg) {
  const normalized = toPosix(arg);
  return normalized.endsWith("/tests/cli-package.test.ts") || normalized === "tests/cli-package.test.ts";
}

function hasExplicitTarget(args) {
  return args.some((arg) => isExplicitVitestTarget(arg));
}

function sharedOptions(args) {
  const options = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("-")) {
      continue;
    }
    options.push(arg);
    const next = args[index + 1];
    if (next && !next.startsWith("-") && !isExplicitVitestTarget(next)) {
      options.push(next);
      index += 1;
    }
  }
  return options;
}

function isExplicitVitestTarget(arg) {
  if (arg.startsWith("-")) {
    return false;
  }
  const normalized = toPosix(arg);
  if (normalized.endsWith(".test.ts") || normalized.endsWith(".spec.ts")) {
    return true;
  }
  const candidate = path.resolve(workspaceRoot, arg);
  return existsSync(candidate) && /\.(test|spec)\.[cm]?[jt]sx?$/.test(path.basename(candidate));
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
