# Fluent open-source runtime Known Limitations

These limits are part of the supported `v0.1.0` public OSS release.

## Runtime Limits

- single-user only
- bearer-token auth only on `/mcp`
- no OAuth, `/authorize`, or `/token` flow in OSS
- plain HTTP runtime by default; use a reverse proxy for TLS and perimeter controls

## Deployment Limits

- direct local runtime support is documented for Node.js `22.x`
- Docker Compose is the primary packaged path
- LAN or VPS exposure is supported, but only when you intentionally bind outside localhost and add your own proxy and network controls

## Storage Limits

- default supported backend is SQLite plus filesystem storage under `~/.fluent/`
- Postgres + S3 is experimental in `v0.1.0`
- snapshot JSON captures relational state and artifact metadata, but not binary artifact bytes

## Product Limits

- OSS focuses on self-hosting and local operator control
- hosted billing, hosted onboarding, and Fluent early access OAuth flows are out of scope for OSS
- packaged client assets assume you will scaffold fresh MCP config against your own OSS base URL and token
