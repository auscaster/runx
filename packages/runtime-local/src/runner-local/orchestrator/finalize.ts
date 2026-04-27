import { writeLocalGraphReceipt } from "@runxhq/core/receipts";

import { appendGraphCompletedLedgerEntry } from "../graph-ledger.js";
import { graphProducerSkillName } from "../graph-reporting.js";
import { toGraphReceiptStep } from "../graph-governance.js";
import {
  indexReceiptIfEnabled,
  mergeMetadata,
} from "../runner-helpers.js";
import { projectReflectIfEnabled } from "../reflect.js";
import type { RunLocalGraphOptions, RunLocalGraphResult } from "../index.js";
import type { RunContext } from "./run-context.js";

export async function finalizeRun(ctx: RunContext, options: RunLocalGraphOptions): Promise<RunLocalGraphResult> {
  const completedAt = new Date().toISOString();
  const graphEscalated = ctx.state.status === "escalated";
  const receipt = await writeLocalGraphReceipt({
    receiptDir: ctx.receiptDir,
    runxHome: options.runxHome ?? options.env?.RUNX_HOME,
    graphId: ctx.graphId,
    graphName: ctx.graph.name,
    owner: ctx.graph.owner,
    status: ctx.state.status === "succeeded" ? "success" : "failure",
    inputs: options.inputs ?? {},
    output: ctx.finalOutput,
    steps: ctx.stepRuns.map(toGraphReceiptStep),
    syncPoints: ctx.syncPoints,
    startedAt: ctx.startedAt,
    completedAt,
    durationMs: Date.now() - ctx.startedAtMs,
    errorMessage: ctx.finalError,
    disposition: graphEscalated ? "escalated" : ctx.executionSemantics.disposition,
    inputContext: ctx.executionSemantics.inputContext,
    outcomeState: graphEscalated ? "pending" : ctx.executionSemantics.outcomeState,
    outcome: ctx.executionSemantics.outcome,
    surfaceRefs: ctx.executionSemantics.surfaceRefs,
    evidenceRefs: ctx.executionSemantics.evidenceRefs,
    metadata: mergeMetadata(ctx.inheritedReceiptMetadata, ctx.terminalReceiptMetadata),
  });
  await appendGraphCompletedLedgerEntry({
    receiptDir: ctx.receiptDir,
    runId: ctx.graphId,
    topLevelSkillName: graphProducerSkillName(options.skillEnvironment?.name, ctx.graph.name),
    receiptId: receipt.id,
    stepCount: ctx.stepRuns.length,
    status: receipt.status,
    createdAt: completedAt,
  });
  try {
    await indexReceiptIfEnabled(receipt, ctx.receiptDir, options);
  } catch (error) {
    await options.caller.report({
      type: "warning",
      message: "Local knowledge indexing failed after receipt write; continuing with the persisted receipt.",
      data: {
        receiptId: receipt.id,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
  await projectReflectIfEnabled({
    caller: options.caller,
    receipt,
    receiptDir: ctx.receiptDir,
    runId: ctx.graphId,
    skillName: graphProducerSkillName(options.skillEnvironment?.name, ctx.graph.name),
    knowledgeDir: options.knowledgeDir,
    env: options.env,
    selectedRunnerName: options.selectedRunnerName,
    postRunReflectPolicy: options.postRunReflectPolicy,
    involvedAgentMediatedWork: ctx.involvedAgentMediatedWork,
  });

  return {
    status: graphEscalated ? "escalated" : receipt.status,
    graph: ctx.graph,
    state: ctx.state,
    steps: [...ctx.stepRuns],
    receipt,
    output: ctx.finalOutput,
    errorMessage: ctx.finalError,
  };
}
