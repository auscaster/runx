import { spawnSync } from "node:child_process";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const command = String(inputs.command || "");
if (!command) {
  throw new Error("command is required.");
}

const args = Array.isArray(inputs.args) ? inputs.args.map((value) => String(value)) : [];
const helpFlag = String(inputs.help_flag || "--help");
const cwd = path.resolve(String(inputs.cwd || inputs.repo_root || process.env.RUNX_CWD || process.cwd()));
const result = spawnSync(command, [...args, helpFlag], {
  cwd,
  encoding: "utf8",
  shell: false,
});

if (result.error) {
  throw result.error;
}

process.stdout.write(JSON.stringify({
  command,
  args,
  help_flag: helpFlag,
  cwd,
  stdout: result.stdout ?? "",
  stderr: result.stderr ?? "",
  exit_code: result.status ?? 0,
}));

if ((result.status ?? 0) !== 0) {
  process.exit(result.status ?? 1);
}
