import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { CliIo } from "@runxhq/cli";

import { runCreateSkill } from "./index.js";

class MemoryWritable extends Writable {
  #chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.#chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    callback();
  }

  contents(): string {
    return this.#chunks.join("");
  }
}

function createIo() {
  const stdout = new MemoryWritable();
  const stderr = new MemoryWritable();
  return {
    stdout,
    stderr,
    io: {
      stdin: process.stdin,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
    } satisfies CliIo,
  };
}

describe("@runxhq/create-skill", () => {
  it("forwards to runx new with the original args", async () => {
    const calls: unknown[] = [];
    const { io, stdout, stderr } = createIo();
    const env = { ...process.env, INIT_CWD: "/tmp/project-root" };

    const exitCode = await runCreateSkill(
      ["demo-skill", "--directory", "packages/demo-skill"],
      io,
      env,
      async (argv, receivedIo, receivedEnv) => {
        calls.push({ argv, receivedIo, receivedEnv });
        return 0;
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout.contents()).toBe("");
    expect(stderr.contents()).toBe("");
    expect(calls).toEqual([
      {
        argv: ["new", "demo-skill", "--directory", "packages/demo-skill"],
        receivedIo: io,
        receivedEnv: env,
      },
    ]);
  });

  it("prints help to stdout", async () => {
    const { io, stdout, stderr } = createIo();

    const exitCode = await runCreateSkill(["--help"], io, process.env, async () => 1);

    expect(exitCode).toBe(0);
    expect(stdout.contents()).toContain("npm create @runxhq/skill@latest <name>");
    expect(stderr.contents()).toBe("");
  });

  it("requires a package name", async () => {
    const { io, stdout, stderr } = createIo();

    const exitCode = await runCreateSkill([], io, process.env, async () => 0);

    expect(exitCode).toBe(64);
    expect(stdout.contents()).toBe("");
    expect(stderr.contents()).toContain("runx new <name>");
  });
});
