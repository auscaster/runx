export interface UrlAddIndexedListing {
  readonly owner: string;
  readonly name: string;
  readonly skill_id: string;
  readonly version: string;
  readonly permalink: string;
  readonly trust_tier: "first_party" | "verified" | "community";
  readonly skill_path: string;
  readonly digest_unchanged: boolean;
}

export interface UrlAddIndexWarning {
  readonly skill_path?: string;
  readonly code: string;
  readonly detail: string;
}

export interface UrlAddIndexResult {
  readonly status: "success";
  readonly listings: readonly UrlAddIndexedListing[];
  readonly warnings: readonly UrlAddIndexWarning[];
  readonly repo: { readonly owner: string; readonly repo: string; readonly ref: string; readonly sha: string };
}

export interface UrlAddErrorPayload {
  readonly status: "error";
  readonly error: {
    readonly code: string;
    readonly detail: string;
    readonly hint?: string;
    readonly retry_after_seconds?: number;
  };
}

export class UrlAddCliError extends Error {
  constructor(readonly payload: UrlAddErrorPayload["error"]) {
    super(payload.detail);
    this.name = "UrlAddCliError";
  }
}

export function isGithubRepoUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("https://github.com/") || trimmed.startsWith("http://github.com/")) {
    return /github\.com\/[^/]+\/[^/]+/.test(trimmed);
  }
  if (trimmed.startsWith("github.com/")) {
    return /github\.com\/[^/]+\/[^/]+/.test(trimmed);
  }
  return false;
}

export interface UrlAddOptions {
  readonly repoUrl: string;
  readonly ref?: string;
  readonly apiBaseUrl: string;
  readonly fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}

export async function publishUrlSkill(options: UrlAddOptions): Promise<UrlAddIndexResult> {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const endpoint = `${options.apiBaseUrl.replace(/\/$/, "")}/v1/index`;
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo_url: options.repoUrl, ref: options.ref }),
  });
  const text = await response.text();
  if (!response.ok) {
    let payload: UrlAddErrorPayload | undefined;
    try {
      payload = JSON.parse(text) as UrlAddErrorPayload;
    } catch {
      throw new UrlAddCliError({
        code: "http_error",
        detail: `runx-api returned ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
      });
    }
    throw new UrlAddCliError(payload.error);
  }
  return JSON.parse(text) as UrlAddIndexResult;
}

export function renderUrlAddResult(result: UrlAddIndexResult): string {
  const lines: string[] = [];
  lines.push(`indexed ${result.listings.length} skill${result.listings.length === 1 ? "" : "s"} from ${result.repo.owner}/${result.repo.repo}@${result.repo.sha.slice(0, 12)}`);
  lines.push("");
  for (const listing of result.listings) {
    const tag = listing.digest_unchanged ? "  (unchanged)" : "  (new)";
    const registryRef = `${listing.skill_id}@${listing.version}`;
    lines.push(`  ${listing.skill_id}@${listing.version} · ${listing.trust_tier}${tag}`);
    lines.push(`    → ${listing.permalink}`);
    lines.push(`    install: runx add ${registryRef}`);
    lines.push(`    run:     runx ${listing.name}`);
    lines.push("");
  }
  if (result.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of result.warnings) {
      const where = warning.skill_path ? ` (${warning.skill_path})` : "";
      lines.push(`  - ${warning.code}${where}: ${warning.detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function resolveUrlAddApiBaseUrl(env: Record<string, string | undefined>): string {
  return env.RUNX_PUBLIC_API_BASE_URL?.trim() || "https://runx.ai";
}
