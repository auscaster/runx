import type { RegistrySkillVersion } from "./store.js";

export type TrustSignalStatus = "verified" | "declared" | "not_declared" | "placeholder";

export interface TrustSignal {
  readonly id: string;
  readonly label: string;
  readonly status: TrustSignalStatus;
  readonly value: string;
}

export function deriveTrustSignals(version: RegistrySkillVersion): readonly TrustSignal[] {
  return [
    {
      id: "digest",
      label: "Immutable digest",
      status: "verified",
      value: `sha256:${version.digest}`,
    },
    {
      id: "source_type",
      label: "Execution source",
      status: "declared",
      value: version.source_type,
    },
    {
      id: "publisher",
      label: "Publisher identity",
      status: version.publisher.type === "placeholder" ? "placeholder" : "verified",
      value: version.publisher.id,
    },
    {
      id: "scopes",
      label: "Required scopes",
      status: version.required_scopes.length > 0 ? "declared" : "not_declared",
      value: version.required_scopes.length > 0 ? version.required_scopes.join(", ") : "none declared",
    },
    {
      id: "runtime",
      label: "Runtime requirements",
      status: version.runtime ? "declared" : "not_declared",
      value: version.runtime ? "declared in skill metadata" : "none declared",
    },
    {
      id: "runner_metadata",
      label: "Runner metadata",
      status: version.x_digest ? "verified" : "not_declared",
      value: version.x_digest
        ? `${version.runner_names.length} runner(s), x sha256:${version.x_digest}`
        : "standard-only agent runner",
    },
  ];
}
