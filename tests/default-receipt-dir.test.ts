import path from "node:path";

import { describe, expect, it } from "vitest";

import { defaultReceiptDir } from "../packages/runtime-local/src/runner-local/receipt-paths.js";

describe("defaultReceiptDir resolves to runx home, not the working tree", () => {
  it("uses <RUNX_HOME>/receipts when RUNX_RECEIPT_DIR is unset", () => {
    const env = { RUNX_HOME: "/tmp/fake-runx-home" } as NodeJS.ProcessEnv;
    expect(defaultReceiptDir(env)).toBe(path.join("/tmp/fake-runx-home", "receipts"));
  });

  it("uses RUNX_RECEIPT_DIR directly when set, without appending .runx/receipts", () => {
    const env = { RUNX_RECEIPT_DIR: "/tmp/explicit-receipts" } as NodeJS.ProcessEnv;
    expect(defaultReceiptDir(env)).toBe("/tmp/explicit-receipts");
  });

  it("does not depend on the current working directory when RUNX_RECEIPT_DIR is unset", () => {
    const envA = { RUNX_HOME: "/tmp/fake-runx-home", INIT_CWD: "/tmp/workspace-a" } as NodeJS.ProcessEnv;
    const envB = { RUNX_HOME: "/tmp/fake-runx-home", INIT_CWD: "/tmp/workspace-b" } as NodeJS.ProcessEnv;
    expect(defaultReceiptDir(envA)).toBe(defaultReceiptDir(envB));
  });
});
