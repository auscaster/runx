import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../packages/cli/src/index.js";
import { hashString } from "../packages/receipts/src/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("remote registry add", () => {
  it("acquires and installs an explicit remote registry skill without a local registry dir", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-remote-add-explicit-"));
    const skillsDir = path.join(tempDir, "skills");
    const homeDir = path.join(tempDir, "home");
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const markdown = await readFile(path.resolve("skills/sourcey/SKILL.md"), "utf8");
    const xManifest = await readFile(path.resolve("skills/sourcey/x.yaml"), "utf8");
    const digest = hashString(markdown);
    const xDigest = hashString(xManifest);

    try {
      globalThis.fetch = vi.fn(async (input, init) => {
        expect(String(input)).toBe("https://runx.example.test/v1/skills/runx/sourcey/acquire");
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body)) as {
          installation_id: string;
          version: string;
          channel: string;
        };
        expect(body.installation_id).toMatch(/^inst_/);
        expect(body.version).toBe("1.0.0");
        expect(body.channel).toBe("cli");
        return new Response(JSON.stringify({
          status: "success",
          install_count: 1,
          acquisition: {
            skill_id: "runx/sourcey",
            owner: "runx",
            name: "sourcey",
            version: "1.0.0",
            digest,
            markdown,
            x_manifest: xManifest,
            x_digest: xDigest,
            runner_names: ["agent", "sourcey"],
          },
        }), { status: 200 });
      }) as typeof fetch;

      const exitCode = await runCli(
        ["skill", "add", "runx/sourcey@1.0.0", "--to", skillsDir, "--registry", "https://runx.example.test", "--json"],
        { stdin: process.stdin, stdout, stderr },
        {
          ...process.env,
          RUNX_CWD: process.cwd(),
          RUNX_HOME: homeDir,
        },
      );

      expect(exitCode).toBe(0);
      expect(stderr.contents()).toBe("");
      expect(JSON.parse(stdout.contents())).toMatchObject({
        status: "success",
        install: {
          status: "installed",
          destination: path.join(skillsDir, "runx", "sourcey", "SKILL.md"),
          lockfile: path.join(skillsDir, "runx", "sourcey", "runx.lock.json"),
          source: "runx-registry",
          source_label: "runx registry",
          skill_id: "runx/sourcey",
          version: "1.0.0",
          xDestination: path.join(skillsDir, "runx", "sourcey", "x.yaml"),
          runnerNames: ["agent", "sourcey"],
        },
      });
      await expect(readFile(path.join(homeDir, "install.json"), "utf8")).resolves.toContain("\"installation_id\"");
      await expect(readFile(path.join(skillsDir, "runx", "sourcey", "SKILL.md"), "utf8")).resolves.toBe(markdown);
      await expect(readFile(path.join(skillsDir, "runx", "sourcey", "x.yaml"), "utf8")).resolves.toBe(xManifest);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves a unique bare skill name through remote search before acquisition", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-remote-add-bare-"));
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const markdown = await readFile(path.resolve("skills/sourcey/SKILL.md"), "utf8");
    const digest = hashString(markdown);

    try {
      const fetchMock = vi.fn(async (input, init) => {
        const url = String(input);
        if (url === "https://runx.example.test/v1/skills?q=sourcey&limit=100") {
          return new Response(JSON.stringify({
            status: "success",
            skills: [
              {
                skill_id: "runx/sourcey",
                owner: "runx",
                name: "sourcey",
                version: "1.0.0",
                source_type: "agent",
                runner_mode: "standard-only",
                runner_names: [],
                required_scopes: [],
                tags: [],
                trust_signals: [],
                install_command: "runx add runx/sourcey@1.0.0 --registry https://runx.example.test",
                run_command: "runx sourcey",
              },
            ],
          }), { status: 200 });
        }
        expect(url).toBe("https://runx.example.test/v1/skills/runx/sourcey/acquire");
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({
          status: "success",
          install_count: 1,
          acquisition: {
            skill_id: "runx/sourcey",
            owner: "runx",
            name: "sourcey",
            version: "1.0.0",
            digest,
            markdown,
            runner_names: [],
          },
        }), { status: 200 });
      });
      globalThis.fetch = fetchMock as typeof fetch;

      const exitCode = await runCli(
        ["skill", "add", "sourcey", "--to", path.join(tempDir, "skills"), "--registry", "https://runx.example.test", "--json"],
        { stdin: process.stdin, stdout, stderr },
        {
          ...process.env,
          RUNX_CWD: process.cwd(),
          RUNX_HOME: path.join(tempDir, "home"),
        },
      );

      expect(exitCode).toBe(0);
      expect(stderr.contents()).toBe("");
      expect(JSON.parse(stdout.contents())).toMatchObject({
        install: {
          destination: path.join(tempDir, "skills", "sourcey", "SKILL.md"),
          skill_id: "runx/sourcey",
          version: "1.0.0",
        },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("fails on ambiguous bare remote registry names", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-remote-add-ambiguous-"));
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();

    try {
      globalThis.fetch = vi.fn(async (input) => {
        expect(String(input)).toBe("https://runx.example.test/v1/skills?q=sourcey&limit=100");
        return new Response(JSON.stringify({
          status: "success",
          skills: [
            {
              skill_id: "runx/sourcey",
              owner: "runx",
              name: "sourcey",
              version: "1.0.0",
              source_type: "agent",
              runner_mode: "standard-only",
              runner_names: [],
              required_scopes: [],
              tags: [],
              trust_signals: [],
              install_command: "runx add runx/sourcey@1.0.0 --registry https://runx.example.test",
              run_command: "runx sourcey",
            },
            {
              skill_id: "0state/sourcey",
              owner: "0state",
              name: "sourcey",
              version: "1.0.0",
              source_type: "agent",
              runner_mode: "standard-only",
              runner_names: [],
              required_scopes: [],
              tags: [],
              trust_signals: [],
              install_command: "runx add 0state/sourcey@1.0.0 --registry https://runx.example.test",
              run_command: "runx sourcey",
            },
          ],
        }), { status: 200 });
      }) as typeof fetch;

      const exitCode = await runCli(
        ["skill", "add", "sourcey", "--to", path.join(tempDir, "skills"), "--registry", "https://runx.example.test", "--json"],
        { stdin: process.stdin, stdout, stderr },
        {
          ...process.env,
          RUNX_CWD: process.cwd(),
          RUNX_HOME: path.join(tempDir, "home"),
        },
      );

      expect(exitCode).toBe(1);
      expect(stdout.contents()).toBe("");
      expect(stderr.contents()).toContain("Use '<owner>/<name>' instead");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

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
