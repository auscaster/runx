export const runnerLocalPackage = "@runx/runner-local";

export * from "./skill-install.js";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { createA2aAdapter, createFixtureA2aTransport } from "../../adapters/a2a/src/index.js";
import {
  appendJournalEntries,
  createReceiptLinkEntry,
  createRunEventEntry,
  materializeArtifacts,
  readJournalEntries,
  type ArtifactContract,
  type ArtifactEnvelope,
} from "../../artifacts/src/index.js";
import { runFanout } from "./fanout.js";
import { createCliToolAdapter } from "../../adapters/cli-tool/src/index.js";
import { createMcpAdapter } from "../../adapters/mcp/src/index.js";
import { executeSkill, type AdapterInvokeResult, type CredentialEnvelope, type SkillAdapter } from "../../executor/src/index.js";
import { createFileMemoryStore } from "../../memory/src/index.js";
import {
  parseChainYaml,
  parseRunnerManifestYaml,
  parseSkillMarkdown,
  validateChain,
  validateSkillArtifactContract,
  validateRunnerManifest,
  validateSkillSource,
  validateSkill,
  type ChainDefinition,
  type ChainPolicy,
  type ChainStep,
  type SkillInput,
  type SkillRunnerDefinition,
  type SkillSandbox,
  type ValidatedSkill,
} from "../../parser/src/index.js";
import {
  admitChainStepScopes,
  admitLocalSkill,
  admitRetryPolicy,
  sandboxRequiresApproval,
  type ChainScopeGrant,
  type LocalAdmissionGrant,
} from "../../policy/src/index.js";
import {
  hashStable,
  listVerifiedLocalReceipts,
  readVerifiedLocalReceipt,
  uniqueReceiptId,
  writeLocalChainReceipt,
  writeLocalReceipt,
  type ChainReceiptStep,
  type ChainReceiptSyncPoint,
  type LocalChainReceipt,
  type LocalReceipt,
  type LocalSkillReceipt,
  type ReceiptVerification,
} from "../../receipts/src/index.js";
import {
  createSingleStepState,
  createSequentialChainState,
  evaluateFanoutSync,
  planSequentialChainTransition,
  transitionSequentialChain,
  transitionSingleStep,
  type FanoutSyncDecision,
  type SequentialChainState,
  type SingleStepState,
} from "../../state-machine/src/index.js";

export interface Question {
  readonly id: string;
  readonly prompt: string;
  readonly description?: string;
  readonly required: boolean;
  readonly type: string;
}

export interface ApprovalGate {
  readonly id: string;
  readonly reason: string;
  readonly type?: string;
  readonly summary?: Readonly<Record<string, unknown>>;
}

export interface ApprovalDecision {
  readonly gate: ApprovalGate;
  readonly approved: boolean;
}

export interface ExecutionEvent {
  readonly type:
    | "skill_loaded"
    | "inputs_resolved"
    | "auth_resolved"
    | "approval_requested"
    | "approval_resolved"
    | "admitted"
    | "executing"
    | "completed";
  readonly message: string;
  readonly data?: unknown;
}

export interface Caller {
  readonly answer: (questions: readonly Question[]) => Promise<Readonly<Record<string, unknown>>>;
  readonly approve: (gate: ApprovalGate) => Promise<boolean>;
  readonly report: (event: ExecutionEvent) => void | Promise<void>;
}

export interface RunLocalSkillOptions {
  readonly skillPath: string;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly answersPath?: string;
  readonly caller: Caller;
  readonly env?: NodeJS.ProcessEnv;
  readonly receiptDir?: string;
  readonly runxHome?: string;
  readonly parentReceipt?: string;
  readonly contextFrom?: readonly string[];
  readonly adapters?: readonly SkillAdapter[];
  readonly allowedSourceTypes?: readonly string[];
  readonly runner?: string;
  readonly memoryDir?: string;
  readonly authResolver?: AuthResolver;
  readonly receiptMetadata?: Readonly<Record<string, unknown>>;
  readonly resumeFromRunId?: string;
}

interface RunResolvedSkillOptions {
  readonly skill: ValidatedSkill;
  readonly skillDirectory: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly caller: Caller;
  readonly env?: NodeJS.ProcessEnv;
  readonly receiptDir?: string;
  readonly runxHome?: string;
  readonly parentReceipt?: string;
  readonly contextFrom?: readonly string[];
  readonly adapters?: readonly SkillAdapter[];
  readonly allowedSourceTypes?: readonly string[];
  readonly authResolver?: AuthResolver;
  readonly receiptMetadata?: Readonly<Record<string, unknown>>;
  readonly resumeFromRunId?: string;
  readonly skillPathForMissingContext?: string;
}

export interface AuthResolver {
  readonly resolveGrants: (request: AuthGrantRequest) => Promise<AuthGrantResolution | undefined>;
  readonly resolveCredential: (request: AuthCredentialRequest) => Promise<AuthCredentialResolution | undefined>;
}

export interface AuthGrantRequest {
  readonly skill: ValidatedSkill;
  readonly inputs: Readonly<Record<string, unknown>>;
}

export interface AuthGrantResolution {
  readonly grants: readonly LocalAdmissionGrant[];
}

export interface AuthCredentialRequest extends AuthGrantRequest {
  readonly grants: readonly LocalAdmissionGrant[];
}

export interface AuthCredentialResolution {
  readonly credential?: CredentialEnvelope;
  readonly receiptMetadata?: Readonly<Record<string, unknown>>;
}

interface ResolvedSkillReference {
  readonly requestedPath: string;
  readonly skillPath: string;
  readonly skillDirectory: string;
  readonly xManifestCandidates: readonly string[];
}

export type RunLocalSkillResult =
  | {
      readonly status: "missing_context";
      readonly skillPath: string;
      readonly questions: readonly Question[];
    }
  | {
      readonly status: "policy_denied";
      readonly skill: ValidatedSkill;
      readonly reasons: readonly string[];
      readonly approval?: ApprovalDecision;
      readonly receipt?: LocalSkillReceipt;
    }
  | {
      readonly status: "success" | "failure";
      readonly skill: ValidatedSkill;
      readonly inputs: Readonly<Record<string, unknown>>;
      readonly execution: AdapterInvokeResult;
      readonly state: SingleStepState;
      readonly receipt: LocalReceipt;
    };

export interface RunLocalChainOptions {
  readonly chainPath?: string;
  readonly chain?: ChainDefinition;
  readonly chainDirectory?: string;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly caller: Caller;
  readonly env?: NodeJS.ProcessEnv;
  readonly receiptDir?: string;
  readonly runxHome?: string;
  readonly adapters?: readonly SkillAdapter[];
  readonly allowedSourceTypes?: readonly string[];
  readonly authResolver?: AuthResolver;
  readonly chainGrant?: ChainScopeGrant;
  readonly runId?: string;
  readonly skillEnvironment?: {
    readonly name: string;
    readonly body: string;
  };
  readonly resumeFromRunId?: string;
}

export interface ChainStepRun {
  readonly stepId: string;
  readonly skill: string;
  readonly skillPath: string;
  readonly runner?: string;
  readonly attempt: number;
  readonly status: "success" | "failure";
  readonly receiptId?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly parentReceipt?: string;
  readonly fanoutGroup?: string;
  readonly retry?: RetryReceiptContext;
  readonly contextFrom: readonly {
    readonly input: string;
    readonly fromStep: string;
    readonly output: string;
    readonly receiptId?: string;
  }[];
  readonly governance?: ChainStepGovernance;
  readonly artifactIds?: readonly string[];
}

interface ChainStepGovernance {
  readonly scopeAdmission: {
    readonly status: "allow" | "deny";
    readonly requestedScopes: readonly string[];
    readonly grantedScopes: readonly string[];
    readonly grantId?: string;
    readonly reasons?: readonly string[];
  };
}

interface RetryReceiptContext {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly ruleFired: string;
  readonly idempotencyKeyHash?: string;
}

export type RunLocalChainResult =
  | {
      readonly status: "missing_context";
      readonly chain: ChainDefinition;
      readonly stepId: string;
      readonly skillPath: string;
      readonly questions: readonly Question[];
      readonly state: SequentialChainState;
    }
  | {
      readonly status: "policy_denied";
      readonly chain: ChainDefinition;
      readonly stepId: string;
      readonly skill: ValidatedSkill;
      readonly reasons: readonly string[];
      readonly state: SequentialChainState;
      readonly receipt?: LocalChainReceipt;
    }
  | {
      readonly status: "success" | "failure";
      readonly chain: ChainDefinition;
      readonly state: SequentialChainState;
      readonly steps: readonly ChainStepRun[];
      readonly receipt: LocalChainReceipt;
      readonly output: string;
      readonly errorMessage?: string;
    };

export interface InspectLocalChainOptions {
  readonly chainId: string;
  readonly receiptDir?: string;
  readonly runxHome?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface InspectLocalReceiptOptions {
  readonly receiptId: string;
  readonly receiptDir?: string;
  readonly runxHome?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface InspectLocalReceiptResult {
  readonly receipt: LocalReceipt;
  readonly verification: ReceiptVerification;
  readonly summary: LocalReceiptSummary;
}

export interface ListLocalHistoryOptions {
  readonly receiptDir?: string;
  readonly runxHome?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly limit?: number;
}

export interface ListLocalHistoryResult {
  readonly receipts: readonly LocalReceiptSummary[];
}

export interface LocalReceiptSummary {
  readonly id: string;
  readonly kind: LocalReceipt["kind"];
  readonly status: LocalReceipt["status"];
  readonly verification: ReceiptVerification;
  readonly name: string;
  readonly sourceType?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface InspectLocalChainResult {
  readonly receipt: LocalChainReceipt;
  readonly verification: ReceiptVerification;
  readonly summary: {
    readonly id: string;
    readonly name: string;
    readonly status: "success" | "failure";
    readonly verification: ReceiptVerification;
    readonly steps: readonly {
      readonly id: string;
      readonly attempt: number;
      readonly status: "success" | "failure";
      readonly receiptId?: string;
      readonly fanoutGroup?: string;
    }[];
    readonly syncPoints: readonly {
      readonly groupId: string;
      readonly decision: "proceed" | "halt" | "pause" | "escalate";
      readonly ruleFired: string;
      readonly reason: string;
    }[];
  };
}

export function createCallerAgentStepAdapter(caller: Caller): SkillAdapter {
  return {
    type: "agent-step",
    invoke: async (request) => {
      const startedAt = Date.now();
      const skillName = request.skillName ?? "agent-step";
      const questionId = `agent_step.${normalizeQuestionId(request.source.task ?? skillName)}.output`;
      const answers = await caller.answer([
        {
          id: questionId,
          prompt: renderAgentStepPrompt(request),
          description: "Return the structured output for this agent-step.",
          required: true,
          type: "json",
        },
      ]);
      const output = answers[questionId];

      if (output === undefined || output === null || output === "") {
        const errorMessage = `agent-step '${request.source.task ?? skillName}' did not receive output from the caller`;
        return {
          status: "failure",
          stdout: "",
          stderr: errorMessage,
          exitCode: null,
          signal: null,
          durationMs: Date.now() - startedAt,
          errorMessage,
          metadata: {
            agent_hook: {
              source_type: "agent-step",
              agent: request.source.agent,
              task: request.source.task,
              route: "caller",
              status: "failure",
            },
          },
        };
      }

      return {
        status: "success",
        stdout: typeof output === "string" ? output : JSON.stringify(output),
        stderr: "",
        exitCode: 0,
        signal: null,
        durationMs: Date.now() - startedAt,
        metadata: {
          agent_hook: {
            source_type: "agent-step",
            agent: request.source.agent,
            task: request.source.task,
            route: "caller",
            status: "success",
          },
        },
      };
    },
  };
}

export function createCallerAgentAdapter(caller: Caller): SkillAdapter {
  return {
    type: "agent",
    invoke: async (request) => {
      const startedAt = Date.now();
      const skillName = request.skillName ?? "skill";
      const questionId = `agent.${normalizeQuestionId(skillName)}.output`;
      const answers = await caller.answer([
        {
          id: questionId,
          prompt: renderAgentRunnerPrompt(request),
          description: "Run this standard skill through the controlling caller and return its reported output.",
          required: true,
          type: "json",
        },
      ]);
      const output = answers[questionId];

      if (output === undefined || output === null || output === "") {
        const errorMessage = `agent runner '${skillName}' did not receive output from the caller`;
        return {
          status: "failure",
          stdout: "",
          stderr: errorMessage,
          exitCode: null,
          signal: null,
          durationMs: Date.now() - startedAt,
          errorMessage,
          metadata: {
            agent_runner: {
              skill: skillName,
              status: "failure",
            },
          },
        };
      }

      return {
        status: "success",
        stdout: typeof output === "string" ? output : JSON.stringify(output),
        stderr: "",
        exitCode: 0,
        signal: null,
        durationMs: Date.now() - startedAt,
        metadata: {
          agent_runner: {
            skill: skillName,
            status: "success",
          },
        },
      };
    },
  };
}

export function createCallerApprovalAdapter(caller: Caller): SkillAdapter {
  return {
    type: "approval",
    invoke: async (request) => {
      const startedAt = Date.now();
      const summary = isPlainRecord(request.inputs.summary) ? request.inputs.summary : request.inputs;
      const gate: ApprovalGate = {
        id: String(request.inputs.gate_id ?? `${request.skillName ?? "approval"}.gate`),
        type: "approval",
        reason:
          typeof request.inputs.reason === "string"
            ? request.inputs.reason
            : `Approval required for ${request.skillName ?? "approval"}.`,
        summary,
      };
      const approved = await caller.approve(gate);
      return {
        status: "success",
        stdout: JSON.stringify({
          approved,
          reason: gate.reason,
          conditions: [],
        }),
        stderr: "",
        exitCode: 0,
        signal: null,
        durationMs: Date.now() - startedAt,
        metadata: {
          approval: {
            gate_id: gate.id,
            gate_type: gate.type,
            decision: approved ? "approved" : "denied",
            reason: gate.reason,
            summary: gate.summary,
          },
        },
      };
    },
  };
}

export async function runLocalSkill(options: RunLocalSkillOptions): Promise<RunLocalSkillResult> {
  const resolvedSkill = await resolveSkillReference(options.skillPath);
  const rawMarkdown = await readFile(resolvedSkill.skillPath, "utf8");
  const rawSkill = parseSkillMarkdown(rawMarkdown);
  const skill = await resolveSkillRunner(validateSkill(rawSkill, { mode: "strict" }), resolvedSkill.xManifestCandidates, options.runner);

  await options.caller.report({
    type: "skill_loaded",
    message: `Loaded skill ${skill.name}.`,
    data: { skillPath: resolvedSkill.skillPath, requestedPath: resolvedSkill.requestedPath },
  });

  const inputResolution = await resolveInputs(skill, options);
  if (inputResolution.status === "missing_context") {
    return {
      status: "missing_context",
      skillPath: resolvedSkill.skillPath,
      questions: inputResolution.questions,
    };
  }

  await options.caller.report({
    type: "inputs_resolved",
    message: `Resolved ${Object.keys(inputResolution.inputs).length} input(s).`,
  });

  return await runResolvedSkill({
    skill,
    skillDirectory: resolvedSkill.skillDirectory,
    inputs: inputResolution.inputs,
    caller: options.caller,
    env: options.env,
    receiptDir: options.receiptDir,
    runxHome: options.runxHome,
    parentReceipt: options.parentReceipt,
    contextFrom: options.contextFrom,
    adapters: options.adapters,
    allowedSourceTypes: options.allowedSourceTypes,
    authResolver: options.authResolver,
    receiptMetadata: options.receiptMetadata,
    resumeFromRunId: options.resumeFromRunId,
    skillPathForMissingContext: resolvedSkill.skillPath,
  });
}

async function runResolvedSkill(options: RunResolvedSkillOptions): Promise<RunLocalSkillResult> {
  const { skill } = options;

  const structuralAdmission = admitLocalSkill(skill, {
    allowedSourceTypes: options.allowedSourceTypes,
    skipConnectedAuth: true,
    skipSandboxEscalation: true,
  });
  if (structuralAdmission.status === "deny") {
    return {
      status: "policy_denied",
      skill,
      reasons: structuralAdmission.reasons,
    };
  }

  const grantResolution = await options.authResolver?.resolveGrants({
    skill,
    inputs: options.inputs,
  });
  if (grantResolution) {
    await options.caller.report({
      type: "auth_resolved",
      message: `Resolved ${grantResolution.grants.length} auth grant(s).`,
    });
  }

  const sandboxApproval = await approveSandboxEscalationIfNeeded(skill, options.caller);
  const approvedSandboxEscalation = sandboxApproval?.approved ?? false;

  const admission = admitLocalSkill(skill, {
    allowedSourceTypes: options.allowedSourceTypes,
    connectedGrants: grantResolution?.grants,
    approvedSandboxEscalation,
  });
  if (admission.status === "deny") {
    const receipt =
      sandboxApproval && !sandboxApproval.approved
        ? await writeApprovalDeniedReceipt({
            skill,
            inputs: options.inputs,
            reasons: admission.reasons,
            approval: sandboxApproval,
            runOptions: options,
          })
        : undefined;
    return {
      status: "policy_denied",
      skill,
      reasons: admission.reasons,
      approval: sandboxApproval && !sandboxApproval.approved ? sandboxApproval : undefined,
      receipt,
    };
  }

  await options.caller.report({
    type: "admitted",
    message: "Local policy admitted skill execution.",
  });

  if (skill.source.type === "chain" && skill.source.chain) {
    const chainResult = await runLocalChain({
      chain: materializeInlineChain(skill),
      chainDirectory: options.skillDirectory,
      inputs: options.inputs,
      caller: options.caller,
      env: options.env,
      receiptDir: options.receiptDir,
      runxHome: options.runxHome,
      adapters: options.adapters,
      allowedSourceTypes: options.allowedSourceTypes,
      authResolver: options.authResolver,
      runId: options.resumeFromRunId ?? uniqueReceiptId("cx"),
      skillEnvironment: {
        name: skill.name,
        body: skill.body,
      },
      resumeFromRunId: options.resumeFromRunId,
    });

    if (chainResult.status === "missing_context") {
      return {
        status: "missing_context",
        skillPath: options.skillPathForMissingContext ?? options.skillDirectory,
        questions: chainResult.questions,
      };
    }

    if (chainResult.status === "policy_denied") {
      return {
        status: "policy_denied",
        skill,
        reasons: chainResult.reasons,
      };
    }

    let state = createSingleStepState(skill.name);
    state = transitionSingleStep(state, { type: "admit" });
    state = transitionSingleStep(state, { type: "start", at: chainResult.receipt.started_at ?? new Date().toISOString() });
    if (chainResult.status === "success") {
      state = transitionSingleStep(state, {
        type: "succeed",
        at: chainResult.receipt.completed_at ?? new Date().toISOString(),
      });
    } else {
      state = transitionSingleStep(state, {
        type: "fail",
        at: chainResult.receipt.completed_at ?? new Date().toISOString(),
        error: chainResult.errorMessage ?? "chain execution failed",
      });
    }

    return {
      status: chainResult.status,
      skill,
      inputs: options.inputs,
      execution: {
        status: chainResult.status,
        stdout: chainResult.output,
        stderr: chainResult.errorMessage ?? "",
        exitCode: chainResult.status === "success" ? 0 : 1,
        signal: null,
        durationMs: chainResult.receipt.duration_ms,
        errorMessage: chainResult.errorMessage,
        metadata: {
          composite: {
            chain_receipt_id: chainResult.receipt.id,
            top_level_skill: skill.name,
          },
        },
      },
      state,
      receipt: chainResult.receipt,
    };
  }

  let state = createSingleStepState(skill.name);
  state = transitionSingleStep(state, { type: "admit" });
  const runId = options.resumeFromRunId ?? uniqueReceiptId("rx");
  const startedAt = new Date().toISOString();
  state = transitionSingleStep(state, { type: "start", at: startedAt });

  const credentialResolution = await options.authResolver?.resolveCredential({
    skill,
    inputs: options.inputs,
    grants: grantResolution?.grants ?? [],
  });

  await options.caller.report({
    type: "executing",
    message: `Executing ${skill.source.type} skill source.`,
  });

  const executionSkill = withSandboxApproval(skill, approvedSandboxEscalation);

  const execution = await executeSkill({
    skill: executionSkill,
    inputs: options.inputs,
    skillDirectory: options.skillDirectory,
    adapters: [
      ...(options.adapters ?? []),
      createCallerAgentAdapter(options.caller),
      createCallerAgentStepAdapter(options.caller),
      createCallerApprovalAdapter(options.caller),
      createCliToolAdapter(),
      createMcpAdapter(),
      ...defaultA2aAdapters(),
    ],
    env: options.env,
    credential: credentialResolution?.credential,
  });

  const completedAt = new Date().toISOString();
  if (execution.status === "success") {
    state = transitionSingleStep(state, {
      type: "succeed",
      at: completedAt,
    });
  } else {
    state = transitionSingleStep(state, {
      type: "fail",
      at: completedAt,
      error: execution.errorMessage ?? execution.stderr,
    });
  }

  const artifactResult = materializeArtifacts({
    stdout: execution.stdout,
    contract: skill.artifacts,
    runId,
    producer: {
      skill: skill.name,
      runner: skill.source.type,
    },
    createdAt: completedAt,
  });

  const receipt = await writeLocalReceipt({
    receiptId: runId,
    receiptDir: options.receiptDir ?? defaultReceiptDir(options.env),
    runxHome: options.runxHome ?? options.env?.RUNX_HOME,
    skillName: skill.name,
    sourceType: skill.source.type,
    inputs: options.inputs,
    stdout: execution.stdout,
    stderr: execution.stderr,
    execution: {
      status: execution.status,
      exitCode: execution.exitCode,
      signal: execution.signal,
      durationMs: execution.durationMs,
      errorMessage: execution.errorMessage,
      metadata: mergeMetadata(
        runnerTrustMetadata(skill.source.type),
        execution.metadata,
        credentialResolution?.receiptMetadata,
        sandboxApproval ? approvalReceiptMetadata(sandboxApproval) : undefined,
        options.receiptMetadata,
      ),
    },
    startedAt,
    completedAt,
    parentReceipt: options.parentReceipt,
    contextFrom: options.contextFrom,
    artifactIds: artifactResult.envelopes.map((envelope) => envelope.meta.artifact_id),
  });
  await appendSkillJournalEntries({
    receiptDir: options.receiptDir ?? defaultReceiptDir(options.env),
    runId,
    skill,
    startedAt,
    completedAt,
    status: execution.status,
    artifactEnvelopes: artifactResult.envelopes,
    receiptId: receipt.id,
  });
  await indexReceiptIfEnabled(receipt, options.receiptDir ?? defaultReceiptDir(options.env), options);

  await options.caller.report({
    type: "completed",
    message: `Skill execution ${execution.status}.`,
  });

  return {
    status: execution.status,
    skill,
    inputs: options.inputs,
    execution,
    state,
    receipt,
  };
}

async function approveSandboxEscalationIfNeeded(skill: ValidatedSkill, caller: Caller): Promise<ApprovalDecision | undefined> {
  if (!sandboxRequiresApproval(skill.source.sandbox)) {
    return undefined;
  }

  const gate: ApprovalGate = {
    id: `sandbox.${skill.name}.unrestricted-local-dev`,
    type: "sandbox",
    reason: `Skill '${skill.name}' requests unrestricted-local-dev sandbox authority.`,
    summary: {
      skill_name: skill.name,
      source_type: skill.source.type,
      sandbox_profile: "unrestricted-local-dev",
    },
  };
  await caller.report({
    type: "approval_requested",
    message: gate.reason,
    data: {
      gate,
    },
  });
  const approved = await caller.approve(gate);
  await caller.report({
    type: "approval_resolved",
    message: approved ? `Approval ${gate.id} approved.` : `Approval ${gate.id} denied.`,
    data: {
      gate,
      approved,
    },
  });
  return {
    gate,
    approved,
  };
}

function withSandboxApproval(skill: ValidatedSkill, approvedSandboxEscalation: boolean): ValidatedSkill {
  if (!approvedSandboxEscalation || !skill.source.sandbox) {
    return skill;
  }

  const sandbox: SkillSandbox = {
    ...skill.source.sandbox,
    approvedEscalation: true,
  };
  return {
    ...skill,
    source: {
      ...skill.source,
      sandbox,
    },
  };
}

async function writeApprovalDeniedReceipt(options: {
  readonly skill: ValidatedSkill;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly reasons: readonly string[];
  readonly approval: ApprovalDecision;
  readonly runOptions: Pick<
    RunResolvedSkillOptions,
    "receiptDir" | "runxHome" | "env" | "receiptMetadata" | "parentReceipt" | "contextFrom"
  >;
}): Promise<LocalSkillReceipt> {
  const startedAt = new Date().toISOString();
  return await writeLocalReceipt({
    receiptDir: options.runOptions.receiptDir ?? defaultReceiptDir(options.runOptions.env),
    runxHome: options.runOptions.runxHome ?? options.runOptions.env?.RUNX_HOME,
    skillName: options.skill.name,
    sourceType: options.skill.source.type,
    inputs: options.inputs,
    stdout: "",
    stderr: options.reasons.join("; "),
    execution: {
      status: "failure",
      exitCode: null,
      signal: null,
      durationMs: 0,
      errorMessage: options.reasons.join("; "),
      metadata: mergeMetadata(
        runnerTrustMetadata(options.skill.source.type),
        approvalReceiptMetadata(options.approval),
        options.runOptions.receiptMetadata,
      ),
    },
    startedAt,
    completedAt: startedAt,
    parentReceipt: options.runOptions.parentReceipt,
    contextFrom: options.runOptions.contextFrom,
  });
}

function approvalReceiptMetadata(approval: ApprovalDecision): Readonly<Record<string, unknown>> {
  return {
    approval: {
      gate_id: approval.gate.id,
      gate_type: approval.gate.type ?? "unspecified",
      decision: approval.approved ? "approved" : "denied",
      reason: approval.gate.reason,
      summary: approval.gate.summary,
    },
  };
}

async function resolveSkillRunner(
  skill: ValidatedSkill,
  xManifestCandidates: readonly string[],
  runnerName: string | undefined,
): Promise<ValidatedSkill> {
  const manifestPath = await findSkillXManifestPath(xManifestCandidates);
  if (!manifestPath) {
    if (!runnerName) {
      return skill;
    }
    throw new Error(`Runner '${runnerName}' requested but no x.yaml or ${skill.name}.x.yaml was found for skill '${skill.name}'.`);
  }

  const manifestContents = await readFile(manifestPath, "utf8");
  const manifest = validateRunnerManifest(parseRunnerManifestYaml(manifestContents));
  if (manifest.skill && manifest.skill !== skill.name) {
    throw new Error(`Runner manifest skill '${manifest.skill}' does not match skill '${skill.name}'.`);
  }

  const selectedRunnerName = runnerName ?? defaultRunnerName(manifest.runners);
  if (!selectedRunnerName) {
    return skill;
  }

  const runner = manifest.runners[selectedRunnerName];
  if (!runner) {
    throw new Error(`Runner '${selectedRunnerName}' is not defined for skill '${skill.name}'.`);
  }

  return applyRunner(skill, runner);
}

async function findSkillXManifestPath(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Try the next supported layout.
    }
  }

  return undefined;
}

function defaultRunnerName(runners: Readonly<Record<string, SkillRunnerDefinition>>): string | undefined {
  const defaults = Object.values(runners).filter((runner) => runner.default);
  if (defaults.length > 1) {
    throw new Error(`Runner manifest declares multiple default runners: ${defaults.map((runner) => runner.name).join(", ")}.`);
  }
  return defaults[0]?.name;
}

function applyRunner(skill: ValidatedSkill, runner: SkillRunnerDefinition): ValidatedSkill {
  return {
    ...skill,
    source: runner.source,
    inputs: {
      ...skill.inputs,
      ...runner.inputs,
    },
    auth: runner.auth ?? skill.auth,
    risk: runner.risk ?? skill.risk,
    runtime: runner.runtime ?? skill.runtime,
    retry: runner.retry ?? skill.retry,
    idempotency: runner.idempotency ?? skill.idempotency,
    mutating: runner.mutating ?? skill.mutating,
    artifacts: runner.artifacts ?? skill.artifacts,
    runx: runner.runx ?? skill.runx,
  };
}

async function resolveSkillReference(skillPath: string): Promise<ResolvedSkillReference> {
  const requestedPath = path.resolve(skillPath);
  const referenceStat = await stat(requestedPath);

  if (referenceStat.isDirectory()) {
    return {
      requestedPath,
      skillPath: path.join(requestedPath, "SKILL.md"),
      skillDirectory: requestedPath,
      xManifestCandidates: [
        path.join(requestedPath, "x.yaml"),
        path.join(path.dirname(requestedPath), `${path.basename(requestedPath)}.x.yaml`),
      ],
    };
  }

  const skillDirectory = path.dirname(requestedPath);
  const skillName = path.basename(requestedPath, path.extname(requestedPath));
  const skillFileName = path.basename(requestedPath).toLowerCase();
  return {
    requestedPath,
    skillPath: requestedPath,
    skillDirectory,
    xManifestCandidates:
      skillFileName === "skill.md"
        ? [
            path.join(skillDirectory, "x.yaml"),
            path.join(path.dirname(skillDirectory), `${path.basename(skillDirectory)}.x.yaml`),
          ]
        : [
            path.join(skillDirectory, `${skillName}.x.yaml`),
          ],
  };
}

function materializeInlineChain(skill: ValidatedSkill): ChainDefinition {
  if (!skill.source.chain) {
    throw new Error(`Skill '${skill.name}' does not declare an inline chain.`);
  }
  return {
    ...skill.source.chain,
    name: skill.name,
  };
}

async function resolveChainExecution(options: RunLocalChainOptions): Promise<{
  readonly chain: ChainDefinition;
  readonly chainDirectory: string;
  readonly resolvedChainPath?: string;
}> {
  if (options.chain) {
    return {
      chain: options.chain,
      chainDirectory: path.resolve(options.chainDirectory ?? process.cwd()),
    };
  }
  if (!options.chainPath) {
    throw new Error("runLocalChain requires chainPath or chain.");
  }
  const resolvedChainPath = path.resolve(options.chainPath);
  return {
    chain: validateChain(parseChainYaml(await readFile(resolvedChainPath, "utf8"))),
    chainDirectory: path.dirname(resolvedChainPath),
    resolvedChainPath,
  };
}

async function appendSkillJournalEntries(options: {
  readonly receiptDir: string;
  readonly runId: string;
  readonly skill: ValidatedSkill;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: "success" | "failure";
  readonly artifactEnvelopes: readonly ArtifactEnvelope[];
  readonly receiptId: string;
}): Promise<void> {
  const producer = {
    skill: options.skill.name,
    runner: options.skill.source.type,
  };
  await appendJournalEntries({
    receiptDir: options.receiptDir,
    runId: options.runId,
    entries: [
      createRunEventEntry({
        runId: options.runId,
        producer,
        kind: "run_started",
        status: "started",
        createdAt: options.startedAt,
      }),
      ...options.artifactEnvelopes,
      ...options.artifactEnvelopes.map((envelope) =>
        createReceiptLinkEntry({
          runId: options.runId,
          producer,
          artifactId: envelope.meta.artifact_id,
          receiptId: options.receiptId,
          createdAt: options.completedAt,
        }),
      ),
      createRunEventEntry({
        runId: options.runId,
        producer,
        kind: "run_completed",
        status: options.status,
        createdAt: options.completedAt,
        detail: {
          receipt_id: options.receiptId,
        },
      }),
    ],
  });
}

async function appendChainJournalEntries(options: {
  readonly receiptDir: string;
  readonly runId: string;
  readonly topLevelSkillName: string;
  readonly stepId: string;
  readonly skill: ValidatedSkill;
  readonly artifactEnvelopes: readonly ArtifactEnvelope[];
  readonly receiptId: string;
  readonly status: "success" | "failure";
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}): Promise<void> {
  const producer = {
    skill: options.topLevelSkillName,
    runner: "chain",
  };
  await appendJournalEntries({
    receiptDir: options.receiptDir,
    runId: options.runId,
    entries: [
      ...options.artifactEnvelopes,
      ...options.artifactEnvelopes.map((envelope) =>
        createReceiptLinkEntry({
          runId: options.runId,
          stepId: options.stepId,
          producer,
          artifactId: envelope.meta.artifact_id,
          receiptId: options.receiptId,
          createdAt: options.createdAt,
        }),
      ),
      createRunEventEntry({
        runId: options.runId,
        stepId: options.stepId,
        producer,
        kind: options.status === "success" ? "step_succeeded" : "step_failed",
        status: options.status,
        detail: {
          skill: options.skill.name,
          receipt_id: options.receiptId,
          ...options.detail,
        },
        createdAt: options.createdAt,
      }),
    ],
  });
}

function admitChainTransition(
  policy: ChainPolicy | undefined,
  stepId: string,
  outputs: ReadonlyMap<string, ChainStepOutput>,
): { readonly status: "allow" } | { readonly status: "deny"; readonly reason: string } {
  const gates = policy?.transitions.filter((gate) => gate.to === stepId) ?? [];
  for (const gate of gates) {
    let value: unknown;
    try {
      value = resolveTransitionGateValue(outputs, gate.field);
    } catch (error) {
      return {
        status: "deny",
        reason: error instanceof Error ? error.message : `unable to resolve policy field '${gate.field}'`,
      };
    }
    if (gate.equals !== undefined && !isDeepEqual(value, gate.equals)) {
      return {
        status: "deny",
        reason: `transition policy blocked step '${stepId}': expected ${gate.field} == ${JSON.stringify(gate.equals)}`,
      };
    }
    if (gate.notEquals !== undefined && isDeepEqual(value, gate.notEquals)) {
      return {
        status: "deny",
        reason: `transition policy blocked step '${stepId}': expected ${gate.field} != ${JSON.stringify(gate.notEquals)}`,
      };
    }
  }
  return { status: "allow" };
}

function resolveTransitionGateValue(
  outputs: ReadonlyMap<string, ChainStepOutput>,
  field: string,
): unknown {
  const dotIndex = field.indexOf(".");
  if (dotIndex <= 0) {
    throw new Error(`invalid transition policy field '${field}'`);
  }
  const stepId = field.slice(0, dotIndex);
  const outputPath = field.slice(dotIndex + 1);
  const output = outputs.get(stepId);
  if (!output) {
    throw new Error(`transition policy references missing step '${stepId}'`);
  }
  return resolveOutputPath(output, outputPath);
}

function hydrateChainFromJournal(options: {
  readonly entries: readonly ArtifactEnvelope[];
  readonly chain: ChainDefinition;
  readonly chainSkillCache: ReadonlyMap<string, ValidatedSkill>;
  readonly skillEnvironment?: {
    readonly name: string;
    readonly body: string;
  };
  readonly chainSteps: readonly {
    readonly id: string;
    readonly contextFrom: readonly string[];
    readonly retry?: ChainStep["retry"];
    readonly fanoutGroup?: string;
  }[];
  readonly stepRuns: ChainStepRun[];
  readonly outputs: Map<string, ChainStepOutput>;
  readonly syncPoints: ChainReceiptSyncPoint[];
  readonly stateRef: {
    get value(): SequentialChainState;
    set value(next: SequentialChainState);
  };
  readonly lastReceiptRef: {
    get value(): string | undefined;
    set value(next: string | undefined);
  };
}): void {
  if (options.entries.length === 0) {
    return;
  }
  if (options.chain.steps.some((step) => step.fanoutGroup)) {
    throw new Error("resumeFromRunId currently supports sequential chains only.");
  }

  const stepsById = new Map(options.chain.steps.map((step) => [step.id, step]));
  const latestEvents = new Map<string, ArtifactEnvelope>();
  const artifactsByStep = new Map<string, ArtifactEnvelope[]>();
  const receiptLinks = new Map<string, string>();

  for (const entry of options.entries) {
    if (entry.type === "run_event") {
      const stepId = entry.data.step_id;
      if (typeof stepId === "string" && stepId.length > 0) {
        latestEvents.set(stepId, entry);
      }
      continue;
    }
    if (entry.type === "receipt_link") {
      const artifactId = typeof entry.data.artifact_id === "string" ? entry.data.artifact_id : undefined;
      const receiptId = typeof entry.data.receipt_id === "string" ? entry.data.receipt_id : undefined;
      if (artifactId && receiptId) {
        receiptLinks.set(artifactId, receiptId);
      }
      continue;
    }
    if (entry.meta.step_id) {
      artifactsByStep.set(entry.meta.step_id, [...(artifactsByStep.get(entry.meta.step_id) ?? []), entry]);
    }
  }

  let state = options.stateRef.value;
  for (const chainStep of options.chainSteps) {
    const step = stepsById.get(chainStep.id);
    const stepSkill = options.chainSkillCache.get(chainStep.id) ?? (step?.run ? buildInlineChainStepSkill(step, options.skillEnvironment) : undefined);
    const event = latestEvents.get(chainStep.id);
    if (!step || !stepSkill || !event) {
      break;
    }
    const stepArtifacts = artifactsByStep.get(chainStep.id) ?? [];
    const stepFields = reconstructStepFields(stepArtifacts, stepSkill.artifacts);
    const receiptId = receiptLinksForStep(stepArtifacts, receiptLinks)[0];
    state = transitionSequentialChain(state, {
      type: "start_step",
      stepId: chainStep.id,
      at: entryTimestamp(event),
    });
    if (event.data.kind === "step_succeeded") {
      state = transitionSequentialChain(state, {
        type: "step_succeeded",
        stepId: chainStep.id,
        at: entryTimestamp(event),
        receiptId,
        outputs: stepFields,
      });
      options.outputs.set(chainStep.id, {
        status: "success",
        stdout: reconstructStdout(stepArtifacts, stepFields),
        stderr: "",
        receiptId: receiptId ?? "",
        fields: stepFields,
        artifactIds: stepArtifacts.map((artifact) => artifact.meta.artifact_id),
      });
      options.stepRuns.push({
        stepId: chainStep.id,
        skill: chainStepReference(step),
        skillPath: step.skill ? step.skill : `inline:${chainStep.id}`,
        runner: step.runner,
        attempt: 1,
        status: "success",
        receiptId,
        stdout: reconstructStdout(stepArtifacts, stepFields),
        stderr: "",
        artifactIds: stepArtifacts.map((artifact) => artifact.meta.artifact_id),
        contextFrom: [],
      });
      options.lastReceiptRef.value = receiptId ?? options.lastReceiptRef.value;
      continue;
    }
    if (event.data.kind === "step_failed") {
      state = transitionSequentialChain(state, {
        type: "step_failed",
        stepId: chainStep.id,
        at: entryTimestamp(event),
        error: typeof event.data.detail === "object" && event.data.detail && "reason" in event.data.detail
          ? String((event.data.detail as Record<string, unknown>).reason)
          : "previous attempt failed",
      });
      break;
    }
    break;
  }
  options.stateRef.value = state;
}

function reconstructStepFields(
  artifacts: readonly ArtifactEnvelope[],
  contract: ArtifactContract | undefined,
): Readonly<Record<string, unknown>> {
  const fields: Record<string, unknown> = {};
  const skillArtifacts = artifacts.filter((artifact) => artifact.type !== "run_event" && artifact.type !== "receipt_link");
  if (skillArtifacts.length === 1 && skillArtifacts[0]?.type === null) {
    const untypedData = skillArtifacts[0].data;
    if ("raw" in untypedData && typeof untypedData.raw === "string") {
      fields.raw = untypedData.raw;
      return fields;
    }
    Object.assign(fields, untypedData);
    fields.raw = JSON.stringify(untypedData);
    return fields;
  }
  for (const artifact of skillArtifacts) {
    const key = declaredArtifactField(contract, artifact.type) ?? artifact.type ?? "raw";
    fields[key] = artifact;
  }
  return fields;
}

function declaredArtifactField(contract: ArtifactContract | undefined, artifactType: string | null): string | undefined {
  if (!artifactType) {
    return undefined;
  }
  for (const [fieldName, declaredType] of Object.entries(contract?.namedEmits ?? {})) {
    if (declaredType === artifactType) {
      return fieldName;
    }
  }
  if (contract?.wrapAs === artifactType) {
    return artifactType;
  }
  return undefined;
}

function receiptLinksForStep(
  artifacts: readonly ArtifactEnvelope[],
  receiptLinks: ReadonlyMap<string, string>,
): readonly string[] {
  return artifacts
    .map((artifact) => receiptLinks.get(artifact.meta.artifact_id))
    .filter((receiptId): receiptId is string => typeof receiptId === "string");
}

function reconstructStdout(
  artifacts: readonly ArtifactEnvelope[],
  fields: Readonly<Record<string, unknown>>,
): string {
  const raw = artifacts.find((artifact) => artifact.type === null)?.data.raw;
  if (typeof raw === "string") {
    return raw;
  }
  if ("raw" in fields && typeof fields.raw === "string") {
    return fields.raw;
  }
  return JSON.stringify(fields);
}

function entryTimestamp(entry: ArtifactEnvelope): string {
  return entry.meta.created_at;
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function runLocalChain(options: RunLocalChainOptions): Promise<RunLocalChainResult> {
  const chainResolution = await resolveChainExecution(options);
  const receiptDir = options.receiptDir ?? defaultReceiptDir(options.env);
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const chain = chainResolution.chain;
  const chainDirectory = chainResolution.chainDirectory;
  const chainId = options.runId ?? options.resumeFromRunId ?? uniqueReceiptId("cx");
  const chainSkillCache = await loadChainSkills(chain, chainDirectory);
  const chainGrant = options.chainGrant ?? defaultLocalChainGrant();
  const chainSteps = chain.steps.map((step) => ({
    id: step.id,
    contextFrom: unique(step.contextEdges.map((edge) => edge.fromStep)),
    retry: step.retry ?? chainSkillCache.get(step.id)?.retry,
    fanoutGroup: step.fanoutGroup,
  }));
  let state = createSequentialChainState(chainId, chainSteps);
  const stepRuns: ChainStepRun[] = [];
  const syncPoints: ChainReceiptSyncPoint[] = [];
  const outputs = new Map<string, ChainStepOutput>();
  let lastReceiptId: string | undefined;
  let finalOutput = "";
  let finalError: string | undefined;
  if (options.resumeFromRunId) {
    hydrateChainFromJournal({
      entries: await readJournalEntries(receiptDir, options.resumeFromRunId),
      chain,
      chainSkillCache,
      skillEnvironment: options.skillEnvironment,
      chainSteps,
      stepRuns,
      outputs,
      syncPoints,
      stateRef: {
        get value() {
          return state;
        },
        set value(next: SequentialChainState) {
          state = next;
        },
      },
      lastReceiptRef: {
        get value() {
          return lastReceiptId;
        },
        set value(next: string | undefined) {
          lastReceiptId = next;
        },
      },
    });
  }

  await options.caller.report({
    type: "skill_loaded",
    message: `Loaded chain ${chain.name}.`,
    data: { chainPath: chainResolution.resolvedChainPath, chainId },
  });

  while (true) {
    const plan = planSequentialChainTransition(state, chainSteps, chain.fanoutGroups);
    if (plan.type === "complete") {
      state = transitionSequentialChain(state, { type: "complete" });
      break;
    }

    if (plan.type === "failed") {
      finalError = plan.reason;
      if (plan.syncDecision) {
        syncPoints.push(toChainReceiptSyncPoint(plan.syncDecision, latestFanoutReceiptIds(stepRuns, plan.syncDecision.groupId)));
      }
      state = transitionSequentialChain(state, { type: "fail_chain", error: plan.reason });
      break;
    }

    if (plan.type === "blocked") {
      finalError = plan.reason;
      if (plan.syncDecision) {
        syncPoints.push(toChainReceiptSyncPoint(plan.syncDecision, latestFanoutReceiptIds(stepRuns, plan.syncDecision.groupId)));
      }
      state = transitionSequentialChain(state, { type: "fail_chain", error: plan.reason });
      break;
    }

    if (plan.type === "run_fanout") {
      const fanoutParentReceipt = lastReceiptId;

      // Pre-flight: admission and retry checks (synchronous, before parallel execution)
      const branchPreps: Array<{
        step: ChainStep;
        stepSkillPath: string;
        stepSkill: ValidatedSkill;
        stepReference: string;
        stepInputs: Readonly<Record<string, unknown>>;
        context: ReturnType<typeof materializeContext>;
        contextFromReceiptIds: string[];
        governance: ReturnType<typeof buildChainStepGovernance>;
        retryContext: ReturnType<typeof buildRetryReceiptContext>;
      }> = [];

      for (const stepId of plan.stepIds) {
        const step = findChainStep(chain, stepId);
        const context = materializeContext(step, outputs);
        const contextFromReceiptIds = context
          .map((edge) => edge.receiptId)
          .filter((receiptId): receiptId is string => typeof receiptId === "string");
        const stepInputs = {
          ...(options.inputs ?? {}),
          ...step.inputs,
          ...Object.fromEntries(context.map((edge) => [edge.input, edge.value])),
        };
        const resolvedStep = await resolveChainStepExecution({
          step,
          chainDirectory,
          chainSkillCache,
          skillEnvironment: options.skillEnvironment,
        });
        const stepSkillPath = resolvedStep.skillPath;
        const stepSkill = resolvedStep.skill;
        const governance = buildChainStepGovernance(step, chainGrant);

        if (governance.scopeAdmission.status === "deny") {
          const deniedRun = buildDeniedChainStepRun({
            step, stepSkillPath,
            attempt: plan.attempts[step.id] ?? 1,
            parentReceipt: fanoutParentReceipt,
            fanoutGroup: plan.groupId,
            governance, context,
          });
          const receipt = await writePolicyDeniedChainReceipt({
            receiptDir,
            runxHome: options.runxHome ?? options.env?.RUNX_HOME,
            chain, chainId, startedAt, startedAtMs,
            inputs: options.inputs ?? {},
            stepRuns: [...stepRuns, deniedRun],
            errorMessage: governance.scopeAdmission.reasons?.join("; ") ?? "chain step scope denied",
          });
          return {
            status: "policy_denied", chain, stepId: step.id,
            skill: stepSkill,
            reasons: governance.scopeAdmission.reasons ?? [],
            state, receipt,
          };
        }

        const effectiveRetry = step.retry ?? stepSkill.retry;
        const retryContext = buildRetryReceiptContext(step, stepInputs, plan.attempts[step.id] ?? 1, stepSkill, effectiveRetry);
        const retryAdmission = admitRetryPolicy({
          stepId: step.id, retry: effectiveRetry,
          mutating: step.mutating || stepSkill.mutating === true,
          idempotencyKey: retryContext.idempotencyKey,
        });
        if (retryAdmission.status === "deny") {
          return {
            status: "policy_denied", chain, stepId: step.id,
            skill: stepSkill, reasons: retryAdmission.reasons, state,
          };
        }

        branchPreps.push({
          step,
          stepSkillPath,
          stepSkill,
          stepReference: resolvedStep.reference,
          stepInputs,
          context,
          contextFromReceiptIds,
          governance,
          retryContext,
        });
      }

      // Transition all branches to started before parallel execution
      for (const prep of branchPreps) {
        state = transitionSequentialChain(state, {
          type: "start_step", stepId: prep.step.id, at: new Date().toISOString(),
        });
        await appendJournalEntries({
          receiptDir,
          runId: chainId,
          entries: [
            createRunEventEntry({
              runId: chainId,
              stepId: prep.step.id,
              producer: {
                skill: chainProducerSkillName(options, chain),
                runner: "chain",
              },
              kind: "step_started",
              status: "started",
              detail: {
                skill: prep.stepReference,
                runner: chainStepRunner(prep.step) ?? "default",
              },
            }),
          ],
        });
      }

      // Parallel execution: all branches run concurrently
      const branchTasks = branchPreps.map((prep) => ({
        id: prep.step.id,
        fn: async (_signal: AbortSignal) => {
          return await runResolvedSkill({
            skill: prep.stepSkill,
            skillDirectory: prep.step.skill ? path.dirname(prep.stepSkillPath) : chainDirectory,
            inputs: prep.stepInputs,
            caller: options.caller,
            env: options.env,
            receiptDir,
            runxHome: options.runxHome,
            parentReceipt: fanoutParentReceipt,
            contextFrom: prep.contextFromReceiptIds,
            adapters: options.adapters,
            allowedSourceTypes: options.allowedSourceTypes,
            authResolver: options.authResolver,
            receiptMetadata: mergeMetadata(prep.retryContext.receiptMetadata, governanceReceiptMetadata(prep.step, prep.governance)),
          });
        },
      }));

      const fanoutResults = await runFanout(branchTasks);

      // Apply results to state machine in declaration order
      for (let i = 0; i < branchPreps.length; i++) {
        const prep = branchPreps[i];
        const result = fanoutResults[i];

        if (result.status === "aborted" || !result.value) {
          state = transitionSequentialChain(state, {
            type: "step_failed", stepId: prep.step.id,
            at: new Date().toISOString(),
            error: result.error ?? "fanout branch aborted",
          });
          continue;
        }

        const stepResult = result.value;

        // In fanout, missing_context and policy_denied are branch failures, not chain halts
        if (stepResult.status === "missing_context" || stepResult.status === "policy_denied") {
          await appendJournalEntries({
            receiptDir,
            runId: chainId,
            entries: [
              createRunEventEntry({
                runId: chainId,
                stepId: prep.step.id,
                producer: {
                  skill: chainProducerSkillName(options, chain),
                  runner: "chain",
                },
                kind: "step_failed",
                status: "failure",
                detail: {
                  reason:
                    stepResult.status === "missing_context"
                      ? `missing context: ${stepResult.questions.map((q) => q.id).join(", ")}`
                      : `policy denied: ${stepResult.reasons.join("; ")}`,
                },
              }),
            ],
          });
          state = transitionSequentialChain(state, {
            type: "step_failed", stepId: prep.step.id,
            at: new Date().toISOString(),
            error: stepResult.status === "missing_context"
              ? `missing context: ${stepResult.questions.map((q) => q.id).join(", ")}`
              : `policy denied: ${stepResult.reasons.join("; ")}`,
          });
          continue;
        }

        const stepCompletedAt = new Date().toISOString();
        const artifactResult = materializeArtifacts({
          stdout: stepResult.execution.stdout,
          contract: stepResult.skill.artifacts,
          runId: chainId,
          stepId: prep.step.id,
          producer: {
            skill: stepResult.skill.name,
            runner: stepResult.skill.source.type,
          },
          createdAt: stepCompletedAt,
        });
        const stepRun: ChainStepRun = {
          stepId: prep.step.id,
          skill: prep.stepReference,
          skillPath: prep.stepSkillPath,
          runner: chainStepRunner(prep.step),
          attempt: plan.attempts[prep.step.id] ?? 1,
          status: stepResult.status,
          receiptId: stepResult.receipt.id,
          stdout: stepResult.execution.stdout,
          stderr: stepResult.execution.stderr,
          parentReceipt: fanoutParentReceipt,
          fanoutGroup: plan.groupId,
          retry: prep.retryContext.receipt,
          governance: prep.governance,
          artifactIds: artifactResult.envelopes.map((envelope) => envelope.meta.artifact_id),
          contextFrom: prep.context.map((edge) => ({
            input: edge.input, fromStep: edge.fromStep,
            output: edge.output, receiptId: edge.receiptId,
          })),
        };
        stepRuns.push(stepRun);
        outputs.set(prep.step.id, {
          status: stepResult.status,
          stdout: stepResult.execution.stdout,
          stderr: stepResult.execution.stderr,
          receiptId: stepResult.receipt.id,
          fields: artifactResult.fields,
          artifactIds: artifactResult.envelopes.map((envelope) => envelope.meta.artifact_id),
        });
        finalOutput = stepResult.execution.stdout;
        await appendChainJournalEntries({
          receiptDir,
          runId: chainId,
          topLevelSkillName: chainProducerSkillName(options, chain),
          stepId: prep.step.id,
          skill: stepResult.skill,
          artifactEnvelopes: artifactResult.envelopes,
          receiptId: stepResult.receipt.id,
          status: stepResult.status,
          detail: {
            runner: chainStepRunner(prep.step) ?? "default",
          },
          createdAt: stepCompletedAt,
        });

        state = stepResult.status === "success"
          ? transitionSequentialChain(state, {
              type: "step_succeeded", stepId: prep.step.id,
              at: stepCompletedAt, receiptId: stepResult.receipt.id,
              outputs: artifactResult.fields,
            })
          : transitionSequentialChain(state, {
              type: "step_failed", stepId: prep.step.id,
              at: stepCompletedAt,
              error: stepResult.execution.errorMessage ?? stepResult.execution.stderr,
            });
      }

      const followUpPlan = planSequentialChainTransition(state, chainSteps, chain.fanoutGroups);
      if (followUpPlan.type === "run_fanout" && followUpPlan.groupId === plan.groupId) {
        continue;
      }
      if ((followUpPlan.type === "failed" || followUpPlan.type === "blocked") && followUpPlan.syncDecision?.groupId === plan.groupId) {
        finalError = followUpPlan.reason;
        syncPoints.push(toChainReceiptSyncPoint(followUpPlan.syncDecision, latestFanoutReceiptIds(stepRuns, plan.groupId)));
        state = transitionSequentialChain(state, { type: "fail_chain", error: followUpPlan.reason });
        break;
      }

      const policy = chain.fanoutGroups[plan.groupId];
      if (policy) {
        const decision = evaluateFanoutSync(
          policy,
          chainSteps
            .filter((step) => step.fanoutGroup === plan.groupId)
            .map((step) => {
              const stepState = state.steps.find((candidate) => candidate.stepId === step.id);
              return {
                stepId: step.id,
                status: stepState?.status ?? "failed",
                outputs: stepState?.outputs,
              };
            }),
        );
        syncPoints.push(toChainReceiptSyncPoint(decision, latestFanoutReceiptIds(stepRuns, plan.groupId)));
      }

      const groupReceiptIds = latestFanoutReceiptIds(stepRuns, plan.groupId);
      lastReceiptId = groupReceiptIds[groupReceiptIds.length - 1] ?? lastReceiptId;
      continue;
    }

    const step = findChainStep(chain, plan.stepId);
    const context = materializeContext(step, outputs);
    const contextFromReceiptIds = context
      .map((edge) => edge.receiptId)
      .filter((receiptId): receiptId is string => typeof receiptId === "string");
    const stepInputs = {
      ...(options.inputs ?? {}),
      ...step.inputs,
      ...Object.fromEntries(context.map((edge) => [edge.input, edge.value])),
    };
    const resolvedStep = await resolveChainStepExecution({
      step,
      chainDirectory,
      chainSkillCache,
      skillEnvironment: options.skillEnvironment,
    });
    const stepSkillPath = resolvedStep.skillPath;
    const stepSkill = resolvedStep.skill;
    const governance = buildChainStepGovernance(step, chainGrant);
    const transitionGate = admitChainTransition(chain.policy, step.id, outputs);
    if (transitionGate.status === "deny") {
      const deniedRun = buildDeniedChainStepRun({
        step,
        stepSkillPath,
        attempt: plan.attempt,
        parentReceipt: lastReceiptId,
        governance,
        context,
        stderr: transitionGate.reason,
      });
      const receipt = await writePolicyDeniedChainReceipt({
        receiptDir,
        runxHome: options.runxHome ?? options.env?.RUNX_HOME,
        chain,
        chainId,
        startedAt,
        startedAtMs,
        inputs: options.inputs ?? {},
        stepRuns: [...stepRuns, deniedRun],
        errorMessage: transitionGate.reason,
      });
      return {
        status: "policy_denied",
        chain,
        stepId: step.id,
        skill: stepSkill,
        reasons: [transitionGate.reason],
        state,
        receipt,
      };
    }
    if (governance.scopeAdmission.status === "deny") {
      const deniedRun = buildDeniedChainStepRun({
        step,
        stepSkillPath,
        attempt: plan.attempt,
        parentReceipt: lastReceiptId,
        governance,
        context,
      });
      const receipt = await writePolicyDeniedChainReceipt({
        receiptDir,
        runxHome: options.runxHome ?? options.env?.RUNX_HOME,
        chain,
        chainId,
        startedAt,
        startedAtMs,
        inputs: options.inputs ?? {},
        stepRuns: [...stepRuns, deniedRun],
        errorMessage: governance.scopeAdmission.reasons?.join("; ") ?? "chain step scope denied",
      });
      return {
        status: "policy_denied",
        chain,
        stepId: step.id,
        skill: stepSkill,
        reasons: governance.scopeAdmission.reasons ?? [],
        state,
        receipt,
      };
    }
    const effectiveRetry = step.retry ?? stepSkill.retry;
    const retryContext = buildRetryReceiptContext(step, stepInputs, plan.attempt, stepSkill, effectiveRetry);
    const retryAdmission = admitRetryPolicy({
      stepId: step.id,
      retry: effectiveRetry,
      mutating: step.mutating || stepSkill.mutating === true,
      idempotencyKey: retryContext.idempotencyKey,
    });
    if (retryAdmission.status === "deny") {
      return {
        status: "policy_denied",
        chain,
        stepId: step.id,
        skill: stepSkill,
        reasons: retryAdmission.reasons,
        state,
      };
    }

    state = transitionSequentialChain(state, {
      type: "start_step",
      stepId: step.id,
      at: new Date().toISOString(),
    });
    await appendJournalEntries({
      receiptDir,
      runId: chainId,
        entries: [
          createRunEventEntry({
            runId: chainId,
            stepId: step.id,
            producer: {
              skill: chainProducerSkillName(options, chain),
              runner: "chain",
            },
            kind: "step_started",
            status: "started",
            detail: {
              skill: resolvedStep.reference,
              runner: chainStepRunner(step) ?? "default",
            },
          }),
        ],
      });

    const stepResult = await runResolvedSkill({
      skill: stepSkill,
      skillDirectory: step.skill ? path.dirname(stepSkillPath) : chainDirectory,
      inputs: stepInputs,
      caller: options.caller,
      env: options.env,
      receiptDir,
      runxHome: options.runxHome,
      parentReceipt: lastReceiptId,
      contextFrom: contextFromReceiptIds,
      adapters: options.adapters,
      allowedSourceTypes: options.allowedSourceTypes,
      authResolver: options.authResolver,
      receiptMetadata: mergeMetadata(retryContext.receiptMetadata, governanceReceiptMetadata(step, governance)),
    });

    if (stepResult.status === "missing_context") {
      await appendJournalEntries({
        receiptDir,
        runId: chainId,
        entries: [
          createRunEventEntry({
            runId: chainId,
            stepId: step.id,
            producer: {
              skill: chainProducerSkillName(options, chain),
              runner: "chain",
            },
            kind: "step_failed",
            status: "failure",
            detail: {
              reason: `missing context: ${stepResult.questions.map((question) => question.id).join(", ")}`,
            },
          }),
        ],
      });
      return {
        status: "missing_context",
        chain,
        stepId: step.id,
        skillPath: stepSkillPath,
        questions: stepResult.questions,
        state,
      };
    }

    if (stepResult.status === "policy_denied") {
      await appendJournalEntries({
        receiptDir,
        runId: chainId,
        entries: [
          createRunEventEntry({
            runId: chainId,
            stepId: step.id,
            producer: {
              skill: chainProducerSkillName(options, chain),
              runner: "chain",
            },
            kind: "step_failed",
            status: "failure",
            detail: {
              reason: `policy denied: ${stepResult.reasons.join("; ")}`,
            },
          }),
        ],
      });
      return {
        status: "policy_denied",
        chain,
        stepId: step.id,
        skill: stepResult.skill,
        reasons: stepResult.reasons,
        state,
      };
    }

    const stepCompletedAt = new Date().toISOString();
    const artifactResult = materializeArtifacts({
      stdout: stepResult.execution.stdout,
      contract: stepResult.skill.artifacts,
      runId: chainId,
      stepId: step.id,
      producer: {
        skill: stepResult.skill.name,
        runner: stepResult.skill.source.type,
      },
      createdAt: stepCompletedAt,
    });
    const stepRun: ChainStepRun = {
      stepId: step.id,
      skill: resolvedStep.reference,
      skillPath: stepSkillPath,
      runner: chainStepRunner(step),
      attempt: plan.attempt,
      status: stepResult.status,
      receiptId: stepResult.receipt.id,
      stdout: stepResult.execution.stdout,
      stderr: stepResult.execution.stderr,
      parentReceipt: lastReceiptId,
      retry: retryContext.receipt,
      governance,
      artifactIds: artifactResult.envelopes.map((envelope) => envelope.meta.artifact_id),
      contextFrom: context.map((edge) => ({
        input: edge.input,
        fromStep: edge.fromStep,
        output: edge.output,
        receiptId: edge.receiptId,
      })),
    };
    stepRuns.push(stepRun);
    outputs.set(step.id, {
      status: stepResult.status,
      stdout: stepResult.execution.stdout,
      stderr: stepResult.execution.stderr,
      receiptId: stepResult.receipt.id,
      fields: artifactResult.fields,
      artifactIds: artifactResult.envelopes.map((envelope) => envelope.meta.artifact_id),
    });
    lastReceiptId = stepResult.receipt.id;
    finalOutput = stepResult.execution.stdout;
    await appendChainJournalEntries({
      receiptDir,
      runId: chainId,
      topLevelSkillName: chainProducerSkillName(options, chain),
      stepId: step.id,
      skill: stepResult.skill,
      artifactEnvelopes: artifactResult.envelopes,
      receiptId: stepResult.receipt.id,
      status: stepResult.status,
      detail: {
        runner: chainStepRunner(step) ?? "default",
      },
      createdAt: stepCompletedAt,
    });

    state =
      stepResult.status === "success"
        ? transitionSequentialChain(state, {
            type: "step_succeeded",
            stepId: step.id,
            at: stepCompletedAt,
            receiptId: stepResult.receipt.id,
            outputs: artifactResult.fields,
          })
        : transitionSequentialChain(state, {
            type: "step_failed",
            stepId: step.id,
            at: stepCompletedAt,
            error: stepResult.execution.errorMessage ?? stepResult.execution.stderr,
          });
  }

  const completedAt = new Date().toISOString();
  const receipt = await writeLocalChainReceipt({
    receiptDir,
    runxHome: options.runxHome ?? options.env?.RUNX_HOME,
    chainId,
    chainName: chain.name,
    owner: chain.owner,
    status: state.status === "succeeded" ? "success" : "failure",
    inputs: options.inputs ?? {},
    output: finalOutput,
    steps: stepRuns.map(toChainReceiptStep),
    syncPoints,
    startedAt,
    completedAt,
    durationMs: Date.now() - startedAtMs,
    errorMessage: finalError,
  });
  await appendJournalEntries({
    receiptDir,
    runId: chainId,
    entries: [
      createRunEventEntry({
        runId: chainId,
        producer: {
          skill: chainProducerSkillName(options, chain),
          runner: "chain",
        },
        kind: "chain_completed",
        status: receipt.status,
        detail: {
          receipt_id: receipt.id,
          step_count: stepRuns.length,
        },
        createdAt: completedAt,
      }),
    ],
  });

  return {
    status: receipt.status,
    chain,
    state,
    steps: stepRuns,
    receipt,
    output: finalOutput,
    errorMessage: finalError,
  };
}

export async function inspectLocalChain(options: InspectLocalChainOptions): Promise<InspectLocalChainResult> {
  const { receipt, verification } = await readVerifiedLocalReceipt(
    options.receiptDir ?? defaultReceiptDir(options.env),
    options.chainId,
    options.runxHome ?? options.env?.RUNX_HOME,
  );
  if (receipt.kind !== "chain_execution") {
    throw new Error(`Receipt ${options.chainId} is not a chain execution receipt.`);
  }

  return {
    receipt,
    verification,
    summary: {
      id: receipt.id,
      name: receipt.subject.chain_name,
      status: receipt.status,
      verification,
      steps: receipt.steps.map((step) => ({
        id: step.step_id,
        attempt: step.attempt,
        status: step.status,
        receiptId: step.receipt_id,
        fanoutGroup: step.fanout_group,
      })),
      syncPoints: (receipt.sync_points ?? []).map((syncPoint) => ({
        groupId: syncPoint.group_id,
        decision: syncPoint.decision,
        ruleFired: syncPoint.rule_fired,
        reason: syncPoint.reason,
      })),
    },
  };
}

export async function inspectLocalReceipt(options: InspectLocalReceiptOptions): Promise<InspectLocalReceiptResult> {
  const { receipt, verification } = await readVerifiedLocalReceipt(
    options.receiptDir ?? defaultReceiptDir(options.env),
    options.receiptId,
    options.runxHome ?? options.env?.RUNX_HOME,
  );
  return {
    receipt,
    verification,
    summary: summarizeLocalReceipt(receipt, verification),
  };
}

export async function listLocalHistory(options: ListLocalHistoryOptions = {}): Promise<ListLocalHistoryResult> {
  const receipts = await listVerifiedLocalReceipts(
    options.receiptDir ?? defaultReceiptDir(options.env),
    options.runxHome ?? options.env?.RUNX_HOME,
  );
  return {
    receipts: receipts
      .slice(0, options.limit ?? receipts.length)
      .map(({ receipt, verification }) => summarizeLocalReceipt(receipt, verification)),
  };
}

async function indexReceiptIfEnabled(
  receipt: LocalSkillReceipt,
  receiptDir: string,
  options: {
    readonly memoryDir?: string;
    readonly env?: NodeJS.ProcessEnv;
  },
): Promise<void> {
  const memoryDir = options.memoryDir ?? options.env?.RUNX_MEMORY_DIR;
  if (!memoryDir) {
    return;
  }
  await createFileMemoryStore(memoryDir).indexReceipt({
    receipt,
    receiptPath: path.join(receiptDir, `${receipt.id}.json`),
    project: options.env?.RUNX_PROJECT ?? options.env?.RUNX_CWD ?? options.env?.INIT_CWD ?? process.cwd(),
  });
}

function summarizeLocalReceipt(receipt: LocalReceipt, verification: ReceiptVerification): LocalReceiptSummary {
  if (receipt.kind === "skill_execution") {
    return {
      id: receipt.id,
      kind: receipt.kind,
      status: receipt.status,
      verification,
      name: receipt.subject.skill_name,
      sourceType: receipt.subject.source_type,
      startedAt: receipt.started_at,
      completedAt: receipt.completed_at,
    };
  }

  return {
    id: receipt.id,
    kind: receipt.kind,
    status: receipt.status,
    verification,
    name: receipt.subject.chain_name,
    startedAt: receipt.started_at,
    completedAt: receipt.completed_at,
  };
}

interface ChainStepOutput {
  readonly status: "success" | "failure";
  readonly stdout: string;
  readonly stderr: string;
  readonly receiptId: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly artifactIds: readonly string[];
}

interface MaterializedContextEdge {
  readonly input: string;
  readonly fromStep: string;
  readonly output: string;
  readonly receiptId?: string;
  readonly value: unknown;
}

function findChainStep(chain: ChainDefinition, stepId: string): ChainStep {
  const step = chain.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    throw new Error(`Chain step '${stepId}' is missing.`);
  }
  return step;
}

function chainStepReference(step: ChainStep): string {
  return step.skill ?? `run:${String(step.run?.type ?? "unknown")}`;
}

function chainStepRunner(step: ChainStep): string | undefined {
  return typeof step.run?.type === "string" ? step.run.type : step.runner;
}

function chainProducerSkillName(options: RunLocalChainOptions, chain: ChainDefinition): string {
  return options.skillEnvironment?.name ?? chain.name;
}

function materializeContext(
  step: ChainStep,
  outputs: ReadonlyMap<string, ChainStepOutput>,
): readonly MaterializedContextEdge[] {
  return step.contextEdges.map((edge) => {
    const sourceOutput = outputs.get(edge.fromStep);
    if (!sourceOutput) {
      throw new Error(`Step '${step.id}' is missing context output from '${edge.fromStep}'.`);
    }

    return {
      input: edge.input,
      fromStep: edge.fromStep,
      output: edge.output,
      receiptId: sourceOutput.receiptId,
      value: resolveOutputPath(sourceOutput, edge.output),
    };
  });
}

function resolveOutputPath(output: ChainStepOutput, outputPath: string): unknown {
  const record: Record<string, unknown> = {
    ...output.fields,
    status: output.status,
    stdout: output.stdout,
    stderr: output.stderr,
    receipt_id: output.receiptId,
    receiptId: output.receiptId,
  };

  return outputPath.split(".").reduce<unknown>((value, key) => {
    if (!isRecord(value) || !(key in value)) {
      throw new Error(`Context output path '${outputPath}' was not produced by the source step.`);
    }
    return value[key];
  }, record);
}

function defaultLocalChainGrant(): ChainScopeGrant {
  return {
    grant_id: "local-default",
    scopes: ["*"],
  };
}

function buildChainStepGovernance(step: ChainStep, chainGrant: ChainScopeGrant): ChainStepGovernance {
  const decision = admitChainStepScopes({
    stepId: step.id,
    requestedScopes: step.scopes,
    grant: chainGrant,
  });
  return {
    scopeAdmission: {
      status: decision.status,
      requestedScopes: decision.requestedScopes,
      grantedScopes: decision.grantedScopes,
      grantId: decision.grantId,
      reasons: decision.status === "deny" ? decision.reasons : undefined,
    },
  };
}

function governanceReceiptMetadata(
  step: ChainStep,
  governance: ChainStepGovernance,
): Readonly<Record<string, unknown>> {
  return {
    chain_governance: {
      step_id: step.id,
      selected_runner: chainStepRunner(step) ?? "default",
      scope_admission: {
        status: governance.scopeAdmission.status,
        requested_scopes: governance.scopeAdmission.requestedScopes,
        granted_scopes: governance.scopeAdmission.grantedScopes,
        grant_id: governance.scopeAdmission.grantId,
        reasons: governance.scopeAdmission.reasons,
      },
    },
  };
}

function buildDeniedChainStepRun(options: {
  readonly step: ChainStep;
  readonly stepSkillPath: string;
  readonly attempt: number;
  readonly parentReceipt?: string;
  readonly fanoutGroup?: string;
  readonly governance: ChainStepGovernance;
  readonly context: readonly MaterializedContextEdge[];
  readonly stderr?: string;
}): ChainStepRun {
  return {
    stepId: options.step.id,
    skill: chainStepReference(options.step),
    skillPath: options.stepSkillPath,
    runner: chainStepRunner(options.step),
    attempt: options.attempt,
    status: "failure",
    stdout: "",
    stderr: options.stderr ?? options.governance.scopeAdmission.reasons?.join("; ") ?? "chain step scope denied",
    parentReceipt: options.parentReceipt,
    fanoutGroup: options.fanoutGroup,
    governance: options.governance,
    artifactIds: [],
    contextFrom: options.context.map((edge) => ({
      input: edge.input,
      fromStep: edge.fromStep,
      output: edge.output,
      receiptId: edge.receiptId,
    })),
  };
}

async function writePolicyDeniedChainReceipt(options: {
  readonly receiptDir: string;
  readonly runxHome?: string;
  readonly chain: ChainDefinition;
  readonly chainId: string;
  readonly startedAt: string;
  readonly startedAtMs: number;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly stepRuns: readonly ChainStepRun[];
  readonly errorMessage: string;
}): Promise<LocalChainReceipt> {
  return await writeLocalChainReceipt({
    receiptDir: options.receiptDir,
    runxHome: options.runxHome,
    chainId: options.chainId,
    chainName: options.chain.name,
    owner: options.chain.owner,
    status: "failure",
    inputs: options.inputs,
    output: "",
    steps: options.stepRuns.map(toChainReceiptStep),
    startedAt: options.startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - options.startedAtMs,
    errorMessage: options.errorMessage,
  });
}

function toChainReceiptStep(step: ChainStepRun): ChainReceiptStep {
  return {
    step_id: step.stepId,
    attempt: step.attempt,
    skill: step.skill,
    runner: step.runner,
    status: step.status,
    receipt_id: step.receiptId,
    parent_receipt: step.parentReceipt,
    fanout_group: step.fanoutGroup,
    retry: step.retry
      ? {
          attempt: step.retry.attempt,
          max_attempts: step.retry.maxAttempts,
          rule_fired: step.retry.ruleFired,
          idempotency_key_hash: step.retry.idempotencyKeyHash,
        }
      : undefined,
    context_from: step.contextFrom.map((edge) => ({
      input: edge.input,
      from_step: edge.fromStep,
      output: edge.output,
      receipt_id: edge.receiptId,
    })),
    governance: step.governance ? toReceiptGovernance(step.governance) : undefined,
    artifact_ids: step.artifactIds && step.artifactIds.length > 0 ? step.artifactIds : undefined,
  };
}

function toReceiptGovernance(governance: ChainStepGovernance): ChainReceiptStep["governance"] {
  return {
    scope_admission: {
      status: governance.scopeAdmission.status,
      requested_scopes: governance.scopeAdmission.requestedScopes,
      granted_scopes: governance.scopeAdmission.grantedScopes,
      grant_id: governance.scopeAdmission.grantId,
      reasons: governance.scopeAdmission.reasons,
    },
  };
}

function toChainReceiptSyncPoint(
  decision: FanoutSyncDecision,
  branchReceipts: readonly string[],
): ChainReceiptSyncPoint {
  return {
    group_id: decision.groupId,
    strategy: decision.strategy,
    decision: decision.decision,
    rule_fired: decision.ruleFired,
    reason: decision.reason,
    branch_count: decision.branchCount,
    success_count: decision.successCount,
    failure_count: decision.failureCount,
    required_successes: decision.requiredSuccesses,
    branch_receipts: branchReceipts,
    gate: decision.gate,
  };
}

function latestFanoutReceiptIds(stepRuns: readonly ChainStepRun[], groupId: string): readonly string[] {
  const latest = new Map<string, string>();
  for (const stepRun of stepRuns) {
    if (stepRun.fanoutGroup === groupId && stepRun.receiptId) {
      latest.set(stepRun.stepId, stepRun.receiptId);
    }
  }
  return Array.from(latest.values());
}

function parseStructuredOutput(stdout: string): Readonly<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function loadValidatedSkill(skillPath: string, runner?: string): Promise<ValidatedSkill> {
  const resolvedSkill = await resolveSkillReference(skillPath);
  const rawSkill = parseSkillMarkdown(await readFile(resolvedSkill.skillPath, "utf8"));
  return await resolveSkillRunner(validateSkill(rawSkill, { mode: "strict" }), resolvedSkill.xManifestCandidates, runner);
}

async function loadChainSkills(
  chain: ChainDefinition,
  chainDirectory: string,
): Promise<ReadonlyMap<string, ValidatedSkill>> {
  const skills = new Map<string, ValidatedSkill>();
  for (const step of chain.steps) {
    if (!step.skill) {
      continue;
    }
    skills.set(step.id, await loadValidatedSkill(path.resolve(chainDirectory, step.skill), step.runner));
  }
  return skills;
}

async function resolveChainStepExecution(options: {
  readonly step: ChainStep;
  readonly chainDirectory: string;
  readonly chainSkillCache: ReadonlyMap<string, ValidatedSkill>;
  readonly skillEnvironment?: {
    readonly name: string;
    readonly body: string;
  };
}): Promise<{
  readonly skill: ValidatedSkill;
  readonly skillPath: string;
  readonly reference: string;
}> {
  if (options.step.skill) {
    return {
      skill: options.chainSkillCache.get(options.step.id) ?? (await loadValidatedSkill(path.resolve(options.chainDirectory, options.step.skill), options.step.runner)),
      skillPath: path.resolve(options.chainDirectory, options.step.skill),
      reference: options.step.skill,
    };
  }

  if (!options.step.run) {
    throw new Error(`Chain step '${options.step.id}' is missing skill or run.`);
  }

  return {
    skill: buildInlineChainStepSkill(options.step, options.skillEnvironment),
    skillPath: `inline:${options.step.id}`,
    reference: `run:${String(options.step.run.type)}`,
  };
}

function composeInlineStepBody(skillBody: string | undefined, step: ChainStep): string {
  const parts = [
    skillBody?.trim(),
    step.instructions?.trim(),
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));
  return parts.join("\n\n");
}

function buildInlineChainStepSkill(
  step: ChainStep,
  skillEnvironment?: {
    readonly name: string;
    readonly body: string;
  },
): ValidatedSkill {
  if (!step.run) {
    throw new Error(`Chain step '${step.id}' is missing an inline run definition.`);
  }
  const body = composeInlineStepBody(skillEnvironment?.body, step);
  return {
    name: `${skillEnvironment?.name ?? "chain"}.${step.id}`,
    description: step.instructions,
    body,
    source: validateSkillSource(step.run),
    inputs: {},
    retry: step.retry,
    idempotency: step.idempotencyKey ? { key: step.idempotencyKey } : undefined,
    mutating: step.mutating,
    artifacts: validateSkillArtifactContract(step.artifacts, `steps.${step.id}.artifacts`),
    raw: {
      frontmatter: {},
      rawFrontmatter: "",
      body,
    },
  };
}

function buildRetryReceiptContext(
  step: ChainStep,
  inputs: Readonly<Record<string, unknown>>,
  attempt: number,
  skill: ValidatedSkill,
  retry: { readonly maxAttempts: number } | undefined,
): {
  readonly idempotencyKey?: string;
  readonly receipt?: RetryReceiptContext;
  readonly receiptMetadata?: Readonly<Record<string, unknown>>;
} {
  const maxAttempts = retry?.maxAttempts ?? 1;
  const idempotencyKey = resolveIdempotencyKey(step.idempotencyKey ?? skill.idempotency?.key, inputs);
  const idempotencyKeyHash = idempotencyKey ? hashStable({ idempotencyKey }) : undefined;
  if (maxAttempts <= 1 && !idempotencyKeyHash) {
    return {
      idempotencyKey,
    };
  }

  const receipt: RetryReceiptContext = {
    attempt,
    maxAttempts,
    ruleFired: attempt === 1 ? "initial_attempt" : "retry_attempt",
    idempotencyKeyHash,
  };
  return {
    idempotencyKey,
    receipt,
    receiptMetadata: {
      retry: {
        attempt,
        max_attempts: maxAttempts,
        rule_fired: receipt.ruleFired,
        idempotency_key_hash: idempotencyKeyHash,
      },
    },
  };
}

function resolveIdempotencyKey(template: string | undefined, inputs: Readonly<Record<string, unknown>>): string | undefined {
  if (!template) {
    return undefined;
  }
  const resolved = template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) =>
    stringifyContextValue(resolveInputPath(inputs, key)),
  );
  return resolved.trim() === "" ? undefined : resolved;
}

function resolveInputPath(inputs: Readonly<Record<string, unknown>>, inputPath: string): unknown {
  return inputPath.split(".").reduce<unknown>((value, key) => {
    if (!isRecord(value) || !(key in value)) {
      return undefined;
    }
    return value[key];
  }, inputs);
}

function stringifyContextValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function mergeMetadata(
  ...metadata: readonly (Readonly<Record<string, unknown>> | undefined)[]
): Readonly<Record<string, unknown>> | undefined {
  const merged = metadata
    .filter((item): item is Readonly<Record<string, unknown>> => Boolean(item))
    .reduce<Record<string, unknown>>((accumulator, item) => mergeRecord(accumulator, item), {});
  if (Object.keys(merged).length === 0) {
    return undefined;
  }
  return merged;
}

function mergeRecord(left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    const existing = merged[key];
    merged[key] = isPlainRecord(existing) && isPlainRecord(value) ? mergeRecord(existing, value) : value;
  }
  return merged;
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultA2aAdapters(): readonly SkillAdapter[] {
  try {
    return [createA2aAdapter({ transport: createFixtureA2aTransport() })];
  } catch {
    return [];
  }
}

function runnerTrustMetadata(sourceType: string): Readonly<Record<string, unknown>> {
  const callerMediated = sourceType === "agent" || sourceType === "agent-step" || sourceType === "approval";
  return {
    runner: {
      type: sourceType,
      enforcement: callerMediated ? "caller-mediated" : "runx-enforced",
      attestation: callerMediated ? "agent-reported" : "runx-observed",
    },
  };
}

function normalizeQuestionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function renderAgentStepPrompt(request: Parameters<SkillAdapter["invoke"]>[0]): string {
  return JSON.stringify(
    {
      source_type: "agent-step",
      agent: request.source.agent,
      task: request.source.task,
      skill: request.skillName ?? "agent-step",
      instructions: request.skillBody?.trim() ?? "",
      inputs: request.inputs,
      expected_outputs: request.source.outputs ?? {},
    },
    null,
    2,
  );
}

function renderAgentRunnerPrompt(request: Parameters<SkillAdapter["invoke"]>[0]): string {
  return JSON.stringify(
    {
      runner: "agent",
      skill: request.skillName ?? "skill",
      instructions: request.skillBody?.trim() ?? "",
      inputs: request.inputs,
      trust_boundary:
        "caller-mediated: runx receipts the caller-reported result but cannot enforce tool scopes inside the caller runtime",
    },
    null,
    2,
  );
}

async function resolveInputs(
  skill: ValidatedSkill,
  options: RunLocalSkillOptions,
): Promise<
  | { readonly status: "resolved"; readonly inputs: Readonly<Record<string, unknown>> }
  | { readonly status: "missing_context"; readonly questions: readonly Question[] }
> {
  const answers = options.answersPath ? await readAnswersFile(options.answersPath) : {};
  const resolved: Record<string, unknown> = {};

  for (const [key, input] of Object.entries(skill.inputs)) {
    if (input.default !== undefined) {
      resolved[key] = input.default;
    }
  }

  Object.assign(resolved, answers, options.inputs ?? {});

  const missing = missingRequiredInputs(skill.inputs, resolved);
  if (missing.length === 0) {
    return {
      status: "resolved",
      inputs: resolved,
    };
  }

  const callerAnswers = await options.caller.answer(missing);
  Object.assign(resolved, callerAnswers);

  const stillMissing = missingRequiredInputs(skill.inputs, resolved);
  if (stillMissing.length > 0) {
    return {
      status: "missing_context",
      questions: stillMissing,
    };
  }

  return {
    status: "resolved",
    inputs: resolved,
  };
}

async function readAnswersFile(answersPath: string): Promise<Record<string, unknown>> {
  const contents = await readFile(path.resolve(answersPath), "utf8");
  const parsed = JSON.parse(contents) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("--answers file must contain a JSON object.");
  }

  const answers = parsed.answers;
  if (answers === undefined) {
    return parsed;
  }
  if (!isRecord(answers)) {
    throw new Error("--answers answers field must be an object.");
  }
  return answers;
}

function missingRequiredInputs(
  inputs: Readonly<Record<string, SkillInput>>,
  resolved: Readonly<Record<string, unknown>>,
): readonly Question[] {
  const questions: Question[] = [];

  for (const [id, input] of Object.entries(inputs)) {
    if (!input.required) {
      continue;
    }

    const value = resolved[id];
    if (value === undefined || value === null || value === "") {
      questions.push({
        id,
        prompt: input.description ?? `Provide ${id}`,
        description: input.description,
        required: true,
        type: input.type,
      });
    }
  }

  return questions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultReceiptDir(env: NodeJS.ProcessEnv | undefined): string {
  return path.resolve(env?.RUNX_RECEIPT_DIR ?? env?.INIT_CWD ?? process.cwd(), ".runx", "receipts");
}
