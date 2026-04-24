# runx-py

Python SDK for [runx](https://runx.ai) — the governed runtime for agent skills, tools, and chains.

`runx-py` is a thin Python client over the `runx` CLI and its JSON surfaces. Install the CLI separately (`@runxhq/cli` on npm), then use this package from Python to search and run skills, resume paused runs, and bridge results into popular agent frameworks.

## Install

```bash
pip install runx-py
```

You will also need the `runx` CLI on your `PATH`:

```bash
npm install -g @runxhq/cli
```

## Usage

```python
from runx import RunxClient

client = RunxClient()

# Search the registry
for result in client.search_skills("sourcey"):
    print(result.skill_id, result.version)

# Run a skill
report = client.run_skill("skills/sourcey", inputs={"project": "."})
print(report["status"])
```

## Framework adapters

Bridge runx into an existing agent framework (OpenAI, Anthropic, CrewAI, LangChain, Vercel AI):

```python
from runx import RunxClient, create_openai_surface_adapter, create_surface_bridge

adapter = create_openai_surface_adapter(create_surface_bridge(RunxClient()))
response = adapter.run("skills/sourcey")
```

The bridge translates paused runs (required inputs, approval gates) into framework-native tool messages, so your agent loop can resolve them and resume.

## Links

- Homepage: <https://runx.ai>
- Documentation: <https://runx.ai/docs>
- Source: <https://github.com/runxhq/runx>
- Issues: <https://github.com/runxhq/runx/issues>

## Releasing

See [RELEASING.md](RELEASING.md) for the automated tag-driven publish flow.

## License

Apache-2.0
