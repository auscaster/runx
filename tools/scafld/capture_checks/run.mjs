import { spawnSync } from "node:child_process";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const scafld = String(inputs.scafld_bin || process.env.SCAFLD_BIN || "scafld");
const cwd = path.resolve(String(
  inputs.fixture
    || inputs.cwd
    || process.env.RUNX_CWD
    || process.cwd()
));
const taskId = String(inputs.task_id || inputs.taskId || "");

if (!taskId) {
  throw new Error("task_id is required.");
}

const env = { ...process.env };
delete env.RUNX_INPUTS_JSON;
for (const key of Object.keys(env)) {
  if (key.startsWith("RUNX_INPUT_")) {
    delete env[key];
  }
}
if (path.isAbsolute(scafld) || scafld.includes(path.sep)) {
  env.PATH = `${path.dirname(scafld)}${path.delimiter}${env.PATH || "/usr/local/bin:/usr/bin:/bin"}`;
}

const result = spawnSync(scafld, ["checks", taskId, "--json"], {
  cwd,
  env,
  encoding: "utf8",
  shell: false,
});

if (result.error) {
  throw result.error;
}

const stdout = result.stdout ?? "";
const stderr = result.stderr ?? "";
const payload = parseJsonPayload(stdout);

const output = {
  ...payload,
  native_exit_code: result.status ?? 1,
};
if (stderr) {
  output.native_stderr = stderr;
}

process.stdout.write(JSON.stringify(output));

function parseJsonPayload(rawStdout) {
  const trimmed = rawStdout.trim();
  if (!trimmed) {
    throw new Error("scafld checks produced no JSON output");
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("scafld checks JSON payload must be an object");
    }
    return parsed;
  } catch (error) {
    const preview = trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `scafld checks did not emit a usable JSON payload. ${message}. Output preview: ${preview}`,
    );
  }
}
