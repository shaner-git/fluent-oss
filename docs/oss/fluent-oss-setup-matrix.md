# Fluent OSS Setup Matrix

Supported setup paths for the public `v0.1.0` release.

| Setup path | When to use it | Runtime requirement | Storage | Auth | Status |
| --- | --- | --- | --- | --- | --- |
| Direct local runtime | laptop or workstation self-hosting | Node.js `22.x` | SQLite + filesystem under `~/.fluent/` | bearer token | supported |
| Docker Compose | easiest repeatable local or homelab install | Docker Desktop or Docker Engine | named Docker volume | bearer token | supported |
| LAN or VPS behind reverse proxy | remote access from your own network or server | Node.js `22.x` or Docker | SQLite + filesystem by default | bearer token plus your own proxy perimeter | supported |
| Experimental Postgres + S3 | advanced operators who want managed relational or object storage | Node.js `22.x` or Docker plus Postgres and S3-compatible storage | Postgres + S3 | bearer token | experimental |

## Client Setup Matrix

| Client | Supported path | Notes |
| --- | --- | --- |
| Codex | `npm run scaffold:mcp -- --client codex --track oss --base-url <url>` | generated config targets Fluent OSS |
| Claude | `npm run scaffold:mcp -- --client claude --track oss --base-url <url>` | generated config targets Fluent OSS |
| OpenClaw | `openclaw plugins install fluent-openclaw` plus `openclaw fluent mcp oss --base-url <url> --token <oss-token>` | the checked-in `openclaw-plugin/fluent` bundle is the separate helper package `fluent-openclaw-oss-helper`; scaffold output remains a native `mcp.servers.fluent` block |

## Contract Support

- supported minimum contract version: `2026-04-20.fluent-core-v1.37`
- contract artifact: [../../contracts/fluent-contract.v1.json](../../contracts/fluent-contract.v1.json)
- contract notes: [../fluent-contract-v1.md](../fluent-contract-v1.md)
- OpenClaw package versioning: [./openclaw-package-versioning.md](./openclaw-package-versioning.md)
