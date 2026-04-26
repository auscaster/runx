import { createRunxSdk, createSurfaceBridge } from "@runx/sdk";
import { createOpenAiSurfaceAdapter } from "@runxhq/host-adapters";

async function main(): Promise<void> {
  const sdk = createRunxSdk({ callerOptions: { maxAttempts: 1 } });
  const bridge = createSurfaceBridge({ execute: sdk.runSkill.bind(sdk) });
  const openai = createOpenAiSurfaceAdapter(bridge);

  const response = await openai.run({
    skillPath: "skills/sourcey",
    inputs: { project: "." },
    resolver: ({ request }) => {
      if (request.kind === "approval") {
        return true;
      }
      return undefined;
    },
  });

  console.log(JSON.stringify(response, null, 2));
}

void main();
