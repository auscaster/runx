---
name: objective-decompose
description: Decompose a build objective into governed runx execution steps.
---

# Objective Decompose

Break the objective into a bounded runx execution plan.

Required inputs:

- `objective`: the build or skill objective to decompose.

Optional inputs:

- `project_context`: optional repo, product, or user context for the objective.

Return structured output with:

- `objective_summary`: concise restatement of the objective.
- `orchestration_steps`: ordered candidate runx execution steps.
- `required_skills`: skills or protocols needed by the chain.
- `open_questions`: missing context that should be asked before mutation.
