---
name: sourcey
description: Generate Sourcey documentation for a project from explicit docs inputs.
---

# Sourcey

Use this skill to generate documentation through Sourcey's existing CLI from
explicitly supplied project context.

Required inputs:

- `project`: project root containing Sourcey inputs.
- `homepage_url`: canonical project homepage URL to include in docs context.
- `brand_name`: human-facing brand or project name for the generated docs context.
- `docs_inputs`: structured docs inputs, for example `{"mode":"config","config":"sourcey.config.ts"}` or `{"mode":"openapi","spec":"openapi.yaml"}`.

Optional inputs:

- `output_dir`: output directory for Sourcey docs; defaults to `<project>/.sourcey/runx-docs`.
- `sourcey_bin`: explicit Sourcey executable or JS entrypoint; defaults to `SOURCEY_BIN` or `sourcey` on `PATH`.

The skill does not discover repository facts implicitly. If brand, homepage, or
docs-source context is missing, runx asks for it through the caller boundary and
records the execution receipt. Sourcey's MCP support is treated as a docs input
format through `mcp.json`; it does not require the runx MCP adapter.
