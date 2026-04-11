import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, type CliIo } from "../packages/cli/src/index.js";

describe("agent-config", () => {
  it("sets provider/model and stores agent API keys without plaintext config", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-agent-config-"));
    const runxHome = path.join(tempDir, ".runx");
    const env = { ...process.env, RUNX_HOME: runxHome };

    try {
      await expect(runCli(["config", "set", "agent.provider", "openai", "--json"], io(), env)).resolves.toBe(0);
      await expect(runCli(["config", "set", "agent.model", "gpt-test", "--json"], io(), env)).resolves.toBe(0);
      await expect(runCli(["config", "set", "agent.api_key", "sk-secret-test", "--json"], io(), env)).resolves.toBe(0);

      const config = await readFile(path.join(runxHome, "config.json"), "utf8");
      expect(config).toContain("openai");
      expect(config).toContain("gpt-test");
      expect(config).not.toContain("sk-secret-test");

      const keyFiles = await readdir(path.join(runxHome, "keys"));
      const encryptedKeyFile = keyFiles.find((file) => file.startsWith("local_agent_key_"));
      expect(encryptedKeyFile).toBeDefined();
      expect(await readFile(path.join(runxHome, "keys", encryptedKeyFile ?? ""), "utf8")).not.toContain("sk-secret-test");

      const listOut = createMemoryStream();
      await expect(runCli(["config", "list", "--json"], { ...io(), stdout: listOut }, env)).resolves.toBe(0);
      expect(listOut.contents()).toContain("[encrypted]");
      expect(listOut.contents()).not.toContain("sk-secret-test");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function io(): CliIo {
  return { stdin: process.stdin, stdout: createMemoryStream(), stderr: createMemoryStream() };
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
