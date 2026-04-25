import { buildRegistrySkillVersion, type IngestSkillOptions } from "./ingest.js";
import type { RegistrySkillVersion, RegistryTrustTier } from "./store.js";

export interface GitHubSourceSnapshot {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly ref: string;
  readonly sha: string;
  readonly markdown: string;
  readonly profileDocument?: string;
  readonly tag?: string;
  readonly indexedAt?: string;
  readonly publisherHandle?: string;
  readonly event: "enrollment" | "push" | "tag" | "tombstone";
  readonly live?: boolean;
  readonly tombstoned?: boolean;
  readonly skillPath?: string;
  readonly profilePath?: string;
  readonly trustTier?: RegistryTrustTier;
}

export interface ResolvedGitHubSource {
  readonly markdown: string;
  readonly profileDocument?: string;
  readonly profilePath?: string;
  readonly version: string;
  readonly ingestOptions: IngestSkillOptions;
}

export function resolveGitHubSource(snapshot: GitHubSourceSnapshot): ResolvedGitHubSource {
  const profileDocument = snapshot.profileDocument;
  const profilePath = snapshot.profilePath ?? (snapshot.profileDocument ? "X.yaml" : undefined);
  const skillPath = snapshot.skillPath?.trim() || "SKILL.md";
  const owner = snapshot.owner.trim().toLowerCase();
  const repo = snapshot.repo.trim();
  const defaultBranch = snapshot.defaultBranch.trim() || "main";
  const tag = normalizeTag(snapshot.tag);
  const immutable = snapshot.event === "tag" && Boolean(tag);
  const immutableTag = immutable ? tag : undefined;
  const version = immutableTag ?? `sha-${snapshot.sha.trim().slice(0, 12)}`;

  return {
    markdown: snapshot.markdown,
    profileDocument,
    profilePath,
    version,
    ingestOptions: {
      owner,
      version,
      trustTier: snapshot.trustTier,
      createdAt: snapshot.indexedAt,
      profileDocument,
      sourceMetadata: {
        provider: "github",
        repo: `${owner}/${repo}`,
        repo_url: `https://github.com/${owner}/${repo}`,
        skill_path: skillPath,
        profile_path: profilePath,
        ref: immutableTag ?? defaultBranch,
        sha: snapshot.sha.trim(),
        default_branch: defaultBranch,
        event: snapshot.event,
        immutable,
        live: snapshot.live ?? !snapshot.tombstoned,
        tombstoned: snapshot.tombstoned ?? false,
        tag: immutableTag,
        publisher_handle: snapshot.publisherHandle?.trim() || undefined,
      },
    },
  };
}

export function buildGitHubRegistrySkillVersion(snapshot: GitHubSourceSnapshot): RegistrySkillVersion {
  const resolved = resolveGitHubSource(snapshot);
  return buildRegistrySkillVersion(resolved.markdown, resolved.ingestOptions);
}

function normalizeTag(tag: string | undefined): string | undefined {
  if (!tag) {
    return undefined;
  }
  const trimmed = tag.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^v(?=\d)/, "");
}
