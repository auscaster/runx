---
name: skill-testing
description: Evaluate a skill, draft the trust audit, and package the approved recommendation.
---

# Skill Testing

This graph is the public-facing trust-audit lane.

It evaluates one skill, turns the findings into a concise report, and then
packages the approved output for publication or operator handoff.

## Quality Profile

- Purpose: produce a reviewable trust audit for one skill.
- Audience: operators, catalog maintainers, and users deciding whether to trust
  or adopt the skill.
- Artifact contract: review-skill assessment, trust audit draft, approval
  decision, and publish or handoff packet.
- Evidence bar: base recommendations on receipts, harness output, source notes,
  and the skill contract. Missing evidence lowers trust; it does not invite
  optimistic language.
- Voice bar: audit report, not marketing copy. Name risks, caveats, and test
  gaps directly.
- Strategic bar: make adoption, sandboxing, rejection, or further testing
  easier.
- Stop conditions: stop at review when trust evidence is insufficient or the
  skill cannot be bounded.

## Inputs

- `skill_ref` (required): skill package or registry reference to assess.
- `objective` (optional): decision the audit should support.
- `channel` (optional): final report channel; defaults to `trust-audit`.
- `evidence_pack` (optional): receipts, docs, or source notes that should anchor
  the evaluation.
- `test_constraints` (optional): environment or safety limits for evaluation.
