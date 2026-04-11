import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseRunnerManifestYaml, validateRunnerManifest } from "../packages/parser/src/index.js";

describe("scafld bug-to-PR skill contract", () => {
  it("parses as a composite skill over one scafld capability plus a reviewer boundary", async () => {
    const manifest = validateRunnerManifest(
      parseRunnerManifestYaml(await readFile(path.resolve("skills/bug-to-pr/x.yaml"), "utf8")),
    );
    const runner = manifest.runners["bug-to-pr"];

    expect(runner?.source.type).toBe("chain");
    if (!runner || runner.source.type !== "chain" || !runner.source.chain) {
      throw new Error("bug-to-pr runner must declare an inline chain.");
    }
    const chain = runner.source.chain;

    expect(chain.name).toBe("bug-to-pr");
    expect(chain.steps.map((step) => step.id)).toEqual([
      "scafld-new",
      "scafld-approve",
      "scafld-start",
      "scafld-exec",
      "scafld-audit",
      "scafld-review-open",
      "reviewer-boundary",
      "scafld-complete",
    ]);
    expect(chain.steps.map((step) => step.skill ?? "")).toEqual([
      "../scafld",
      "../scafld",
      "../scafld",
      "../scafld",
      "../scafld",
      "../scafld",
      "../scafld",
      "../scafld",
    ]);
    expect(chain.steps.map((step) => step.inputs.command)).toEqual([
      "spec",
      "approve",
      "start",
      "execute",
      "audit",
      "review",
      undefined,
      "complete",
    ]);
    expect(chain.steps.some((step) => (step.skill ?? "").includes("fixture-agent"))).toBe(false);
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
});
