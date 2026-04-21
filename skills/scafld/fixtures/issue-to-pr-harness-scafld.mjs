#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const command = argv[0] || "";
const taskId = argv[1] || "";
const cwd = process.cwd();

const draftSpecPath = path.join(cwd, ".ai", "specs", "drafts", `${taskId}.yaml`);
const activeSpecPath = path.join(cwd, ".ai", "specs", "active", `${taskId}.yaml`);
const reviewPath = path.join(cwd, ".ai", "reviews", `${taskId}.md`);

switch (command) {
  case "init":
    mkdirSync(path.join(cwd, ".ai", "specs", "drafts"), { recursive: true });
    mkdirSync(path.join(cwd, ".ai", "specs", "active"), { recursive: true });
    mkdirSync(path.join(cwd, ".ai", "reviews"), { recursive: true });
    emit({
      ok: true,
      command,
      warnings: [],
      state: { status: "ready" },
      result: { initialized: true },
      error: null,
    });
    break;
  case "new":
    ensure(taskId, "task_id is required for new");
    mkdirSync(path.dirname(draftSpecPath), { recursive: true });
    if (!existsSync(draftSpecPath)) {
      writeFileSync(
        draftSpecPath,
        [
          'spec_version: "1.1"',
          `task_id: "${taskId}"`,
          'status: "draft"',
          'task:',
          '  title: "Harness draft"',
          '  summary: "Harness draft emitted by the issue-to-pr fake native scafld"',
        ].join("\n"),
      );
    }
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "draft", file: relativeToCwd(draftSpecPath) },
      result: { valid: true, file: relativeToCwd(draftSpecPath), errors: [] },
      error: null,
    });
    break;
  case "validate":
    ensure(taskId, "task_id is required for validate");
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "draft" },
      result: { valid: true, file: relativeToCwd(draftSpecPath), errors: [] },
      error: null,
    });
    break;
  case "approve":
    ensure(taskId, "task_id is required for approve");
    ensure(existsSync(draftSpecPath), "draft spec missing");
    mkdirSync(path.dirname(activeSpecPath), { recursive: true });
    copyFileSync(draftSpecPath, activeSpecPath);
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "approved", file: relativeToCwd(activeSpecPath) },
      result: {
        transition: {
          from: relativeToCwd(draftSpecPath),
          to: relativeToCwd(activeSpecPath),
        },
      },
      error: null,
    });
    break;
  case "start":
    ensure(taskId, "task_id is required for start");
    ensure(existsSync(activeSpecPath), "active spec missing");
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "in_progress", file: relativeToCwd(activeSpecPath) },
      result: {
        transition: {
          from: relativeToCwd(draftSpecPath),
          to: relativeToCwd(activeSpecPath),
        },
      },
      error: null,
    });
    break;
  case "branch":
    ensure(taskId, "task_id is required for branch");
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "in_progress" },
      result: {
        origin: {
          git: {
            branch: taskId,
            base_ref: "main",
          },
        },
        sync: {
          status: "in_sync",
          reasons: [],
        },
      },
      error: null,
    });
    break;
  case "exec":
    ensure(taskId, "task_id is required for exec");
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "in_progress" },
      result: {
        executed: true,
        phase: readFlagValue("--phase"),
      },
      error: null,
    });
    break;
  case "status":
    ensure(taskId, "task_id is required for status");
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "in_progress" },
      result: {
        status: "in_progress",
        file: relativeToCwd(activeSpecPath),
        sync: {
          status: "in_sync",
          reasons: [],
        },
        review_state: {
          verdict: "pending",
          round_status: "pending",
        },
      },
      error: null,
    });
    break;
  case "audit":
    ensure(taskId, "task_id is required for audit");
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "in_progress" },
      result: {
        status: "pass",
        issues: [],
      },
      error: null,
    });
    break;
  case "review":
    ensure(taskId, "task_id is required for review");
    mkdirSync(path.dirname(reviewPath), { recursive: true });
    if (!existsSync(reviewPath)) {
      writeFileSync(
        reviewPath,
        [
          `# Review: ${taskId}`,
          "",
          "## Spec",
          "",
          "## Review 1 - 2026-04-22T00:00:00Z",
          "",
          "### Metadata",
          "{}",
          "",
          "### Pass Results",
          "{}",
          "",
          "### Regression Hunt",
          "None.",
          "",
          "### Convention Check",
          "None.",
          "",
          "### Dark Patterns",
          "None.",
          "",
          "### Blocking",
          "None.",
          "",
          "### Non-blocking",
          "None.",
          "",
          "### Verdict",
          "pending",
          "",
        ].join("\n"),
      );
    }
    emit({
      ok: true,
      command,
      task_id: taskId,
      warnings: [],
      state: { status: "in_progress" },
      result: {
        review_file: relativeToCwd(reviewPath),
        review_round: 1,
        automated_passes: [],
        required_sections: ["Regression Hunt", "Convention Check", "Dark Patterns"],
        review_prompt: "ADVERSARIAL REVIEW\n\nReview the bounded change set.",
      },
      error: null,
    });
    break;
  default:
    process.stderr.write(`unsupported command: ${command}\n`);
    process.exit(1);
}

function ensure(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function relativeToCwd(targetPath) {
  return path.relative(cwd, targetPath);
}

function readFlagValue(flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1] || undefined;
}
