import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseRunnerManifestYaml, validateRunnerManifest } from "../packages/parser/src/index.js";
import { runLocalSkill, type Caller } from "../packages/runner-local/src/index.js";

const scafldBin = process.env.SCAFLD_BIN ?? "/home/kam/dev/scafld/cli/scafld";
const caller: Caller = {
  answer: async () => ({}),
  approve: async () => false,
  report: () => undefined,
};

describe("bug-to-PR composite skill", () => {
  it("models review-open, caller-mediated review, and completion as separate execution steps", async () => {
    const manifest = validateRunnerManifest(
      parseRunnerManifestYaml(await readFile(path.resolve("skills/bug-to-pr/x.yaml"), "utf8")),
    );
    const runner = manifest.runners["bug-to-pr"];

    expect(runner?.source.type).toBe("chain");
    if (!runner || runner.source.type !== "chain" || !runner.source.chain) {
      throw new Error("bug-to-pr runner must declare an inline chain.");
    }
    const chain = runner.source.chain;

    expect(chain.steps.map((step) => step.id)).toContain("scafld-review-open");
    expect(chain.steps.find((step) => step.id === "reviewer-boundary")).toMatchObject({
      runner: "agent",
      context: {
        review_file: "scafld-review-open.review_file",
        review_prompt: "scafld-review-open.review_prompt",
      },
    });
    expect(chain.steps.find((step) => step.id === "scafld-complete")).toMatchObject({
      context: {
        reviewer_result: "reviewer-boundary.stdout",
      },
    });
  });

  it.skipIf(!existsSync(scafldBin))("surfaces the current spec-authoring gap cleanly through the composite receipt", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-bug-to-pr-skill-"));
    const receiptDir = path.join(tempDir, "receipts");
    const taskId = "bug-to-pr-skill-fixture";
    const caller: Caller = {
      answer: async (questions) => {
        await writePassingReviewFile(path.join(tempDir, ".ai", "reviews", `${taskId}.md`), taskId);
        return {
          [questions[0]?.id ?? "agent.scafld.output"]: {
            task_id: taskId,
            review_file: `.ai/reviews/${taskId}.md`,
            verdict: "pass",
          },
        };
      },
      approve: async () => false,
      report: () => undefined,
    };

    try {
      initScafldRepo(tempDir);

      const result = await runLocalSkill({
        skillPath: path.resolve("skills/bug-to-pr"),
        inputs: {
          fixture: tempDir,
          task_id: taskId,
          title: "Fixture bug to PR",
          size: "micro",
          risk: "low",
          phase: "phase1",
          scafld_bin: scafldBin,
        },
        caller,
        env: process.env,
        receiptDir,
        runxHome: path.join(tempDir, ".runx-test-home"),
        allowedSourceTypes: ["cli-tool", "mcp", "agent-step", "agent", "chain"],
      });

      expect(result.status).toBe("failure");
      if (result.status !== "failure") {
        return;
      }
      expect(result.receipt.kind).toBe("chain_execution");
      if (result.receipt.kind !== "chain_execution") {
        return;
      }
      expect(result.receipt.subject.chain_name).toBe("bug-to-pr");
      expect(result.execution.stdout).toContain("spec has validation errors");
      expect(result.execution.stdout).toContain("TODO placeholder");
      expect(result.receipt.steps.map((step) => [step.step_id, step.status])).toEqual([
        ["scafld-new", "success"],
        ["scafld-approve", "failure"],
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30_000);

  it.skipIf(!existsSync(scafldBin))("opens a structured scafld review, accepts a caller-filled review file, and completes from JSON verdict", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-bug-to-pr-"));
    const receiptDir = path.join(tempDir, "receipts");
    const taskId = "bug-to-pr-json-fixture";

    try {
      initScafldRepo(tempDir);
      await writeActiveSpec(tempDir, taskId);

      const reviewResult = await runScafldSkill(tempDir, receiptDir, {
        command: "review",
        task_id: taskId,
      });
      expect(reviewResult.status).toBe("success");
      if (reviewResult.status !== "success") {
        return;
      }

      const reviewOpen = JSON.parse(reviewResult.execution.stdout) as {
        status: string;
        review_file: string;
        review_prompt: string;
      };
      expect(reviewOpen).toMatchObject({
        status: "review_open",
        review_file: `.ai/reviews/${taskId}.md`,
      });
      expect(reviewOpen.review_prompt).toContain("ADVERSARIAL REVIEW");

      await writePassingReviewFile(path.join(tempDir, reviewOpen.review_file), taskId);

      const completeResult = await runScafldSkill(tempDir, receiptDir, {
        command: "complete",
        task_id: taskId,
      });
      expect(completeResult.status).toBe("success");
      if (completeResult.status !== "success") {
        return;
      }

      expect(JSON.parse(completeResult.execution.stdout)).toMatchObject({
        task_id: taskId,
        completed_state: "completed",
        verdict: "pass",
        blocking_count: 0,
        non_blocking_count: 0,
        review_file: `.ai/reviews/${taskId}.md`,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30_000);
});

async function runScafldSkill(
  fixture: string,
  receiptDir: string,
  inputs: Readonly<Record<string, unknown>>,
) {
  return await runLocalSkill({
    skillPath: path.resolve("skills/scafld"),
    runner: "scafld-cli",
    inputs: {
      ...inputs,
      fixture,
      scafld_bin: scafldBin,
    },
    caller,
    receiptDir,
    runxHome: path.join(fixture, ".runx-test-home"),
  });
}

function initScafldRepo(repo: string): void {
  runChecked("git", ["init", "-b", "main"], repo);
  runChecked("git", ["config", "user.email", "smoke@example.com"], repo);
  runChecked("git", ["config", "user.name", "Smoke Test"], repo);
  runChecked(scafldBin, ["init"], repo);
  runChecked("git", ["add", "."], repo);
  runChecked("git", ["commit", "-m", "init"], repo);
}

async function writeActiveSpec(repo: string, taskId: string): Promise<void> {
  await writeFile(path.join(repo, "app.txt"), "base\n");
  await mkdir(path.join(repo, ".ai", "specs", "active"), { recursive: true });
  await writeFile(
    path.join(repo, ".ai", "specs", "active", `${taskId}.yaml`),
    `spec_version: "1.1"
task_id: "${taskId}"
created: "2026-04-10T00:00:00Z"
updated: "2026-04-10T00:00:00Z"
status: "in_progress"

task:
  title: "Bug to PR JSON Fixture"
  summary: "Fixture for runx scafld review handoff"
  size: "small"
  risk_level: "low"

phases:
  - id: "phase1"
    name: "Fixture"
    objective: "Provide one passing acceptance criterion"
    changes:
      - file: "app.txt"
        action: "update"
        content_spec: "Fixture file exists"
    acceptance_criteria:
      - id: "ac1_1"
        type: "custom"
        description: "app.txt exists"
        command: "test -f app.txt"
        expected: "exit code 0"
        result: "pass"

planning_log:
  - timestamp: "2026-04-10T00:00:00Z"
    actor: "test"
    summary: "Fixture spec"
`,
  );
}

async function writePassingReviewFile(reviewPath: string, taskId: string): Promise<void> {
  await writeFile(
    reviewPath,
    `# Review: ${taskId}

## Spec
Bug to PR JSON Fixture

## Files Changed
- app.txt

---

## Review 1 — 2026-04-10T00:00:00Z

### Metadata
\`\`\`json
{
  "schema_version": 3,
  "round_status": "completed",
  "reviewer_mode": "executor",
  "reviewer_session": "",
  "reviewed_at": "2026-04-10T00:00:00Z",
  "override_reason": null,
  "pass_results": {
    "spec_compliance": "pass",
    "scope_drift": "pass",
    "regression_hunt": "pass",
    "convention_check": "pass",
    "dark_patterns": "pass"
  }
}
\`\`\`

### Pass Results
- spec_compliance: PASS
- scope_drift: PASS
- regression_hunt: PASS
- convention_check: PASS
- dark_patterns: PASS

### Regression Hunt

No issues found. Checked [app.txt](${reviewPath}):1 fixture scope.

### Convention Check

No issues found. Checked [app.txt](${reviewPath}):1 fixture scope.

### Dark Patterns

No issues found. Checked [app.txt](${reviewPath}):1 fixture scope.

### Blocking

None.

### Non-blocking

None.

### Verdict

pass
`,
  );
}

function runChecked(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}
