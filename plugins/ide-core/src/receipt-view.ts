export interface ReceiptViewNode {
  readonly id: string;
  readonly label: string;
  readonly kind: "receipt" | "step" | "sync" | "approval" | "retry";
  readonly status?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface ReceiptViewEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface ReceiptViewModel {
  readonly title: string;
  readonly nodes: readonly ReceiptViewNode[];
  readonly edges: readonly ReceiptViewEdge[];
}

export function buildReceiptViewModel(receipt: unknown): ReceiptViewModel {
  if (!isRecord(receipt)) {
    return { title: "Invalid receipt", nodes: [], edges: [] };
  }

  const id = stringValue(receipt.id) ?? "receipt";
  const kind = stringValue(receipt.kind) ?? "receipt";
  const status = stringValue(receipt.status);
  const nodes: ReceiptViewNode[] = [
    {
      id,
      label: `${kind} ${id}`,
      kind: "receipt",
      status,
      detail: hashOnlyDetail(receipt),
    },
  ];
  const edges: ReceiptViewEdge[] = [];

  for (const step of arrayValue(receipt.steps)) {
    if (!isRecord(step)) {
      continue;
    }
    const stepId = stringValue(step.step_id) ?? `step-${nodes.length}`;
    const nodeId = `${id}:${stepId}`;
    nodes.push({
      id: nodeId,
      label: stepId,
      kind: "step",
      status: stringValue(step.status),
      detail: {
        skill: step.skill,
        runner: step.runner,
        fanout_group: step.fanout_group,
        receipt_id: step.receipt_id,
        rule_fired: isRecord(step.retry) ? step.retry.rule_fired : undefined,
        scope_admission: isRecord(step.governance) ? step.governance.scope_admission : undefined,
      },
    });
    edges.push({ from: id, to: nodeId, label: stringValue(step.fanout_group) ?? "step" });

    if (isRecord(step.retry)) {
      const retryId = `${nodeId}:retry`;
      nodes.push({
        id: retryId,
        label: `retry ${String(step.retry.attempt ?? "")}/${String(step.retry.max_attempts ?? "")}`,
        kind: "retry",
        detail: { rule_fired: step.retry.rule_fired, idempotency_key_hash: step.retry.idempotency_key_hash },
      });
      edges.push({ from: nodeId, to: retryId, label: "retry" });
    }
  }

  for (const syncPoint of arrayValue(receipt.sync_points)) {
    if (!isRecord(syncPoint)) {
      continue;
    }
    const syncId = `${id}:sync:${stringValue(syncPoint.group_id) ?? nodes.length.toString()}`;
    nodes.push({
      id: syncId,
      label: `sync ${String(syncPoint.group_id ?? "")}`,
      kind: "sync",
      status: stringValue(syncPoint.decision),
      detail: {
        strategy: syncPoint.strategy,
        rule_fired: syncPoint.rule_fired,
        branch_count: syncPoint.branch_count,
        success_count: syncPoint.success_count,
        failure_count: syncPoint.failure_count,
        required_successes: syncPoint.required_successes,
      },
    });
    edges.push({ from: id, to: syncId, label: "sync" });
  }

  return {
    title: stringValue(receipt.graph_name ?? receipt.skill_name) ?? id,
    nodes,
    edges,
  };
}

function hashOnlyDetail(receipt: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return {
    input_hash: receipt.input_hash,
    output_hash: receipt.output_hash,
    error_hash: receipt.error_hash,
    stderr_hash: receipt.stderr_hash,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
