# Upstream Registry Bindings

Bindings connect an upstream-owned `SKILL.md` to runx execution metadata.

The upstream repository remains the source of truth for the portable skill
document. This directory stores runx-owned binding data:

- `registry-binding.json`: upstream repo/path/commit provenance, trust tier,
  registry owner, publication state, and proof pointers.
- `x.yaml`: runx runner metadata, harness cases, policy, scopes, and receipt
  expectations.

Publishing materializes a pinned registry package into `dist/` from the
upstream `SKILL.md` plus the local `x.yaml`. The generated package is an
immutable registry artifact, not the source document.

Example:

```bash
node scripts/materialize-upstream-skill-binding.mjs \
  bindings/nilstate/icey-server-operator/registry-binding.json \
  --output-dir dist/upstream-bindings/nilstate/icey-server-operator
```
