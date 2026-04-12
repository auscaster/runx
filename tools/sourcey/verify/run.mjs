import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");

function requiredString(name) {
  const value = inputs[name];
  if (value === undefined || value === null || value === "") {
    throw new Error(`${name} is required.`);
  }
  return String(value);
}

const inputBase = process.env.RUNX_CWD || process.env.INIT_CWD || process.cwd();
const outputDir = path.resolve(inputBase, requiredString("output_dir"));
const indexPath = path.resolve(outputDir, String(inputs.index_path || "index.html"));
if (!existsSync(indexPath)) {
  throw new Error(`Sourcey output is missing index.html at ${indexPath}`);
}

const contents = readFileSync(indexPath, "utf8");
process.stdout.write(
  JSON.stringify({
    output_dir: outputDir,
    index_path: indexPath,
    verified: true,
    contains_doctype: /<!doctype html>/i.test(contents),
  }),
);
