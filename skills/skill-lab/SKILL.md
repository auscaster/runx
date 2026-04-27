---
name: skill-lab
description: Turn one bounded skill opportunity into a concrete proposal packet with explicit approval before packaging.
---

# Skill Lab

Turn one bounded opportunity into a concrete skill proposal.

`skill-lab` is the public graph that packages the internal builder stack into
one reviewable surface. It does not hide the builder capabilities; it composes
them into one governed proposal flow:

`work-plan` -> `prior-art` -> `write-harness` -> `draft-content`

Use it when the real output is not code yet, but a candidate skill package and
proposal packet that a maintainer can review, amend, approve, or reject.

The graph is intentionally honest about the boundary:

- it designs the candidate skill
- it drafts the proposal in maintainer-facing language
- it requires explicit approval before the proposal is packaged for handoff

Proposal quality is part of the contract, not a later editorial pass. The
proposal should:

- read like a first-party runx skill or graph proposal, not a builder trace
- identify the concrete pain point being addressed
- explain fit against the current runx catalog
- say when the right answer is an amendment to Sourcey, `draft-content`, an
  existing skill, or an existing graph instead of a new skill
- describe the concrete artifact a maintainer would ship or use
- keep issue-thread evidence and approval mechanics as provenance, not proposal
  prose
- surface the remaining maintainer decisions cleanly
- avoid builder-source framing such as "supplied work-plan", "supplied
  catalog", "supplied decomposition", "machine output", "agent output", or
  "model output"
- never write "the machine should" or similar instruction-framing in proposal
  prose; name the maintainer artifact, decision, or workflow improvement
- write catalog fit from the maintainer's point of view: name the adjacent
  skill or graph and the boundary directly
- avoid "provided catalog evidence" framing; say `current catalog` or name the
  adjacent entries directly
- never use `supplied` or `envelope` in proposal prose; if provenance is thin,
  say what source was unavailable in plain maintainer language

## Quality Profile

- Purpose: decide whether one bounded opportunity deserves a first-party runx
  skill or graph proposal, then produce the proposal packet.
- Audience: runx maintainers reviewing the catalog, not a model evaluating its
  own work.
- Artifact contract: crisp thesis, maintainer pain, catalog fit, full contract
  with inputs and outputs, sample output shape, boundaries, non-goals, harness
  fixtures, acceptance checks, and explicit maintainer decisions.
- Evidence bar: cite the source thread, amendments, catalog entries, and prior
  art that make the proposal necessary. Do not turn issue discussion into
  public proposal prose.
- Voice bar: first-party catalog proposal. It should read like a maintainer
  wrote it after doing the work.
- Strategic bar: explain why this should be first-party, why it is not Sourcey,
  `draft-content`, an existing skill, or a graph amendment, and what strategic
  runx capability it strengthens.
- Stop conditions: return `needs_more_evidence`, `needs_review`, or
  `not_first_party` when the idea is useful but does not deserve a new catalog
  surface.

It does not silently open PRs, mutate external repos, or imply that a proposed
skill is already accepted. Those outward moves belong to provider-bound lanes
such as `aster`'s live issue-ledger flow.

## Inputs

- `objective` (required): the capability to propose.
- `project_context` (optional): repo, product, or operator context that
  constrains the proposal.
- `thread_title` (optional): original thread title when the proposal comes
  from an issue, chat, ticket, or other work thread.
- `thread_body` (optional): original thread body or request text.
- `thread_locator` (optional): canonical locator for the bounded thread.
- `thread` (optional): provider-backed thread for the source
  thread.
- `channel` (optional): proposal delivery channel; defaults to
  `skill-proposal`.
- `operator_context` (optional): maintainer posture, constraints, or teaching
  notes that should shape the proposal.

## Outputs

- `work_plan`: bounded decomposition for the candidate capability.
- `prior_art_report`: verified findings and risks that constrain the design.
- `skill_design_packet`: candidate skill spec, execution plan, harness
  fixtures, and acceptance checks.
- `content_draft_packet`: maintainer-facing proposal draft.
- `content_publish_packet`: packaged proposal after approval.
