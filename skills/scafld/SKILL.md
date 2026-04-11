---
name: scafld
description: Run existing scafld lifecycle commands under runx governance.
---

# scafld

Use this skill when runx needs to govern an existing scafld lifecycle command.

The skill does not replace scafld. It calls the scafld CLI with explicit argv,
records the runx receipt for the hop, and lets the chain define which command is
allowed at each step.

Required inputs:

- `command`: existing scafld command to run: `init`, `new`, `spec`, `approve`, `start`, `exec`, `execute`, `audit`, `review`, `complete`, `validate`, or `status`.

Optional inputs:

- `task_id`: scafld task id for lifecycle commands.
- `fixture`: workspace root containing `.ai/`; used as the scafld working directory.
- `title`: title passed to `scafld new`.
- `size`: size passed to `scafld new`.
- `risk`: risk passed to `scafld new`.
- `phase`: optional phase passed to `scafld exec --phase`.
- `scafld_bin`: explicit scafld executable path; defaults to `SCAFLD_BIN` or `scafld` on `PATH`.

Structured commands (`review`, `complete`, `status`, and `validate`) are run
with `--json` so chain policy and caller-mediated review steps consume fields,
not terminal prose. `review` opens the review artifact and returns the review
file path plus prompt. The actual adversarial review is caller-mediated: the
attached caller may be the same agent, a peer reviewer agent, or a human
channel. In that mode, the `agent` runner receives `task_id`, `review_file`,
and `review_prompt`; it must fill the review file before `complete` runs.
