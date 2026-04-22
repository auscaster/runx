import { firstNonEmptyString, parseJsonInput, prune } from "../common.mjs";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const scanPacket = unwrapArtifactData(inputs.docs_scan_packet, "docs_scan_packet");
const previewPlan = unwrapArtifactData(inputs.preview_plan, "preview_plan");
const previewWorkspace = optionalArtifactData(inputs.preview_workspace);
const sourceyPacket = optionalArtifactData(inputs.sourcey_packet);
const discoveryReport = sourceyPacket?.discovery_report;
const docBundle = sourceyPacket?.doc_bundle;
const revisionBundle = sourceyPacket?.revision_bundle;
const buildReport = sourceyPacket?.build_report;
const verificationReport = sourceyPacket?.verification_report;

const migrationFiles = mergeFiles(docBundle?.files, revisionBundle?.files);
const generated = buildReport?.generated === true && verificationReport?.verified === true;
const shouldGenerate = previewPlan.should_generate === true;
const shouldOutreach = generated && scanPacket.preview_recommendation?.recommended === true;

process.stdout.write(JSON.stringify(prune({
  schema: "runx.docs_preview.v1",
  scan: scanPacket,
  status: shouldGenerate ? (generated ? "generated" : "planned") : "skipped",
  sourcey_plan: prune({
    should_generate: shouldGenerate,
    repo_root: previewPlan.repo_root,
    staged_repo_root: previewWorkspace?.staged_repo_root,
    docs_inputs: discoveryReport?.discovered?.docs_inputs ?? previewPlan.sourcey_inputs?.docs_inputs,
    output_dir: buildReport?.output_dir ?? previewWorkspace?.output_dir ?? previewPlan.sourcey_inputs?.output_dir,
    authored_files: uniquePaths([
      ...(Array.isArray(docBundle?.files) ? docBundle.files.map((file) => file.path) : []),
      ...(Array.isArray(revisionBundle?.files) ? revisionBundle.files.map((file) => file.path) : []),
    ]),
    rationale: firstNonEmptyString(previewPlan.rationale),
    skip_reason: firstNonEmptyString(previewPlan.skip_reason),
  }),
  build_report: buildReport,
  verification_report: verificationReport,
  before_after_evidence: prune({
    current_docs_url: firstNonEmptyString(scanPacket.target?.docs_url),
    preview_url: firstNonEmptyString(buildReport?.index_path),
    summary: buildBeforeAfterSummary({
      scanPacket,
      previewPlan,
      generated,
      buildReport,
      verificationReport,
      migrationFiles,
    }),
  }),
  migration_bundle: migrationFiles.length > 0
    ? {
        files: migrationFiles,
        summary: firstNonEmptyString(
          revisionBundle?.summary,
          docBundle?.summary,
          `Prepared ${migrationFiles.length} file change${migrationFiles.length === 1 ? "" : "s"} for a Sourcey preview migration.`,
        ),
      }
    : undefined,
  operator_summary: {
    should_publish: generated,
    should_outreach: shouldOutreach,
    should_pr: false,
    rationale: buildOperatorRationale({
      shouldGenerate,
      generated,
      scanPacket,
      previewPlan,
      verificationReport,
    }),
  },
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

function optionalArtifactData(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const record = parseJsonInput(value);
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }
  return record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data
    : record;
}

function mergeFiles(...lists) {
  const merged = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const file of list) {
      if (!file || typeof file !== "object" || Array.isArray(file) || !file.path) {
        continue;
      }
      merged.set(String(file.path), {
        path: String(file.path),
        contents: typeof file.contents === "string" ? file.contents : "",
      });
    }
  }
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function uniquePaths(paths) {
  return [...new Set(paths.filter((pathValue) => typeof pathValue === "string" && pathValue.length > 0))];
}

function buildBeforeAfterSummary({
  scanPacket,
  previewPlan,
  generated,
  buildReport,
  verificationReport,
  migrationFiles,
}) {
  if (!previewPlan.should_generate) {
    return firstNonEmptyString(
      previewPlan.skip_reason,
      "Preview generation was skipped because the current docs surface already looks strong enough.",
    );
  }
  if (!generated) {
    return `Preview generation was attempted but did not reach a verified build. ${firstNonEmptyString(verificationReport?.reason, "")}`.trim();
  }
  const title = firstNonEmptyString(buildReport?.index_title, scanPacket.repo_profile?.name, "Untitled preview");
  const headings = Array.isArray(buildReport?.index_headings) ? buildReport.index_headings.filter((value) => typeof value === "string") : [];
  return `${scanPacket.quality_assessment?.summary} Preview '${title}' verified successfully with ${migrationFiles.length} authored file change${migrationFiles.length === 1 ? "" : "s"} and ${headings.length} captured top-level heading${headings.length === 1 ? "" : "s"}.`;
}

function buildOperatorRationale({
  shouldGenerate,
  generated,
  scanPacket,
  previewPlan,
  verificationReport,
}) {
  if (!shouldGenerate) {
    return firstNonEmptyString(
      previewPlan.skip_reason,
      "Current docs already look solid enough that a Sourcey preview should not be generated by default.",
    );
  }
  if (!generated) {
    return `Preview work remains in planning or needs repair before publication: ${firstNonEmptyString(verificationReport?.reason, previewPlan.rationale, "verification incomplete")}.`;
  }
  return `Preview generated and verified for a repo that scanned as '${firstNonEmptyString(scanPacket.stack_detection?.stack, "unknown")}' with docs quality '${firstNonEmptyString(scanPacket.quality_assessment?.quality_band, "unknown")}'.`;
}
