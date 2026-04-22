import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const toolPath = path.resolve("tools/outbox/build_pull_request/run.mjs");

describe("outbox.build_pull_request tool", () => {
  it("packages native scafld projections into a proposed pull_request outbox entry", () => {
    const result = runTool({
      task_id: "fixture-task",
      thread_title: "Fix fixture behavior",
      thread_locator: "github://example/repo/issues/123",
      target_repo: "example/repo",
      summary_projection: {
        markdown: "## scafld: Fix fixture behavior\n",
        model: {
          title: "Fix fixture behavior",
          origin: {
            git: {
              branch: "fixture-task",
              base_ref: "main",
            },
            repo: {
              remote: "origin",
              remote_url: "git@github.com:example/repo.git",
            },
            source: {
              system: "github",
              kind: "issue",
              id: 123,
              url: "https://github.com/example/repo/issues/123",
            },
          },
        },
      },
      checks_projection: {
        check: {
          status: "success",
          summary: "review pass_with_issues",
          details: ["status: completed"],
        },
      },
      pr_body_projection: {
        markdown: "# Fix fixture behavior\n\nBody.\n",
        model: {
          title: "Fix fixture behavior",
          origin: {
            git: {
              branch: "fixture-task",
              base_ref: "main",
            },
            repo: {
              remote: "origin",
              remote_url: "git@github.com:example/repo.git",
            },
            source: {
              system: "github",
              kind: "issue",
              id: 123,
              url: "https://github.com/example/repo/issues/123",
            },
          },
        },
      },
      completion_result: {
        archive_path: ".ai/specs/archive/2026-04/fixture-task.yaml",
        review_file: ".ai/reviews/fixture-task.md",
        blocking_count: 0,
        non_blocking_count: 1,
        review_round: 1,
      },
      completion_state: {
        status: "completed",
        review_verdict: "pass_with_issues",
      },
      status_snapshot: {
        sync: {
          status: "in_sync",
          reasons: [],
        },
      },
    });

    expect(result.outbox_entry).toMatchObject({
      entry_id: "pull_request:fixture-task",
      kind: "pull_request",
      status: "proposed",
      thread_locator: "github://example/repo/issues/123",
      title: "Fix fixture behavior",
      metadata: {
        action: "create",
        repo: "example/repo",
        branch: "fixture-task",
        base: "main",
        review_verdict: "pass_with_issues",
        check_status: "success",
        push_ready: true,
      },
    });
    expect(result.draft_pull_request).toMatchObject({
      schema_version: "runx.pull-request-draft.v1",
      action: "create",
      push_ready: true,
      task_id: "fixture-task",
      target: {
        repo: "example/repo",
        branch: "fixture-task",
        base: "main",
      },
      source: {
        system: "github",
        kind: "issue",
        id: "123",
      },
      pull_request: {
        title: "Fix fixture behavior",
        body_markdown: "# Fix fixture behavior\n\nBody.\n",
        is_draft: true,
      },
      governance: {
        review_verdict: "pass_with_issues",
        blocking_count: 0,
        non_blocking_count: 1,
        sync_status: "in_sync",
      },
      thread: {
        thread_locator: "github://example/repo/issues/123",
      },
    });
  });

  it("refreshes an existing pull_request outbox entry from thread", () => {
    const result = runTool({
      task_id: "fixture-task",
      summary_projection: {
        markdown: "## scafld: Refresh fixture behavior\n",
        model: {
          title: "Refresh fixture behavior",
          origin: {
            git: {
              branch: "fixture-task",
              base_ref: "main",
            },
            repo: {
              remote_url: "https://github.com/example/repo.git",
            },
          },
        },
      },
      checks_projection: {
        check: {
          status: "success",
          summary: "ready",
        },
      },
      pr_body_projection: {
        markdown: "# Refresh fixture behavior\n\nUpdated body.\n",
        model: {
          title: "Refresh fixture behavior",
          origin: {
            git: {
              branch: "fixture-task",
              base_ref: "main",
            },
          },
        },
      },
      completion_result: {
        archive_path: ".ai/specs/archive/2026-04/fixture-task.yaml",
        review_file: ".ai/reviews/fixture-task.md",
        blocking_count: 0,
        non_blocking_count: 0,
      },
      completion_state: {
        status: "completed",
        review_verdict: "pass",
      },
      thread: {
        kind: "runx.thread.v1",
        adapter: {
          type: "github",
        },
        thread_kind: "work_item",
        thread_locator: "github://example/repo/issues/123",
        canonical_uri: "https://github.com/example/repo/issues/123",
        entries: [],
        decisions: [],
        outbox: [
          {
            entry_id: "pr-77",
            kind: "pull_request",
            locator: "https://github.com/example/repo/pull/77",
            status: "draft",
            thread_locator: "github://example/repo/issues/123",
          },
        ],
        source_refs: [],
      },
    });

    expect(result.outbox_entry).toMatchObject({
      entry_id: "pr-77",
      kind: "pull_request",
      locator: "https://github.com/example/repo/pull/77",
      status: "draft",
      thread_locator: "github://example/repo/issues/123",
      metadata: {
        action: "refresh",
        push_ready: true,
      },
    });
    expect(result.draft_pull_request).toMatchObject({
      action: "refresh",
      target: {
        repo: "example/repo",
      },
      thread: {
        thread_locator: "github://example/repo/issues/123",
      },
    });
  });
});

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
