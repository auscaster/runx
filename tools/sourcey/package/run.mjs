function unwrapArtifactData(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  if (value.data && typeof value.data === "object" && !Array.isArray(value.data)) {
    return value.data;
  }
  return value;
}

function prune(value) {
  if (Array.isArray(value)) {
    const items = value.map((entry) => prune(entry)).filter((entry) => entry !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value === undefined ? undefined : value;
  }
  const entries = Object.entries(value)
    .map(([key, nested]) => [key, prune(nested)])
    .filter(([, nested]) => nested !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const discoveryReport = unwrapArtifactData(inputs.discovery_report, "discovery_report");
const docBundle = unwrapArtifactData(inputs.doc_bundle, "doc_bundle");
const buildReport = unwrapArtifactData(inputs.sourcey_build_report, "sourcey_build_report");
const evaluationReport = unwrapArtifactData(inputs.evaluation_report, "evaluation_report");
const revisionBundle = unwrapArtifactData(inputs.revision_bundle, "revision_bundle");
const verificationReport = unwrapArtifactData(inputs.sourcey_verification_report, "sourcey_verification_report");

process.stdout.write(JSON.stringify(prune({
  schema: "runx.sourcey_run.v1",
  verified: verificationReport.verified === true,
  output_dir: firstNonEmptyString(verificationReport.output_dir, buildReport.output_dir),
  contains_doctype: verificationReport.contains_doctype === true,
  discovery_report: discoveryReport,
  doc_bundle: docBundle,
  build_report: buildReport,
  evaluation_report: evaluationReport,
  revision_bundle: revisionBundle,
  verification_report: verificationReport,
})));
