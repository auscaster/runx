---
name: skill-research
description: Research best-in-class skill and composite execution patterns for a proposed runx flow.
---

# Skill Research

Research existing tools, standards, and skill patterns relevant to the objective.

Required inputs:

- `objective`: the build or skill objective being researched.

Optional inputs:

- `decomposition`: structured decomposition output from `objective-decompose`.

Return structured output with:

- `findings`: factual findings or design constraints.
- `recommended_flow`: proposed skill/execution flow.
- `sources`: source references when external research was performed.
- `risks`: adoption, safety, or implementation risks.
