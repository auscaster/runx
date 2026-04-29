---
name: issue-triage
description: Discover, analyze, and draft high-signal issue-thread responses and follow-up actions.
---

# Issue Triage

Turn noisy issue streams into bounded, evidence-backed action.

This skill is for issue selection and response drafting, not for silently
mutating repositories. Use it to identify which threads are worth attention,
understand the maintainer or contributor situation, and draft the next helpful
response or remediation path.

Separate discovery from response. Discovery finds the thread worth engaging.
Response drafting turns one chosen thread into a concrete answer, escalation,
or change plan.

## Quality Profile

- Purpose: choose or answer the issue where runx can create the most useful
  next maintainer action.
- Audience: maintainers and contributors reading the thread, plus any downstream
  lane that consumes the triage artifact.
- Artifact contract: issue candidates and selection rationale for discovery;
  issue profile, response strategy, response draft, and follow-up actions for
  response mode.
- Evidence bar: quote or summarize the actual issue state, repo facts, receipts,
  and maintainer context. Do not infer intent beyond the visible thread.
- Voice bar: helpful maintainer response, not support-ticket filler or generic
  bot tone. Lead with the decision, answer, or next action.
- Strategic bar: explain why this issue deserves attention now and whether the
  right move is reply, plan, build, hold, or no action.
- Stop conditions: return `needs_more_evidence` or `needs_human` when the issue
  is ambiguous, hostile, underspecified, unsafe, or outside the maintainer's
  declared posture.

## Output

Discovery runner:

- `issue_candidates`: candidate issues or discussions worth attention.
- `selection_rationale`: why one candidate should be handled next.
- `operator_notes`: constraints, caveats, or escalation triggers.

Response runner:

- `issue_profile`: concise summary of the chosen thread.
- `response_strategy`: recommended response posture and next action.
- `response_draft`: post-ready draft or maintainer handoff.
- `follow_up_actions`: concrete next steps after the response.

## Inputs

- `repository` (optional): repository slug or workspace reference.
- `query` (optional): search or queue objective for discovery.
- `issue_url` (optional): canonical issue URL for response drafting.
- `issue_snapshot` (optional): structured issue data when already fetched.
- `maintainer_context` (optional): project norms, release posture, and
  response constraints.
- `operator_context` (optional): operator-supplied context used by higher-level
  triage graphs.
- `objective` (optional): what the operator wants from this pass.
