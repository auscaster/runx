---
name: docs-preview
description: Generate a private Sourcey preview packet for one explicit repository target after docs-scan recommends a preview.
---

# Docs Preview

`docs-preview` is the bounded preview lane for Sourcey adoption candidates.

It starts from one explicit repository target, runs `docs-scan`, confirms the
repo is still a preview candidate, stages the repo into an isolated preview
workspace, then runs the existing governed `sourcey` lane there and packages
the result into a `runx.docs_preview.v1` packet.

Treat `docs-scan` as the explicit gate. When the scan says the existing docs are
already strong enough, do not call `docs-preview`; stop at the scan packet.

The original repository is not mutated by the preview run. Preview authoring
happens in a staged workspace and the packet carries the migration bundle
separately.

## Inputs

- `repo_root`: explicit repository root.
- `repo_url` (optional): canonical repository URL.
- `docs_url` (optional): current docs URL.
- `default_branch` (optional): default branch for the target repo.
- `preview_context` (optional): bounded operator context for the preview run.
- `sourcey_bin` (optional): explicit Sourcey executable or JS entrypoint.

## Output

The default runner emits a `runx.docs_preview.v1` packet with:

- `scan`
- `sourcey_plan`
- `build_report`
- `verification_report`
- `before_after_evidence`
- `migration_bundle`
- `operator_summary`

## Constraints

- Scan only one explicit target.
- Use it only after `docs-scan` recommends a preview.
- Stage preview work into an isolated workspace instead of mutating the source repo.
- Keep PR creation, publication, and outreach out of this skill.
