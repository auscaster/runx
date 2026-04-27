import { type GraphReceiptSyncPoint } from "@runxhq/core/receipts";
import { type SequentialGraphState } from "@runxhq/core/state-machine";

import type { GraphStepOutput } from "../graph-context.js";
import { loadGraphStepExecutables, resolveGraphExecution } from "../execution-targets.js";
import {
  contextReceiptMetadata as _contextReceiptMetadata,
  loadContext,
  loadVoiceProfile,
  voiceProfileReceiptMetadata as _voiceProfileReceiptMetadata,
} from "../context.js";
import { loadRunxWorkspacePolicy } from "@runxhq/core/config";
import { normalizeExecutionSemantics } from "../execution-semantics.js";
import { defaultLocalGraphGrant } from "../runner-helpers.js";
import type { GraphStepRun, RunLocalGraphOptions, RunLocalGraphResult } from "../index.js";

void _contextReceiptMetadata;
void _voiceProfileReceiptMetadata;

export interface RunContext {
  options: RunLocalGraphOptions;
  graphResolution: Awaited<ReturnType<typeof resolveGraphExecution>>;
  graph: RunContext["graphResolution"]["graph"];
  graphDirectory: string;
  graphSteps: readonly {
    readonly id: string;
    readonly contextFrom: readonly string[];
    readonly retry: { readonly maxAttempts: number } | undefined;
    readonly fanoutGroup: string | undefined;
  }[];
  graphStepCache: Awaited<ReturnType<typeof loadGraphStepExecutables>>;
  graphGrant: ReturnType<typeof defaultLocalGraphGrant>;
  graphId: string;
  receiptDir: string;
  contextSnapshot: Awaited<ReturnType<typeof loadContext>>;
  voiceProfile: Awaited<ReturnType<typeof loadVoiceProfile>>;
  executionSemantics: ReturnType<typeof normalizeExecutionSemantics>;
  workspacePolicy: Awaited<ReturnType<typeof loadRunxWorkspacePolicy>>;
  inheritedReceiptMetadata: Readonly<Record<string, unknown>> | undefined;
  startedAt: string;
  startedAtMs: number;
  state: SequentialGraphState;
  stepRuns: GraphStepRun[];
  syncPoints: GraphReceiptSyncPoint[];
  resolvedFanoutGateKeys: Set<string>;
  outputs: Map<string, GraphStepOutput>;
  lastReceiptId: string | undefined;
  finalOutput: string;
  finalError: string | undefined;
  terminalReceiptMetadata: Readonly<Record<string, unknown>> | undefined;
  graphAlreadyTerminal: boolean;
  involvedAgentMediatedWork: boolean;
}

export type HandlerContinuation =
  | { readonly kind: "continue" }
  | { readonly kind: "break" }
  | { readonly kind: "return"; readonly result: RunLocalGraphResult };
