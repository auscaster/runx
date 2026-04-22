import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseRunnerManifestYaml, validateRunnerManifest } from "../packages/parser/src/index.js";
import { runLocalSkill, type Caller } from "../packages/runner-local/src/index.js";

const passiveCaller: Caller = {
  resolve: async () => undefined,
  report: () => undefined,
};

describe("docs-preview skill", () => {
  it("wraps docs-scan plus staged Sourcey preview generation into one packetized lane", async () => {
    const manifest = validateRunnerManifest(
      parseRunnerManifestYaml(await readFile(path.resolve("skills/docs-preview/X.yaml"), "utf8")),
    );
    const runner = manifest.runners["docs-preview"];

    expect(runner?.source.type).toBe("chain");
    if (!runner || runner.source.type !== "chain" || !runner.source.chain) {
      throw new Error("docs-preview runner must declare an inline chain.");
    }

    const steps = runner.source.chain.steps;
    expect(steps.map((step) => step.id)).toEqual([
      "scan-target",
      "plan-preview",
      "stage-preview",
      "run-sourcey",
      "package-preview",
    ]);
    expect(steps[0]).toMatchObject({
      skill: "../docs-scan",
      runner: "docs-scan",
    });
    expect(steps[1]).toMatchObject({
      tool: "docs.prepare_preview",
    });
    expect(steps[2]).toMatchObject({
      tool: "docs.stage_repo",
    });
    expect(steps[3]).toMatchObject({
      skill: "../sourcey",
      runner: "sourcey",
    });
    expect(steps[4]).toMatchObject({
      tool: "docs.package_preview",
    });
    expect(runner.source.chain.policy?.transitions).toEqual([
      {
        to: "stage-preview",
        field: "plan-preview.preview_plan.data.should_generate",
        equals: true,
      },
      {
        to: "run-sourcey",
        field: "plan-preview.preview_plan.data.should_generate",
        equals: true,
      },
    ]);
  });

  it("yields at the Sourcey approval boundary for a repo that still scans as a preview candidate", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-docs-preview-yield-"));

    try {
      const result = await runLocalSkill({
        skillPath: path.resolve("skills/docs-preview"),
        inputs: {
          repo_root: "fixtures/docs/scan/openapi-adoption",
          repo_url: "https://github.com/example/openapi-adoption",
        },
        caller: passiveCaller,
        env: { ...process.env, RUNX_CWD: process.cwd() },
        receiptDir: path.join(tempDir, "receipts"),
        runxHome: path.join(tempDir, "home"),
      });

      expect(result.status).toBe("needs_resolution");
      if (result.status !== "needs_resolution") {
        throw new Error(result.status === "failure" ? result.execution.stderr || result.execution.errorMessage : result.status);
      }

      expect(result.stepIds).toEqual(["run-sourcey"]);
      expect(result.stepLabels).toEqual(["generate staged Sourcey preview"]);
      expect(result.requests).toEqual([
        expect.objectContaining({
          kind: "cognitive_work",
          id: "agent_step.sourcey-discover.output",
          work: expect.objectContaining({
            envelope: expect.objectContaining({
              skill: "sourcey.discover",
            }),
          }),
        }),
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("generates a staged preview packet and leaves the original repo untouched for a preview candidate", async () => {
    const sourceyBin = resolveSourceyBin();
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-docs-preview-generate-"));
    const fixtureRoot = path.resolve("fixtures/docs/scan/openapi-adoption");

    try {
      const result = await runLocalSkill({
        skillPath: path.resolve("skills/docs-preview"),
        inputs: {
          repo_root: "fixtures/docs/scan/openapi-adoption",
          repo_url: "https://github.com/example/openapi-adoption",
          sourcey_bin: sourceyBin,
        },
        caller: createDocsPreviewCaller(sourceyBin),
        env: {
          ...process.env,
          RUNX_CWD: process.cwd(),
          SOURCEY_BIN: sourceyBin,
        },
        receiptDir: path.join(tempDir, "receipts"),
        runxHome: path.join(tempDir, "home"),
      });

      expect(result.status).toBe("success");
      if (result.status !== "success") {
        throw new Error(result.status === "failure" ? result.execution.stderr || result.execution.errorMessage : result.status);
      }

      const packet = JSON.parse(result.execution.stdout) as {
        schema: string;
        status: string;
        sourcey_plan: { should_generate: boolean; staged_repo_root?: string; authored_files: string[] };
        build_report: { generated: boolean; index_path: string; output_dir: string };
        verification_report: { verified: boolean };
        migration_bundle?: { files: Array<{ path: string; contents: string }> };
        operator_summary: { should_publish: boolean };
      };

      expect(packet).toMatchObject({
        schema: "runx.docs_preview.v1",
        status: "generated",
        sourcey_plan: {
          should_generate: true,
        },
        build_report: {
          generated: true,
        },
        verification_report: {
          verified: true,
        },
        operator_summary: {
          should_publish: true,
        },
      });
      expect(packet.sourcey_plan.staged_repo_root).toBeDefined();
      expect(packet.sourcey_plan.authored_files).toEqual(expect.arrayContaining([
        "sourcey.config.ts",
        "introduction.md",
      ]));
      expect(packet.migration_bundle?.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "sourcey.config.ts" }),
        expect.objectContaining({ path: "introduction.md" }),
      ]));
      expect(existsSync(packet.build_report.index_path)).toBe(true);
      expect(existsSync(path.join(fixtureRoot, "sourcey.config.ts"))).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30_000);
});

function createDocsPreviewCaller(sourceyBin: string): Caller {
  const sourceyEntry = path.resolve(path.dirname(sourceyBin), "index.js").replace(/\\/g, "/");

  return {
    resolve: async (request) => {
      if (request.kind === "approval") {
        return request.gate.id === "sourcey.discovery.approval"
          ? { actor: "human", payload: true }
          : undefined;
      }
      if (request.kind !== "cognitive_work") {
        return undefined;
      }

      if (request.work.envelope.skill === "sourcey.discover") {
        return {
          actor: "agent",
          payload: {
            discovery_report: {
              discovered: {
                brand_name: "OpenAPI Adoption Fixture",
                homepage_url: "https://github.com/example/openapi-adoption",
                docs_inputs: {
                  mode: "config",
                  config: "sourcey.config.ts",
                },
              },
              confidence: "high",
              rationale: ["repo has a thin README and an OpenAPI spec but no dedicated docs stack"],
            },
          },
        };
      }

      if (request.work.envelope.skill === "sourcey.author") {
        return {
          actor: "agent",
          payload: {
            doc_bundle: {
              files: [
                {
                  path: "sourcey.config.ts",
                  contents: [
                    `import { defineConfig } from "${sourceyEntry}";`,
                    "",
                    "export default defineConfig({",
                    '  name: "OpenAPI Adoption Fixture",',
                    "  navigation: {",
                    "    tabs: [",
                    "      {",
                    '        tab: "Docs",',
                    "        groups: [",
                    "          {",
                    '            group: "Start",',
                    '            pages: ["introduction"],',
                    "          },",
                    "        ],",
                    "      },",
                    "      {",
                    '        tab: "API",',
                    '        openapi: "openapi.yaml",',
                    "      },",
                    "    ],",
                    "  },",
                    "});",
                    "",
                  ].join("\n"),
                },
                {
                  path: "introduction.md",
                  contents: [
                    "---",
                    "title: Introduction",
                    "description: A bounded preview generated by runx and Sourcey",
                    "---",
                    "",
                    "# OpenAPI Adoption Fixture",
                    "",
                    "This preview wraps the existing API spec in a stronger documentation surface.",
                    "",
                    "## What changed",
                    "",
                    "- Added a Sourcey config",
                    "- Added a guided introduction page",
                    "- Kept the OpenAPI spec as the API reference source of truth",
                    "",
                  ].join("\n"),
                },
              ],
              summary: "Prepared a minimal Sourcey config plus an introduction page for the preview workspace.",
            },
          },
        };
      }

      if (request.work.envelope.skill === "sourcey.critique") {
        return {
          actor: "agent",
          payload: {
            evaluation_report: {
              verdict: "pass",
              grounding: "strong",
              clarity: "strong",
              navigation: "strong",
              obvious_gaps: [],
            },
          },
        };
      }

      if (request.work.envelope.skill === "sourcey.revise") {
        return {
          actor: "agent",
          payload: {
            revision_bundle: {
              files: [],
              summary: "No revision needed after the first bounded preview pass.",
            },
          },
        };
      }

      throw new Error(`Unexpected cognitive work request: ${request.work.envelope.skill}`);
    },
    report: () => undefined,
  };
}

function resolveSourceyBin(): string {
  const candidates = [
    process.env.SOURCEY_BIN,
    path.resolve(process.cwd(), "../../sourcey/dist/cli.js"),
  ].filter((candidate): candidate is string => Boolean(candidate) && existsSync(candidate));

  if (!candidates[0]) {
    throw new Error("A Sourcey CLI is required for docs-preview tests.");
  }
  return candidates[0];
}
