export const registryPackage = "@runx/registry";

export { createLocalRegistryClient, type RegistryClient } from "./client.js";
export {
  acquireRegistrySkill,
  readRemoteRegistrySkill,
  resolveRemoteRegistryRef,
  searchRemoteRegistry,
  type AcquiredRegistrySkill,
  type AcquireRegistrySkillOptions,
  type RemoteRegistrySkillDetail,
  type ResolveRemoteRegistryRefOptions,
  type SearchRemoteRegistryOptions,
} from "./http-client.js";
export {
  buildRegistrySkillVersion,
  createRegistrySkillVersion,
  ingestSkillMarkdown,
  type CreateRegistrySkillVersionResult,
  type IngestSkillOptions,
} from "./ingest.js";
export {
  resolveRunxLink,
  runxLinkForVersion,
  runxSkillPagePath,
  runxSkillPageUrl,
  runxSkillPageUrlForVersion,
  type RunxLinkResolution,
} from "./links.js";
export { publishSkillMarkdown, type PublishSkillMarkdownOptions, type PublishSkillMarkdownResult } from "./publish.js";
export { parseRegistrySkillRef, resolveRegistrySkill, type RegistrySkillResolution } from "./resolve.js";
export { normalizeRegistrySearchResult, searchRegistry, type RegistrySearchResult } from "./search.js";
export {
  FileRegistryStore,
  buildSkillId,
  createFileRegistryStore,
  slugify,
  splitSkillId,
  type RegistryPublisher,
  type RegistrySkill,
  type RegistrySkillVersion,
  type RegistryStore,
} from "./store.js";
export { deriveTrustSignals, type TrustSignal, type TrustSignalStatus } from "./trust.js";
