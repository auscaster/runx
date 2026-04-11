import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createHarnessHookAdapter } from "../packages/harness/src/index.js";
import { parseRunnerManifestYaml, validateRunnerManifest } from "../packages/parser/src/index.js";
import { runLocalSkill, type Caller } from "../packages/runner-local/src/index.js";

const nonInteractiveCaller: Caller = {
  answer: async () => ({}),
  approve: async () => false,
  report: () => undefined,
};

describe("agent-step and harness-hook boundary", () => {
  it("denies agent-step execution by default in local policy", async () => {
    const result = await runLocalSkill({
      skillPath: path.resolve("fixtures/skills/agent-step.md"),
      inputs: { prompt: "review this" },
      caller: nonInteractiveCaller,
      env: process.env,
    });

    expect(result.status).toBe("policy_denied");
    if (result.status !== "policy_denied") {
      return;
    }
    expect(result.reasons).toContain("source type 'agent-step' is not allowed for local execution");
  });

  it("runs an explicit agent-step through the caller boundary when policy admits it", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-agent-step-"));
    const caller: Caller = {
      answer: async (questions) => ({
        [questions[0]?.id ?? "agent_step.review-boundary.output"]: {
          verdict: "pass",
          checked: "caller boundary",
        },
      }),
      approve: async () => false,
      report: () => undefined,
    };

    try {
      const result = await runLocalSkill({
        skillPath: path.resolve("fixtures/skills/agent-step.md"),
        inputs: { prompt: "review this" },
        caller,
        env: process.env,
        receiptDir: path.join(tempDir, "receipts"),
        runxHome: path.join(tempDir, "home"),
        allowedSourceTypes: ["cli-tool", "mcp", "agent-step"],
      });

      expect(result.status).toBe("success");
      if (result.status !== "success") {
        return;
      }
      expect(JSON.parse(result.execution.stdout)).toEqual({
        verdict: "pass",
        checked: "caller boundary",
      });
      expect(result.receipt.kind).toBe("skill_execution");
      if (result.receipt.kind !== "skill_execution") {
        return;
      }
      expect(result.receipt.metadata).toMatchObject({
        agent_hook: {
          source_type: "agent-step",
          agent: "codex",
          task: "review-boundary",
          route: "caller",
          status: "success",
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("runs an explicit harness-hook through an injected adapter and receipts the boundary", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-agent-step-boundary-"));

    try {
      const result = await runLocalSkill({
        skillPath: path.resolve("fixtures/skills/harness-hook.md"),
        inputs: { receipt_id: "rx_test" },
        caller: nonInteractiveCaller,
        env: process.env,
        receiptDir: path.join(tempDir, "receipts"),
        runxHome: path.join(tempDir, "home"),
        adapters: [
          createHarnessHookAdapter({
            handlers: {
              "review-receipt": () => ({ output: { verdict: "pass" } }),
            },
          }),
        ],
        allowedSourceTypes: ["cli-tool", "mcp", "harness-hook"],
      });

      expect(result.status).toBe("success");
      if (result.status !== "success") {
        return;
      }
      expect(result.receipt.kind).toBe("skill_execution");
      if (result.receipt.kind !== "skill_execution") {
        return;
      }
      expect(result.receipt.metadata).toMatchObject({
        agent_hook: {
          source_type: "harness-hook",
          hook: "review-receipt",
          status: "success",
        },
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps scafld bug-to-pr free of repo-local helper-script skills", async () => {
    const manifest = validateRunnerManifest(
      parseRunnerManifestYaml(await readFile(path.resolve("skills/bug-to-pr/x.yaml"), "utf8")),
    );
    const runner = manifest.runners["bug-to-pr"];

    expect(runner?.source.type).toBe("chain");
    if (!runner || runner.source.type !== "chain" || !runner.source.chain) {
      throw new Error("bug-to-pr runner must declare an inline chain.");
    }
    const chain = runner.source.chain;

    expect(chain.steps.every((step) => step.skill === "../scafld")).toBe(true);
    expect(chain.steps.some((step) => /fixture-agent|helper-script|\.mjs$/.test(step.skill ?? ""))).toBe(false);
  });
});
