# Fluent Codex Plugin

This public plugin bundle is for running Fluent yourself.

Default MCP config:

- `plugins/fluent/.mcp.json` points at local Fluent on `http://127.0.0.1:8788/mcp`

Recommended setup:

1. Start Fluent from the repo root with `npm run oss:start -- --host 127.0.0.1 --port 8788`.
2. Run `npm run scaffold:mcp -- --client codex --track oss --base-url http://127.0.0.1:8788 --out plugins/fluent/.mcp.json`.
3. Reconnect Codex so it refreshes the MCP registration.

This public bundle intentionally focuses on local client config assets. Managed packaging and internal operator flows are maintained outside the public repo.
