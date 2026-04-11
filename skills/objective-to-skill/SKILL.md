---
name: objective-to-skill
description: Turn a product or automation objective into a bounded runx skill package proposal.
---

# Objective To Skill

Convert an objective into a practical runx skill package proposal.

This skill coordinates decomposition, research, and harness authoring to produce:

- a bounded skill contract
- a composite execution plan when the capability needs multiple checkpoints
- a replayable harness fixture
- acceptance checks for the first implementation slice

Required inputs:

- `objective`: the capability or automation objective to design.

Optional inputs:

- `project_context`: repo, product, or operator context that constrains the design.

Keep outputs concrete, testable, and publishable.
