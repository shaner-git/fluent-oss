# Fluent OpenClaw Plugin

This public OpenClaw plugin package is OSS-first.

Default MCP config:

- `openclaw-plugin/fluent/.mcp.json` is an OpenClaw-native Fluent server block for `mcp.servers.fluent`

Recommended setup:

1. Start Fluent OSS from the repo root with `npm run oss:start -- --host 127.0.0.1 --port 8788`.
2. Install this native plugin so OpenClaw loads the Fluent skills.
3. Run `npm run scaffold:mcp -- --client openclaw --track oss --base-url http://127.0.0.1:8788 --out ./tmp/fluent-openclaw.json`.
4. Register that server with `openclaw --profile <name> mcp set fluent "<paste-the-json-from-./tmp/fluent-openclaw.json>"`.
5. Start a fresh OpenClaw session or use `openclaw agent --local --session-id <new-id> ...`.

This public package ships as a native OpenClaw plugin with `openclaw.plugin.json` plus `package.json`, but the live MCP connection should still be applied through native profile config.

This public OpenClaw package intentionally omits the bundled Meals browser and retailer-execution scripts so standard installs do not require the unsafe-install override.

This public plugin package intentionally focuses on OSS client config assets. Hosted packaging and internal operator flows are maintained outside the OSS repo.
