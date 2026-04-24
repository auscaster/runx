import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { inspectLocalReceipt, readLocalReplaySeed } from "@runxhq/core/runner-local";
import { runCli } from "../packages/cli/src/index.js";

describe("run replay", () => {
  it("replays a completed run from its local ledger seed and stamps lineage into the new receipt", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-replay-run-"));
    const receiptDir = path.join(tempDir, "receipts");
    const runxHome = path.join(tempDir, "home");

    try {
      const firstStdout = createMemoryStream();
      const firstExit = await runCli(
        ["skill", "fixtures/skills/echo", "--message", "hi", "--receipt-dir", receiptDir, "--json"],
        { stdin: process.stdin, stdout: firstStdout, stderr: createMemoryStream() },
        {
          ...process.env,
          RUNX_CWD: process.cwd(),
          RUNX_HOME: runxHome,
        },
      );
      expect(firstExit).toBe(0);
      const first = JSON.parse(firstStdout.contents()) as { readonly receipt: { readonly id: string } };

      await expect(readLocalReplaySeed({ referenceId: first.receipt.id, receiptDir, runxHome })).resolves.toMatchObject({
        runId: first.receipt.id,
        receiptId: first.receipt.id,
        lineage: {
          kind: "rerun",
          sourceRunId: first.receipt.id,
          sourceReceiptId: first.receipt.id,
        },
      });

      const replayStdout = createMemoryStream();
      const replayExit = await runCli(
        ["replay", first.receipt.id, "--receipt-dir", receiptDir, "--json"],
        { stdin: process.stdin, stdout: replayStdout, stderr: createMemoryStream() },
        {
          ...process.env,
          RUNX_CWD: process.cwd(),
          RUNX_HOME: runxHome,
        },
      );
      expect(replayExit).toBe(0);
      const replay = JSON.parse(replayStdout.contents()) as {
        readonly receipt: {
          readonly id: string;
          readonly metadata?: Readonly<Record<string, unknown>>;
        };
      };
      expect(replay.receipt.id).not.toBe(first.receipt.id);

      await expect(inspectLocalReceipt({ receiptDir, runxHome, receiptId: replay.receipt.id })).resolves.toMatchObject({
        summary: {
          id: replay.receipt.id,
          lineage: {
            kind: "rerun",
            sourceRunId: first.receipt.id,
            sourceReceiptId: first.receipt.id,
          },
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps paused runs on the resume path instead of replay", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-replay-paused-"));
    const receiptDir = path.join(tempDir, "receipts");
    const runxHome = path.join(tempDir, "home");

    try {
      const pausedStdout = createMemoryStream();
      const pausedExit = await runCli(
        ["skill", "fixtures/skills/echo", "--receipt-dir", receiptDir, "--non-interactive", "--json"],
        { stdin: process.stdin, stdout: pausedStdout, stderr: createMemoryStream() },
        {
          ...process.env,
          RUNX_CWD: process.cwd(),
          RUNX_HOME: runxHome,
        },
      );
      expect(pausedExit).toBe(2);
      const paused = JSON.parse(pausedStdout.contents()) as { readonly run_id: string };

      const replayStderr = createMemoryStream();
      const replayExit = await runCli(
        ["replay", paused.run_id, "--receipt-dir", receiptDir, "--json"],
        { stdin: process.stdin, stdout: createMemoryStream(), stderr: replayStderr },
        {
          ...process.env,
          RUNX_CWD: process.cwd(),
          RUNX_HOME: runxHome,
        },
      );
      expect(replayExit).toBe(1);
      expect(replayStderr.contents()).toContain("Use 'runx resume");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function createMemoryStream(): NodeJS.WriteStream & { contents: () => string } {
  let contents = "";
  return {
    write(chunk: unknown) {
      contents += String(chunk);
      return true;
    },
    contents: () => contents,
  } as NodeJS.WriteStream & { contents: () => string };
}
