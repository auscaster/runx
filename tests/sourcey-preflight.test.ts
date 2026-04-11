import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../packages/cli/src/index.js";
import type { AdapterInvokeRequest, AdapterInvokeResult, SkillAdapter } from "../packages/executor/src/index.js";
import { parseRunnerManifestYaml, parseSkillMarkdown, validateRunnerManifest, validateSkill } from "../packages/parser/src/index.js";
import { runLocalSkill, type Caller } from "../packages/runner-local/src/index.js";

const nonInteractiveCaller: Caller = {
  answer: async () => ({}),
  approve: async () => false,
  report: () => undefined,
};

describe("sourcey parser", () => {
  it("keeps the portable skill standard while X owns deterministic input metadata", async () => {
    const skill = validateSkill(parseSkillMarkdown(await readFile(path.resolve("skills/sourcey/SKILL.md"), "utf8")));
    const manifest = validateRunnerManifest(parseRunnerManifestYaml(await readFile(path.resolve("skills/sourcey/x.yaml"), "utf8")));
    const runner = manifest.runners["sourcey-cli"];

    expect(skill.name).toBe("sourcey");
    expect(skill.source.type).toBe("agent");
    expect(skill.inputs).toEqual({});
    expect(runner?.default).toBe(true);
    expect(runner?.source.type).toBe("cli-tool");
    expect(runner?.source.command).toBe("node");
    expect(runner?.inputs.project.required).toBe(true);
    expect(runner?.inputs.homepage_url.required).toBe(true);
    expect(runner?.inputs.brand_name.required).toBe(true);
    expect(runner?.inputs.docs_inputs.required).toBe(true);
    expect(runner?.inputs.sourcey_bin.required).toBe(false);
  });
});

describe("sourcey preflight", () => {
  it("emits bundled missing-context questions through the non-interactive JSON CLI", async () => {
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const fixtureProject = path.resolve("fixtures/sourcey/incomplete");

    const exitCode = await runCli(
      ["skill", "skills/sourcey", "--project", fixtureProject, "--non-interactive", "--json"],
      { stdin: process.stdin, stdout, stderr },
      { ...process.env, RUNX_CWD: process.cwd() },
    );

    expect(exitCode).toBe(0);
    expect(stderr.contents()).toBe("");

    const report = JSON.parse(stdout.contents()) as {
      status: string;
      questions: { id: string; type: string; required: boolean }[];
    };
    expect(report.status).toBe("missing_context");
    expect(report.questions.map((question) => question.id)).toEqual(["homepage_url", "brand_name", "docs_inputs"]);
    expect(report.questions.every((question) => question.required)).toBe(true);
    expect(report.questions.find((question) => question.id === "docs_inputs")?.type).toBe("json");
  });

  it("resumes from an answers file and writes an inspectable receipt without requiring memory", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-sourcey-preflight-"));
    const receiptDir = path.join(tempDir, "receipts");
    const answersPath = path.join(tempDir, "answers.json");
    const adapter = createCapturingCliToolAdapter();

    try {
      await writeFile(
        answersPath,
        `${JSON.stringify(
          {
            answers: {
              project: path.resolve("fixtures/sourcey/incomplete"),
              homepage_url: "https://sourcey.example.test",
              brand_name: "Sourcey Fixture",
              docs_inputs: {
                mode: "config",
                config: "sourcey.config.ts",
              },
            },
          },
          null,
          2,
        )}\n`,
      );

      const result = await runLocalSkill({
        skillPath: path.resolve("skills/sourcey"),
        answersPath,
        caller: nonInteractiveCaller,
        adapters: [adapter],
        env: process.env,
        receiptDir,
        runxHome: path.join(tempDir, "home"),
      });

      expect(result.status).toBe("success");
      if (result.status !== "success") {
        return;
      }

      expect(adapter.lastRequest?.inputs).toMatchObject({
        homepage_url: "https://sourcey.example.test",
        brand_name: "Sourcey Fixture",
        docs_inputs: {
          mode: "config",
          config: "sourcey.config.ts",
        },
      });
      expect(result.receipt.kind).toBe("skill_execution");
      expect(result.receipt.subject).toEqual({
        skill_name: "sourcey",
        source_type: "cli-tool",
      });

      const receiptFiles = await readdir(receiptDir);
      expect(receiptFiles).toContain("journals");
      expect(receiptFiles.filter((file) => file.endsWith(".json"))).toEqual([`${result.receipt.id}.json`]);
      const receiptText = await readFile(path.join(receiptDir, `${result.receipt.id}.json`), "utf8");
      expect(receiptText).not.toContain("https://sourcey.example.test");
      expect(receiptText).not.toContain("Sourcey Fixture");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("does not forward raw runx input environment into the Sourcey subprocess", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-sourcey-env-"));
    const sourceyStub = path.join(tempDir, "sourcey-stub.mjs");
    const envCapturePath = path.join(tempDir, "sourcey-env.json");
    const outputDir = path.join(tempDir, "docs");

    try {
      await writeFile(
        sourceyStub,
        [
          'import { mkdirSync, writeFileSync } from "node:fs";',
          'import { join } from "node:path";',
          'const outputFlag = process.argv.indexOf("-o");',
          'const outputDir = outputFlag === -1 ? "dist" : process.argv[outputFlag + 1];',
          'mkdirSync(outputDir, { recursive: true });',
          'writeFileSync(join(outputDir, "index.html"), "<!doctype html>");',
          'const leaked = Object.keys(process.env).filter((key) => key === "RUNX_INPUTS_JSON" || key.startsWith("RUNX_INPUT_"));',
          'writeFileSync(process.env.SOURCEY_STUB_ENV_PATH, JSON.stringify(leaked));',
          "",
        ].join("\n"),
      );

      const result = await runLocalSkill({
        skillPath: path.resolve("skills/sourcey"),
        inputs: {
          project: "fixtures/sourcey/basic",
          homepage_url: "https://sourcey.example.test",
          brand_name: "Sourcey Fixture",
          docs_inputs: {
            mode: "config",
            config: "sourcey.config.ts",
          },
          output_dir: outputDir,
          sourcey_bin: sourceyStub,
        },
        caller: nonInteractiveCaller,
        env: {
          ...process.env,
          RUNX_CWD: process.cwd(),
          SOURCEY_STUB_ENV_PATH: envCapturePath,
        },
        receiptDir: path.join(tempDir, "receipts"),
        runxHome: path.join(tempDir, "home"),
      });

      expect(result.status).toBe("success");
      const leakedEnv = JSON.parse(await readFile(envCapturePath, "utf8")) as string[];
      expect(leakedEnv).toEqual([]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function createCapturingCliToolAdapter(): SkillAdapter & { lastRequest?: AdapterInvokeRequest } {
  const adapter: SkillAdapter & { lastRequest?: AdapterInvokeRequest } = {
    type: "cli-tool",
    invoke: async (request) => {
      adapter.lastRequest = request;

      return {
        status: "success",
        stdout: JSON.stringify({ ok: true }),
        stderr: "",
        exitCode: 0,
        signal: null,
        durationMs: 1,
      } satisfies AdapterInvokeResult;
    },
  };
  return adapter;
}

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
