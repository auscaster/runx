import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseDocument } from "yaml";

import {
  runLocalChain,
  runLocalSkill,
  type Caller,
  type ExecutionEvent,
  type Question,
  type RunLocalChainResult,
  type RunLocalSkillResult,
} from "../../runner-local/src/index.js";

type HarnessKind = "skill" | "chain";

export interface HarnessCallerFixture {
  readonly answers?: Readonly<Record<string, unknown>>;
  readonly approvals?: Readonly<Record<string, boolean>>;
}

export interface HarnessReceiptExpectation {
  readonly kind?: "skill_execution" | "chain_execution";
  readonly status?: "success" | "failure";
  readonly subject?: Readonly<Record<string, unknown>>;
}

export interface HarnessExpectation {
  readonly status?: "success" | "failure" | "missing_context" | "policy_denied";
  readonly receipt?: HarnessReceiptExpectation;
  readonly steps?: readonly string[];
}

export interface HarnessFixture {
  readonly name: string;
  readonly kind: HarnessKind;
  readonly target: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly env: Readonly<Record<string, string>>;
  readonly caller: HarnessCallerFixture;
  readonly expect: HarnessExpectation;
}

export interface HarnessRunOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly keepFiles?: boolean;
}

export interface CallerTrace {
  readonly questions: readonly Question[];
  readonly approvals: readonly string[];
  readonly events: readonly ExecutionEvent[];
}

export interface HarnessRunResult {
  readonly fixture: HarnessFixture;
  readonly fixturePath: string;
  readonly targetPath: string;
  readonly receiptDir: string;
  readonly runxHome: string;
  readonly status: RunLocalSkillResult["status"] | RunLocalChainResult["status"];
  readonly receipt?: RunLocalSkillResult extends infer SkillResult
    ? SkillResult extends { readonly receipt: infer Receipt }
      ? Receipt
      : never
    : never;
  readonly chainReceipt?: RunLocalChainResult extends infer ChainResult
    ? ChainResult extends { readonly receipt: infer Receipt }
      ? Receipt
      : never
    : never;
  readonly trace: CallerTrace;
  readonly assertionErrors: readonly string[];
}

export async function parseHarnessFixtureFile(fixturePath: string): Promise<HarnessFixture> {
  return parseHarnessFixture(await readFile(fixturePath, "utf8"));
}

export function parseHarnessFixture(contents: string): HarnessFixture {
  const document = parseDocument(contents, { prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error: { readonly message: string }) => error.message).join("; "));
  }

  const parsed = document.toJS() as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Harness fixture must be a YAML object.");
  }

  const kind = requiredString(parsed.kind, "kind");
  if (kind !== "skill" && kind !== "chain") {
    throw new Error("Harness fixture kind must be skill or chain.");
  }

  return {
    name: requiredString(parsed.name, "name"),
    kind,
    target: requiredString(parsed.target, "target"),
    inputs: optionalRecord(parsed.inputs, "inputs") ?? {},
    env: validateEnv(optionalRecord(parsed.env, "env") ?? {}),
    caller: validateCaller(optionalRecord(parsed.caller, "caller") ?? {}),
    expect: validateExpectation(optionalRecord(parsed.expect, "expect") ?? {}),
  };
}

export async function runHarness(fixturePath: string, options: HarnessRunOptions = {}): Promise<HarnessRunResult> {
  const resolvedFixturePath = path.resolve(fixturePath);
  const fixture = await parseHarnessFixtureFile(resolvedFixturePath);
  const fixtureDir = path.dirname(resolvedFixturePath);
  const targetPath = path.resolve(fixtureDir, fixture.target);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "runx-harness-"));
  const receiptDir = path.join(tempDir, "receipts");
  const runxHome = path.join(tempDir, "home");
  const trace = createTrace();
  const caller = createReplayCaller(fixture.caller, trace);
  const env = {
    ...(options.env ?? process.env),
    ...fixture.env,
    RUNX_RECEIPT_DIR: receiptDir,
    RUNX_HOME: runxHome,
  };

  try {
    const result =
      fixture.kind === "skill"
        ? await runLocalSkill({
            skillPath: targetPath,
            inputs: fixture.inputs,
            caller,
            env,
            receiptDir,
            runxHome,
          })
        : await runLocalChain({
            chainPath: targetPath,
            inputs: fixture.inputs,
            caller,
            env,
            receiptDir,
            runxHome,
          });

    const assertionErrors = assertHarnessResult(fixture, result);
    return {
      fixture,
      fixturePath: resolvedFixturePath,
      targetPath,
      receiptDir,
      runxHome,
      status: result.status,
      receipt: skillReceipt(result),
      chainReceipt: chainReceipt(result),
      trace,
      assertionErrors,
    };
  } finally {
    if (!options.keepFiles) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function assertHarnessResult(
  fixture: HarnessFixture,
  result: RunLocalSkillResult | RunLocalChainResult,
): readonly string[] {
  const errors: string[] = [];

  if (fixture.expect.status && result.status !== fixture.expect.status) {
    errors.push(`Expected status ${fixture.expect.status}, got ${result.status}.`);
  }

  const receipt = skillReceipt(result) ?? chainReceipt(result);
  if (fixture.expect.receipt) {
    if (!receipt) {
      errors.push("Expected a receipt, but run did not produce one.");
    } else {
      if (fixture.expect.receipt.kind && receipt.kind !== fixture.expect.receipt.kind) {
        errors.push(`Expected receipt kind ${fixture.expect.receipt.kind}, got ${receipt.kind}.`);
      }
      if (fixture.expect.receipt.status && receipt.status !== fixture.expect.receipt.status) {
        errors.push(`Expected receipt status ${fixture.expect.receipt.status}, got ${receipt.status}.`);
      }
      for (const [key, expected] of Object.entries(fixture.expect.receipt.subject ?? {})) {
        if (receipt.subject[key as keyof typeof receipt.subject] !== expected) {
          errors.push(`Expected receipt subject.${key} to equal ${String(expected)}.`);
        }
      }
    }
  }

  if (fixture.expect.steps) {
    const actualSteps = "steps" in result ? result.steps.map((step) => step.stepId) : [];
    if (JSON.stringify(actualSteps) !== JSON.stringify(fixture.expect.steps)) {
      errors.push(`Expected steps ${fixture.expect.steps.join(", ")}, got ${actualSteps.join(", ")}.`);
    }
  }

  return errors;
}

function createTrace(): CallerTrace {
  return {
    questions: [],
    approvals: [],
    events: [],
  };
}

function createReplayCaller(fixture: HarnessCallerFixture, trace: CallerTrace): Caller {
  return {
    answer: async (questions) => {
      (trace.questions as Question[]).push(...questions);
      return Object.fromEntries(questions.map((question) => [question.id, fixture.answers?.[question.id]]));
    },
    approve: async (gate) => {
      (trace.approvals as string[]).push(gate.id);
      return fixture.approvals?.[gate.id] ?? false;
    },
    report: (event) => {
      (trace.events as ExecutionEvent[]).push(event);
    },
  };
}

type SkillReceipt = Extract<RunLocalSkillResult, { readonly status: "success" | "failure" }>["receipt"];

function skillReceipt(result: RunLocalSkillResult | RunLocalChainResult): SkillReceipt | undefined {
  if ("receipt" in result && "skill" in result && !("chain" in result)) {
    return result.receipt as SkillReceipt | undefined;
  }
  return undefined;
}

function chainReceipt(result: RunLocalSkillResult | RunLocalChainResult): Extract<RunLocalChainResult, { readonly receipt: unknown }>["receipt"] | undefined {
  if ("receipt" in result && "chain" in result) {
    return result.receipt;
  }
  return undefined;
}

function validateCaller(value: Record<string, unknown>): HarnessCallerFixture {
  return {
    answers: optionalRecord(value.answers, "caller.answers"),
    approvals: validateApprovals(optionalRecord(value.approvals, "caller.approvals") ?? {}),
  };
}

function validateApprovals(value: Record<string, unknown>): Readonly<Record<string, boolean>> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (typeof entry !== "boolean") {
        throw new Error(`caller.approvals.${key} must be a boolean.`);
      }
      return [key, entry];
    }),
  );
}

function validateExpectation(value: Record<string, unknown>): HarnessExpectation {
  return {
    status: optionalStatus(value.status, "expect.status"),
    receipt: validateReceiptExpectation(optionalRecord(value.receipt, "expect.receipt")),
    steps: optionalStringArray(value.steps, "expect.steps"),
  };
}

function validateReceiptExpectation(value: Record<string, unknown> | undefined): HarnessReceiptExpectation | undefined {
  if (!value) {
    return undefined;
  }
  return {
    kind: optionalReceiptKind(value.kind, "expect.receipt.kind"),
    status: optionalSuccessFailure(value.status, "expect.receipt.status"),
    subject: optionalRecord(value.subject, "expect.receipt.subject"),
  };
}

function validateEnv(value: Record<string, unknown>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (typeof entry !== "string") {
        throw new Error(`env.${key} must be a string.`);
      }
      return [key, entry];
    }),
  );
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required.`);
  }
  return value;
}

function optionalRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return value;
}

function optionalStatus(value: unknown, field: string): HarnessExpectation["status"] {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "success" || value === "failure" || value === "missing_context" || value === "policy_denied") {
    return value;
  }
  throw new Error(`${field} must be success, failure, missing_context, or policy_denied.`);
}

function optionalSuccessFailure(value: unknown, field: string): "success" | "failure" | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "success" || value === "failure") {
    return value;
  }
  throw new Error(`${field} must be success or failure.`);
}

function optionalReceiptKind(value: unknown, field: string): HarnessReceiptExpectation["kind"] {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "skill_execution" || value === "chain_execution") {
    return value;
  }
  throw new Error(`${field} must be skill_execution or chain_execution.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
