import { describe, expect, it } from "vitest";

import {
  SkillParseError,
  SkillValidationError,
  parseRunnerManifestYaml,
  parseSkillMarkdown,
  validateRunnerManifest,
  validateSkill,
} from "./index.js";

const validSkill = `---
name: echo
description: Echo a message
source:
  type: cli-tool
  command: node
  args:
    - -e
    - "process.stdout.write(process.argv[1] ?? '')"
  timeout_seconds: 10
inputs:
  message:
    type: string
    required: true
    description: Message to echo
runx:
  input_resolution:
    required:
      - message
---
# Echo

Print a message.
`;

describe("parseSkillMarkdown", () => {
  it("parses frontmatter and body into raw IR", () => {
    const raw = parseSkillMarkdown(validSkill);

    expect(raw.frontmatter.name).toBe("echo");
    expect(raw.body).toContain("Print a message.");
  });

  it("fails when frontmatter is missing", () => {
    expect(() => parseSkillMarkdown("# Echo")).toThrow(SkillParseError);
  });

  it("fails when frontmatter YAML is malformed", () => {
    expect(() =>
      parseSkillMarkdown(`---
name: echo
source: [unterminated
---
body
`),
    ).toThrow(SkillParseError);
  });
});

describe("validateSkill", () => {
  it("defaults standard-only skills to the agent runner", () => {
    const skill = validateSkill(
      parseSkillMarkdown(`---
name: standard-only
description: A portable marketplace skill.
---
# Standard Only

Follow the instructions.
`),
    );

    expect(skill.name).toBe("standard-only");
    expect(skill.source).toMatchObject({
      type: "agent",
      args: [],
      raw: { type: "agent" },
    });
  });

  it("validates a cli-tool skill", () => {
    const skill = validateSkill(parseSkillMarkdown(validSkill));

    expect(skill.name).toBe("echo");
    expect(skill.description).toBe("Echo a message");
    expect(skill.source).toMatchObject({
      type: "cli-tool",
      command: "node",
      args: ["-e", "process.stdout.write(process.argv[1] ?? '')"],
      timeoutSeconds: 10,
    });
    expect(skill.inputs.message).toMatchObject({
      type: "string",
      required: true,
      description: "Message to echo",
    });
    expect(skill.runx).toEqual({
      input_resolution: {
        required: ["message"],
      },
    });
  });

  it("validates cli-tool sandbox metadata from runx", () => {
    const skill = validateSkill(
      parseSkillMarkdown(`---
name: sandboxed
source:
  type: cli-tool
  command: node
  timeout_seconds: 10
runx:
  sandbox:
    profile: workspace-write
    cwd_policy: workspace
    env_allowlist:
      - PATH
    network: false
    writable_paths:
      - "{{output_path}}"
---
Sandboxed.
`),
    );

    expect(skill.source.sandbox).toEqual({
      profile: "workspace-write",
      cwdPolicy: "workspace",
      envAllowlist: ["PATH"],
      network: false,
      writablePaths: ["{{output_path}}"],
      raw: {
        profile: "workspace-write",
        cwd_policy: "workspace",
        env_allowlist: ["PATH"],
        network: false,
        writable_paths: ["{{output_path}}"],
      },
    });
  });

  it("validates skill retry, mutation, and idempotency metadata", () => {
    const skill = validateSkill(
      parseSkillMarkdown(`---
name: mutating-skill
source:
  type: cli-tool
  command: node
retry:
  max_attempts: 2
idempotency:
  key: "{{request_id}}"
risk:
  mutating: true
---
Mutating.
`),
    );

    expect(skill.retry).toEqual({ maxAttempts: 2 });
    expect(skill.idempotency).toEqual({ key: "{{request_id}}" });
    expect(skill.mutating).toBe(true);
  });

  it("rejects invalid sandbox profiles", () => {
    expect(() =>
      validateSkill(
        parseSkillMarkdown(`---
name: bad-sandbox
source:
  type: cli-tool
  command: node
  sandbox:
    profile: pretend-secure
---
Bad.
`),
      ),
    ).toThrow("sandbox.profile must be readonly, workspace-write, network, or unrestricted-local-dev");
  });

  it("validates mcp source metadata", () => {
    const raw = parseSkillMarkdown(`---
name: mcp-echo
source:
  type: mcp
  server:
    command: node
    args:
      - ./server.js
  tool: echo
  arguments:
    message: "{{message}}"
inputs:
  message:
    required: true
---
Echo through MCP.
`);

    const skill = validateSkill(raw);

    expect(skill.source.type).toBe("mcp");
    expect(skill.source.server?.command).toBe("node");
    expect(skill.source.tool).toBe("echo");
    expect(skill.source.arguments?.message).toBe("{{message}}");
  });

  it("validates explicit agent-step source metadata", () => {
    const skill = validateSkill(
      parseSkillMarkdown(`---
name: objective-decompose
source:
  type: agent-step
  agent: codex
  task: objective-decomposition
  outputs:
    draft_spec: string
inputs:
  objective:
    type: string
    required: true
---
Decompose the objective.
`),
    );

    expect(skill.source).toMatchObject({
      type: "agent-step",
      agent: "codex",
      task: "objective-decomposition",
      outputs: { draft_spec: "string" },
    });
  });

  it("validates a2a source metadata", () => {
    const skill = validateSkill(
      parseSkillMarkdown(`---
name: a2a-echo
source:
  type: a2a
  agent_card_url: fixture://echo-agent
  agent_identity: echo-agent
  task: echo
  arguments:
    message: "{{message}}"
inputs:
  message:
    required: true
---
Echo through A2A.
`),
    );

    expect(skill.source).toMatchObject({
      type: "a2a",
      agentCardUrl: "fixture://echo-agent",
      agentIdentity: "echo-agent",
      task: "echo",
      arguments: { message: "{{message}}" },
    });
  });

  it("rejects a2a source metadata without an agent card URL", () => {
    expect(() =>
      validateSkill(
        parseSkillMarkdown(`---
name: bad-a2a
source:
  type: a2a
  task: echo
---
Bad.
`),
      ),
    ).toThrow(SkillValidationError);
  });

  it("validates explicit harness-hook source metadata", () => {
    const skill = validateSkill(
      parseSkillMarkdown(`---
name: harness-review
source:
  type: harness-hook
  hook: receipt-review
  outputs:
    verdict: string
inputs:
  receipt_id:
    type: string
    required: true
---
Review a receipt in a deterministic harness.
`),
    );

    expect(skill.source).toMatchObject({
      type: "harness-hook",
      hook: "receipt-review",
      outputs: { verdict: "string" },
    });
  });

  it("rejects helper-script declarations hidden behind agent or harness source types", () => {
    expect(() =>
      validateSkill(
        parseSkillMarkdown(`---
name: hidden-helper
source:
  type: harness-hook
  hook: receipt-review
  command: node
  args:
    - ./repo-local-helper.mjs
---
Invalid.
`),
      ),
    ).toThrow("harness-hook sources must not declare source.command or source.args");
  });

  it("accepts standard-only skills in lenient mode", () => {
    const raw = parseSkillMarkdown(`---
name: standard-only
---
Body
`);

    const skill = validateSkill(raw, { mode: "lenient" });
    expect(skill.runx).toBeUndefined();
    expect(skill.source.type).toBe("agent");
  });

  it("fails strict validation for malformed runx metadata", () => {
    const raw = parseSkillMarkdown(`---
name: bad-runx
source:
  type: cli-tool
  command: echo
runx: invalid
---
Body
`);

    expect(() => validateSkill(raw, { mode: "strict" })).toThrow(SkillValidationError);
  });

  it("fails when cli-tool source command is missing", () => {
    const raw = parseSkillMarkdown(`---
name: missing-command
source:
  type: cli-tool
---
Body
`);

    expect(() => validateSkill(raw)).toThrow(SkillValidationError);
  });

  it("fails when mcp tool is missing", () => {
    const raw = parseSkillMarkdown(`---
name: bad-mcp
source:
  type: mcp
  server:
    command: node
---
Bad MCP skill.
`);

    expect(() => validateSkill(raw)).toThrow(SkillValidationError);
  });
});

describe("validateRunnerManifest", () => {
  it("validates A2A runner metadata outside the standard skill file", () => {
    const manifest = validateRunnerManifest(
      parseRunnerManifestYaml(`skill: a2a-echo
runners:
  fixture-a2a:
    type: a2a
    agent_card_url: fixture://echo-agent
    agent_identity: echo-agent
    task: echo
    arguments:
      message: "{{message}}"
    inputs:
      message:
        required: true
`),
    );

    expect(manifest.skill).toBe("a2a-echo");
    expect(manifest.runners["fixture-a2a"]).toMatchObject({
      name: "fixture-a2a",
      source: {
        type: "a2a",
        agentCardUrl: "fixture://echo-agent",
        agentIdentity: "echo-agent",
        task: "echo",
      },
      inputs: {
        message: {
          required: true,
        },
      },
    });
  });
});
