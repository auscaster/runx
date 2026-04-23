---
name: vuln-scan
description: Analyze dependency or ecosystem risk and produce remediation and advisory packets.
---

# Vulnerability Scan

Review one dependency surface or project scope and produce a bounded security
packet. This skill is for operator-facing risk analysis, remediation planning,
and advisory drafting. It is not a license to run arbitrary destructive scans.

Keep the output practical: what is affected, how serious it is, what to do
next, and whether a public advisory is justified.

## Quality Profile

- Purpose: turn one bounded dependency or ecosystem risk surface into a
  remediation and advisory decision.
- Audience: maintainers, operators, and affected users who need clear risk and
  next steps.
- Artifact contract: inventory, advisories, remediation plan, operator summary,
  advisory draft, maintainer summary, and disclosure checklist as appropriate.
- Evidence bar: cite package data, versions, advisories, scan output, commits,
  or public references. Separate confirmed exposure from possible risk.
- Voice bar: calm security writing. No alarmism, no vague severity claims, and
  no public advisory language unless disclosure evidence supports it.
- Strategic bar: help the operator decide whether to patch, disclose, monitor,
  escalate, or stop.
- Stop conditions: return `needs_more_evidence`, `needs_human`, or
  `do_not_publish_advisory` when exposure, affected versions, or disclosure
  posture cannot be verified.

## Output

Scan runner:

- `dependency_inventory`: affected components and versions.
- `advisories`: findings with severity, exposure, and evidence.
- `remediation_plan`: concrete next actions.
- `operator_summary`: concise decision-ready summary.

Advisory runner:

- `advisory_draft`: public or maintainer-facing advisory text.
- `maintainer_summary`: concise summary for repo owners.
- `disclosure_checklist`: what to verify before public release.

## Inputs

- `target` (required): repo, lockfile, package set, or ecosystem slice.
- `objective` (optional): what the operator wants from this scan.
- `scan_context` (optional): known packages, incidents, or prior findings.
- `advisories` (optional): structured findings from the scan runner.
- `remediation_plan` (optional): structured remediation plan for the advisory pass.
