---
name: content-pipeline
description: Research a topic, draft the content, and package the approved publication bundle.
---

# Content Pipeline

This is the standard publish lane for runx-authored public content.

It keeps evidence collection, drafting, and publication packaging as separate
steps so the operator can approve one concrete draft before anything is turned
into a publish packet.

## Quality Profile

- Purpose: produce one governed public content artifact from evidence,
  operator intent, and approval.
- Audience: the declared channel audience and the operator who must stand
  behind the publication.
- Artifact contract: research packet, draft content, approval decision, and
  packaged publish packet.
- Evidence bar: every public claim must be grounded in the research packet or
  explicit operator context. Thin evidence narrows or stops the draft.
- Voice bar: useful public writing, not generic thought leadership or a
  transcript of the chain.
- Strategic bar: the piece must create a concrete reader or operator outcome:
  understanding, decision, trust, adoption, or follow-up.
- Stop conditions: stop with `needs_more_evidence`, `needs_review`, or
  `not_worth_publishing` when the topic is true but weak, stale, duplicative,
  or unsupported.

## Inputs

- `objective` (required): what the content should accomplish.
- `audience` (optional): intended reader or operator segment.
- `channel` (optional): publication channel; defaults to `blog`.
- `domain` (optional): ecosystem or market area to research.
- `operator_context` (optional): constraints, voice, or campaign context.
- `target_entities` (optional): structured list of products, projects, or
  actors the research pass should keep in view.
