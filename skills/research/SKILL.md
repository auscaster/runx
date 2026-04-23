---
name: research
description: Produce bounded, source-backed research packets for product, ecosystem, and operator decisions.
---

# Research

Research one bounded question and turn it into a decision-ready packet.

This skill is for applied research, not open-ended browsing. It should answer
one practical question with evidence, tradeoffs, and explicit uncertainty:
which issue is worth tackling, what the ecosystem is doing, whether a proposal
is grounded, or what claims a public post can safely make.

Keep the scope tight. Summaries without evidence are not enough, but an
undirected literature review is also wrong. Prefer a small number of verified
claims that change the operator's decision.

## Operating rules

- State the objective in operational terms.
- Distinguish verified evidence from inference.
- Surface missing evidence instead of inventing it.
- Bound the result to a concrete deliverable: brief, issue recommendation,
  content outline, or publish/no-publish decision.

## Quality Profile

- Purpose: answer one practical question well enough to change a downstream
  decision or stop the chain.
- Audience: the maintainer, operator, author, or follow-on skill that will use
  the research packet.
- Artifact contract: `research_brief`, `evidence_log`, `decision_support`, and
  `risks` with enough specificity to support the declared deliverable.
- Evidence bar: every important claim names a source and confidence. Separate
  verified facts from inference and unsupported hypotheses.
- Voice bar: concise analyst-to-maintainer prose. Do not narrate browsing,
  cite "general knowledge", or pad with generic market language.
- Strategic bar: state why the finding matters for the chain purpose: what to
  write, what not to write, what to build, what to avoid, or what needs review.
- Stop conditions: return `needs_more_evidence` when the available sources
  would force a speculative conclusion, and return `not_worth_publishing` when
  the finding is true but not useful for the declared audience.

## Output

- `research_brief`: object with `objective`, `scope`, `summary`, and
  `open_questions`.
- `evidence_log`: array of evidence entries with `claim`, `source`,
  `confidence`, and `relevance`.
- `decision_support`: array of options or recommendations with rationale.
- `risks`: array of research or execution risks.

## Inputs

- `objective` (required): the question to answer.
- `domain` (optional): ecosystem, product area, or audience context.
- `deliverable` (optional): intended artifact, for example `daily brief`,
  `triage recommendation`, or `publish packet`.
- `operator_context` (optional): local constraints or strategic context.
- `target_entities` (optional): array or object naming repos, products,
  competitors, communities, or issues that bound the research.
