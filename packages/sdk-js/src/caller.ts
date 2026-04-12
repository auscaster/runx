import type { AgentWorkRequest, ApprovalGate } from "../../executor/src/index.js";
import type { Caller, ExecutionEvent, Question } from "../../runner-local/src/index.js";

export interface StructuredApproval {
  readonly gate: ApprovalGate;
  readonly approved: boolean;
}

export interface StructuredCallerTrace {
  readonly questionBundles: readonly (readonly Question[])[];
  readonly agentRequests: readonly AgentWorkRequest[];
  readonly approvals: readonly StructuredApproval[];
  readonly events: readonly ExecutionEvent[];
}

export interface StructuredCallerOptions {
  readonly answers?: Readonly<Record<string, unknown>>;
  readonly approvals?: boolean | Readonly<Record<string, boolean>>;
}

export type StructuredCaller = Caller & {
  readonly trace: StructuredCallerTrace;
};

export function createStructuredCaller(options: StructuredCallerOptions = {}): StructuredCaller {
  const questionBundles: (readonly Question[])[] = [];
  const agentRequests: AgentWorkRequest[] = [];
  const approvals: StructuredApproval[] = [];
  const events: ExecutionEvent[] = [];

  return {
    trace: {
      questionBundles,
      agentRequests,
      approvals,
      events,
    },
    answer: async (questions) => {
      questionBundles.push(questions);
      return Object.fromEntries(
        questions
          .filter((question) => options.answers?.[question.id] !== undefined)
          .map((question) => [question.id, options.answers?.[question.id]]),
      );
    },
    approve: async (gate) => {
      const approved =
        typeof options.approvals === "boolean" ? options.approvals : Boolean(options.approvals?.[gate.id]);
      approvals.push({ gate, approved });
      return approved;
    },
    resolveAgentResult: async (request) => {
      agentRequests.push(request);
      return options.answers?.[request.id];
    },
    resolveApproval: async (gate) => {
      const approved =
        typeof options.approvals === "boolean" ? options.approvals : options.approvals?.[gate.id];
      if (approved !== undefined) {
        approvals.push({ gate, approved });
      }
      return approved;
    },
    report: (event) => {
      events.push(event);
    },
  };
}
