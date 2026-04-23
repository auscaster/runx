---
name: review-skill
description: Assess a skill package for capability, trust, and operator readiness.
---

# Review Skill

Judge whether a skill is ready to trust, adopt, or publish.

This skill evaluates one bounded capability. It should identify what the skill
does well, where it is incomplete, what evidence supports the trust level, and
what tests or governance gaps block adoption.

Avoid generic praise. The output should help an operator decide whether to
adopt, publish, sandbox, or reject the skill.

## Quality Profile

- Purpose: decide whether a bounded skill package is trustworthy and useful
  enough for adoption, publication, sandboxing, or rejection.
- Audience: operators and maintainers responsible for capability trust.
- Artifact contract: capability profile, trust assessment, test matrix, and
  recommendation report.
- Evidence bar: base trust on the skill contract, execution profile, fixtures,
  receipts, source notes, and known failure evidence. Do not infer trust from
  a confident README alone.
- Voice bar: direct review notes with concrete blockers and residual risk. No
  generic praise, marketing language, or "looks good" summaries.
- Strategic bar: explain whether the skill strengthens the catalog, fills a
  real operator need, duplicates existing capability, or carries unacceptable
  trust risk.
- Stop conditions: return `needs_more_evidence` when receipts or harness proof
  are missing, and `reject` when the skill cannot be bounded or audited.

## Output

- `capability_profile`: what the skill appears to do and how it executes.
- `trust_assessment`: trust tier, caveats, and missing evidence.
- `test_matrix`: concrete checks the skill should pass.
- `recommendation_report`: adoption or publication recommendation.

## Inputs

- `skill_ref` (required): skill package path, registry id, or marketplace id.
- `objective` (optional): what the operator wants to know about this skill.
- `evidence_pack` (optional): receipts, docs, harness output, or source notes.
- `test_constraints` (optional): time, environment, or safety limits.
