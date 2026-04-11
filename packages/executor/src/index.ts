export const executorPackage = "@runx/executor";

import type { ValidatedSkill } from "../../parser/src/index.js";

export interface AdapterInvokeRequest {
  readonly skillName?: string;
  readonly skillBody?: string;
  readonly source: ValidatedSkill["source"];
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly resolvedInputs?: Readonly<Record<string, string>>;
  readonly skillDirectory: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly credential?: CredentialEnvelope;
  readonly signal?: AbortSignal;
}

export interface AdapterInvokeResult {
  readonly status: "success" | "failure";
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly errorMessage?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SkillAdapter {
  readonly type: string;
  readonly invoke: (request: AdapterInvokeRequest) => Promise<AdapterInvokeResult>;
}

export interface CredentialEnvelope {
  readonly kind: string;
  readonly grant_id: string;
  readonly provider: string;
  readonly connection_id: string;
  readonly scopes: readonly string[];
  readonly material_ref: string;
}

export interface ExecuteSkillOptions {
  readonly skill: ValidatedSkill;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly resolvedInputs?: Readonly<Record<string, string>>;
  readonly skillDirectory: string;
  readonly adapters: readonly SkillAdapter[];
  readonly env?: NodeJS.ProcessEnv;
  readonly credential?: CredentialEnvelope;
  readonly signal?: AbortSignal;
}

export async function executeSkill(options: ExecuteSkillOptions): Promise<AdapterInvokeResult> {
  const adapter = options.adapters.find((candidate) => candidate.type === options.skill.source.type);

  if (!adapter) {
    return {
      status: "failure",
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      durationMs: 0,
      errorMessage: `No adapter registered for source type '${options.skill.source.type}'.`,
    };
  }

  return await adapter.invoke({
    skillName: options.skill.name,
    skillBody: options.skill.body,
    source: options.skill.source,
    inputs: options.inputs,
    resolvedInputs: options.resolvedInputs,
    skillDirectory: options.skillDirectory,
    env: options.env,
    credential: options.credential,
    signal: options.signal,
  });
}
