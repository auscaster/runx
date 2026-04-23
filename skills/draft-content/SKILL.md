---
name: draft-content
description: Turn evidence and operator intent into publication-ready drafts and handoff packets.
---

# Draft Content

Write one bounded piece of content from available evidence and a clear objective.

This skill is for drafting useful public artifacts: ecosystem briefs, trust
reports, release notes, maintainer updates, or social posts. It should never
hallucinate evidence. If the evidence is thin, say so and narrow the claims.

Keep the content grounded in a specific audience, channel, and objective. The
job is not to sound expansive. The job is to be useful and publishable.

## Quality Bar

The draft should look like a human maintainer or operator did the work:

- lead with the reader's problem, decision, or next action, not the evidence
  collection process
- turn evidence into claims, examples, and concrete wording; do not dump raw
  receipts, issue threads, amendments, or machine packets into the public body
- match the target project's vocabulary and voice instead of defaulting to
  generic AI, launch, preview, migration, or adoption language
- never describe the work as machine output, agent output, or AI-generated
  content; the surfaced draft should read like a maintainer-owned artifact
- prefer one sharp page, brief, or update over several thin sections
- if the evidence is not strong enough to publish, return a narrow handoff or
  `needs_more_evidence` state instead of filling the gap with plausible prose

## Quality Profile

- Purpose: convert evidence and operator intent into one publishable or
  reviewable content artifact.
- Audience: the declared channel audience, plus the maintainer who must stand
  behind the wording.
- Artifact contract: content brief, draft, review checklist, and distribution
  notes for draft mode; publish packet and handoff notes for package or handoff
  mode.
- Evidence bar: every substantive claim must be traceable to `evidence_pack`,
  project context, receipts, or named source material. Weak evidence narrows
  claims; it does not invite filler.
- Voice bar: write in the target project's vocabulary and channel convention.
  Do not explain the generation process, quote raw packets, or use generic AI
  positioning.
- Strategic bar: the draft must make a human action easier: publish, respond,
  brief a stakeholder, defer, or request more evidence.
- Stop conditions: return `needs_more_evidence`, `needs_review`, or
  `not_worth_publishing` when the content would be true but low-value,
  under-sourced, off-voice, or unclear for the audience.

## Output

Draft runner:

- `content_brief`: framing for audience, angle, and constraints.
- `draft`: the main draft text or structured sections.
- `review_checklist`: what must be checked before publication.
- `distribution_notes`: channel-specific packaging guidance.

Package runner:

- `publish_packet`: channel-ready payload and metadata.
- `qa_checklist`: final quality gates for handoff or publishing.
- `handoff_notes`: operator notes, caveats, and next actions.

Handoff runner:

- `handoff_packet`: approved outward packet with the exact delivery surface.
- `boundary_state`: explicit boundary semantics so external handoff does not
  masquerade as internal review completion.
- `follow_up_contract`: who acts next, whether acknowledgement is expected,
  and what should retrigger the lane.

## Inputs

- `objective` (optional): what the content should accomplish.
- `audience` (optional): intended reader or viewer.
- `channel` (optional): blog, newsletter, GitHub comment, status post,
  advisory, Moltbook, or other outlet.
- `evidence_pack` (optional): structured evidence object from research or
  another skill.
- `voice_guide` (optional): tone or brand constraints.
- `draft` (optional): existing draft text when packaging or revising.
- `packet` (optional): already-packaged outward payload when moving through the
  explicit handoff boundary.
- `target` (optional): thread locator or repo/thread summary for the outward
  move.
- `boundary_kind` (optional): boundary type such as `external_maintainer`.
