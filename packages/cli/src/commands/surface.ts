import { readFile } from "node:fs/promises";

import { resolveDefaultSkillAdapters } from "@runxhq/adapters";
import { resolvePathFromUserInput, resolveRunxHomeDir } from "@runxhq/core/config";
import { createRunxSurfaceBridge, type SurfaceBoundaryResolver, type SurfaceRunResult, type SurfaceRunState } from "@runxhq/core/sdk";
import type { RegistryStore } from "@runxhq/core/registry";
import { resolveEnvToolCatalogAdapters } from "@runxhq/core/tool-catalogs";

import type { CliIo } from "../index.js";
import { resolveBundledCliVoiceProfilePath } from "../runtime-assets.js";
import { resolveRunnableSkillReference } from "../skill-refs.js";

export interface SurfaceCommandArgs {
  readonly surfaceAction: "run" | "resume" | "inspect";
  readonly surfaceRef: string;
  readonly surfaceInputPath?: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly receiptDir?: string;
  readonly runner?: string;
}

export interface SurfaceCommandDependencies {
  readonly resolveRegistryStoreForChains: (env: NodeJS.ProcessEnv) => Promise<RegistryStore | undefined>;
  readonly resolveDefaultReceiptDir: (env: NodeJS.ProcessEnv) => string;
}

export async function handleSurfaceCommand(
  parsed: SurfaceCommandArgs,
  io: CliIo,
  env: NodeJS.ProcessEnv,
  deps: SurfaceCommandDependencies,
): Promise<SurfaceRunResult | SurfaceRunState> {
  const registryStore = await deps.resolveRegistryStoreForChains(env);
  const adapters = await resolveDefaultSkillAdapters(env);
  const receiptDir = parsed.receiptDir ? resolvePathFromUserInput(parsed.receiptDir, env) : deps.resolveDefaultReceiptDir(env);
  const bridge = createRunxSurfaceBridge({
    env,
    receiptDir,
    runxHome: resolveRunxHomeDir(env),
    registryStore,
    adapters,
    toolCatalogAdapters: resolveEnvToolCatalogAdapters(env),
    voiceProfilePath: await resolveBundledCliVoiceProfilePath(),
  });

  if (parsed.surfaceAction === "inspect") {
    return await bridge.inspect(parsed.surfaceRef, { receiptDir });
  }

  const payload = await readOptionalSurfacePayload(parsed.surfaceInputPath, io, env);
  if (parsed.surfaceAction === "run") {
    const skillPath = await resolveRunnableSkillReference(parsed.surfaceRef, env);
    return await bridge.run({
      skillPath,
      inputs: {
        ...surfaceInputsFromPayload(payload),
        ...parsed.inputs,
      },
      runner: parsed.runner,
      receiptDir,
    });
  }

  return await bridge.resume(parsed.surfaceRef, {
    receiptDir,
    resolver: createSurfaceResumeResolver(payload),
  });
}

async function readOptionalSurfacePayload(
  source: string | undefined,
  io: CliIo,
  env: NodeJS.ProcessEnv,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  if (!source) {
    return undefined;
  }
  const raw = source === "-"
    ? await readStream(io.stdin)
    : await readFile(resolvePathFromUserInput(source, env), "utf8");
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("--input-json must contain a JSON object.");
  }
  return parsed;
}

function surfaceInputsFromPayload(
  payload: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (!payload) {
    return {};
  }
  if ("inputs" in payload) {
    if (!isRecord(payload.inputs)) {
      throw new Error("surface run payload.inputs must be an object.");
    }
    return payload.inputs;
  }
  return payload;
}

function createSurfaceResumeResolver(
  payload: Readonly<Record<string, unknown>> | undefined,
): SurfaceBoundaryResolver | undefined {
  if (!payload) {
    return undefined;
  }
  const responsesValue = payload.responses;
  if (responsesValue === undefined) {
    return undefined;
  }
  if (!Array.isArray(responsesValue)) {
    throw new Error("surface resume payload.responses must be an array.");
  }
  const responses = responsesValue.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`surface resume payload.responses[${index}] must be an object.`);
    }
    const requestId = entry.requestId;
    if (typeof requestId !== "string" || requestId.trim().length === 0) {
      throw new Error(`surface resume payload.responses[${index}].requestId must be a non-empty string.`);
    }
    const actor = entry.actor;
    if (actor !== undefined && actor !== "human" && actor !== "agent") {
      throw new Error(`surface resume payload.responses[${index}].actor must be human or agent when provided.`);
    }
    if (!("payload" in entry)) {
      throw new Error(`surface resume payload.responses[${index}].payload is required.`);
    }
    return {
      requestId,
      actor,
      payload: entry.payload,
    };
  });
  const byRequestId = new Map(responses.map((response) => [response.requestId, response] as const));
  return ({ request }) => {
    const response = byRequestId.get(request.id);
    if (!response) {
      return undefined;
    }
    return response.actor
      ? { actor: response.actor, payload: response.payload }
      : { payload: response.payload };
  };
}

async function readStream(stream: NodeJS.ReadStream): Promise<string> {
  let contents = "";
  for await (const chunk of stream) {
    contents += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
  }
  return contents;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
