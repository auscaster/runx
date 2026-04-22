import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const explicitProjections = Array.isArray(inputs.reflect_projections) ? inputs.reflect_projections : undefined;
const skillFilter = typeof inputs.skill_filter === "string" && inputs.skill_filter.trim()
  ? inputs.skill_filter.trim()
  : undefined;
const sinceMs = typeof inputs.since === "string" && inputs.since.trim()
  ? Date.parse(inputs.since)
  : undefined;

let projections = explicitProjections;
if (!projections) {
  const project =
    process.env.RUNX_PROJECT
    ?? process.env.RUNX_CWD
    ?? process.env.INIT_CWD
    ?? process.cwd();
  const cliEntry = fileURLToPath(new URL("../../packages/cli/src/index.ts", import.meta.url));
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", cliEntry, "knowledge", "show", "--project", project, "--json"],
    {
      env: process.env,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "knowledge query failed");
  }
  const report = JSON.parse(result.stdout || "{}");
  projections = Array.isArray(report.projections) ? report.projections : [];
}

const filteredProjections = projections
  .filter((entry) => entry && entry.entry_kind === "projection" && entry.scope === "reflect")
  .filter((entry) => !skillFilter || entry?.value?.skill_ref === skillFilter)
  .filter((entry) => {
    if (sinceMs === undefined) {
      return true;
    }
    const createdAt = typeof entry.created_at === "string" ? Date.parse(entry.created_at) : NaN;
    return Number.isFinite(createdAt) && createdAt >= sinceMs;
  });

process.stdout.write(JSON.stringify({
  reflect_projections_packet: {
    items: filteredProjections,
  },
}));
