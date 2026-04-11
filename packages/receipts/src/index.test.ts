import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadOrCreateLocalKey,
  readLocalReceipt,
  verifyLocalReceipt,
  writeLocalReceipt,
  type LocalReceipt,
} from "./index.js";

describe("local receipts", () => {
  it("writes a signed receipt without raw inputs or outputs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-receipt-"));
    const receiptDir = path.join(tempDir, "receipts");
    const runxHome = path.join(tempDir, "home");

    try {
      const receipt = await writeLocalReceipt({
        receiptDir,
        runxHome,
        skillName: "echo",
        sourceType: "cli-tool",
        inputs: { message: "super-secret-value" },
        stdout: "super-secret-output",
        stderr: "",
        execution: {
          status: "success",
          exitCode: 0,
          signal: null,
          durationMs: 10,
        },
        startedAt: "2026-04-10T00:00:00Z",
        completedAt: "2026-04-10T00:00:01Z",
      });

      const receiptPath = path.join(receiptDir, `${receipt.id}.json`);
      const contents = await readFile(receiptPath, "utf8");
      const parsed = JSON.parse(contents) as LocalReceipt;
      const keyPair = await loadOrCreateLocalKey(runxHome);

      expect(parsed.input_hash).toHaveLength(64);
      expect(parsed.output_hash).toHaveLength(64);
      expect(contents).not.toContain("super-secret-value");
      expect(contents).not.toContain("super-secret-output");
      expect(verifyLocalReceipt(parsed, keyPair.publicKey)).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe receipt ids on read", async () => {
    await expect(readLocalReceipt("/tmp", "../escape")).rejects.toThrow("Invalid receipt id");
  });

  it("redacts raw provider secrets from receipt metadata", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-receipt-redaction-"));
    const receiptDir = path.join(tempDir, "receipts");
    const runxHome = path.join(tempDir, "home");

    try {
      const receipt = await writeLocalReceipt({
        receiptDir,
        runxHome,
        skillName: "connected",
        sourceType: "cli-tool",
        inputs: {},
        stdout: "ok",
        stderr: "",
        execution: {
          status: "success",
          exitCode: 0,
          signal: null,
          durationMs: 10,
          metadata: {
            auth: {
              grant_id: "grant_1",
              provider: "github",
              connection_id: "conn_1",
              access_token: "super-secret-token",
            },
          },
        },
      });

      const contents = await readFile(path.join(receiptDir, `${receipt.id}.json`), "utf8");
      expect(contents).toContain('"access_token": "[redacted]"');
      expect(contents).not.toContain("super-secret-token");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
