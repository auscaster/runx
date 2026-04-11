export const marketplacesPackage = "@runx/marketplaces";

export type SkillSearchSource = "runx-registry" | string;
export type SkillSearchTrustTier = "runx-derived" | "external-unverified";
export type SkillRunnerMode = "standard-only" | "x-metadata";

export interface SkillSearchResult {
  readonly skill_id: string;
  readonly name: string;
  readonly summary?: string;
  readonly owner: string;
  readonly version?: string;
  readonly digest?: string;
  readonly source: SkillSearchSource;
  readonly source_label: string;
  readonly source_type: string;
  readonly trust_tier: SkillSearchTrustTier;
  readonly required_scopes: readonly string[];
  readonly tags: readonly string[];
  readonly runner_mode: SkillRunnerMode;
  readonly runner_names: readonly string[];
  readonly x_digest?: string;
  readonly x_trust_tier?: SkillSearchTrustTier;
  readonly trust_signals?: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: string;
    readonly value: string;
  }[];
  readonly add_command: string;
  readonly run_command: string;
}

export interface MarketplaceSearchOptions {
  readonly limit?: number;
}

export interface MarketplaceAdapter {
  readonly source: string;
  readonly label: string;
  readonly search: (query: string, options?: MarketplaceSearchOptions) => Promise<readonly SkillSearchResult[]>;
  readonly resolve?: (ref: string, options?: { readonly version?: string }) => Promise<{
    readonly markdown: string;
    readonly xManifest?: string;
    readonly result: SkillSearchResult;
  } | undefined>;
}

export async function searchMarketplaceAdapters(
  adapters: readonly MarketplaceAdapter[],
  query: string,
  options: MarketplaceSearchOptions = {},
): Promise<readonly SkillSearchResult[]> {
  const results = await Promise.all(adapters.map((adapter) => adapter.search(query, options)));
  return results.flat().slice(0, options.limit ?? 20);
}

export { createFixtureMarketplaceAdapter } from "./fixture.js";
export {
  isMarketplaceRef,
  parseMarketplaceRef,
  resolveMarketplaceSkill,
  type MarketplaceResolvedSkill,
  type MarketplaceResolveOptions,
  type MarketplaceResolver,
} from "./resolve.js";
