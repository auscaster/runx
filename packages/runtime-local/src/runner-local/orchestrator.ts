import { planSequentialGraphTransition } from "@runxhq/core/state-machine";

import type { RunLocalGraphOptions, RunLocalGraphResult } from "./index.js";
import { prepareRun } from "./orchestrator/prepare-run.js";
import { finalizeRun } from "./orchestrator/finalize.js";
import { hydrateResumedRun } from "./orchestrator/hydrate-resume.js";
import {
  handleBlockedPlan,
  handleCompletePlan,
  handleEscalatedPlan,
  handleFailedPlan,
} from "./orchestrator/handle-terminal.js";
import { handlePausedPlan } from "./orchestrator/handle-paused.js";
import { handleRunStepPlan } from "./orchestrator/handle-run-step.js";
import { handleRunFanoutPlan } from "./orchestrator/handle-run-fanout.js";
import type { HandlerContinuation } from "./orchestrator/run-context.js";

export async function runLocalGraph(options: RunLocalGraphOptions): Promise<RunLocalGraphResult> {
  const ctx = await prepareRun(options);

  const earlyResume = await hydrateResumedRun(ctx, options);
  if (earlyResume) {
    return earlyResume;
  }

  await options.caller.report({
    type: "skill_loaded",
    message: `Loaded graph ${ctx.graph.name}.`,
    data: { graphPath: ctx.graphResolution.resolvedGraphPath, graphId: ctx.graphId },
  });

  while (!ctx.graphAlreadyTerminal) {
    const plan = planSequentialGraphTransition(ctx.state, ctx.graphSteps, ctx.graph.fanoutGroups, {
      resolvedFanoutGateKeys: ctx.resolvedFanoutGateKeys,
    });

    let continuation: HandlerContinuation;
    switch (plan.type) {
      case "complete":
        continuation = handleCompletePlan(ctx, plan);
        break;
      case "failed":
        continuation = handleFailedPlan(ctx, plan);
        break;
      case "blocked":
        continuation = handleBlockedPlan(ctx, plan);
        break;
      case "escalated":
        continuation = await handleEscalatedPlan(ctx, plan, options);
        break;
      case "paused":
        continuation = await handlePausedPlan(ctx, plan, options);
        break;
      case "run_fanout":
        continuation = await handleRunFanoutPlan(ctx, plan, options);
        break;
      case "run_step":
        continuation = await handleRunStepPlan(ctx, plan, options);
        break;
      default:
        return assertNever(plan);
    }

    if (continuation.kind === "return") {
      return continuation.result;
    }
    if (continuation.kind === "break") {
      break;
    }
  }

  return await finalizeRun(ctx, options);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled SequentialGraphPlan variant: ${JSON.stringify(value)}`);
}
