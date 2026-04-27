---
name: ecosystem-brief
description: Produce an approved ecosystem briefing from bounded research and a governed content pass.
---

# Ecosystem Brief

This graph is the specialized daily-brief variant of `content-pipeline`.

It is for one decision-ready ecosystem update: what changed, why it matters,
and what the operator should do with that information. The output should feel
like a sharp daily brief, not a generic article.

## Quality Profile

- Purpose: turn bounded ecosystem research into one decision-ready brief.
- Audience: an operator deciding what to monitor, write, build, defer, or
  investigate next.
- Artifact contract: concise brief with what changed, why it matters, evidence,
  implications, recommended posture, and open uncertainties.
- Evidence bar: cite concrete source material and separate verified movement
  from inference. If the market signal is weak, say so.
- Voice bar: analyst brief, not SEO article, launch recap, or trend filler.
  Lead with the operational implication.
- Strategic bar: connect the signal to runx, Sourcey, catalog growth, trust,
  distribution, or ecosystem positioning only when the evidence supports it.
- Stop conditions: return `not_worth_publishing` when the update is true but
  not strategically useful, and `needs_more_evidence` when the signal cannot be
  verified.

## Inputs

- `objective` (optional): specific question for the market scan.
- `audience` (optional): who will read the brief.
- `channel` (optional): output channel; defaults to `brief`.
- `domain` (optional): ecosystem slice to monitor.
- `operator_context` (optional): decision context or evaluation lens for the brief.
- `target_entities` (optional): structured list of projects or companies the scan
  should compare or monitor.
