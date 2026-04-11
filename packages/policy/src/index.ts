export const policyPackage = "@runx/policy";

import { admitSandbox } from "./sandbox.js";

export interface LocalAdmissionSkill {
  readonly name: string;
  readonly source: {
    readonly type: string;
    readonly timeoutSeconds?: number;
    readonly sandbox?: LocalAdmissionSandbox;
  };
  readonly auth?: unknown;
  readonly runtime?: unknown;
}

export interface LocalAdmissionSandbox {
  readonly profile: "readonly" | "workspace-write" | "network" | "unrestricted-local-dev";
  readonly cwdPolicy?: "skill-directory" | "workspace" | "custom";
  readonly envAllowlist?: readonly string[];
  readonly network?: boolean;
  readonly writablePaths?: readonly string[];
}

export interface LocalAdmissionOptions {
  readonly allowedSourceTypes?: readonly string[];
  readonly maxTimeoutSeconds?: number;
  readonly connectedGrants?: readonly LocalAdmissionGrant[];
  readonly skipConnectedAuth?: boolean;
  readonly approvedSandboxEscalation?: boolean;
  readonly skipSandboxEscalation?: boolean;
}

export interface LocalAdmissionGrant {
  readonly grant_id: string;
  readonly provider: string;
  readonly scopes: readonly string[];
  readonly status?: "active" | "revoked";
}

export interface RetryAdmissionRequest {
  readonly stepId: string;
  readonly retry?: {
    readonly maxAttempts: number;
  };
  readonly mutating?: boolean;
  readonly idempotencyKey?: string;
}

export interface ChainScopeGrant {
  readonly grant_id?: string;
  readonly scopes: readonly string[];
}

export interface ChainScopeAdmissionRequest {
  readonly stepId: string;
  readonly requestedScopes: readonly string[];
  readonly grant: ChainScopeGrant;
}

export type AdmissionDecision =
  | { readonly status: "allow"; readonly reasons: readonly string[] }
  | { readonly status: "deny"; readonly reasons: readonly string[] };

export type ChainScopeAdmissionDecision =
  | {
      readonly status: "allow";
      readonly reasons: readonly string[];
      readonly stepId: string;
      readonly requestedScopes: readonly string[];
      readonly grantedScopes: readonly string[];
      readonly grantId?: string;
    }
  | {
      readonly status: "deny";
      readonly reasons: readonly string[];
      readonly stepId: string;
      readonly requestedScopes: readonly string[];
      readonly grantedScopes: readonly string[];
      readonly grantId?: string;
    };

export function admitLocalSkill(
  skill: LocalAdmissionSkill,
  options: LocalAdmissionOptions = {},
): AdmissionDecision {
  const allowedSourceTypes = options.allowedSourceTypes ?? ["agent", "cli-tool", "mcp", "a2a", "chain"];
  const maxTimeoutSeconds = options.maxTimeoutSeconds ?? 300;
  const reasons: string[] = [];

  if (!allowedSourceTypes.includes(skill.source.type)) {
    reasons.push(`source type '${skill.source.type}' is not allowed for local execution`);
  }

  if (skill.source.timeoutSeconds !== undefined) {
    if (skill.source.timeoutSeconds <= 0) {
      reasons.push("source timeout must be greater than zero seconds");
    }
    if (skill.source.timeoutSeconds > maxTimeoutSeconds) {
      reasons.push(`source timeout exceeds local maximum of ${maxTimeoutSeconds} seconds`);
    }
  }

  if (skill.source.type === "cli-tool") {
    const sandboxDecision = admitSandbox(skill.source.sandbox, {
      approvedEscalation: options.approvedSandboxEscalation,
      skipEscalation: options.skipSandboxEscalation,
    });
    if (sandboxDecision.status !== "allow") {
      reasons.push(...sandboxDecision.reasons);
    }
  }

  const authRequirement = options.skipConnectedAuth ? undefined : connectedAuthRequirement(skill.auth);
  if (authRequirement) {
    const grant = findMatchingGrant(authRequirement, options.connectedGrants ?? []);
    if (!grant) {
      reasons.push(`connected auth grant required for provider '${authRequirement.provider}'`);
    }
  }

  if (reasons.length > 0) {
    return {
      status: "deny",
      reasons,
    };
  }

  return {
    status: "allow",
    reasons: ["local admission allowed"],
  };
}

export function admitRetryPolicy(request: RetryAdmissionRequest): AdmissionDecision {
  const maxAttempts = request.retry?.maxAttempts ?? 1;
  if (maxAttempts <= 1) {
    return {
      status: "allow",
      reasons: ["retry policy not requested"],
    };
  }

  if (request.mutating && !request.idempotencyKey) {
    return {
      status: "deny",
      reasons: [`step '${request.stepId}' declares mutating retry without an idempotency key`],
    };
  }

  return {
    status: "allow",
    reasons: ["retry policy allowed"],
  };
}

export function admitChainStepScopes(request: ChainScopeAdmissionRequest): ChainScopeAdmissionDecision {
  const requestedScopes = unique(request.requestedScopes);
  const grantedScopes = unique(request.grant.scopes);
  const deniedScopes = requestedScopes.filter((scope) => !grantedScopes.some((grantedScope) => scopeAllows(grantedScope, scope)));

  if (deniedScopes.length > 0) {
    return {
      status: "deny",
      reasons: [`step '${request.stepId}' requested scope(s) outside chain grant: ${deniedScopes.join(", ")}`],
      stepId: request.stepId,
      requestedScopes,
      grantedScopes,
      grantId: request.grant.grant_id,
    };
  }

  return {
    status: "allow",
    reasons: requestedScopes.length > 0 ? ["chain step scopes allowed"] : ["chain step requested no scopes"],
    stepId: request.stepId,
    requestedScopes,
    grantedScopes,
    grantId: request.grant.grant_id,
  };
}

function connectedAuthRequirement(auth: unknown): { readonly provider: string; readonly scopes: readonly string[] } | undefined {
  if (auth === undefined || auth === null || auth === false) {
    return undefined;
  }

  if (!isRecord(auth)) {
    return {
      provider: "unknown",
      scopes: [],
    };
  }

  const type = auth.type;
  if (type === "env" || type === "none" || type === "local") {
    return undefined;
  }

  return {
    provider: typeof auth.provider === "string" ? auth.provider : typeof type === "string" ? type : "unknown",
    scopes: Array.isArray(auth.scopes) ? auth.scopes.filter((scope): scope is string => typeof scope === "string") : [],
  };
}

function findMatchingGrant(
  requirement: { readonly provider: string; readonly scopes: readonly string[] },
  grants: readonly LocalAdmissionGrant[],
): LocalAdmissionGrant | undefined {
  return grants.find(
    (grant) =>
      grant.provider === requirement.provider &&
      grant.status !== "revoked" &&
      requirement.scopes.every((scope) => grant.scopes.includes(scope)),
  );
}

function scopeAllows(grantedScope: string, requestedScope: string): boolean {
  if (grantedScope === "*" || grantedScope === requestedScope) {
    return true;
  }
  if (grantedScope.endsWith(":*")) {
    return requestedScope.startsWith(grantedScope.slice(0, -1));
  }
  return false;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export {
  admitSandbox,
  normalizeSandboxDeclaration,
  sandboxRequiresApproval,
  type RequiredSandboxDeclaration,
  type SandboxAdmissionDecision,
  type SandboxDeclaration,
  type SandboxProfile,
} from "./sandbox.js";
