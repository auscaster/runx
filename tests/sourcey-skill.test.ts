import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runLocalSkill, type Caller } from "../packages/runner-local/src/index.js";

const nonInteractiveCaller: Caller = {
  answer: async () => ({}),
  approve: async () => false,
  report: () => undefined,
};

describe("sourcey skill", () => {
  const sourceyBin = resolveSourceyBin();
  const itWithSourcey = sourceyBin ? it : it.skip;

  itWithSourcey("builds deterministic docs, including an MCP snapshot, through the cli-tool adapter", async () => {
    expect(sourceyBin).toBeDefined();

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-sourcey-skill-"));
    const receiptDir = path.join(tempDir, "receipts");
    const outputDir = path.join(tempDir, "docs");
    const project = "fixtures/sourcey/basic";
    const expectedProject = path.resolve(project);

    try {
      const result = await runLocalSkill({
        skillPath: path.resolve("skills/sourcey"),
        inputs: {
          project,
          homepage_url: "https://sourcey.example.test",
          brand_name: "Sourcey Fixture",
          docs_inputs: {
            mode: "config",
            config: "sourcey.config.ts",
          },
          output_dir: outputDir,
          sourcey_bin: sourceyBin as string,
        },
        caller: nonInteractiveCaller,
        env: { ...process.env, RUNX_CWD: process.cwd() },
        receiptDir,
        runxHome: path.join(tempDir, "home"),
      });

      expect(result.status).toBe("success");
      if (result.status !== "success") {
        throw new Error(result.status === "failure" ? result.execution.stderr || result.execution.errorMessage : result.status);
      }

      const output = JSON.parse(result.execution.stdout) as {
        command: string;
        output_dir: string;
        generated: boolean;
        docs_inputs: { mode: string; config: string };
      };
      expect(output).toMatchObject({
        command: "sourcey build",
        output_dir: outputDir,
        generated: true,
        docs_inputs: {
          mode: "config",
          config: "sourcey.config.ts",
        },
      });

      const generatedFiles = await collectFiles(outputDir);
      expect(generatedFiles.some((file) => file.endsWith("index.html"))).toBe(true);

      const generatedText = (
        await Promise.all(
          generatedFiles
            .filter((file) => /\.(html|txt|json)$/.test(file))
            .map((file) => readFile(file, "utf8")),
        )
      ).join("\n");
      expect(generatedText).toContain("fixture_status");

      const receiptFiles = await readdir(receiptDir);
      expect(receiptFiles).toContain("journals");
      expect(receiptFiles.filter((file) => file.endsWith(".json"))).toEqual([`${result.receipt.id}.json`]);
      const receiptText = await readFile(path.join(receiptDir, `${result.receipt.id}.json`), "utf8");
      expect(receiptText).not.toContain(expectedProject);
      expect(receiptText).not.toContain("fixture_status");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 30000);
});

function resolveSourceyBin(): string | undefined {
  const candidates = [
    process.env.SOURCEY_BIN,
    path.resolve(process.cwd(), "../../sourcey/dist/cli.js"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate));
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
    }),
  );
  return files.flat();
}
