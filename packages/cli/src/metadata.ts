import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const cliPackageName = "@runxhq/cli";

interface CliPackageManifest {
  readonly name?: string;
  readonly version?: string;
}

export interface CliPackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly packageRoot: string;
}

export function readCliPackageMetadata(): CliPackageMetadata {
  const packageRoot = resolveCliPackageRoot();
  const packageJsonPath = path.join(packageRoot, "package.json");
  const raw = JSON.parse(readFileSync(packageJsonPath, "utf8")) as CliPackageManifest;
  const name = normalizePackageName(raw.name);
  const version = normalizePackageVersion(raw.version);
  return {
    name,
    version,
    packageRoot,
  };
}

export function resolveCliPackageRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return findCliPackageRoot(moduleDir);
}

function findCliPackageRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    const manifestPath = path.join(current, "package.json");
    if (existsSync(manifestPath)) {
      const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as CliPackageManifest;
      if (raw.name === cliPackageName) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to resolve ${cliPackageName} package root from ${startDir}.`);
    }
    current = parent;
  }
}

function normalizePackageName(value: string | undefined): string {
  if (value !== cliPackageName) {
    throw new Error(`Expected ${cliPackageName} package name, received ${value ?? "undefined"}.`);
  }
  return value;
}

function normalizePackageVersion(value: string | undefined): string {
  if (!value || value === "0.0.0") {
    throw new Error(`Expected ${cliPackageName} to have a publishable version, received ${value ?? "undefined"}.`);
  }
  return value;
}
