import { describe, expect, it } from "vitest";

import { buildReceiptViewModel } from "../plugins/ide-core/src/index.js";
import { receiptTreeItems } from "../plugins/antigravity/src/views.js";

describe("ide receipt view", () => {
  it("renders graph receipt graph metadata without raw output bodies", () => {
    const receipt = {
      id: "gx_1",
      kind: "graph_execution",
      status: "success",
      output_hash: "hash-output",
      raw_output: "secret full output body",
      graph_name: "fanout-docs",
      steps: [
        {
          step_id: "research-a",
          skill: "research",
          runner: "agent",
          status: "success",
          receipt_id: "rx_1",
          fanout_group: "research",
          context_from: [],
          governance: {
            scope_admission: {
              status: "allow",
              requested_scopes: ["repo:read"],
              granted_scopes: ["repo:read"],
              grant_id: "grant_1",
            },
          },
        },
        {
          step_id: "synthesize",
          skill: "synthesize",
          status: "success",
          receipt_id: "rx_2",
          context_from: [{ input: "research", from_step: "research-a", output: "summary", receipt_id: "rx_1" }],
          retry: { attempt: 1, max_attempts: 2, rule_fired: "initial_attempt" },
        },
      ],
      sync_points: [
        {
          group_id: "research",
          strategy: "quorum",
          decision: "proceed",
          rule_fired: "quorum_met",
          reason: "2/2 branches succeeded",
          branch_count: 2,
          success_count: 2,
          failure_count: 0,
          required_successes: 2,
          branch_receipts: ["rx_1", "rx_2"],
        },
      ],
    };

    const model = buildReceiptViewModel(receipt);
    expect(model.title).toBe("fanout-docs");
    expect(model.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining(["receipt", "step", "retry", "sync"]));
    expect(JSON.stringify(model)).toContain("quorum_met");
    expect(JSON.stringify(model)).toContain("hash-output");
    expect(JSON.stringify(model)).not.toContain("secret full output body");

    expect(receiptTreeItems(receipt).map((item) => item.label)).toContain("sync research");
  });
});
