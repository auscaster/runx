---
name: reflect-digest
description: Aggregate projected reflect knowledge into bounded skill improvement proposals.
---

# Reflect Digest

Read projected reflect projections from Knowledge, group them by skill, and
draft bounded improvement proposals only when the grouped evidence clears the
configured floors.

This is the explicit cognition lane for reflection. It does not mutate a repo,
push a branch, or publish a pull request. It emits provider-agnostic PR draft
handoffs for later governed review and push.

## Quality Profile

- Purpose: turn repeated reflect evidence into bounded improvement proposals.
- Audience: maintainers deciding which observed skill failures deserve work.
- Artifact contract: grouped proposals with skill ref, supporting receipt ids,
  draft pull request packet, and outbox entry.
- Evidence bar: group only admitted reflect projections that clear support and
  confidence floors. Every proposal must cite the receipts that justify it.
- Voice bar: concise improvement rationale, not introspective commentary.
- Strategic bar: propose changes only when repeated evidence indicates durable
  capability, quality, or trust improvement.
- Stop conditions: emit no proposal when support is thin, confidence is low, or
  the grouped evidence does not imply a bounded fix.

## Output

- `proposals`: an array of grouped proposal packets. Each item includes:
  - `skill_ref`
  - `supporting_receipt_ids`
  - `draft_pull_request`
  - `outbox_entry`

## Inputs

- `reflect_projections` (optional): explicit reflect projection entries. Useful for harness
  replay and controlled evaluation.
- `skill_filter` (optional): only consider one skill ref.
- `since` (optional): only consider projections recorded at or after this ISO time.
- `min_support` (optional): minimum grouped projection count required to draft.
- `min_confidence` (optional): minimum per-projection confidence required to include
  a reflect projection in grouping.
