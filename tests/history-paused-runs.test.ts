import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { inspectLocalRun, listLocalHistory } from "@runxhq/runtime-local";

const ledgerEntries = (runId: string, skillName: string) => {
  const created = "2026-04-28T01:00:00.000Z";
  const meta = (artifactId: string, sizeBytes: number) => ({
    artifact_id: artifactId,
    run_id: runId,
    step_id: "discover",
    producer: { skill: skillName, runner: "graph" },
    created_at: created,
    hash: "0".repeat(64),
    size_bytes: sizeBytes,
    parent_artifact_id: null,
    receipt_id: null,
    redacted: false,
  });
  return [
    {
      type: "run_event",
      version: "1",
      data: {
        kind: "run_started",
        status: "started",
        step_id: null,
        detail: {},
      },
      meta: meta("ax_started", 64),
    },
    {
      type: "run_event",
      version: "1",
      data: {
        kind: "step_waiting_resolution",
        status: "waiting",
        step_id: "discover",
        detail: {
          request_ids: ["agent_step.test-step.output"],
          resolution_kinds: ["cognitive_work"],
          step_ids: ["discover"],
          step_labels: ["inspect repo"],
          inputs: {},
          selected_runner: "agent-step",
        },
      },
      meta: meta("ax_waiting", 256),
    },
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n");
};

describe("paused runs surface in history and inspect", () => {
  it("listLocalHistory includes paused runs from ledgers", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-paused-history-"));
    const receiptDir = path.join(tempDir, "receipts");
    await mkdir(path.join(receiptDir, "ledgers"), { recursive: true });
    const runId = "gx_paused0000000000000000000000ab";

    try {
      await writeFile(
        path.join(receiptDir, "ledgers", `${runId}.jsonl`),
        ledgerEntries(runId, "sourcey"),
      );

      const result = await listLocalHistory({ receiptDir });
      expect(result.receipts).toHaveLength(0);
      expect(result.pendingRuns).toHaveLength(1);
      expect(result.pendingRuns[0]).toMatchObject({
        id: runId,
        name: "sourcey",
        status: "paused",
        kind: "graph_execution",
        selectedRunner: "agent-step",
        stepIds: ["discover"],
        stepLabels: ["inspect repo"],
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("inspectLocalRun returns a paused summary for paused runs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-paused-inspect-"));
    const receiptDir = path.join(tempDir, "receipts");
    await mkdir(path.join(receiptDir, "ledgers"), { recursive: true });
    const runId = "gx_paused0000000000000000000000cd";

    try {
      await writeFile(
        path.join(receiptDir, "ledgers", `${runId}.jsonl`),
        ledgerEntries(runId, "issue-to-pr"),
      );

      const result = await inspectLocalRun({ referenceId: runId, receiptDir });
      expect(result.kind).toBe("paused");
      if (result.kind !== "paused") return;
      expect(result.runId).toBe(runId);
      expect(result.summary.name).toBe("issue-to-pr");
      expect(result.summary.status).toBe("paused");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("listLocalHistory does not double-list runs that have terminal receipts", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-paused-dedupe-"));
    const receiptDir = path.join(tempDir, "receipts");
    await mkdir(path.join(receiptDir, "ledgers"), { recursive: true });

    try {
      const result = await listLocalHistory({ receiptDir });
      expect(result.receipts).toHaveLength(0);
      expect(result.pendingRuns).toHaveLength(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
