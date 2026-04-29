# Fluent OpenClaw Plugin

This bundled OpenClaw helper package is for running Fluent yourself.

It is not the published `fluent-openclaw` package. The supported public OpenClaw install surface stays the standalone `fluent-openclaw` repo/package, while this directory is the helper copy shipped inside the Fluent public export.

Default MCP config:

- `openclaw-plugin/fluent/.mcp.json` is an OpenClaw-native Fluent server block for `mcp.servers.fluent`

Recommended setup:

1. Start Fluent from the repo root with `npm run oss:start -- --host 127.0.0.1 --port 8788`.
2. Install this native plugin from the local helper directory only if you intentionally want the bundled public copy.
3. Run `npm run scaffold:mcp -- --client openclaw --track oss --base-url http://127.0.0.1:8788 --out ./tmp/fluent-openclaw.json`.
4. Register that server with `openclaw --profile <name> mcp set fluent "<paste-the-json-from-./tmp/fluent-openclaw.json>"`.
5. Start a fresh OpenClaw session or use `openclaw agent --local --session-id <new-id> ...`.

This bundled helper ships as a native OpenClaw plugin with `openclaw.plugin.json` plus `package.json`, but the live MCP connection should still be applied through native profile config.

This bundled OpenClaw helper intentionally omits the bundled Meals browser and retailer-execution scripts so standard installs do not require the unsafe-install override.

This helper package intentionally focuses on local client config assets. Managed packaging and the public `fluent-openclaw` release line are maintained outside the public repo.
