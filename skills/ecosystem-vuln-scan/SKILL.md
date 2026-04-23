---
name: ecosystem-vuln-scan
description: Scan one dependency surface, draft the advisory, and package the approved publication bundle.
---

# Ecosystem Vulnerability Scan

This is the public-facing advisory lane built on top of `vuln-scan`.

It keeps the security flow bounded and reviewable:

1. produce the risk packet
2. draft the advisory
3. require approval before anything is packaged for publication

## Quality Profile

- Purpose: compose scan, advisory drafting, and approval into one public-facing
  security lane.
- Audience: maintainers, operators, and external readers affected by the
  advisory.
- Artifact contract: risk packet, advisory draft, approval decision, and
  publish packet.
- Evidence bar: public-facing claims must trace back to the risk packet and
  verified advisory sources. Speculation remains private operator context.
- Voice bar: precise advisory language with clear impact, affected scope, and
  remediation. No sensationalism or generic security filler.
- Strategic bar: publish only when the advisory materially helps affected
  users. Otherwise keep the output as an operator remediation packet.
- Stop conditions: stop at review when severity, exposure, remediation, or
  disclosure authorization is not clear.

## Inputs

- `target` (required): repo, lockfile, package set, or ecosystem slice.
- `objective` (optional): what the operator wants from the scan.
- `channel` (optional): final advisory channel; defaults to `advisory`.
- `scan_context` (optional): known incidents or previous findings.
