import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runLocalSkill, type Caller } from "../packages/runner-local/src/index.js";

const passiveCaller: Caller = {
  answer: async () => ({}),
  approve: async () => false,
  report: () => undefined,
};

describe("agent context envelope", () => {
  it("yields current step artifacts and provenance to agent-mediated steps", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-agent-envelope-"));

    try {
      const result = await runLocalSkill({
        skillPath: path.resolve("skills/evolve"),
        inputs: {
          objective: "add release notes",
          repo_root: ".",
        },
        caller: passiveCaller,
        env: { ...process.env, RUNX_CWD: process.cwd() },
        receiptDir: path.join(tempDir, "receipts"),
        runxHome: path.join(tempDir, "home"),
      });

      expect(result.status).toBe("needs_agent");
      if (result.status !== "needs_agent") {
        return;
      }

      const request = result.requests[0];
      expect(request?.id).toBe("agent_step.evolve-plan.output");
      expect(request?.envelope.run_id.startsWith("cx_")).toBe(true);
      expect(request?.envelope.step_id).toBe("plan");
      expect(request?.envelope.skill).toBe("evolve.plan");
      expect(request?.envelope.allowed_tools).toEqual(["fs.read", "git.status", "shell.exec"]);
      expect(request?.envelope.current_context.map((artifact) => artifact.type)).toEqual(["repo_profile"]);
      expect(request?.envelope.provenance).toEqual([
        {
          input: "repo_profile",
          output: "repo_profile.data",
          from_step: "preflight",
          artifact_id: request?.envelope.current_context[0]?.meta.artifact_id,
          receipt_id: request?.envelope.provenance[0]?.receipt_id,
        },
      ]);
      expect(request?.envelope.historical_context).toEqual([]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("includes prior typed artifacts from the same skill and project in historical context", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-agent-history-"));
    const receiptDir = path.join(tempDir, "receipts");
    const runxHome = path.join(tempDir, "home");

    const completionCaller: Caller = {
      answer: async () => ({}),
      approve: async () => false,
      resolveAgentResult: async (request) =>
        request.id === "agent_step.evolve-plan.output"
          ? {
              objective_brief: {
                objective: "add release notes",
                target_type: "repo",
                target_ref: ".",
              },
              diagnosis_report: {
                findings: ["docs missing"],
                recommended_phases: ["plan", "act"],
              },
              change_plan: {
                steps: ["draft release notes"],
                estimated_scope: "small",
                risk_assessment: "low",
              },
              spec_document: {
                spec_version: "1.1",
                task_id: "evolve_release_notes",
                phases: ["plan", "act"],
              },
            }
          : undefined,
      resolveApproval: async (gate) => (gate.id === "evolve.plan.approval" ? true : undefined),
      report: () => undefined,
    };

    try {
      const first = await runLocalSkill({
        skillPath: path.resolve("skills/evolve"),
        inputs: {
          objective: "add release notes",
          repo_root: ".",
        },
        caller: completionCaller,
        env: { ...process.env, RUNX_CWD: process.cwd() },
        receiptDir,
        runxHome,
      });

      expect(first.status).toBe("success");

      const second = await runLocalSkill({
        skillPath: path.resolve("skills/evolve"),
        inputs: {
          objective: "add release notes",
          repo_root: ".",
        },
        caller: passiveCaller,
        env: { ...process.env, RUNX_CWD: process.cwd() },
        receiptDir,
        runxHome,
      });

      expect(second.status).toBe("needs_agent");
      if (second.status !== "needs_agent") {
        return;
      }

      const historicalTypes = second.requests[0]?.envelope.historical_context.map((artifact) => artifact.type);
      expect(historicalTypes).toEqual(["objective_brief", "diagnosis_report", "change_plan", "spec_document"]);
      expect(second.requests[0]?.envelope.allowed_tools).toEqual(["fs.read", "git.status", "shell.exec"]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
