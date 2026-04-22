import path from "node:path";

import {
  firstNonEmptyString,
  getRepoRoot,
  parseJsonInput,
  prune,
} from "../common.mjs";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const repoRoot = getRepoRoot(inputs);
const scanPacket = unwrapArtifactData(inputs.docs_scan_packet, "docs_scan_packet");
const candidates = Array.isArray(scanPacket.docs_input_candidates) ? scanPacket.docs_input_candidates : [];
const repoProfile = scanPacket.repo_profile && typeof scanPacket.repo_profile === "object" ? scanPacket.repo_profile : {};
const stackDetection = scanPacket.stack_detection && typeof scanPacket.stack_detection === "object" ? scanPacket.stack_detection : {};
const qualityAssessment = scanPacket.quality_assessment && typeof scanPacket.quality_assessment === "object"
  ? scanPacket.quality_assessment
  : {};
const previewRecommendation = scanPacket.preview_recommendation && typeof scanPacket.preview_recommendation === "object"
  ? scanPacket.preview_recommendation
  : {};

const stack = firstNonEmptyString(stackDetection.stack, "unknown");
const qualityBand = firstNonEmptyString(qualityAssessment.quality_band, "poor");
const recommended = previewRecommendation.recommended === true;
const preferredConfig = candidates.find((candidate) => candidate?.kind === "config");
const preferredOpenApi = candidates.find((candidate) => candidate?.kind === "openapi");
const preferredMarkdown = candidates.find((candidate) => candidate?.kind === "markdown");
const preferredDoxygen = candidates.find((candidate) => candidate?.kind === "doxygen");
const preferredMcp = candidates.find((candidate) => candidate?.kind === "mcp");

let shouldGenerate = recommended;
let skipReason;

if (stack === "sourcey") {
  shouldGenerate = false;
  skipReason = "Repo already appears to use Sourcey.";
} else if (!recommended) {
  shouldGenerate = false;
  skipReason = firstNonEmptyString(previewRecommendation.rationale, "Scan did not recommend generating a Sourcey preview.");
}

const docsInputs = chooseSourceyInputs({
  preferredConfig,
  preferredOpenApi,
  preferredMarkdown,
  preferredDoxygen,
  preferredMcp,
});
const outputDir = path.join(".sourcey", "runx-preview");

process.stdout.write(JSON.stringify(prune({
  schema: "runx.docs_preview_plan.v1",
  repo_root: repoRoot,
  should_generate: shouldGenerate,
  skip_reason: skipReason,
  sourcey_inputs: {
    brand_name: firstNonEmptyString(repoProfile.name, path.basename(repoRoot)) ?? null,
    homepage_url: firstNonEmptyString(repoProfile.homepage_url, scanPacket.target?.repo_url) ?? null,
    docs_inputs: docsInputs ?? null,
    output_dir: outputDir,
    sourcey_bin: firstNonEmptyString(inputs.sourcey_bin) ?? null,
  },
  existing_surface: prune({
    stack,
    quality_band: qualityBand,
    summary: firstNonEmptyString(qualityAssessment.summary),
  }),
  selected_inputs: prune({
    config: preferredConfig?.path,
    openapi: preferredOpenApi?.path,
    markdown: preferredMarkdown?.path,
    doxygen: preferredDoxygen?.path,
    mcp: preferredMcp?.path,
  }),
  rationale: shouldGenerate
    ? buildGenerationRationale({ stack, qualityBand, preferredConfig, preferredOpenApi, preferredMarkdown, preferredDoxygen, preferredMcp })
    : skipReason,
  preview_context: firstNonEmptyString(inputs.preview_context),
})));

function unwrapArtifactData(value, label) {
  const record = parseJsonInput(value);
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${label} must be an object.`);
  }
  return record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data
    : record;
}

function chooseSourceyInputs({
  preferredConfig,
  preferredOpenApi,
  preferredMarkdown,
  preferredDoxygen,
  preferredMcp,
}) {
  if (preferredConfig?.path) {
    return {
      mode: "config",
      config: preferredConfig.path,
    };
  }
  if (preferredOpenApi?.path && !preferredMarkdown?.path && !preferredDoxygen?.path && !preferredMcp?.path) {
    return {
      mode: "openapi",
      spec: preferredOpenApi.path,
    };
  }
  return undefined;
}

function buildGenerationRationale({
  stack,
  qualityBand,
  preferredConfig,
  preferredOpenApi,
  preferredMarkdown,
  preferredDoxygen,
  preferredMcp,
}) {
  if (preferredConfig?.path) {
    return `Generate a private preview from the existing docs config '${preferredConfig.path}' because the current stack '${stack}' still scans as '${qualityBand}'.`;
  }
  if (preferredOpenApi?.path && !preferredMarkdown?.path) {
    return `Generate a private preview from the detected OpenAPI spec '${preferredOpenApi.path}' because the repo lacks a stronger authored docs surface.`;
  }
  if (preferredMarkdown?.path && !preferredDoxygen?.path && !preferredMcp?.path) {
    return `Generate a private preview by letting Sourcey author a config around the existing markdown surface '${preferredMarkdown.path}'.`;
  }
  if (preferredDoxygen?.path || preferredMcp?.path) {
    return "Generate a private preview by letting Sourcey discover and wrap the detected structured inputs in a bounded config.";
  }
  return `Generate a private preview because the scan marked this repo as a Sourcey adoption candidate with '${qualityBand}' docs quality.`;
}
