# Fluent Claude Plugin

This public plugin bundle is OSS-first.

Default MCP config:

- `claude-plugin/fluent/.mcp.json` points at Fluent open-source runtime on `http://127.0.0.1:8788/mcp`

Recommended setup:

1. Start Fluent open-source runtime from the repo root with `npm run oss:start -- --host 127.0.0.1 --port 8788`.
2. Run `npm run scaffold:mcp -- --client claude --track oss --base-url http://127.0.0.1:8788 --out claude-plugin/fluent/.mcp.json`.
3. Reconnect Claude so it refreshes the MCP registration.

This public bundle intentionally focuses on OSS client config assets. Hosted packaging and internal operator flows are maintained outside the OSS repo.
