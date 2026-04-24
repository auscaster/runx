import type { Writable } from "node:stream";

import { runCli, type CliIo } from "@runxhq/cli";

export type RunCliLike = (
  argv: readonly string[],
  io?: CliIo,
  env?: NodeJS.ProcessEnv,
) => Promise<number>;

const usageLines = [
  "Usage:",
  "  npm create @runxhq/skill@latest <name> [-- --directory dir]",
  "  runx new <name> [--directory dir]",
  "",
  "Notes:",
  "  runx new is the canonical command.",
  "  The create package is a thin cold-start alias over the same scaffolder.",
];

export function writeCreateSkillUsage(stream: Writable): void {
  stream.write(`${usageLines.join("\n")}\n`);
}

export async function runCreateSkill(
  argv: readonly string[] = process.argv.slice(2),
  io: CliIo = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
  env: NodeJS.ProcessEnv = process.env,
  runCliImpl: RunCliLike = runCli,
): Promise<number> {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    writeCreateSkillUsage(io.stdout);
    return 0;
  }
  if (argv.length === 0) {
    writeCreateSkillUsage(io.stderr);
    return 64;
  }
  return await runCliImpl(["new", ...argv], io, env);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  process.exitCode = await runCreateSkill();
}
