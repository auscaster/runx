import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDefaultSkillAdapters } from "@runxhq/adapters";
import { createRunxSdk, createSurfaceBridge, type SurfaceBridge } from "@runxhq/core/sdk";

export interface SurfaceHarness {
  readonly bridge: SurfaceBridge;
  readonly cleanup: () => Promise<void>;
}

export async function createSurfaceHarness(): Promise<SurfaceHarness> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-surface-protocol-"));
  const sdk = createRunxSdk({
    env: { ...process.env, RUNX_CWD: process.cwd(), RUNX_HOME: path.join(tempDir, "home") },
    receiptDir: path.join(tempDir, "receipts"),
    adapters: createDefaultSkillAdapters(),
  });

  return {
    bridge: createSurfaceBridge({ execute: sdk.runSkill.bind(sdk) }),
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
