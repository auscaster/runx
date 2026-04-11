---
name: bug-to-pr
description: Govern a scafld-backed bug-to-PR lane with caller-mediated review.
---

Turn a bounded bugfix lane into a governed composite skill.

This skill drives the existing scafld lifecycle through explicit steps:
spec creation, approval, start, execution, audit, review open, reviewer
boundary, and completion.

The adversarial review itself stays outside the scafld subprocess. runx routes
the review handoff through the caller boundary so the reviewer may be a human,
the controlling agent, or a peer agent.
