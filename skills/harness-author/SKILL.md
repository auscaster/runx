---
name: harness-author
description: Draft replayable runx harness fixtures for a proposed skill package or composite execution plan.
---

# Harness Author

Draft deterministic skill specs, execution plans, and harness fixtures for the objective.

Required inputs:

- `objective`: the skill objective to harness.

Optional inputs:

- `decomposition`: output from `objective-decompose`.
- `research`: output from `skill-research`.
- `review`: output from `receipt-review` when improving an existing skill.

Return structured output with:

- `skill_spec`: proposed skill contract or skill update.
- `execution_plan`: proposed composite runner or step plan when needed.
- `harness_fixture`: replayable fixture inputs and expectations.
- `acceptance_checks`: tests or checks the generated artifact must pass.
