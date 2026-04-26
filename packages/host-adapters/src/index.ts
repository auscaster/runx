import type {
  SurfaceBoundaryResolver,
  SurfaceBridge,
  SurfaceRunOptions,
  SurfaceRunResult,
} from "@runxhq/core/sdk";

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
    options: Omit<SurfaceRunOptions, "resumeFromRunId" | "skillPath"> & {
      readonly skillPath?: string;
      readonly resolver?: SurfaceBoundaryResolver;
    },
  ) => Promise<TResponse>;
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
    case "escalated":
      return `${result.skillName} escalated. Inspect receipt ${result.receiptId}.`;
    case "failed":
      return `${result.skillName} failed. Inspect receipt ${result.receiptId ?? "n/a"}.`;
  }
}
