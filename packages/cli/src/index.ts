#!/usr/bin/env node

export const cliPackage = "@runxai/cli";

import { createInterface } from "node:readline/promises";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import { runHarness, runHarnessTarget } from "../../harness/src/index.js";
import { createFixtureMarketplaceAdapter, searchMarketplaceAdapters, type SkillSearchResult } from "../../marketplaces/src/index.js";
import { createFileMemoryStore } from "../../memory/src/index.js";
import {
  createFileRegistryStore,
  createLocalRegistryClient,
  publishSkillMarkdown,
  searchRegistry,
} from "../../registry/src/index.js";
import {
  installLocalSkill,
  inspectLocalReceipt,
  listLocalHistory,
  runLocalSkill,
  type Caller,
  type LocalReceiptSummary,
  type Question,
} from "../../runner-local/src/index.js";

export interface CliIo {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly stdin: NodeJS.ReadStream;
}

interface UiTheme {
  readonly on: boolean;
  readonly reset: string;
  readonly bold: string;
  readonly dim: string;
  readonly cyan: string;
  readonly magenta: string;
  readonly green: string;
  readonly red: string;
  readonly yellow: string;
  readonly gray: string;
}

function isTtyStream(stream: unknown): boolean {
  return typeof stream === "object" && stream !== null && (stream as { isTTY?: boolean }).isTTY === true;
}

function theme(stream: NodeJS.WritableStream | undefined = process.stdout, env: NodeJS.ProcessEnv = process.env): UiTheme {
  const on = isTtyStream(stream) && !env.NO_COLOR;
  const code = (seq: string) => (on ? seq : "");
  return {
    on,
    reset: code("\u001b[0m"),
    bold: code("\u001b[1m"),
    dim: code("\u001b[2m"),
    cyan: code("\u001b[38;5;117m"),
    magenta: code("\u001b[38;5;207m"),
    green: code("\u001b[38;5;42m"),
    red: code("\u001b[38;5;203m"),
    yellow: code("\u001b[38;5;221m"),
    gray: code("\u001b[38;5;244m"),
  };
}

function statusIcon(status: string, t: UiTheme): string {
  if (status === "success" || status === "verified" || status === "installed") return `${t.green}✓${t.reset}`;
  if (status === "failure" || status === "invalid" || status === "denied") return `${t.red}✗${t.reset}`;
  if (status === "needs_agent" || status === "needs_approval") return `${t.yellow}◇${t.reset}`;
  if (status === "unverified" || status === "unchanged") return `${t.dim}·${t.reset}`;
  return `${t.dim}·${t.reset}`;
}

function relativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

export interface CliServices {
  readonly connect?: ConnectService;
}

export interface ConnectService {
  readonly list: () => Promise<unknown>;
  readonly preprovision: (provider: string, scopes: readonly string[]) => Promise<unknown>;
  readonly revoke: (grantId: string) => Promise<unknown>;
}

interface CallerInputFile {
  readonly answers: Readonly<Record<string, unknown>>;
  readonly approvals?: boolean | Readonly<Record<string, boolean>>;
}

export interface ParsedArgs {
  readonly command?: string;
  readonly subcommand?: string;
  readonly skillAction?: "search" | "add" | "publish" | "inspect";
  readonly memoryAction?: "show";
  readonly searchQuery?: string;
  readonly skillRef?: string;
  readonly publishPath?: string;
  readonly receiptId?: string;
  readonly resumeReceiptId?: string;
  readonly skillPath?: string;
  readonly harnessPath?: string;
  readonly evolveObjective?: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly nonInteractive: boolean;
  readonly json: boolean;
  readonly answersPath?: string;
  readonly receiptDir?: string;
  readonly runner?: string;
  readonly memoryProject?: string;
  readonly sourceFilter?: string;
  readonly installVersion?: string;
  readonly installTo?: string;
  readonly publishOwner?: string;
  readonly publishVersion?: string;
  readonly registryUrl?: string;
  readonly expectedDigest?: string;
  readonly connectAction?: "list" | "revoke" | "preprovision";
  readonly connectProvider?: string;
  readonly connectGrantId?: string;
  readonly connectScopes: readonly string[];
  readonly configAction?: "set" | "get" | "list";
  readonly configKey?: string;
  readonly configValue?: string;
}

export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  io: CliIo = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
  env: NodeJS.ProcessEnv = process.env,
  services: CliServices = {},
): Promise<number> {
  if (isHelpRequest(argv)) {
    writeUsage(io.stdout, env);
    return 0;
  }

  const parsed = parseArgs(argv);

  if (!isSupportedCommand(parsed)) {
    writeUsage(io.stderr, env);
    return 64;
  }

  try {
    const callerInput = parsed.answersPath
      ? await readCallerInputFile(resolveUserPath(parsed.answersPath, env))
      : { answers: {} };
    const caller = parsed.nonInteractive
      ? createNonInteractiveCaller(callerInput.answers, callerInput.approvals)
      : createInteractiveCaller(io, callerInput.answers, callerInput.approvals);
    if (parsed.command === "harness" && parsed.harnessPath) {
      const result = await runHarnessTarget(resolveUserPath(parsed.harnessPath, env), { env });
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        io.stdout.write(renderHarnessResult(result));
      }
      for (const error of result.assertionErrors) {
        io.stderr.write(`${error}\n`);
      }
      return result.assertionErrors.length === 0 ? 0 : 1;
    }

    if (parsed.command === "connect" && parsed.connectAction) {
      if (!services.connect) {
        throw new Error("runx connect requires a configured connect service.");
      }
      const result =
        parsed.connectAction === "list"
          ? await services.connect.list()
          : parsed.connectAction === "revoke" && parsed.connectGrantId
            ? await services.connect.revoke(parsed.connectGrantId)
            : parsed.connectAction === "preprovision" && parsed.connectProvider
              ? await services.connect.preprovision(parsed.connectProvider, parsed.connectScopes)
              : undefined;

      if (!result) {
        throw new Error("Invalid runx connect invocation.");
      }
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify({ status: "success", connect: result }, null, 2)}\n`);
      } else {
        io.stdout.write(`${JSON.stringify(result)}\n`);
      }
      return 0;
    }

    if (parsed.command === "config" && parsed.configAction) {
      const result = await handleConfigCommand(parsed, env);
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify({ status: "success", config: result }, null, 2)}\n`);
      } else {
        io.stdout.write(`${renderConfigResult(result)}\n`);
      }
      return 0;
    }

    if (parsed.command === "skill" && parsed.skillAction === "search" && parsed.searchQuery) {
      const results = await runSkillSearch(parsed.searchQuery, parsed.sourceFilter, env);
      if (parsed.json) {
        io.stdout.write(
          `${JSON.stringify(
            {
              status: "success",
              query: parsed.searchQuery,
              source: parsed.sourceFilter ?? "all",
              results,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        io.stdout.write(renderSearchResults(results));
      }
      return 0;
    }

    if (parsed.command === "skill" && parsed.skillAction === "add" && parsed.skillRef) {
      const result = await installLocalSkill({
        ref: parsed.skillRef,
        registryStore: createFileRegistryStore(resolveRegistryDir(env, parsed.registryUrl)),
        marketplaceAdapters: env.RUNX_ENABLE_FIXTURE_MARKETPLACE === "1" ? [createFixtureMarketplaceAdapter()] : [],
        destinationRoot: resolveInstallDestinationRoot(parsed.installTo, env),
        version: parsed.installVersion,
        expectedDigest: parsed.expectedDigest,
        registryUrl: parsed.registryUrl,
      });
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify({ status: "success", install: result }, null, 2)}\n`);
      } else {
        const t = theme(io.stdout, env);
        const icon = statusIcon(result.status, t);
        io.stdout.write(
          `\n  ${icon}  ${t.bold}${result.skill_name}${t.reset}  ${t.dim}${result.status}${t.reset}\n  ${t.dim}${result.destination}${t.reset}\n\n`,
        );
      }
      return 0;
    }

    if (parsed.command === "skill" && parsed.skillAction === "publish" && parsed.publishPath) {
      const skillPackage = await readSkillPackage(resolveUserPath(parsed.publishPath, env));
      const result = await publishSkillMarkdown(
        createLocalRegistryClient(createFileRegistryStore(resolveRegistryDir(env, parsed.registryUrl))),
        skillPackage.markdown,
        {
          owner: parsed.publishOwner,
          version: parsed.publishVersion,
          registryUrl: parsed.registryUrl,
          xManifest: skillPackage.xManifest,
        },
      );
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify({ status: "success", publish: result }, null, 2)}\n`);
      } else {
        const t = theme(io.stdout, env);
        const icon = statusIcon(result.status, t);
        io.stdout.write(
          `\n  ${icon}  ${t.bold}${result.skill_id}${t.reset}${t.dim}@${result.version}${t.reset}  ${t.dim}${result.status}${t.reset}\n  ${t.dim}sha256:${result.digest}${t.reset}\n\n`,
        );
      }
      return 0;
    }

    if (parsed.command === "skill" && parsed.skillAction === "inspect" && parsed.receiptId) {
      const inspection = await inspectLocalReceipt({
        receiptId: parsed.receiptId,
        receiptDir: parsed.receiptDir ? resolveUserPath(parsed.receiptDir, env) : undefined,
        env,
      });
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify(inspection, null, 2)}\n`);
      } else {
        io.stdout.write(renderReceiptInspection(inspection.summary));
      }
      return 0;
    }

    if (parsed.command === "history") {
      const history = await listLocalHistory({
        receiptDir: parsed.receiptDir ? resolveUserPath(parsed.receiptDir, env) : undefined,
        env,
      });
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify({ status: "success", ...history }, null, 2)}\n`);
      } else {
        io.stdout.write(renderHistory(history.receipts));
      }
      return 0;
    }

    if (parsed.command === "memory" && parsed.memoryAction === "show") {
      const project = resolveUserPath(parsed.memoryProject ?? ".", env);
      const facts = await createFileMemoryStore(resolveMemoryDir(env)).listFacts({ project });
      const report = {
        status: "success",
        project,
        facts,
      };
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        io.stdout.write(renderMemoryFacts(project, facts));
      }
      return 0;
    }

    if (parsed.command === "evolve") {
      const evolveInputs: Record<string, unknown> = { ...parsed.inputs };
      if (parsed.evolveObjective !== undefined) {
        evolveInputs.objective = parsed.evolveObjective;
      }
      const result = await runLocalSkill({
        skillPath: resolveBundledSkillPath("evolve"),
        inputs: evolveInputs,
        answersPath: parsed.answersPath ? resolveUserPath(parsed.answersPath, env) : undefined,
        caller,
        env,
        receiptDir: parsed.receiptDir ? resolveUserPath(parsed.receiptDir, env) : undefined,
        runner: parsed.runner ?? (parsed.evolveObjective === undefined && !parsed.resumeReceiptId ? "introspect" : undefined),
        resumeFromRunId: parsed.resumeReceiptId,
      });

      if (result.status === "missing_context") {
        const report = {
          status: "missing_context",
          skill_path: resolveBundledSkillPath("evolve"),
          questions: result.questions,
        };
        if (parsed.json) {
          io.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
          return 0;
        }
        io.stdout.write(renderMissingContext("evolve", result.questions));
        return 2;
      }

      if (result.status === "needs_agent") {
        if (parsed.json) {
          io.stdout.write(
            `${JSON.stringify(
              {
                status: "needs_agent",
                skill: result.skill.name,
                run_id: result.runId,
                step_ids: result.stepIds,
                requests: result.requests,
              },
              null,
              2,
            )}\n`,
          );
        } else {
          io.stdout.write(renderNeedsAgent(result));
        }
        return 2;
      }

      if (result.status === "needs_approval") {
        if (parsed.json) {
          io.stdout.write(
            `${JSON.stringify(
              {
                status: "needs_approval",
                skill: result.skill.name,
                run_id: result.runId,
                step_ids: result.stepIds,
                gates: result.gates,
              },
              null,
              2,
            )}\n`,
          );
        } else {
          io.stdout.write(renderNeedsApproval(result));
        }
        return 2;
      }

      if (result.status === "policy_denied") {
        io.stderr.write(renderPolicyDenied(result.skill.name, result.reasons));
        return 1;
      }

      if (parsed.json) {
        io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        io.stdout.write(result.execution.stdout);
        if (result.execution.stderr) {
          io.stderr.write(result.execution.stderr);
        }
      }
      return result.status === "success" ? 0 : 1;
    }

    const result = await runLocalSkill({
      skillPath: resolveSkillReference(parsed.skillPath ?? "", env),
      inputs: parsed.inputs,
      answersPath: parsed.answersPath ? resolveUserPath(parsed.answersPath, env) : undefined,
      caller,
      env,
      receiptDir: parsed.receiptDir ? resolveUserPath(parsed.receiptDir, env) : undefined,
      runner: parsed.runner,
      resumeFromRunId: parsed.resumeReceiptId,
    });

    if (result.status === "missing_context") {
      const report = {
        status: "missing_context",
        skill_path: result.skillPath,
        questions: result.questions,
      };
      if (parsed.json) {
        io.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return 0;
      }
      io.stdout.write(renderMissingContext(path.basename(result.skillPath, path.extname(result.skillPath)), result.questions));
      return 2;
    }

    if (result.status === "needs_agent") {
      if (parsed.json) {
        io.stdout.write(
          `${JSON.stringify(
            {
              status: "needs_agent",
              skill: result.skill.name,
              run_id: result.runId,
              step_ids: result.stepIds,
              requests: result.requests,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        io.stdout.write(renderNeedsAgent(result));
      }
      return 2;
    }

    if (result.status === "needs_approval") {
      if (parsed.json) {
        io.stdout.write(
          `${JSON.stringify(
            {
              status: "needs_approval",
              skill: result.skill.name,
              run_id: result.runId,
              step_ids: result.stepIds,
              gates: result.gates,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        io.stdout.write(renderNeedsApproval(result));
      }
      return 2;
    }

    if (result.status === "policy_denied") {
      if (parsed.json) {
        const approvalRequired = parsed.nonInteractive && result.approval !== undefined;
        io.stdout.write(
          `${JSON.stringify(
            {
              status: approvalRequired ? "approval_required" : "policy_denied",
              skill: result.skill.name,
              reasons: result.reasons,
              approval: result.approval
                ? {
                    gate_id: result.approval.gate.id,
                    gate_type: result.approval.gate.type ?? "unspecified",
                    reason: result.approval.gate.reason,
                    summary: result.approval.gate.summary,
                    decision: result.approval.approved ? "approved" : "denied",
                  }
                : undefined,
              receipt_id: result.receipt?.id,
            },
            null,
            2,
          )}\n`,
        );
        return approvalRequired ? 2 : 1;
      }
      io.stderr.write(renderPolicyDenied(result.skill.name, result.reasons));
      return 1;
    }

    if (parsed.json) {
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      io.stdout.write(result.execution.stdout);
      if (result.execution.stderr) {
        io.stderr.write(result.execution.stderr);
      }
    }

    return result.status === "success" ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(renderCliError(message));
    return 1;
  }
}

function isHelpRequest(argv: readonly string[]): boolean {
  return argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h");
}

const BANNER_LINES = [
  "_______ __ __  ____ ___  ___",
  "\\_  __ \\  |  \\/    \\\\  \\/  /",
  " |  | \\/  |  /   |  \\>    < ",
  " |__|  |____/|___|  /__/\\_ \\",
  "                  \\/      \\/",
];

function writeBanner(stream: NodeJS.WritableStream, env: NodeJS.ProcessEnv): void {
  const t = theme(stream, env);
  const gradient = t.on
    ? ["\u001b[38;5;201m", "\u001b[38;5;207m", "\u001b[38;5;177m", "\u001b[38;5;147m", "\u001b[38;5;117m"]
    : ["", "", "", "", ""];
  const lines: string[] = [""];
  for (let i = 0; i < BANNER_LINES.length; i += 1) {
    lines.push(`  ${gradient[i]}${t.bold}${BANNER_LINES[i]}${t.reset}`);
  }
  lines.push("");
  stream.write(`${lines.join("\n")}\n`);
}

function writeUsage(stream: NodeJS.WritableStream, env: NodeJS.ProcessEnv = process.env): void {
  const t = theme(stream, env);
  const wantsBanner = t.on || env.RUNX_BANNER === "1";
  if (wantsBanner) {
    writeBanner(stream, env);
  }
  stream.write(
    [
      "Usage:",
      "  runx skill search <query> [--source registry|marketplace|fixture-marketplace] [--json]",
      "  runx skill add <ref> [--version version] [--to skills-dir] [--registry url] [--digest sha256] [--json]",
      "  runx skill publish <skill.md> [--owner owner] [--version version] [--registry url-or-path] [--json]",
      "  runx skill inspect <receipt-id> [--receipt-dir dir] [--json]",
      "  runx history [--receipt-dir dir] [--json]",
      "  runx memory show --project . [--json]",
      "  runx connect list|revoke <grant-id>|<provider> [--scope scope] [--json]",
      "  runx config set|get|list [agent.provider|agent.model|agent.api_key] [value] [--json]",
      "  runx skill <skill.md> [--runner runner-name] [--input value] [--non-interactive] [--json] [--answers answers.json]",
      "  runx evolve [objective] [--receipt run-id] [--non-interactive] [--json] [--answers answers.json]",
      "  runx harness <fixture.yaml|skill-dir|x.yaml> [--json]",
      "",
    ].join("\n"),
  );
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const inputs: Record<string, unknown> = {};
  let nonInteractive = false;
  let json = false;
  let answersPath: string | undefined;
  let receiptDir: string | undefined;
  let resumeReceiptId: string | undefined;
  let runner: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const knownKey = normalizeKnownFlag(rawKey);

    if (knownKey === "nonInteractive") {
      nonInteractive = true;
      continue;
    }

    if (knownKey === "json") {
      json = true;
      continue;
    }

    const next = nextValue(rest, index);
    const value = inlineValue ?? next;
    if (inlineValue === undefined && next !== "true") {
      index += 1;
    }

    if (knownKey === "answers") {
      answersPath = String(value);
      continue;
    }

    if (knownKey === "receiptDir") {
      receiptDir = String(value);
      continue;
    }

    if (knownKey === "receipt") {
      resumeReceiptId = String(value);
      continue;
    }

    if (knownKey === "runner") {
      runner = String(value);
      continue;
    }

    inputs[rawKey] = mergeInputValue(inputs[rawKey], value);
  }

  const isSkillSearch = command === "skill" && positionals[0] === "search";
  const isSkillAdd = command === "skill" && positionals[0] === "add";
  const isSkillPublish = command === "skill" && positionals[0] === "publish";
  const isSkillInspect = command === "skill" && positionals[0] === "inspect";
  const isMemoryShow = command === "memory" && positionals[0] === "show";
  const isConnect = command === "connect";
  const isConfig = command === "config";
  const memoryProject = isMemoryShow && typeof inputs.project === "string" ? inputs.project : undefined;
  const sourceFilter = isSkillSearch && typeof inputs.source === "string" ? inputs.source : undefined;
  const installVersion = isSkillAdd && typeof inputs.version === "string" ? inputs.version : undefined;
  const installTo = isSkillAdd && typeof inputs.to === "string" ? inputs.to : undefined;
  const publishOwner = isSkillPublish && typeof inputs.owner === "string" ? inputs.owner : undefined;
  const publishVersion = isSkillPublish && typeof inputs.version === "string" ? inputs.version : undefined;
  const registryUrl = (isSkillAdd || isSkillPublish) && typeof inputs.registry === "string" ? inputs.registry : undefined;
  const expectedDigest = isSkillAdd && typeof inputs.digest === "string" ? normalizeDigest(inputs.digest) : undefined;
  const connectScopes = isConnect ? normalizeScopes(inputs.scope) : [];
  const effectiveInputs = isSkillSearch
    ? omitInput(inputs, "source")
    : isSkillAdd
      ? omitInputs(inputs, ["version", "to", "registry", "digest"])
      : isSkillPublish
        ? omitInputs(inputs, ["version", "owner", "registry"])
        : isConnect
          ? omitInput(inputs, "scope")
          : isConfig
            ? {}
            : inputs;

  return {
    command,
    subcommand: positionals[0],
    skillAction: isSkillSearch ? "search" : isSkillAdd ? "add" : isSkillPublish ? "publish" : isSkillInspect ? "inspect" : undefined,
    memoryAction: isMemoryShow ? "show" : undefined,
    searchQuery: isSkillSearch ? positionals.slice(1).join(" ") || undefined : undefined,
    skillRef: isSkillAdd ? positionals.slice(1).join(" ") || undefined : undefined,
    publishPath: isSkillPublish ? positionals[1] : undefined,
    receiptId: isSkillInspect ? positionals[1] : undefined,
    skillPath: command === "skill" && !isSkillSearch && !isSkillAdd && !isSkillPublish && !isSkillInspect ? positionals[0] : undefined,
    harnessPath: command === "harness" ? positionals[0] : undefined,
    evolveObjective: command === "evolve" ? positionals.join(" ") || undefined : undefined,
    inputs: effectiveInputs,
    nonInteractive,
    json,
    answersPath,
    receiptDir,
    resumeReceiptId,
    runner,
    memoryProject,
    sourceFilter,
    installVersion,
    installTo,
    publishOwner,
    publishVersion,
    registryUrl,
    expectedDigest,
    connectAction: isConnect ? connectAction(positionals) : undefined,
    connectProvider: isConnect && positionals[0] !== "list" && positionals[0] !== "revoke" ? positionals[0] : undefined,
    connectGrantId: isConnect && positionals[0] === "revoke" ? positionals[1] : undefined,
    connectScopes,
    configAction: isConfig ? configAction(positionals) : undefined,
    configKey: isConfig ? positionals[1] : undefined,
    configValue: isConfig ? positionals.slice(2).join(" ") || undefined : undefined,
  };
}

function isSupportedCommand(parsed: ParsedArgs): boolean {
  if (parsed.command === "skill" && parsed.skillAction === "search" && parsed.searchQuery) {
    return true;
  }
  if (parsed.command === "skill" && parsed.skillAction === "add" && parsed.skillRef) {
    return true;
  }
  if (parsed.command === "skill" && parsed.skillAction === "publish" && parsed.publishPath) {
    return true;
  }
  if (parsed.command === "skill" && parsed.skillAction === "inspect" && parsed.receiptId) {
    return true;
  }
  if (parsed.command === "skill" && parsed.skillPath) {
    return true;
  }
  if (parsed.command === "evolve") {
    return true;
  }
  if (parsed.command === "history") {
    return true;
  }
  if (parsed.command === "memory" && parsed.memoryAction === "show") {
    return true;
  }
  if (parsed.command === "harness" && parsed.harnessPath) {
    return true;
  }
  if (parsed.command === "connect" && parsed.connectAction === "list") {
    return true;
  }
  if (parsed.command === "connect" && parsed.connectAction === "revoke" && parsed.connectGrantId) {
    return true;
  }
  if (parsed.command === "connect" && parsed.connectAction === "preprovision" && parsed.connectProvider) {
    return true;
  }
  if (parsed.command === "config" && parsed.configAction === "list") {
    return true;
  }
  if (parsed.command === "config" && parsed.configAction === "get" && parsed.configKey) {
    return true;
  }
  if (parsed.command === "config" && parsed.configAction === "set" && parsed.configKey && parsed.configValue !== undefined) {
    return true;
  }
  return false;
}

function nextValue(args: readonly string[], index: number): string {
  const next = args[index + 1];
  if (next === undefined || next.startsWith("--")) {
    return "true";
  }
  return next;
}

function omitInput(inputs: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> {
  const { [key]: _omitted, ...rest } = inputs;
  return rest;
}

function omitInputs(inputs: Readonly<Record<string, unknown>>, keys: readonly string[]): Readonly<Record<string, unknown>> {
  let rest = inputs;
  for (const key of keys) {
    rest = omitInput(rest, key);
  }
  return rest;
}

function mergeInputValue(existing: unknown, next: unknown): unknown {
  if (existing === undefined) {
    return next;
  }
  return Array.isArray(existing) ? [...existing, next] : [existing, next];
}

interface RunStateSummary {
  readonly skill: { readonly name: string };
  readonly runId: string;
  readonly stepIds?: readonly string[];
}

function renderNeedsAgent(result: RunStateSummary & { readonly requests: readonly { readonly id: string }[] }): string {
  const t = theme();
  const icon = statusIcon("needs_agent", t);
  const steps = (result.stepIds ?? []).join(", ");
  const requestIds = result.requests.map((r) => r.id).join(", ");
  return (
    `\n  ${icon}  ${t.bold}${result.skill.name}${t.reset}  ${t.dim}needs an agent${t.reset}\n` +
    `  ${t.dim}run${t.reset}       ${shortId(result.runId)}\n` +
    `  ${t.dim}step${t.reset}      ${steps}\n` +
    `  ${t.dim}requests${t.reset}  ${requestIds}\n\n` +
    `  ${t.dim}This step needs a hosted agent or \`--answers\` input. Re-run with \`--json\` to see the full envelope.${t.reset}\n\n`
  );
}

function renderNeedsApproval(
  result: RunStateSummary & { readonly gates: readonly { readonly id: string; readonly reason?: string }[] },
): string {
  const t = theme();
  const icon = statusIcon("needs_approval", t);
  const lines: string[] = [""];
  lines.push(`  ${icon}  ${t.bold}${result.skill.name}${t.reset}  ${t.dim}needs approval${t.reset}`);
  lines.push(`  ${t.dim}run${t.reset}   ${shortId(result.runId)}`);
  lines.push("");
  for (const gate of result.gates) {
    lines.push(`  ${t.yellow}◇${t.reset}  ${t.bold}${gate.id}${t.reset}`);
    if (gate.reason) lines.push(`     ${t.dim}${gate.reason}${t.reset}`);
  }
  lines.push("");
  lines.push(`  ${t.dim}Re-run interactively to approve, or pass \`--answers\` with approval decisions.${t.reset}`);
  lines.push("");
  return lines.join("\n");
}

function renderPolicyDenied(skillName: string, reasons: readonly string[]): string {
  const t = theme(process.stderr);
  const icon = statusIcon("denied", t);
  const lines = [""];
  lines.push(`  ${icon}  ${t.bold}${skillName}${t.reset}  ${t.dim}policy denied${t.reset}`);
  for (const reason of reasons) {
    lines.push(`  ${t.dim}·${t.reset} ${reason}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderMissingContext(skillName: string, questions: readonly { id: string; prompt: string }[]): string {
  const t = theme();
  const icon = statusIcon("needs_agent", t);
  const lines = [""];
  lines.push(`  ${icon}  ${t.bold}${skillName}${t.reset}  ${t.dim}needs more context${t.reset}`);
  for (const question of questions) {
    lines.push(`  ${t.dim}·${t.reset} ${question.prompt} ${t.dim}(${question.id})${t.reset}`);
  }
  lines.push("");
  lines.push(`  ${t.dim}Re-run interactively or pass --input ${t.reset}${t.cyan}<key>=<value>${t.reset}${t.dim}.${t.reset}`);
  lines.push("");
  return lines.join("\n");
}

function renderCliError(message: string): string {
  const t = theme(process.stderr);
  const icon = statusIcon("failure", t);
  let hint = "";
  if (/ENOENT.*SKILL\.md/i.test(message) && !/Try/.test(message)) {
    hint = `\n  ${t.dim}Pass a skill name or directory path.${t.reset}`;
  }
  return `\n  ${icon}  ${message}${hint}\n\n`;
}

function renderHarnessResult(
  result:
    | Awaited<ReturnType<typeof runHarness>>
    | Awaited<ReturnType<typeof runHarnessTarget>>,
): string {
  const t = theme();
  if ("cases" in result) {
    const icon = statusIcon(result.status, t);
    const lines = [
      "",
      `  ${icon}  ${t.bold}harness suite${t.reset}  ${t.dim}${result.cases.length} case(s) · ${result.assertionErrors.length} assertion error(s)${t.reset}`,
      "",
    ];
    for (const entry of result.cases) {
      lines.push(
        `  ${statusIcon(entry.status, t)}  ${entry.fixture.name}  ${t.dim}${entry.assertionErrors.length} error(s)${t.reset}`,
      );
    }
    lines.push("");
    return lines.join("\n");
  }
  const icon = statusIcon(result.status, t);
  return `\n  ${icon}  ${t.bold}${result.fixture.name}${t.reset}  ${t.dim}${result.assertionErrors.length} assertion error(s)${t.reset}\n\n`;
}

function normalizeKnownFlag(rawKey: string): string {
  return rawKey.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

interface LocalSkillPackage {
  readonly markdown: string;
  readonly xManifest?: string;
}

function resolveBundledSkillPath(skillName: string): string {
  const bundledDir = resolveBundledSkillsDir();
  if (bundledDir) {
    const candidate = path.join(bundledDir, skillName);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Bundled skill not found: ${skillName}. The @runxai/cli package may be missing its \`skills/\` assets.`);
}

async function readSkillPackage(skillPath: string): Promise<LocalSkillPackage> {
  const resolvedPath = path.resolve(skillPath);
  const pathStat = await stat(resolvedPath);
  const markdownPath = pathStat.isDirectory() ? path.join(resolvedPath, "SKILL.md") : resolvedPath;
  const xManifestPath = pathStat.isDirectory()
    ? path.join(resolvedPath, "x.yaml")
    : path.basename(resolvedPath).toLowerCase() === "skill.md"
      ? path.join(path.dirname(resolvedPath), "x.yaml")
      : path.join(path.dirname(resolvedPath), `${path.basename(resolvedPath, path.extname(resolvedPath))}.x.yaml`);
  return {
    markdown: await readFile(markdownPath, "utf8"),
    xManifest: await readOptionalFile(xManifestPath),
  };
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

async function runSkillSearch(
  query: string,
  sourceFilter: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<readonly SkillSearchResult[]> {
  const results: SkillSearchResult[] = [];
  const normalizedSource = sourceFilter?.trim().toLowerCase();

  if (!normalizedSource || normalizedSource === "registry" || normalizedSource === "runx-registry") {
    results.push(
      ...(await searchRegistry(createFileRegistryStore(resolveRegistryDir(env)), query, {
        registryUrl: env.RUNX_REGISTRY_URL,
      })),
    );
  }

  const marketplaceAdapters =
    env.RUNX_ENABLE_FIXTURE_MARKETPLACE === "1" &&
    (!normalizedSource || normalizedSource === "marketplace" || normalizedSource === "fixture-marketplace")
      ? [createFixtureMarketplaceAdapter()]
      : [];
  results.push(...(await searchMarketplaceAdapters(marketplaceAdapters, query)));

  if (!normalizedSource || normalizedSource === "bundled" || normalizedSource === "builtin") {
    results.push(...(await searchBundledSkills(query)));
  }

  return results;
}

async function searchBundledSkills(query: string): Promise<readonly SkillSearchResult[]> {
  const bundledDir = resolveBundledSkillsDir();
  if (!bundledDir || !existsSync(bundledDir)) return [];
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(bundledDir, { withFileTypes: true });
  const needle = query.trim().toLowerCase();
  const out: SkillSearchResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(bundledDir, entry.name, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;
    const raw = await readFile(skillMdPath, "utf8");
    const { name, description } = parseSkillFrontmatter(raw, entry.name);
    const hay = `${name}\n${description}`.toLowerCase();
    if (needle && !hay.includes(needle)) continue;
    const hasXManifest = existsSync(path.join(bundledDir, entry.name, "x.yaml"));
    out.push({
      skill_id: `runx/${name}`,
      name,
      summary: description,
      owner: "runx",
      source: "runx-registry",
      source_label: "runx (bundled)",
      source_type: "bundled",
      trust_tier: "runx-derived",
      required_scopes: [],
      tags: [],
      runner_mode: hasXManifest ? "x-manifest" : "standard-only",
      runner_names: [],
      add_command: `runx skill add runx/${name}`,
      run_command: `runx skill ${name}`,
    });
  }
  return out;
}

let cachedBundledSkillsDir: string | undefined | null = null;

function resolveBundledSkillsDir(): string | undefined {
  if (cachedBundledSkillsDir !== null) return cachedBundledSkillsDir ?? undefined;
  try {
    // Walk up from the compiled entry looking for the @runxai/cli package root,
    // which owns a `skills/` sibling. Works across dev (src/), dist wrapper,
    // and nested-dist layouts without sentinel files.
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i += 1) {
      const pkgJsonPath = path.join(dir, "package.json");
      if (existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
          if (pkg && pkg.name === "@runxai/cli") {
            const skills = path.join(dir, "skills");
            cachedBundledSkillsDir = existsSync(skills) ? skills : undefined;
            return cachedBundledSkillsDir ?? undefined;
          }
        } catch {
          // ignore and keep walking
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    cachedBundledSkillsDir = undefined;
    return undefined;
  } catch {
    cachedBundledSkillsDir = undefined;
    return undefined;
  }
}

function resolveSkillReference(ref: string, env: NodeJS.ProcessEnv): string {
  if (!ref) {
    throw new Error("Missing skill reference.");
  }
  // Treat anything that looks like a path (contains a separator, leading dot, or
  // tilde) or that actually exists on disk as a direct filesystem reference.
  const looksLikePath = ref.includes("/") || ref.includes(path.sep) || ref.startsWith(".") || ref.startsWith("~");
  if (looksLikePath) {
    return resolveUserPath(ref, env);
  }
  const directCandidate = resolveUserPath(ref, env);
  if (existsSync(directCandidate)) {
    return directCandidate;
  }
  const bundled = resolveBundledSkillsDir();
  if (bundled) {
    const named = path.join(bundled, ref);
    if (existsSync(path.join(named, "SKILL.md")) || existsSync(`${named}.md`)) {
      return existsSync(path.join(named, "SKILL.md")) ? named : `${named}.md`;
    }
  }
  throw new Error(`Skill not found: ${ref}. Try \`runx skill search ${ref}\` to discover available skills.`);
}

function parseSkillFrontmatter(raw: string, fallbackName: string): { name: string; description: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  let name = fallbackName;
  let description = "";
  if (match) {
    for (const line of match[1].split("\n")) {
      const kv = line.match(/^(name|description):\s*(.*)$/);
      if (!kv) continue;
      const value = kv[2].trim().replace(/^["']|["']$/g, "");
      if (kv[1] === "name") name = value || fallbackName;
      else if (kv[1] === "description") description = value;
    }
  }
  return { name, description };
}

function resolveRegistryDir(env: NodeJS.ProcessEnv, registry?: string): string {
  if (registry && isRemoteRegistryUrl(registry) && !env.RUNX_REGISTRY_DIR) {
    throw new Error("Remote registry transport is not implemented in CE; set RUNX_REGISTRY_DIR for local-backed registry tests.");
  }
  if (registry && !isRemoteRegistryUrl(registry)) {
    return registry.startsWith("file://") ? fileURLToPath(registry) : resolveUserPath(registry, env);
  }
  return env.RUNX_REGISTRY_DIR
    ? resolveUserPath(env.RUNX_REGISTRY_DIR, env)
    : path.resolve(env.RUNX_CWD ?? findWorkspaceRoot(process.cwd()) ?? env.INIT_CWD ?? process.cwd(), ".runx", "registry");
}

function resolveInstallDestinationRoot(to: string | undefined, env: NodeJS.ProcessEnv): string {
  return to
    ? resolveUserPath(to, env)
    : path.resolve(env.RUNX_CWD ?? findWorkspaceRoot(process.cwd()) ?? env.INIT_CWD ?? process.cwd(), "skills");
}

function normalizeDigest(value: string): string {
  return value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
}

function normalizeScopes(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.filter((scope): scope is string => typeof scope === "string" && scope.length > 0).flatMap(splitScopes);
  }
  if (typeof value === "string" && value !== "true") {
    return splitScopes(value);
  }
  return [];
}

function splitScopes(value: string): readonly string[] {
  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function connectAction(positionals: readonly string[]): ParsedArgs["connectAction"] {
  if (positionals[0] === "list") {
    return "list";
  }
  if (positionals[0] === "revoke") {
    return "revoke";
  }
  return positionals[0] ? "preprovision" : undefined;
}

function configAction(positionals: readonly string[]): ParsedArgs["configAction"] {
  if (positionals[0] === "set" || positionals[0] === "get" || positionals[0] === "list") {
    return positionals[0];
  }
  return undefined;
}

interface RunxConfigFile {
  readonly agent?: {
    readonly provider?: string;
    readonly model?: string;
    readonly api_key_ref?: string;
  };
}

type ConfigResult =
  | { readonly action: "set"; readonly key: string; readonly value: unknown }
  | { readonly action: "get"; readonly key: string; readonly value: unknown }
  | { readonly action: "list"; readonly values: RunxConfigFile };

async function handleConfigCommand(parsed: ParsedArgs, env: NodeJS.ProcessEnv): Promise<ConfigResult> {
  const configDir = resolveRunxDir(env);
  const configPath = path.join(configDir, "config.json");
  const config = await readRunxConfig(configPath);

  if (parsed.configAction === "list") {
    return { action: "list", values: redactConfig(config) };
  }
  if (!parsed.configKey) {
    throw new Error("config key is required.");
  }
  if (parsed.configAction === "get") {
    return {
      action: "get",
      key: parsed.configKey,
      value: readConfigValue(config, parsed.configKey),
    };
  }
  if (parsed.configAction === "set") {
    if (parsed.configValue === undefined) {
      throw new Error("config value is required.");
    }
    const next = await setConfigValue(config, parsed.configKey, parsed.configValue, configDir);
    await writeRunxConfig(configPath, next);
    return {
      action: "set",
      key: parsed.configKey,
      value: readConfigValue(redactConfig(next), parsed.configKey),
    };
  }
  throw new Error("Invalid config invocation.");
}

async function readRunxConfig(configPath: string): Promise<RunxConfigFile> {
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as RunxConfigFile;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function writeRunxConfig(configPath: string, config: RunxConfigFile): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

async function setConfigValue(
  config: RunxConfigFile,
  key: string,
  value: string,
  configDir: string,
): Promise<RunxConfigFile> {
  if (key === "agent.provider") {
    return { ...config, agent: { ...config.agent, provider: value } };
  }
  if (key === "agent.model") {
    return { ...config, agent: { ...config.agent, model: value } };
  }
  if (key === "agent.api_key") {
    return {
      ...config,
      agent: {
        ...config.agent,
        api_key_ref: await storeLocalAgentApiKey(configDir, value),
      },
    };
  }
  throw new Error(`Unsupported config key: ${key}`);
}

function readConfigValue(config: RunxConfigFile, key: string): unknown {
  if (key === "agent.provider") {
    return config.agent?.provider;
  }
  if (key === "agent.model") {
    return config.agent?.model;
  }
  if (key === "agent.api_key") {
    return config.agent?.api_key_ref ? "[encrypted]" : undefined;
  }
  throw new Error(`Unsupported config key: ${key}`);
}

function redactConfig(config: RunxConfigFile): RunxConfigFile {
  return config.agent?.api_key_ref
    ? { ...config, agent: { ...config.agent, api_key_ref: "[encrypted]" } }
    : config;
}

async function storeLocalAgentApiKey(configDir: string, apiKey: string): Promise<string> {
  const keyDir = path.join(configDir, "keys");
  await mkdir(keyDir, { recursive: true });
  const encryptionKey = createHash("sha256").update(await loadOrCreateLocalConfigSecret(keyDir)).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ref = `local_agent_key_${createHash("sha256").update(`${iv.toString("hex")}:${Date.now()}`).digest("hex").slice(0, 24)}`;
  await writeFile(
    path.join(keyDir, `${ref}.json`),
    `${JSON.stringify(
      {
        ref,
        alg: "aes-256-gcm",
        iv: iv.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
        auth_tag: authTag.toString("base64url"),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  return ref;
}

async function loadOrCreateLocalConfigSecret(keyDir: string): Promise<string> {
  const keyPath = path.join(keyDir, "local-config-secret");
  try {
    return await readFile(keyPath, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
    const secret = randomBytes(32).toString("base64url");
    try {
      await writeFile(keyPath, secret, { mode: 0o600, flag: "wx" });
      return secret;
    } catch (writeError) {
      if (isNodeError(writeError) && writeError.code === "EEXIST") {
        return await readFile(keyPath, "utf8");
      }
      throw writeError;
    }
  }
}

function renderConfigResult(result: ConfigResult): string {
  const t = theme();
  if (result.action === "list") {
    const entries = Object.entries(result.values ?? {});
    if (entries.length === 0) return `\n  ${t.dim}No config values set.${t.reset}\n\n`;
    const keyWidth = Math.max(...entries.map(([k]) => k.length));
    const lines = [""];
    for (const [key, value] of entries) {
      lines.push(`  ${t.bold}${key.padEnd(keyWidth)}${t.reset}  ${String(value ?? "")}`);
    }
    lines.push("");
    return lines.join("\n");
  }
  const value = String(result.value ?? "");
  return `\n  ${t.bold}${result.key}${t.reset}  ${value}\n`;
}

function isRemoteRegistryUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function renderSearchResults(results: readonly SkillSearchResult[]): string {
  const t = theme();
  if (results.length === 0) {
    return `\n  ${t.dim}No skills found.${t.reset}\n\n`;
  }
  const lines: string[] = [""];
  for (const result of results) {
    const tier = result.source_type === "bundled" ? "bundled" : result.source;
    lines.push(`  ${t.magenta}${t.bold}${result.skill_id}${t.reset}  ${t.dim}· ${tier}${t.reset}`);
    if (result.summary) {
      lines.push(`  ${t.dim}${result.summary}${t.reset}`);
    }
    lines.push(`  ${t.cyan}${result.run_command}${t.reset}`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderReceiptInspection(summary: LocalReceiptSummary): string {
  const t = theme();
  const icon = statusIcon(summary.status, t);
  const source = summary.sourceType ? ` ${t.dim}· ${summary.sourceType}${t.reset}` : "";
  const verification = renderVerificationBadge(summary.verification, t);
  const when = summary.startedAt ? `  ${t.dim}${relativeTime(summary.startedAt)}${t.reset}` : "";
  return (
    `\n  ${icon}  ${t.bold}${summary.name}${t.reset}  ${t.dim}${summary.kind}${t.reset}${source}${when}\n` +
    `  ${t.dim}${summary.id}${t.reset}${verification}\n\n`
  );
}

function renderHistory(receipts: readonly LocalReceiptSummary[]): string {
  const t = theme();
  if (receipts.length === 0) {
    return `\n  ${t.dim}No receipts yet. Run a skill to produce one:${t.reset}\n  ${t.cyan}runx skill search${t.reset}\n\n`;
  }
  const now = Date.now();
  const nameWidth = Math.min(32, Math.max(...receipts.map((r) => r.name.length)));
  const lines: string[] = [""];
  for (const summary of receipts) {
    const icon = statusIcon(summary.status, t);
    const name = summary.name.padEnd(nameWidth);
    const when = summary.startedAt ? relativeTime(summary.startedAt, now) : "";
    const source = summary.sourceType ?? summary.kind;
    const id = shortId(summary.id);
    lines.push(
      `  ${icon}  ${t.bold}${name}${t.reset}  ${t.dim}${source.padEnd(16)}${t.reset}  ${t.dim}${when.padEnd(10)}${t.reset}  ${t.dim}${id}${t.reset}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderVerificationBadge(verification: LocalReceiptSummary["verification"] | undefined, t: UiTheme): string {
  if (!verification) return "";
  const color = verification.status === "verified" ? t.green : verification.status === "invalid" ? t.red : t.dim;
  const reason = verification.reason ? ` ${t.dim}(${verification.reason})${t.reset}` : "";
  return `  ${color}${verification.status}${t.reset}${reason}`;
}

function renderMemoryFacts(
  project: string,
  facts: readonly {
    readonly key: string;
    readonly value: unknown;
    readonly scope: string;
    readonly source: string;
    readonly confidence: number;
    readonly freshness: string;
    readonly receipt_id?: string;
  }[],
): string {
  const t = theme();
  if (facts.length === 0) {
    return `\n  ${t.dim}No memory facts for ${project}.${t.reset}\n\n`;
  }
  const keyWidth = Math.min(32, Math.max(...facts.map((f) => f.key.length)));
  const lines: string[] = [""];
  lines.push(`  ${t.dim}${project}${t.reset}`);
  lines.push("");
  for (const fact of facts) {
    const value = typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value);
    lines.push(
      `  ${t.bold}${fact.key.padEnd(keyWidth)}${t.reset}  ${value}  ${t.dim}· ${fact.scope}/${fact.source} ${fact.freshness}${t.reset}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function resolveUserPath(userPath: string, env: NodeJS.ProcessEnv): string {
  if (path.isAbsolute(userPath)) {
    return userPath;
  }

  for (const base of [env.RUNX_CWD, env.INIT_CWD, findWorkspaceRoot(process.cwd()), process.cwd()]) {
    if (!base) {
      continue;
    }
    const candidate = path.resolve(base, userPath);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(env.RUNX_CWD ?? findWorkspaceRoot(process.cwd()) ?? env.INIT_CWD ?? process.cwd(), userPath);
}

function resolveMemoryDir(env: NodeJS.ProcessEnv): string {
  return env.RUNX_MEMORY_DIR
    ? resolveUserPath(env.RUNX_MEMORY_DIR, env)
    : path.resolve(env.RUNX_CWD ?? findWorkspaceRoot(process.cwd()) ?? env.INIT_CWD ?? process.cwd(), ".runx", "memory");
}

function resolveRunxDir(env: NodeJS.ProcessEnv): string {
  return env.RUNX_HOME
    ? resolveUserPath(env.RUNX_HOME, env)
    : path.resolve(env.RUNX_CWD ?? findWorkspaceRoot(process.cwd()) ?? env.INIT_CWD ?? process.cwd(), ".runx");
}

function findWorkspaceRoot(start: string): string | undefined {
  let current = start;
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function createNonInteractiveCaller(
  answers: Readonly<Record<string, unknown>> = {},
  approvals?: boolean | Readonly<Record<string, boolean>>,
): Caller {
  return {
    answer: async (questions) => pickAnswers(questions, answers),
    approve: async (gate) => resolveApproval(gate.id, approvals) ?? false,
    resolveAgentResult: async (request) => answers[request.id],
    resolveApproval: async (gate) => resolveApproval(gate.id, approvals),
    report: () => undefined,
  };
}

function createInteractiveCaller(
  io: CliIo,
  answers: Readonly<Record<string, unknown>> = {},
  approvals?: boolean | Readonly<Record<string, boolean>>,
): Caller {
  return {
    answer: async (questions) => askQuestions(questions, io, answers),
    approve: async (gate) => approveGate(gate, io, approvals),
    resolveAgentResult: async (request) => answers[request.id],
    resolveApproval: async (gate) => resolveApproval(gate.id, approvals) ?? await approveGate(gate, io, approvals),
    report: () => undefined,
  };
}

async function approveGate(
  gate: { readonly id: string; readonly reason: string },
  io: CliIo,
  approvals?: boolean | Readonly<Record<string, boolean>>,
): Promise<boolean> {
  const provided = resolveApproval(gate.id, approvals);
  if (provided !== undefined) {
    return provided;
  }

  const rl = createInterface({
    input: io.stdin,
    output: io.stdout,
  });

  try {
    const answer = (
      await rl.question(`${gate.reason}\nApproval gate ${gate.id}. Approve? Type 'yes' to approve [y/N]: `)
    )
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

function resolveApproval(
  gateId: string,
  approvals?: boolean | Readonly<Record<string, boolean>>,
): boolean | undefined {
  if (typeof approvals === "boolean") {
    return approvals;
  }
  return approvals?.[gateId];
}

async function askQuestions(
  questions: readonly Question[],
  io: CliIo,
  answers: Readonly<Record<string, unknown>> = {},
): Promise<Record<string, unknown>> {
  const provided = pickAnswers(questions, answers);
  const unanswered = questions.filter((question) => provided[question.id] === undefined);
  if (unanswered.length === 0) {
    return provided;
  }

  const t = theme(io.stdout);
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  io.stdout.write(`\n  ${t.magenta}runx${t.reset} ${t.dim}needs a little context${t.reset}\n\n`);

  try {
    const collected: Record<string, unknown> = { ...provided };
    for (const question of unanswered) {
      const defaultValue = inferQuestionDefault(question);
      const label = question.description ?? question.prompt;
      const hint = defaultValue
        ? ` ${t.dim}(${defaultValue})${t.reset}`
        : question.required
          ? ` ${t.dim}(required)${t.reset}`
          : "";
      io.stdout.write(`  ${t.bold}${label}${t.reset}${hint}\n`);
      const answer = (await rl.question(`  ${t.cyan}›${t.reset} `)).trim();
      collected[question.id] = answer || defaultValue || "";
      io.stdout.write("\n");
    }
    return collected;
  } finally {
    rl.close();
  }
}

function inferQuestionDefault(question: Question): string | undefined {
  const label = `${question.id} ${question.prompt} ${question.description ?? ""}`.toLowerCase();
  if (question.id === "project" || /project\s+root|repo\s+root|working\s+directory/.test(label)) {
    return process.cwd();
  }
  return undefined;
}

function pickAnswers(
  questions: readonly Question[],
  answers: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    questions
      .filter((question) => answers[question.id] !== undefined)
      .map((question) => [question.id, answers[question.id]]),
  );
}

async function readCallerInputFile(answersPath: string): Promise<CallerInputFile> {
  const parsed = JSON.parse(await readFile(answersPath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("--answers file must contain a JSON object.");
  }
  if (parsed.answers === undefined && parsed.approvals === undefined) {
    return {
      answers: parsed,
    };
  }
  if (parsed.answers !== undefined && !isRecord(parsed.answers)) {
    throw new Error("--answers answers field must be an object.");
  }
  return {
    answers: parsed.answers === undefined ? {} : parsed.answers,
    approvals: validateCallerApprovals(parsed.approvals),
  };
}

function validateCallerApprovals(value: unknown): boolean | Readonly<Record<string, boolean>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (!isRecord(value)) {
    throw new Error("--answers approvals field must be a boolean or object.");
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, approval]) => {
      if (typeof approval !== "boolean") {
        throw new Error(`--answers approvals.${key} must be a boolean.`);
      }
      return [key, approval];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const exitCode = await runCli(process.argv.slice(2), {
    stdin: processStdin,
    stdout: processStdout,
    stderr: process.stderr,
  });
  process.exitCode = exitCode;
}
