# Fluent open-source runtime OpenClaw Helper

This directory is the bundled OpenClaw helper package exported with `fluent-oss`.

It is not the published standalone `fluent-openclaw` package. If you want the public OpenClaw install surface, use:

```bash
openclaw plugins install fluent-openclaw
```

Default MCP config:

- `openclaw-plugin/fluent/.mcp.json` is an OpenClaw-native Fluent server block for `mcp.servers.fluent`

Recommended setup:

1. Start Fluent open-source runtime from the repo root with `npm run oss:start -- --host 127.0.0.1 --port 8788`.
2. Install the published OpenClaw package with `openclaw plugins install fluent-openclaw`.
3. Bind Fluent open-source runtime into OpenClaw with `openclaw fluent mcp oss --base-url http://127.0.0.1:8788 --token <oss-token>`.
4. Verify the connection with `openclaw fluent doctor oss --base-url http://127.0.0.1:8788 --token <oss-token>`.
5. Start a fresh OpenClaw session or use `openclaw agent --local --session-id <new-id> ...`.

If you are validating the exported OSS helper itself, this package remains installable from the repo checkout, but it should only be described as the bundled helper package `fluent-openclaw-oss-helper`.

This bundled OpenClaw helper intentionally omits the bundled Meals browser and retailer-execution scripts so standard installs do not require the unsafe-install override.

This helper package focuses on OSS client config assets. The published standalone OpenClaw package and its release line are maintained in the separate `fluent-openclaw` repository.
