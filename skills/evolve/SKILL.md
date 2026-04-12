---
name: evolve
description: Governed repo evolution with fixed phase semantics and bounded outcomes.
---

# Evolve

Evolve the current repository through governed phases with fixed semantics and
optional bounded revision. With no objective, the default behavior is
introspective: analyze the repo, recommend one bounded improvement, and stop
at a plan-quality artifact set.

This is not autonomous code generation. It governs the shape around
cognition — every phase produces a typed artifact, every mutation requires
approval, every step emits a receipt. A single evolve run ends in a bounded
artifact, not an open-ended improvement loop.

## Canonical semantics

Complex runx skills share one internal phase language:

- `scope`
- `ingest`
- `model`
- `materialize`
- `evaluate`
- `revise`
- `verify`
- `ratify`

The current `evolve` runner uses a bounded subset and compresses some phases
into fewer concrete steps. That is allowed. What stays fixed is the meaning of
the phases, not the number of steps.

## Current runner mapping

### Introspect

Caller-mediated (agent-step). This is the zero-argument recommendation lane.
It uses `scope + ingest + model` to analyze the current repo and produce:

- `opportunity_report` — ranked opportunities grounded in repo evidence
- `recommended_objective` — one bounded next move
- `change_plan` — a concrete plan for that recommendation
- `spec_document` — a draft scafld-style spec when governance applies

No approval gate and no mutation happen in this runner. It is introspection
only.

### Preflight

Deterministic. This is the current `scope + ingest` step. It inspects the
target repo and produces a `repo_profile`:
repo root, git state, base branch, dirty worktree, `.ai/` presence
(scafld initialized), detected languages, test commands, risk signals.
No agent cognition, no mutation.

### Plan

Caller-mediated (agent-step). This is the current `model` step and also drafts
bounded plan artifacts. Given the objective and repo profile, it produces four
artifacts in one pass:

- `objective_brief` — restatement with target kind, constraints,
  success criteria.
- `diagnosis_report` — current repo state relative to the objective.
- `change_plan` — ordered phases, acceptance checks, touchpoints, risk.
- `spec_document` — draft scafld spec when governance applies.

### Approve

Gate before mutation. Presents the plan for explicit approval. If denied,
the chain stops. This is the current `ratify` boundary. The
`approval_decision` records: approved, decision_by, reason.

### Act

Executes the approved plan. This is the current bounded
`materialize + evaluate + verify` slice. It is gated by the approval decision
via policy transition.

- If `terminate` is `spec`: no-op. Plan artifacts are the deliverable.
- If `terminate` is `patch` or `pr`: executes the change plan and
  produces `execution_report`, `verification_report`, `review_report`.

**Current status: skeleton.** The act step currently produces synthetic
output. Real execution, critique, bounded revision, and verification are not
yet fully wired.

### Publish

Publishes if the review verdict permits.

- If `terminate` is `pr` and verdict is `approve`: produces a
  publishable artifact.
- Otherwise: no publication.

**Current status: skeleton.** Like act, this step produces synthetic
output. Real PR creation is not yet wired.

## Revision policy

`evolve` does not currently perform revision rounds. That is intentional. When
bounded revision is introduced, it must be explicit and policy-controlled, for
example `max_rounds: 1` or `2`, with defined stop and escalation conditions.

## Invocation modes

- `runx evolve` — introspect the current repo and recommend one bounded
  improvement
- `runx evolve "<objective>"` — plan a directed change
- `runx evolve "<objective>" --terminate patch|pr` — execute a governed
  change lane

## Evolution targets

The objective string determines the target. The preflight phase resolves
the concrete target from the current repo context.

- **Repo**: "add websocket adapter support" — improve the codebase
  toward an objective.
- **Skill**: `--skill ./skills/sourcey` — improve a specific skill package.
- **Receipt**: `--receipt rx_8f3a` — repair based on a failed run.
- **Self**: run against the runx repo itself for dogfooding.

## Termination

- `spec` (default): stop after planning. No mutation.
- `patch`: execute and produce a local patch in an isolated branch.
- `pr`: execute, verify, review, and open a PR if review passes.

## Boundary rules

- Every mutating run uses an isolated branch or worktree.
- A single evolve run ends in a bounded artifact, not another hidden loop.
- Policy evaluates structured fields, never prose.
- Approval gates are first-class chain steps, not hidden CLI behavior.
- If a skill lacks X metadata, evolve falls back to the agent runner.

## Inputs

- `objective` (optional): what to evolve toward. If omitted, `evolve` uses the
  introspective recommendation runner.
- `repo_root` (optional): repository root. Defaults to cwd.
- `terminate` (optional): `spec`, `patch`, or `pr`. Defaults to `spec`.
