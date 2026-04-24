import { afterEach, describe, expect, it } from "vitest";

import { createOpenAiSurfaceAdapter } from "@runxhq/core/sdk";
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

describe("OpenAI surface adapter", () => {
  it("wraps paused and resumed runs in an OpenAI-style tool response", async () => {
    const harness = await createSurfaceHarness();
    cleanups.push(harness.cleanup);
    const adapter = createOpenAiSurfaceAdapter(harness.bridge);

    const paused = await adapter.run({
      skillPath: "fixtures/skills/echo",
    });

    expect(paused.role).toBe("tool");
    expect(paused.structuredContent.runx.status).toBe("paused");
    if (paused.structuredContent.runx.status !== "paused") {
      return;
    }

    const resumed = await adapter.resume(paused.structuredContent.runx.runId, {
      skillPath: "fixtures/skills/echo",
      resolver: ({ request }) => (request.kind === "input" ? { message: "from-openai-surface-adapter" } : undefined),
    });

    expect(resumed.role).toBe("tool");
    expect(resumed.structuredContent.runx).toMatchObject({
      status: "completed",
      output: "from-openai-surface-adapter",
    });
  });
});
