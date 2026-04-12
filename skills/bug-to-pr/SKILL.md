---
name: bug-to-pr
description: Govern a scafld-backed bug-to-PR lane with a visible reviewer boundary.
---

# Bug to PR

Drive a bounded bugfix through the full scafld lifecycle under runx
governance — from spec creation through authored fix and adversarial
review to archived completion.

The chain separates cognition from mutation. Agent phases author the
scafld spec, the repo change, and the review contents. Deterministic
`fs.write` phases are the only places files are written to disk. The
`scafld` skill then validates, advances, executes, audits, reviews, and
archives the lane with explicit scopes.

The adversarial review is reviewer-mediated. runx opens the review round
via `scafld review --json`, which returns the review file path and
adversarial prompt. A reviewer (human, controlling agent, or peer agent)
fills the three adversarial sections — regression_hunt, convention_check,
dark_patterns — then sets a verdict. The review markdown is written via a
deterministic file-write step before `scafld complete` validates it and
archives the spec.

The chain does not control who authors the spec, the fix, or the review.
It provides the governed handoff boundaries. The caller decides.

## Lifecycle

The chain runs: `scafld new` → author spec → write spec → validate →
approve → start → author fix → write fix → exec → audit → review-open →
reviewer boundary → write review → complete. Each step gets only the
scopes it needs. See x.yaml for the full step graph.

## Inputs

- `task_id`: scafld task id (default: `bug-to-pr-fixture`).
- `title`: bugfix title for the spec.
- `size`: `micro`, `small`, `medium`, or `large` (default: `micro`).
- `risk`: `low`, `medium`, or `high` (default: `low`).
- `phase`: optional scafld execution phase.
- `fixture`: workspace root containing `.ai/`.
- `scafld_bin`: explicit scafld executable path.
