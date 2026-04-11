---
name: receipt-review
description: Review receipts and harness failures to propose bounded skill improvements.
---

# Receipt Review

Review the supplied receipt or harness failure and propose bounded improvements.

Optional inputs:

- `receipt_id`: receipt id to review when available.
- `receipt_summary`: sanitized receipt or harness summary.
- `harness_output`: sanitized failed harness output.
- `skill_path`: skill path being improved.

Return structured output with:

- `verdict`: `pass`, `needs_update`, or `blocked`.
- `failure_summary`: concise explanation of what failed.
- `improvement_proposals`: bounded changes to the skill or composite execution plan.
- `next_harness_checks`: replayable checks for the next iteration.
