import { describe, expect, it } from "vitest";

import type { SurfaceBridge, SurfaceRunResult, SurfaceRunState } from "@runxhq/core/sdk";
import {
  createAnthropicSurfaceAdapter,
  createCrewAiSurfaceAdapter,
  createLangChainSurfaceAdapter,
  createOpenAiSurfaceAdapter,
  createVercelAiSurfaceAdapter,
} from "./index.js";

function fakeBridge(result: SurfaceRunResult): SurfaceBridge {
  return {
    run: async () => result,
    resume: async () => result,
    inspect: async () => result as SurfaceRunState,
  };
}

describe("host surface adapters", () => {
  const paused: SurfaceRunResult = {
    status: "paused",
    skillName: "echo",
    runId: "rx_paused",
    requests: [],
    events: [],
  };

  it("wraps OpenAI tool responses", async () => {
    const response = await createOpenAiSurfaceAdapter(fakeBridge(paused)).run({ skillPath: "unused" });
    expect(response).toMatchObject({
      role: "tool",
      structuredContent: {
        runx: {
          status: "paused",
          runId: "rx_paused",
        },
      },
    });
  });

  it("wraps Anthropic responses", async () => {
    const response = await createAnthropicSurfaceAdapter(fakeBridge(paused)).run({ skillPath: "unused" });
    expect(response.metadata.runx.status).toBe("paused");
  });

  it("wraps Vercel AI SDK responses", async () => {
    const response = await createVercelAiSurfaceAdapter(fakeBridge(paused)).run({ skillPath: "unused" });
    expect(response.data.runx.status).toBe("paused");
  });

  it("wraps LangChain responses", async () => {
    const response = await createLangChainSurfaceAdapter(fakeBridge(paused)).run({ skillPath: "unused" });
    expect(response.additional_kwargs.runx.status).toBe("paused");
  });

  it("wraps CrewAI responses", async () => {
    const response = await createCrewAiSurfaceAdapter(fakeBridge(paused)).run({ skillPath: "unused" });
    expect(response.json_dict.runx.status).toBe("paused");
  });
});
