# runx OSS

Public open-source boundary for the runx CLI, trusted kernel, adapters, SDK, harness, local receipts, registry CE, marketplace adapters, official skills, and IDE plugin shells.

The npm CLI package is `@runxai/cli` and exposes the `runx` binary.

## Requirements

- Node.js 20+
- pnpm 10+
- No native runtime dependency is required for the CLI path.

## Install For Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Local CLI

```bash
pnpm --dir oss build
node oss/packages/cli/dist/index.js --help
node oss/packages/cli/dist/index.js skill ./oss/fixtures/skills/echo.md --message hello --json
node oss/packages/cli/dist/index.js skill ./oss/skills/objective-to-skill --objective "build sourcey docs skill" --json
```

Common commands:

```bash
runx skill search sourcey
runx skill add 0state/sourcey@1.0.0 --to ./skills
runx skill ./skills/sourcey --runner sourcey-cli --project .
runx skill ./skills/objective-to-skill --objective "build github review skill" --json
runx skill inspect <receipt-id> --json
runx history --json
runx harness ./fixtures/harness/echo-skill.yaml --json
runx config set agent.provider openai
runx config set agent.model gpt-5.4
runx config set agent.api_key "$OPENAI_API_KEY"
```

## Skill And X Model

Portable skills stay as standard markdown instructions. Execution metadata lives in a sibling X file or registry metadata:

```text
skills/sourcey/
  SKILL.md
  x.yaml
```

Flat marketplace imports remain supported:

```text
skills/sourcey.md
skills/sourcey.x.yaml
```

See `../docs/skill-x-model.md` for resolution rules, runner trust levels, and composite skill behavior.

See `../docs/evolution-model.md` for the internal skill taxonomy, canonical
evolve phase geometry, and the distinction between builder, control,
integration, and domain skills.

## Receipts

Local receipts are append-only JSON files under `.runx/receipts` unless `RUNX_RECEIPT_DIR` is set. `runx inspect` and `runx history` verify receipt signatures and surface `verified`, `unverified`, or `invalid` status.

## Build And Pack

```bash
pnpm --dir oss build
pnpm --dir oss test tests/cli-package.test.ts
cd oss/packages/cli
npm pack --dry-run --json
```

The package must include `dist/index.js` and `dist/index.d.ts`, and `dist/index.js` must be executable.

## Boundary Rules

- `oss/` must not import from `cloud/`.
- State-machine and policy packages remain pure.
- Executor dispatches adapters but does not write receipts.
- Adapters own side effects.
- CLI, SDK, IDE plugin, and MCP entrypoints delegate to runner contracts instead of duplicating the engine.
