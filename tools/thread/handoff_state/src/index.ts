import {
  arrayInput,
  defineTool,
  stringInput,
} from "@runxhq/authoring";
import {
  findActiveSuppressionRecord,
  handoffStateAllowsOutboxPush,
  handoffStateAllowsSignalDisposition,
  latestHandoffSignal,
  reduceHandoffState,
  validateHandoffSignal,
  validateSuppressionRecord,
  type HandoffSignal,
  type HandoffState,
  type SuppressionRecord,
} from "@runxhq/core/knowledge";

const handoffSignalDispositions = new Set([
  "acknowledged",
  "interested",
  "requested_changes",
  "accepted",
  "approved_to_send",
  "merged",
  "declined",
  "requested_no_contact",
  "rerouted",
]);

const handoffStatuses = new Set([
  "awaiting_response",
  "engaged",
  "needs_revision",
  "accepted",
  "approved_to_send",
  "completed",
  "declined",
  "rerouted",
  "suppressed",
]);

export default defineTool({
  name: "thread.handoff_state",
  description: "Reduce generic post-handoff signals and suppression records into the current handoff state.",
  inputs: {
    handoff_id: stringInput({ description: "Stable id for the outward handoff being reduced." }),
    boundary_kind: stringInput({ optional: true, description: "Optional boundary kind for the far side of the handoff." }),
    target_repo: stringInput({ optional: true, description: "Optional target repository slug for repo-scoped suppression matching." }),
    target_locator: stringInput({ optional: true, description: "Optional target locator for target-scoped suppression matching." }),
    contact_locator: stringInput({ optional: true, description: "Optional contact locator for contact-scoped suppression matching." }),
    signals: arrayInput({ optional: true, description: "Observed handoff_signal records to replay for this handoff." }),
    suppressions: arrayInput({ optional: true, description: "Durable suppression_record policies to apply after signal replay." }),
    now: stringInput({ optional: true, description: "Optional ISO timestamp used for suppression expiry checks." }),
    candidate_disposition: stringInput({ optional: true, description: "Optional signal disposition to check against the reduced state." }),
    required_outbox_status: stringInput({ optional: true, description: "Optional handoff_state status required before an outbox push. Defaults to approved_to_send." }),
  },
  scopes: ["thread:read"],
  run({ inputs }) {
    const now = optionalNonEmptyString(inputs.now) ?? new Date().toISOString();
    const signals = normalizeSignals(inputs.signals);
    const suppressions = normalizeSuppressions(inputs.suppressions);
    const state = reduceHandoffState({
      handoff_id: inputs.handoff_id,
      boundary_kind: optionalNonEmptyString(inputs.boundary_kind),
      target_repo: optionalNonEmptyString(inputs.target_repo),
      target_locator: optionalNonEmptyString(inputs.target_locator),
      contact_locator: optionalNonEmptyString(inputs.contact_locator),
      signals,
      suppressions,
      now,
    });
    const candidateDisposition = optionalDisposition(inputs.candidate_disposition, "candidate_disposition");
    const requiredOutboxStatus =
      optionalHandoffStatus(inputs.required_outbox_status, "required_outbox_status") ?? "approved_to_send";
    const activeSuppressionRecord = findActiveSuppressionRecord({
      handoff_id: state.handoff_id,
      boundary_kind: state.boundary_kind,
      target_repo: state.target_repo,
      target_locator: state.target_locator,
      contact_locator: state.contact_locator,
    }, suppressions, now);

    return {
      handoff_state: state,
      latest_signal: latestHandoffSignal(signals, state.handoff_id),
      active_suppression_record: activeSuppressionRecord,
      allowed: {
        outbox_push: handoffStateAllowsOutboxPush(state, requiredOutboxStatus),
        required_outbox_status: requiredOutboxStatus,
        candidate_signal: candidateDisposition
          ? handoffStateAllowsSignalDisposition(state, candidateDisposition)
          : undefined,
      },
    };
  },
});

function normalizeSignals(value: readonly unknown[] | undefined): readonly HandoffSignal[] {
  return (value ?? []).map((signal, index) => validateHandoffSignal(signal, `signals[${index}]`));
}

function normalizeSuppressions(value: readonly unknown[] | undefined): readonly SuppressionRecord[] {
  return (value ?? []).map((record, index) => validateSuppressionRecord(record, `suppressions[${index}]`));
}

function optionalDisposition(
  value: string | undefined,
  label: string,
): HandoffSignal["disposition"] | undefined {
  const normalized = optionalNonEmptyString(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (!handoffSignalDispositions.has(normalized)) {
    throw new Error(`${label} must be a valid handoff_signal disposition.`);
  }
  return normalized as HandoffSignal["disposition"];
}

function optionalHandoffStatus(
  value: string | undefined,
  label: string,
): HandoffState["status"] | undefined {
  const normalized = optionalNonEmptyString(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (!handoffStatuses.has(normalized)) {
    throw new Error(`${label} must be a valid handoff_state status.`);
  }
  return normalized as HandoffState["status"];
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
