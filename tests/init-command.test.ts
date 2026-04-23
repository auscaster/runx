import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../packages/cli/src/index.js";

describe("runx init", () => {
  it("scaffolds a new authoring package through runx new", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-new-package-"));
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();

    try {
      const exitCode = await runCli(
        ["new", "Docs Demo", "--json"],
        { stdin: process.stdin, stdout, stderr },
        { ...process.env, RUNX_CWD: tempDir },
      );

      expect(exitCode).toBe(0);
      expect(stderr.contents()).toBe("");
      const report = JSON.parse(stdout.contents()) as {
        readonly new: {
          readonly action: string;
          readonly name: string;
          readonly packet_namespace: string;
          readonly directory: string;
          readonly files: readonly string[];
        };
      };
      const target = path.join(tempDir, "docs-demo");
      expect(report.new).toMatchObject({
        action: "package",
        name: "docs-demo",
        packet_namespace: "docs.demo",
        directory: target,
      });
      expect(report.new.files).toContain("SKILL.md");
      await expect(readFile(path.join(target, "SKILL.md"), "utf8")).resolves.toContain("name: docs-demo");
      await expect(readFile(path.join(target, "X.yaml"), "utf8")).resolves.toContain("tool: docs.echo");
      await expect(readFile(path.join(target, "tools/docs/echo/fixtures/basic.yaml"), "utf8")).resolves.toContain("lane: deterministic");
      await expect(readFile(path.join(target, "fixtures/agent.yaml"), "utf8")).resolves.toContain("lane: agent");
      await expect(readFile(path.join(target, "fixtures/agent.replay.json"), "utf8")).resolves.toContain("runx.replay.v1");
      await expect(readFile(path.join(target, "dist/packets/echo.v1.schema.json"), "utf8")).resolves.toContain("docs.demo.echo.v1");
      const manifest = JSON.parse(await readFile(path.join(target, "tools/docs/echo/manifest.json"), "utf8")) as {
        readonly source_hash?: string;
        readonly schema_hash?: string;
      };
      expect(manifest.source_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(manifest.schema_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates project-local state without creating global state", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-init-project-"));
    const projectDir = path.join(tempDir, "project");
    const globalHomeDir = path.join(tempDir, "global-home");
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();

    try {
      const exitCode = await runCli(
        ["init", "--json"],
        { stdin: process.stdin, stdout, stderr },
        { ...process.env, RUNX_CWD: projectDir, RUNX_HOME: globalHomeDir },
      );

      expect(exitCode).toBe(0);
      expect(stderr.contents()).toBe("");
      const report = JSON.parse(stdout.contents()) as {
        init: { action: string; created: boolean; project_dir: string; project_id: string };
      };
      expect(report.init).toMatchObject({
        action: "project",
        created: true,
        project_dir: path.join(projectDir, ".runx"),
        project_id: expect.stringMatching(/^proj_/),
      });
      await expect(readFile(path.join(projectDir, ".runx", "project.json"), "utf8")).resolves.toContain("\"project_id\"");
      expect((await stat(path.join(projectDir, ".runx", "skills"))).isDirectory()).toBe(true);
      expect((await stat(path.join(projectDir, ".runx", "tools"))).isDirectory()).toBe(true);
      await expect(stat(path.join(globalHomeDir, "install.json"))).rejects.toThrow();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates stable global state and optional official cache on repeat init -g", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-init-global-"));
    const projectDir = path.join(tempDir, "project");
    const globalHomeDir = path.join(tempDir, "global-home");

    try {
      const first = createMemoryStream();
      const second = createMemoryStream();
      const stderr = createMemoryStream();

      const firstExit = await runCli(
        ["init", "-g", "--prefetch", "official", "--json"],
        { stdin: process.stdin, stdout: first, stderr },
        { ...process.env, RUNX_CWD: projectDir, RUNX_HOME: globalHomeDir },
      );
      expect(firstExit).toBe(0);
      const firstReport = JSON.parse(first.contents()) as {
        init: { action: string; created: boolean; installation_id: string; official_cache_dir: string };
      };
      expect(firstReport.init).toMatchObject({
        action: "global",
        created: true,
        installation_id: expect.stringMatching(/^inst_/),
        official_cache_dir: path.join(globalHomeDir, "official-skills"),
      });

      const secondExit = await runCli(
        ["init", "--global", "--json"],
        { stdin: process.stdin, stdout: second, stderr },
        { ...process.env, RUNX_CWD: projectDir, RUNX_HOME: globalHomeDir },
      );
      expect(secondExit).toBe(0);
      const secondReport = JSON.parse(second.contents()) as {
        init: { action: string; created: boolean; installation_id: string };
      };
      expect(secondReport.init).toMatchObject({
        action: "global",
        created: false,
        installation_id: firstReport.init.installation_id,
      });
      await expect(readFile(path.join(globalHomeDir, "install.json"), "utf8")).resolves.toContain(firstReport.init.installation_id);
      expect((await stat(path.join(globalHomeDir, "official-skills"))).isDirectory()).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function createMemoryStream(): NodeJS.WriteStream & { readonly contents: () => string } {
  let output = "";
  return {
    write(chunk: string | Uint8Array) {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      return true;
    },
    contents() {
      return output;
    },
    isTTY: false,
  } as NodeJS.WriteStream & { readonly contents: () => string };
}
