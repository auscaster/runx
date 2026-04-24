import { afterEach, describe, expect, it } from "vitest";

import { createStructuredCaller } from "@runxhq/core/sdk";
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

describe("surface bridge", () => {
  it("pauses on unresolved work and resumes the same run through the shared bridge", async () => {
    const harness = await createSurfaceHarness();
    cleanups.push(harness.cleanup);

    const paused = await harness.bridge.run({
      skillPath: "fixtures/skills/echo",
    });

    expect(paused.status).toBe("paused");
    if (paused.status !== "paused") {
      return;
    }
    expect(paused.requests[0]).toMatchObject({
      kind: "input",
    });

    const resumed = await harness.bridge.resume(paused.runId, {
      skillPath: "fixtures/skills/echo",
      resolver: ({ request }) => {
        if (request.kind !== "input") {
          return undefined;
        }
        return { message: "from-surface-bridge" };
      },
    });

    expect(resumed).toMatchObject({
      status: "completed",
      skillName: "echo",
      output: "from-surface-bridge",
    });
  });

  it("falls back to an upstream caller when the bridge resolver does not answer", async () => {
    const harness = await createSurfaceHarness();
    cleanups.push(harness.cleanup);
    const caller = createStructuredCaller({
      answers: {
        message: "from-upstream-caller",
      },
    });

    const result = await harness.bridge.run({
      skillPath: "fixtures/skills/echo",
      caller,
    });

    expect(result).toMatchObject({
      status: "completed",
      output: "from-upstream-caller",
    });
    expect(caller.trace.resolutions).toHaveLength(1);
  });
});
