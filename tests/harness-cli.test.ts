import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../packages/cli/src/index.js";

describe("harness CLI", () => {
  it("runs a skill harness fixture non-interactively", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-harness-cli-"));
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();

    try {
      const exitCode = await runCli(
        ["harness", "fixtures/harness/echo-skill.yaml", "--json"],
        { stdin: process.stdin, stdout, stderr },
        { ...process.env, RUNX_CWD: process.cwd(), RUNX_HOME: path.join(tempDir, "home") },
      );

      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout.contents()) as {
        fixture: { name: string };
        status: string;
        assertionErrors: string[];
      };
      expect(report.fixture.name).toBe("echo-skill");
      expect(report.status).toBe("success");
      expect(report.assertionErrors).toEqual([]);
      expect(stderr.contents()).toBe("");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("runs inline harness cases from a skill directory", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-harness-inline-cli-"));
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();

    try {
      const exitCode = await runCli(
        ["harness", "skills/evolve", "--json"],
        { stdin: process.stdin, stdout, stderr },
        { ...process.env, RUNX_CWD: process.cwd(), RUNX_HOME: path.join(tempDir, "home") },
      );

      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout.contents()) as {
        source: string;
        status: string;
        cases: Array<{ fixture: { name: string }; status: string }>;
        assertionErrors: string[];
      };
      expect(report.source).toBe("inline");
      expect(report.status).toBe("success");
      expect(report.cases).toMatchObject([
        { fixture: { name: "evolve-introspect" }, status: "success" },
        { fixture: { name: "evolve-plan-spec" }, status: "success" },
      ]);
      expect(report.assertionErrors).toEqual([]);
      expect(stderr.contents()).toBe("");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 15_000);
});

function createMemoryStream(): NodeJS.WriteStream & { contents: () => string } {
  let buffer = "";
  return {
    write: (chunk: string | Uint8Array) => {
      buffer += chunk.toString();
      return true;
    },
    contents: () => buffer,
  } as NodeJS.WriteStream & { contents: () => string };
}
