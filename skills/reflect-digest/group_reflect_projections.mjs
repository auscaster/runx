const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const reflectProjections = Array.isArray(inputs.reflect_projections_packet?.items) ? inputs.reflect_projections_packet.items : [];
const parsedSupport = Number(inputs.min_support);
const parsedConfidence = Number(inputs.min_confidence);
const minSupport = Number.isFinite(parsedSupport) ? parsedSupport : 2;
const minConfidence = Number.isFinite(parsedConfidence) ? parsedConfidence : 0.5;
const grouped = new Map();

for (const projectionEntry of reflectProjections) {
  if (!projectionEntry || projectionEntry.entry_kind !== "projection" || projectionEntry.scope !== "reflect") {
    continue;
  }
  if (typeof projectionEntry.confidence !== "number" || projectionEntry.confidence < minConfidence) {
    continue;
  }
  const projection = projectionEntry.value;
  if (!projection || typeof projection !== "object") {
    continue;
  }
  const skillRef = typeof projection.skill_ref === "string" ? projection.skill_ref : undefined;
  if (!skillRef) {
    continue;
  }
  const current = grouped.get(skillRef) ?? {
    skill_ref: skillRef,
    support: 0,
    supporting_receipt_ids: [],
    projections: [],
  };
  current.support += 1;
  if (typeof projectionEntry.receipt_id === "string") {
    current.supporting_receipt_ids.push(projectionEntry.receipt_id);
  }
  current.projections.push(projectionEntry);
  grouped.set(skillRef, current);
}

const groupedReflections = Array.from(grouped.values())
  .filter((group) => group.support >= minSupport)
  .map((group) => ({
    ...group,
    supporting_receipt_ids: Array.from(new Set(group.supporting_receipt_ids)),
  }))
  .sort((left, right) => right.support - left.support || left.skill_ref.localeCompare(right.skill_ref));

process.stdout.write(JSON.stringify({
  grouped_reflections_packet: {
    items: groupedReflections,
  },
}));
