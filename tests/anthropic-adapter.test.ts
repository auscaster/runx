import { afterEach, describe, expect, it } from "vitest";

import { createAnthropicSurfaceAdapter } from "@runxhq/core/sdk";
import { createSurfaceHarness } from "./surface-protocol-test-utils.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("Anthropic surface adapter", () => {
  it("wraps paused and resumed runs in an Anthropic-style response", async () => {
    const harness = await createSurfaceHarness();
    cleanups.push(harness.cleanup);
    const adapter = createAnthropicSurfaceAdapter(harness.bridge);

    const paused = await adapter.run({
      skillPath: "fixtures/skills/echo",
    });

    expect(paused.metadata.runx.status).toBe("paused");
    if (paused.metadata.runx.status !== "paused") {
      return;
    }

    const resumed = await adapter.resume(paused.metadata.runx.runId, {
      skillPath: "fixtures/skills/echo",
      resolver: ({ request }) => (request.kind === "input" ? { message: "from-anthropic-surface-adapter" } : undefined),
    });

    expect(resumed.metadata.runx).toMatchObject({
      status: "completed",
      output: "from-anthropic-surface-adapter",
    });
  });
});
