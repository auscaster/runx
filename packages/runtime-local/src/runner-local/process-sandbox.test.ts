import { describe, expect, it } from "vitest";

import { cleanupLocalProcessSandbox, type LocalProcessSandboxResult } from "./process-sandbox.js";

describe("cleanupLocalProcessSandbox", () => {
  it("returns cleanup failures instead of dropping them", () => {
    const sandbox: LocalProcessSandboxResult = {
      status: "allow",
      cwd: process.cwd(),
      env: {},
      cleanupPaths: ["bad\u0000path"],
      metadata: {},
    };

    const errors = cleanupLocalProcessSandbox(sandbox);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("bad");
  });

  it("has no cleanup work for denied sandboxes", () => {
    expect(cleanupLocalProcessSandbox({
      status: "deny",
      reason: "denied",
      metadata: {},
    })).toEqual([]);
  });
});
