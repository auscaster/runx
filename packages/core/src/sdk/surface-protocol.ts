import type { ResolutionRequest, ResolutionResponse } from "../executor/index.js";
import type { AuthResolver, Caller, ExecutionEvent, RunLocalSkillResult } from "../runner-local/index.js";

// Surface bridges let external hosts act as surfaces over the runx kernel.
// The host gets normalized run states; runx keeps ownership of execution,
// pause/resume, approvals, and receipts.
export interface SurfaceRunOptions {
  readonly skillPath: string;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly answersPath?: string;
  readonly receiptDir?: string;
  readonly runxHome?: string;
  readonly parentReceipt?: string;
  readonly contextFrom?: readonly string[];
  readonly caller?: Caller;
  readonly authResolver?: AuthResolver;
  readonly allowedSourceTypes?: readonly string[];
  readonly resumeFromRunId?: string;
}

export type SurfaceSkillExecutor = (
  options: SurfaceRunOptions & { readonly caller: Caller },
) => Promise<RunLocalSkillResult>;

export interface SurfaceBoundaryContext {
  readonly request: ResolutionRequest;
  readonly events: readonly ExecutionEvent[];
}

export type SurfaceBoundaryReply =
  | ResolutionResponse
  | {
      readonly actor?: "agent" | "human";
      readonly payload: unknown;
    }
  | boolean
  | string
  | number
  | Readonly<Record<string, unknown>>
  | undefined;

export type SurfaceBoundaryResolver = (
  context: SurfaceBoundaryContext,
) => Promise<SurfaceBoundaryReply> | SurfaceBoundaryReply;

export interface SurfaceBridgeOptions {
  readonly execute: SurfaceSkillExecutor;
}

export interface SurfacePausedResult {
  readonly status: "paused";
  readonly skillName: string;
  readonly runId: string;
  readonly requests: readonly ResolutionRequest[];
  readonly stepIds?: readonly string[];
  readonly stepLabels?: readonly string[];
  readonly events: readonly ExecutionEvent[];
}

export interface SurfaceCompletedResult {
  readonly status: "completed";
  readonly skillName: string;
  readonly receiptId: string;
  readonly output: string;
  readonly events: readonly ExecutionEvent[];
}

export interface SurfaceFailedResult {
  readonly status: "failed";
  readonly skillName: string;
  readonly receiptId?: string;
  readonly error: string;
  readonly events: readonly ExecutionEvent[];
}

export interface SurfaceDeniedResult {
  readonly status: "denied";
  readonly skillName: string;
  readonly reasons: readonly string[];
  readonly receiptId?: string;
  readonly events: readonly ExecutionEvent[];
}

export type SurfaceRunResult =
  | SurfacePausedResult
  | SurfaceCompletedResult
  | SurfaceFailedResult
  | SurfaceDeniedResult;

export interface SurfaceBridge {
  readonly run: (
    options: SurfaceRunOptions & {
      readonly resolver?: SurfaceBoundaryResolver;
    },
  ) => Promise<SurfaceRunResult>;
  readonly resume: (
    runId: string,
    options: Omit<SurfaceRunOptions, "resumeFromRunId"> & {
      readonly resolver?: SurfaceBoundaryResolver;
    },
  ) => Promise<SurfaceRunResult>;
}

export interface OpenAISurfaceResponse {
  readonly role: "tool";
  readonly content: readonly [{ readonly type: "text"; readonly text: string }];
  readonly structuredContent: {
    readonly runx: SurfaceRunResult;
  };
}

export interface AnthropicSurfaceResponse {
  readonly content: readonly [{ readonly type: "text"; readonly text: string }];
  readonly metadata: {
    readonly runx: SurfaceRunResult;
  };
}

export interface VercelAiSurfaceResponse {
  readonly messages: readonly [{ readonly role: "assistant"; readonly content: string }];
  readonly data: {
    readonly runx: SurfaceRunResult;
  };
}

export interface LangChainSurfaceResponse {
  readonly content: string;
  readonly additional_kwargs: {
    readonly runx: SurfaceRunResult;
  };
}

export interface CrewAiSurfaceResponse {
  readonly raw: string;
  readonly json_dict: {
    readonly runx: SurfaceRunResult;
  };
}

export interface ProviderSurfaceAdapter<TResponse> {
  readonly run: (
    options: SurfaceRunOptions & {
      readonly resolver?: SurfaceBoundaryResolver;
    },
  ) => Promise<TResponse>;
  readonly resume: (
    runId: string,
    options: Omit<SurfaceRunOptions, "resumeFromRunId"> & {
      readonly resolver?: SurfaceBoundaryResolver;
    },
  ) => Promise<TResponse>;
}

export function createSurfaceBridge(options: SurfaceBridgeOptions): SurfaceBridge {
  const bridge: SurfaceBridge = {
    run: async (runOptions) => {
      const events: ExecutionEvent[] = [];
      const caller: Caller = {
        report: async (event) => {
          events.push(event);
          await runOptions.caller?.report(event);
        },
        resolve: async (request) => {
          const resolved = normalizeSurfaceReply(await runOptions.resolver?.({ request, events }), request);
          return resolved ?? await runOptions.caller?.resolve(request);
        },
      };

      const result = await options.execute({
        ...runOptions,
        caller,
      });
      return normalizeRunResult(result, events);
    },
    resume: async (runId, runOptions) => {
      return await bridge.run({
        ...runOptions,
        resumeFromRunId: runId,
      });
    },
  };
  return bridge;
}

export function createOpenAiSurfaceAdapter(bridge: SurfaceBridge): ProviderSurfaceAdapter<OpenAISurfaceResponse> {
  return {
    run: async (options) => toOpenAiResponse(await bridge.run(options)),
    resume: async (runId, options) => toOpenAiResponse(await bridge.resume(runId, options)),
  };
}

export function createAnthropicSurfaceAdapter(bridge: SurfaceBridge): ProviderSurfaceAdapter<AnthropicSurfaceResponse> {
  return {
    run: async (options) => toAnthropicResponse(await bridge.run(options)),
    resume: async (runId, options) => toAnthropicResponse(await bridge.resume(runId, options)),
  };
}

export function createVercelAiSurfaceAdapter(bridge: SurfaceBridge): ProviderSurfaceAdapter<VercelAiSurfaceResponse> {
  return {
    run: async (options) => toVercelAiResponse(await bridge.run(options)),
    resume: async (runId, options) => toVercelAiResponse(await bridge.resume(runId, options)),
  };
}

export function createLangChainSurfaceAdapter(bridge: SurfaceBridge): ProviderSurfaceAdapter<LangChainSurfaceResponse> {
  return {
    run: async (options) => toLangChainResponse(await bridge.run(options)),
    resume: async (runId, options) => toLangChainResponse(await bridge.resume(runId, options)),
  };
}

export function createCrewAiSurfaceAdapter(bridge: SurfaceBridge): ProviderSurfaceAdapter<CrewAiSurfaceResponse> {
  return {
    run: async (options) => toCrewAiResponse(await bridge.run(options)),
    resume: async (runId, options) => toCrewAiResponse(await bridge.resume(runId, options)),
  };
}

function normalizeSurfaceReply(
  reply: SurfaceBoundaryReply,
  request: ResolutionRequest,
): ResolutionResponse | undefined {
  if (reply === undefined) {
    return undefined;
  }
  if (isResolutionResponse(reply)) {
    return reply;
  }
  if (typeof reply === "object" && reply !== null && "payload" in reply) {
    const candidate = reply as { readonly actor?: "agent" | "human"; readonly payload: unknown };
    return {
      actor: candidate.actor ?? defaultActorForRequest(request),
      payload: candidate.payload,
    };
  }
  if (typeof reply === "boolean" && request.kind === "approval") {
    return { actor: "human", payload: reply };
  }
  return {
    actor: defaultActorForRequest(request),
    payload: reply,
  };
}

function defaultActorForRequest(request: ResolutionRequest): "agent" | "human" {
  return request.kind === "cognitive_work" ? "agent" : "human";
}

function isResolutionResponse(value: unknown): value is ResolutionResponse {
  return typeof value === "object"
    && value !== null
    && "actor" in value
    && "payload" in value
    && (((value as { readonly actor?: unknown }).actor === "agent") || ((value as { readonly actor?: unknown }).actor === "human"));
}

function normalizeRunResult(result: RunLocalSkillResult, events: readonly ExecutionEvent[]): SurfaceRunResult {
  if (result.status === "needs_resolution") {
    return {
      status: "paused",
      skillName: result.skill.name,
      runId: result.runId,
      requests: result.requests,
      stepIds: result.stepIds,
      stepLabels: result.stepLabels,
      events,
    };
  }
  if (result.status === "policy_denied") {
    return {
      status: "denied",
      skillName: result.skill.name,
      reasons: result.reasons,
      receiptId: result.receipt?.id,
      events,
    };
  }
  if (result.status === "success") {
    return {
      status: "completed",
      skillName: result.skill.name,
      receiptId: result.receipt.id,
      output: result.execution.stdout,
      events,
    };
  }
  return {
    status: "failed",
    skillName: result.skill.name,
    receiptId: result.receipt.id,
    error: result.execution.errorMessage ?? (result.execution.stderr || result.execution.stdout),
    events,
  };
}

function toOpenAiResponse(result: SurfaceRunResult): OpenAISurfaceResponse {
  return {
    role: "tool",
    content: [{ type: "text", text: summarizeSurfaceResult(result) }],
    structuredContent: { runx: result },
  };
}

function toAnthropicResponse(result: SurfaceRunResult): AnthropicSurfaceResponse {
  return {
    content: [{ type: "text", text: summarizeSurfaceResult(result) }],
    metadata: { runx: result },
  };
}

function toVercelAiResponse(result: SurfaceRunResult): VercelAiSurfaceResponse {
  return {
    messages: [{ role: "assistant", content: summarizeSurfaceResult(result) }],
    data: { runx: result },
  };
}

function toLangChainResponse(result: SurfaceRunResult): LangChainSurfaceResponse {
  return {
    content: summarizeSurfaceResult(result),
    additional_kwargs: { runx: result },
  };
}

function toCrewAiResponse(result: SurfaceRunResult): CrewAiSurfaceResponse {
  return {
    raw: summarizeSurfaceResult(result),
    json_dict: { runx: result },
  };
}

function summarizeSurfaceResult(result: SurfaceRunResult): string {
  switch (result.status) {
    case "completed":
      return `${result.skillName} completed. Inspect receipt ${result.receiptId}.`;
    case "paused":
      return `${result.skillName} paused at ${result.runId}. Resume after resolving ${result.requests.length} request(s).`;
    case "denied":
      return `${result.skillName} was denied by policy.`;
    case "failed":
      return `${result.skillName} failed. Inspect receipt ${result.receiptId ?? "n/a"}.`;
  }
}
