import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { isMarketplaceRef, resolveMarketplaceSkill, type MarketplaceAdapter } from "../../marketplaces/src/index.js";
import {
  parseRunnerManifestYaml,
  validateRunnerManifest,
  validateSkillInstall,
  type SkillInstallOrigin,
} from "../../parser/src/index.js";
import { hashString } from "../../receipts/src/index.js";
import {
  acquireRegistrySkill,
  resolveRegistrySkill,
  resolveRemoteRegistryRef,
  type RegistryStore,
} from "../../registry/src/index.js";

export interface InstallLocalSkillOptions {
  readonly ref: string;
  readonly registryStore?: RegistryStore;
  readonly marketplaceAdapters?: readonly MarketplaceAdapter[];
  readonly destinationRoot: string;
  readonly version?: string;
  readonly expectedDigest?: string;
  readonly registryUrl?: string;
  readonly installationId?: string;
}

export interface InstallLocalSkillResult {
  readonly status: "installed" | "unchanged";
  readonly destination: string;
  readonly lockfile: string;
  readonly skill_name: string;
  readonly source: string;
  readonly source_label: string;
  readonly skill_id?: string;
  readonly version?: string;
  readonly digest: string;
  readonly xDigest?: string;
  readonly xDestination?: string;
  readonly runnerNames: readonly string[];
  readonly trust_tier?: string;
}

interface FetchedInstallCandidate {
  readonly markdown: string;
  readonly xManifest?: string;
  readonly origin: SkillInstallOrigin;
}

export async function installLocalSkill(options: InstallLocalSkillOptions): Promise<InstallLocalSkillResult> {
  const candidate = await fetchInstallCandidate(options);
  const actualDigest = hashString(candidate.markdown);
  const expectedDigest = options.expectedDigest ?? candidate.origin.digest;

  if (expectedDigest && expectedDigest !== actualDigest) {
    throw new Error(
      `Digest mismatch for ${options.ref}: expected sha256:${expectedDigest}, received sha256:${actualDigest}.`,
    );
  }

  const install = validateSkillInstall(candidate.markdown, {
    ...candidate.origin,
    digest: actualDigest,
  });
  const xDigest = candidate.xManifest ? hashString(candidate.xManifest) : undefined;
  if (candidate.origin.x_digest && candidate.origin.x_digest !== xDigest) {
    throw new Error(
      `X metadata digest mismatch for ${options.ref}: expected sha256:${candidate.origin.x_digest}, received sha256:${xDigest ?? "none"}.`,
    );
  }
  const runnerNames = validateInstallXManifest(install.skill.name, candidate.xManifest, candidate.origin.runner_names);
  const packageRoot = path.join(options.destinationRoot, ...safeSkillPackageParts(options.ref, install.skill.name));
  const destination = path.join(packageRoot, "SKILL.md");
  const xDestination = candidate.xManifest ? path.join(packageRoot, "x.yaml") : undefined;
  const lockfile = path.join(packageRoot, "runx.lock.json");
  const existing = await readExisting(destination);
  const existingX = xDestination ? await readExisting(xDestination) : undefined;
  const shouldWriteX = xDestination !== undefined && existingX === undefined;
  const result: InstallLocalSkillResult = {
    status: existing === undefined || shouldWriteX ? "installed" : "unchanged",
    destination,
    lockfile,
    skill_name: install.skill.name,
    source: install.origin.source,
    source_label: install.origin.source_label,
    skill_id: install.origin.skill_id,
    version: install.origin.version,
    digest: actualDigest,
    xDigest,
    xDestination,
    runnerNames,
    trust_tier: install.origin.trust_tier,
  };

  if (existing !== undefined && hashString(existing) !== actualDigest) {
    throw new Error(`Skill install destination already exists with different content: ${destination}`);
  }
  if (candidate.xManifest && xDestination && existingX !== undefined && hashString(existingX) !== xDigest) {
    throw new Error(`Skill install X metadata already exists with different content: ${xDestination}`);
  }

  await mkdir(packageRoot, { recursive: true });
  if (existing === undefined) {
    await writeAtomic(destination, install.markdown);
  }
  if (candidate.xManifest && xDestination && shouldWriteX) {
    await writeAtomic(xDestination, candidate.xManifest);
  }
  await writeAtomic(lockfile, `${JSON.stringify(buildInstallLock(result, install.origin), null, 2)}\n`, true);

  return result;
}

async function fetchInstallCandidate(options: InstallLocalSkillOptions): Promise<FetchedInstallCandidate> {
  if (isMarketplaceRef(options.ref)) {
    const resolved = await resolveMarketplaceSkill(options.marketplaceAdapters ?? [], options.ref, {
      version: options.version,
    });
    if (!resolved) {
      throw new Error(`Marketplace skill not found: ${options.ref}`);
    }
    return {
      markdown: resolved.markdown,
      xManifest: resolved.xManifest,
      origin: {
        source: resolved.result.source,
        source_label: resolved.result.source_label,
        ref: options.ref,
        skill_id: resolved.result.skill_id,
        version: resolved.result.version,
        digest: resolved.result.digest,
        x_digest: resolved.result.x_digest,
        runner_names: resolved.result.runner_names,
        trust_tier: resolved.result.trust_tier,
      },
    };
  }

  if (isRemoteRegistryUrl(options.registryUrl)) {
    if (!options.installationId) {
      throw new Error("Remote registry installs require an installation id.");
    }
    const resolvedRef = await resolveRemoteRegistryRef(options.ref, {
      baseUrl: options.registryUrl,
      version: options.version,
    });
    if (!resolvedRef) {
      throw new Error(`Registry skill not found: ${options.ref}`);
    }
    const acquired = await acquireRegistrySkill(resolvedRef.skill_id, {
      baseUrl: options.registryUrl,
      installationId: options.installationId,
      version: resolvedRef.version,
      channel: "cli",
    });
    return {
      markdown: acquired.markdown,
      xManifest: acquired.x_manifest,
      origin: {
        source: "runx-registry",
        source_label: "runx registry",
        ref: options.ref,
        skill_id: acquired.skill_id,
        version: acquired.version,
        digest: acquired.digest,
        x_digest: acquired.x_digest,
        runner_names: acquired.runner_names,
        trust_tier: "runx-derived",
      },
    };
  }

  if (!options.registryStore) {
    throw new Error("A local registry store is required when no remote registry URL is configured.");
  }

  const resolved = await resolveRegistrySkill(options.registryStore, options.ref, {
    version: options.version,
    registryUrl: options.registryUrl,
  });
  if (!resolved) {
    throw new Error(`Registry skill not found: ${options.ref}`);
  }
  return {
    markdown: resolved.markdown,
    xManifest: resolved.x_manifest,
    origin: {
      source: resolved.source,
      source_label: resolved.source_label,
      ref: options.ref,
      skill_id: resolved.skill_id,
      version: resolved.version,
      digest: resolved.digest,
      x_digest: resolved.x_digest,
      runner_names: resolved.runner_names,
      trust_tier: "runx-derived",
    },
  };
}

function isRemoteRegistryUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function buildInstallLock(result: InstallLocalSkillResult, origin: SkillInstallOrigin): Readonly<Record<string, unknown>> {
  return {
    schema_version: "runx.skill-lock.v1",
    skill_name: result.skill_name,
    destination: result.destination,
    digest: result.digest,
    artifacts: {
      skill: {
        path: result.destination,
        digest: result.digest,
      },
      x: result.xDestination && result.xDigest
        ? {
            path: result.xDestination,
            digest: result.xDigest,
            runner_names: result.runnerNames,
          }
        : undefined,
    },
    origin,
  };
}

function validateInstallXManifest(
  skillName: string,
  xManifest: string | undefined,
  advertisedRunnerNames: readonly string[] | undefined,
): readonly string[] {
  if (!xManifest) {
    return advertisedRunnerNames ?? [];
  }

  const manifest = validateRunnerManifest(parseRunnerManifestYaml(xManifest));
  if (manifest.skill && manifest.skill !== skillName) {
    throw new Error(`Runner manifest skill '${manifest.skill}' does not match skill '${skillName}'.`);
  }

  const runnerNames = Object.keys(manifest.runners);
  if (
    advertisedRunnerNames &&
    (advertisedRunnerNames.length !== runnerNames.length ||
      advertisedRunnerNames.some((runnerName, index) => runnerName !== runnerNames[index]))
  ) {
    throw new Error(`Runner manifest runners do not match advertised runner metadata for skill '${skillName}'.`);
  }
  return runnerNames;
}

async function readExisting(destination: string): Promise<string | undefined> {
  try {
    return await readFile(destination, "utf8");
  } catch {
    return undefined;
  }
}

async function writeAtomic(destination: string, contents: string, replace = false): Promise<void> {
  const tempPath = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, contents, { flag: "wx", mode: 0o600 });
  try {
    if (!replace) {
      await assertMissing(destination);
    }
    await rename(tempPath, destination);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function assertMissing(destination: string): Promise<void> {
  try {
    await access(destination, fsConstants.F_OK);
  } catch {
    return;
  }
  throw new Error(`Skill install destination already exists: ${destination}`);
}

function safeSkillPackageParts(ref: string, skillName: string): readonly string[] {
  const normalizedRef = normalizeInstallRef(ref);
  const rawParts = normalizedRef.includes("/") ? normalizedRef.split("/") : [skillName];
  const parts = rawParts.map(safeSkillPathPart).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return [safeSkillPathPart(skillName)];
  }
  return parts;
}

function normalizeInstallRef(ref: string): string {
  const withoutProtocol = ref.startsWith("runx://skill/")
    ? decodeURIComponent(ref.slice("runx://skill/".length))
    : ref;
  const withoutPrefix = withoutProtocol.replace(/^[a-z0-9._-]+:/i, "");
  const atIndex = withoutPrefix.lastIndexOf("@");
  return atIndex > 0 ? withoutPrefix.slice(0, atIndex) : withoutPrefix;
}

function safeSkillPathPart(name: string): string {
  const part = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!part || part === "." || part === "..") {
    throw new Error("Skill name cannot produce an empty install path part.");
  }
  return part;
}
