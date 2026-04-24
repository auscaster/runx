from runx import RunxClient, create_openai_surface_adapter, create_surface_bridge


def main() -> None:
    client = RunxClient()
    bridge = create_surface_bridge(client)
    adapter = create_openai_surface_adapter(bridge)
    response = adapter.run(
        "skills/sourcey",
        inputs={"project": "."},
        resolver=lambda context: True if context.request.get("kind") == "approval" else None,
    )
    print(response)


if __name__ == "__main__":
    main()
