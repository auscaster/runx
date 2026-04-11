import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runHarness } from "../packages/harness/src/index.js";
import { createStructuredCaller } from "../packages/sdk-js/src/index.js";
import { runLocalSkill } from "../packages/runner-local/src/index.js";

describe("caller approval boundary", () => {
  it("lets SDK callers supply approval decisions programmatically", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-sdk-approval-"));

    try {
      const skillPath = await writeUnrestrictedSkill(tempDir, "sdk-approval");
      const caller = createStructuredCaller({
        approvals: {
          "sandbox.sdk-approval.unrestricted-local-dev": true,
        },
      });
      const result = await runLocalSkill({
        skillPath,
        caller,
        receiptDir: path.join(tempDir, "receipts"),
        runxHome: path.join(tempDir, "home"),
        env: process.env,
      });

      expect(result.status).toBe("success");
      expect(caller.trace.approvals).toHaveLength(1);
      expect(caller.trace.approvals[0]).toMatchObject({
        approved: true,
        gate: {
          id: "sandbox.sdk-approval.unrestricted-local-dev",
          type: "sandbox",
        },
      });
      expect(caller.trace.events.map((event) => event.type)).toContain("approval_requested");
      expect(caller.trace.events.map((event) => event.type)).toContain("approval_resolved");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("lets harness fixtures replay approval decisions deterministically", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-harness-approval-"));

    try {
      await writeUnrestrictedSkill(tempDir, "harness-approval");
      const fixturePath = path.join(tempDir, "fixture.yaml");
      await writeFile(
        fixturePath,
        `name: harness-approval
kind: skill
target: ./harness-approval.md
caller:
  approvals:
    sandbox.harness-approval.unrestricted-local-dev: true
expect:
  status: success
`,
      );

      const result = await runHarness(fixturePath);
      expect(result.status).toBe("success");
      expect(result.trace.approvals).toEqual(["sandbox.harness-approval.unrestricted-local-dev"]);
      expect(result.trace.events.map((event) => event.type)).toContain("approval_requested");
      expect(result.trace.events.map((event) => event.type)).toContain("approval_resolved");
      expect(result.assertionErrors).toEqual([]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("exposes approval-denied receipts through the harness result", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-harness-approval-denied-"));

    try {
      await writeUnrestrictedSkill(tempDir, "harness-approval-denied");
      const fixturePath = path.join(tempDir, "fixture.yaml");
      await writeFile(
        fixturePath,
        `name: harness-approval-denied
kind: skill
target: ./harness-approval-denied.md
caller:
  approvals:
    sandbox.harness-approval-denied.unrestricted-local-dev: false
expect:
  status: policy_denied
  receipt:
    status: failure
`,
      );

      const result = await runHarness(fixturePath);
      expect(result.status).toBe("policy_denied");
      expect(result.receipt?.kind).toBe("skill_execution");
      if (result.receipt?.kind !== "skill_execution") {
        return;
      }
      expect(result.receipt.metadata).toMatchObject({
        approval: {
          gate_id: "sandbox.harness-approval-denied.unrestricted-local-dev",
          decision: "denied",
        },
      });
      expect(result.assertionErrors).toEqual([]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

async function writeUnrestrictedSkill(tempDir: string, name: string): Promise<string> {
  const skillPath = path.join(tempDir, `${name}.md`);
  await writeFile(
    skillPath,
    `---
name: ${name}
source:
  type: cli-tool
  command: node
  args:
    - -e
    - "process.stdout.write('approved')"
  sandbox:
    profile: unrestricted-local-dev
---
Unrestricted fixture.
`,
  );
  return skillPath;
}
