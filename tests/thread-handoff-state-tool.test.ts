import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const toolPath = path.resolve("tools/thread/handoff_state/run.mjs");

describe("thread.handoff_state tool", () => {
  it("reduces generic handoff signals and exposes the outbox push gate", () => {
    const result = runTool({
      handoff_id: "handoff:example-repo:docs-pr",
      target_repo: "example/repo",
      target_locator: "github://example/repo/pulls/42",
      signals: [
        signal({
          signal_id: "sig_accept",
          disposition: "accepted",
          recorded_at: "2026-04-25T00:00:00Z",
        }),
        signal({
          signal_id: "sig_send",
          disposition: "approved_to_send",
          recorded_at: "2026-04-25T00:05:00Z",
        }),
      ],
    });

    expect(result).toMatchObject({
      handoff_state: {
        schema: "runx.handoff_state.v1",
        handoff_id: "handoff:example-repo:docs-pr",
        target_repo: "example/repo",
        status: "approved_to_send",
        signal_count: 2,
        last_signal_id: "sig_send",
      },
      latest_signal: {
        signal_id: "sig_send",
        disposition: "approved_to_send",
      },
      allowed: {
        outbox_push: true,
        required_outbox_status: "approved_to_send",
      },
    });
  });

  it("checks candidate signal transitions without product-specific workflow logic", () => {
    const result = runTool({
      handoff_id: "handoff:example-repo:docs-pr",
      candidate_disposition: "approved_to_send",
      signals: [
        signal({
          signal_id: "sig_accept",
          disposition: "accepted",
          recorded_at: "2026-04-25T00:00:00Z",
        }),
      ],
    });

    expect(result).toMatchObject({
      handoff_state: {
        status: "accepted",
      },
      allowed: {
        outbox_push: false,
        candidate_signal: true,
      },
    });
  });

  it("applies active suppression records after signal replay", () => {
    const result = runTool({
      handoff_id: "handoff:example-repo:docs-pr",
      target_repo: "example/repo",
      now: "2026-04-25T01:00:00Z",
      signals: [
        signal({
          signal_id: "sig_accept",
          disposition: "accepted",
          recorded_at: "2026-04-25T00:00:00Z",
        }),
      ],
      suppressions: [
        {
          schema: "runx.suppression_record.v1",
          record_id: "sup_repo",
          scope: "repo",
          key: "example/repo",
          reason: "operator_block",
          recorded_at: "2026-04-25T00:30:00Z",
        },
      ],
    });

    expect(result).toMatchObject({
      handoff_state: {
        status: "suppressed",
        suppression_record_id: "sup_repo",
      },
      active_suppression_record: {
        record_id: "sup_repo",
        scope: "repo",
      },
      allowed: {
        outbox_push: false,
      },
    });
  });
});

function signal(overrides: Readonly<Record<string, unknown>>) {
  return {
    schema: "runx.handoff_signal.v1",
    handoff_id: "handoff:example-repo:docs-pr",
    target_repo: "example/repo",
    target_locator: "github://example/repo/pulls/42",
    source: "manual_note",
    ...overrides,
  };
}

function runTool(inputs: Readonly<Record<string, unknown>>) {
  const result = spawnSync("node", [toolPath], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      RUNX_INPUTS_JSON: JSON.stringify(inputs),
    },
  });
  expect(result.status).toBe(0);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "tool failed");
  }
  return JSON.parse(result.stdout);
}
