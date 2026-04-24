# @runxhq/create-skill

Initializer package behind:

```bash
npm create @runxhq/skill@latest my-skill
```

The canonical runx command remains:

```bash
runx new my-skill
```

This package is intentionally thin. It delegates to `@runxhq/cli` so the
scaffolding logic stays in one place.
