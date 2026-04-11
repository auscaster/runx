import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = process.cwd();
const cliPackageRoot = path.join(workspaceRoot, "packages", "cli");
const cliDistEntry = path.join(cliPackageRoot, "dist", "index.js");

describe("Node CLI package", () => {
  beforeAll(async () => {
    await execFileAsync("pnpm", ["build"], {
      cwd: workspaceRoot,
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  }, 130_000);

  it("emits an executable dist CLI entrypoint", async () => {
    const entry = await stat(cliDistEntry);
    expect(entry.isFile()).toBe(true);
    expect(entry.mode & 0o111).not.toBe(0);

    const { stdout } = await execFileAsync(process.execPath, [cliDistEntry, "--help"], {
      cwd: workspaceRoot,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    expect(stdout).toContain("runx skill search");
    expect(stdout).toContain("runx evolve <objective>");
  });

  it("packs @runxai/cli with the emitted dist files", async () => {
    const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], {
      cwd: cliPackageRoot,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    const [pack] = JSON.parse(stdout) as [
      {
        readonly name: string;
        readonly files: readonly { readonly path: string }[];
      },
    ];

    expect(pack.name).toBe("@runxai/cli");
    expect(pack.files.map((file) => file.path)).toContain("dist/index.js");
    expect(pack.files.map((file) => file.path)).toContain("dist/index.d.ts");
  }, 60_000);
});
