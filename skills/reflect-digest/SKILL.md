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
