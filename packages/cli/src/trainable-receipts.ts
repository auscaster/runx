import { readJournalEntries, type ArtifactEnvelope } from "../../artifacts/src/index.js";
import {
  defaultRunxHome,
  listVerifiedLocalReceipts,
  latestVerifiedReceiptOutcomeResolution,
  type LocalReceipt,
  type ReceiptVerification,
  type VerifiedReceiptOutcomeResolution,
} from "../../receipts/src/index.js";

export interface StreamTrainableReceiptsOptions {
  readonly receiptDir: string;
  readonly runxHome?: string;
  readonly since?: string;
  readonly until?: string;
  readonly status?: string;
  readonly source?: string;
}

export interface TrainableReceiptRecord {
  readonly receipt: LocalReceipt;
  readonly receipt_verification: ReceiptVerification;
  readonly effective_outcome_state: string;
  readonly latest_outcome_resolution: VerifiedReceiptOutcomeResolution | null;
  readonly journal_entries: readonly ArtifactEnvelope[];
  readonly runner_provenance: {
    readonly provider?: string;
    readonly model?: string;
    readonly prompt_version?: string;
  };
}

export async function* streamTrainableReceipts(
  options: StreamTrainableReceiptsOptions,
): AsyncGenerator<TrainableReceiptRecord> {
  const since = parseTimestamp(options.since, "since");
  const until = parseTimestamp(options.until, "until");
  const receipts = await listVerifiedLocalReceipts(options.receiptDir, options.runxHome);

  for (const { receipt, verification } of receipts) {
    if (verification.status !== "verified") {
      continue;
    }

    const timestamp = receiptTimestamp(receipt);
    if (since && (!timestamp || timestamp < since)) {
      continue;
    }
    if (until && (!timestamp || timestamp > until)) {
      continue;
    }

    const latestOutcomeResolution = await latestVerifiedReceiptOutcomeResolution(
      options.receiptDir,
      receipt.id,
      options.runxHome ?? defaultRunxHome(),
    );
    const effectiveOutcomeState = latestOutcomeResolution?.resolution.outcome_state ?? receipt.outcome_state ?? "complete";
    if (options.status && effectiveOutcomeState !== options.status) {
      continue;
    }

    const receiptSource = sourceType(receipt);
    if (options.source && receiptSource !== options.source) {
      continue;
    }

    yield {
      receipt,
      receipt_verification: verification,
      effective_outcome_state: effectiveOutcomeState,
      latest_outcome_resolution: latestOutcomeResolution ?? null,
      journal_entries: await readJournalEntries(options.receiptDir, receipt.id),
      runner_provenance: runnerProvenance(receipt),
    };
  }
}

function receiptTimestamp(receipt: LocalReceipt): number | undefined {
  const raw = receipt.completed_at ?? receipt.started_at;
  if (!raw) {
    return undefined;
  }
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function parseTimestamp(value: string | undefined, label: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid ${label} timestamp '${value}'. Expected ISO-8601.`);
  }
  return timestamp;
}

function sourceType(receipt: LocalReceipt): string | undefined {
  return receipt.kind === "skill_execution" ? receipt.subject.source_type : undefined;
}

function runnerProvenance(receipt: LocalReceipt): TrainableReceiptRecord["runner_provenance"] {
  const metadata = receipt.kind === "skill_execution" && isRecord(receipt.metadata) ? receipt.metadata : undefined;
  const runner = isRecord(metadata?.runner) ? metadata.runner : undefined;
  return {
    provider: typeof runner?.provider === "string" ? runner.provider : undefined,
    model: typeof runner?.model === "string" ? runner.model : undefined,
    prompt_version: typeof runner?.prompt_version === "string" ? runner.prompt_version : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
