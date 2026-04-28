import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isNotFound, isRecord } from "@runxhq/core/util";

export {
  ensureRunxInstallState,
  readRunxInstallState,
  type RunxInstallState,
} from "@runxhq/runtime-local/sdk";

export interface RunxProjectState {
  readonly version: 1;
  readonly project_id: string;
  readonly created_at: string;
}

export async function readRunxProjectState(projectDir: string): Promise<RunxProjectState | undefined> {
  const projectPath = path.join(projectDir, "project.json");
  let contents: string;
  try {
    contents = await readFile(projectPath, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
  const parsed: unknown = JSON.parse(contents);
  if (
    !isRecord(parsed)
    || parsed.version !== 1
    || typeof parsed.project_id !== "string"
    || typeof parsed.created_at !== "string"
  ) {
    throw new Error(`${projectPath} is not a valid Runx project state.`);
  }
  return {
    version: 1,
    project_id: parsed.project_id,
    created_at: parsed.created_at,
  };
}

export async function ensureRunxProjectState(
  projectDir: string,
  now: () => string = () => new Date().toISOString(),
): Promise<{ readonly state: RunxProjectState; readonly created: boolean }> {
  const existing = await readRunxProjectState(projectDir);
  if (existing) {
    return {
      state: existing,
      created: false,
    };
  }
  const state: RunxProjectState = {
    version: 1,
    project_id: `proj_${randomUUID()}`,
    created_at: now(),
  };
  await mkdir(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, "project.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  return {
    state,
    created: true,
  };
}
