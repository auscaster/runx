---
name: open-source-triage
description: Discover one high-value open-source issue, research it, draft the response, and package the approved handoff.
---

# Open Source Triage

This governed chain turns a noisy issue queue into one approved response packet.

The flow is intentionally narrow:

1. discover the issue worth attention
2. research the thread and its likely resolution path
3. draft the maintainer response
4. require approval before the response is packaged for dispatch
5. end on an explicit external handoff boundary rather than pretending
   upstream maintainer review is an internal review stage

It exists to make runx visibly helpful to the community without hiding the
operator gate between drafting and outward action.

## Inputs

- `repository` (optional): repository slug or local reference.
- `query` (optional): triage objective for the discovery pass.
- `objective` (optional): how the operator wants to help.
- `channel` (optional): final response channel; defaults to `github_issue_comment`.
- `operator_context` (optional): maintainer norms or community constraints.
