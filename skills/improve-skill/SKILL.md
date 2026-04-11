---
name: improve-skill
description: Turn a failed receipt or harness outcome into a bounded skill improvement proposal.
---

# Improve Skill

Review a failed or suspicious run and draft the next bounded improvement.

This skill coordinates receipt review and harness authoring to produce:

- a focused failure summary
- bounded improvement proposals
- an updated execution-plan proposal when needed
- replayable acceptance checks for the next iteration

Optional inputs:

- `receipt_id`: receipt id to inspect when available.
- `receipt_summary`: sanitized receipt or failure summary.
- `harness_output`: sanitized harness output or failure text.
- `skill_path`: skill package being improved.
- `objective`: operator intent for the next improvement pass.

Prefer the smallest change that materially improves the skill.
