# Fluent OSS

Fluent OSS is a self-hosted MCP server for:

- meal planning and grocery workflows
- health planning and workout logging
- closet-aware style decisions

It is the open-source self-hosted track of Fluent. If you want Fluent without running infrastructure yourself, Hosted Fluent is the managed commercial option. Both tracks share the same MCP contract.

## Public Release

- GitHub release: [Fluent OSS v0.1.0](https://github.com/shaner-git/fluent-oss/releases/tag/v0.1.0)
- release-pinned quickstart: [docs/fluent-oss.md at `v0.1.0`](https://github.com/shaner-git/fluent-oss/blob/v0.1.0/docs/fluent-oss.md)
- release-pinned docs bucket: [docs/oss at `v0.1.0`](https://github.com/shaner-git/fluent-oss/tree/v0.1.0/docs/oss)
- supported direct runtime: Node.js `22.x`
- supported minimum contract version: `2026-04-13.fluent-core-v1.34`

## Who This Is For

- people who want Fluent running on their own machine, NAS, VPS, or homelab
- Codex, Claude, and OpenClaw users who want an MCP server they control
- power users who are comfortable with a local token, local storage, and a small amount of setup

If you want the easiest path, Hosted Fluent will be the simpler choice. If you want control, local data, and self-hosting flexibility, start here.

## What You Get

- a supported single-user OSS runtime
- Docker and direct Node.js runtime options
- MCP config generation for Codex, Claude, and OpenClaw
- snapshot backup and restore tooling
- shared contract and architecture docs
- an experimental Postgres + S3 backend for advanced self-hosting

## Current Limits

- single-user only in v1
- bearer-token auth instead of OAuth
- Postgres + S3 is experimental
- this repo focuses on self-hosting, not Hosted billing or onboarding
- `npm run scaffold:mcp -- --track cloud` requires an explicit `--base-url` in this public repo until Fluent Cloud is GA

## Hosted Vs OSS

| Option | Best for | Auth | Ops model |
| --- | --- | --- | --- |
| Hosted Fluent | people who want managed setup | OAuth | Fluent runs it for you |
| Fluent OSS | self-hosters and power users | bearer token | you run it yourself |

## Prerequisites

- Node.js 22.x if you want to run Fluent OSS directly
- Docker Desktop or Docker Engine if you prefer the container path
- an MCP client such as Codex, Claude Desktop, or OpenClaw

By default, Fluent OSS:

- listens on `127.0.0.1`
- stores data under `~/.fluent/`
- protects `/mcp` with a bearer token

## Quickstart

### 1. Install dependencies

```bash
npm install
```

### 2. Create an OSS token

```bash
npm run oss:token:bootstrap
```

Expected result:
- Fluent creates local auth state under `~/.fluent/`
- `npm run oss:token:print` prints the token you will use with your MCP client

### 3. Start the server

```bash
npm run oss:start -- --host 127.0.0.1 --port 8788
```

Expected result:
- Fluent OSS starts on `http://127.0.0.1:8788`

Optional health check:

```bash
curl http://127.0.0.1:8788/health
```

### 4. Generate MCP client config

For Codex:

```bash
npm run scaffold:mcp -- --client codex --track oss --base-url http://127.0.0.1:8788
```

For Claude:

```bash
npm run scaffold:mcp -- --client claude --track oss --base-url http://127.0.0.1:8788
```

For OpenClaw:

```bash
npm run scaffold:mcp -- --client openclaw --track oss --base-url http://127.0.0.1:8788
```

For OpenClaw, the scaffold output is the native `mcp.servers.fluent` JSON block you should register with `openclaw mcp set fluent ...`.

The scaffold command automatically uses your local OSS token unless you override it with `--token` or `--root`.

### 5. Verify the local setup

```bash
npm run verify:oss-parity -- --base-url http://127.0.0.1:8788
```

For the broader local check suite:

```bash
npm run check
```

## Docker Quickstart

If you prefer Docker:

```bash
docker compose --env-file .env.oss.example up --build
```

Then print the token from the running container:

```bash
docker compose exec fluent-oss npm run oss:token:print
```

## Backups

Export a snapshot:

```bash
npm run oss:export:snapshot -- --out ./tmp/fluent-oss-snapshot.json
```

Restore a snapshot:

```bash
npm run oss:import:snapshot -- --file ./tmp/fluent-oss-snapshot.json
```

## Experimental Postgres + S3

Fluent OSS supports an experimental `Postgres + S3-compatible storage` mode for more advanced deployments.

Start with:

```bash
cp .env.postgres-s3.example .env.postgres-s3
```

Then see the operator guide:

- [docs/oss/fluent-oss-postgres-s3.md](./docs/oss/fluent-oss-postgres-s3.md)

## Docs

- changelog: [CHANGELOG.md](./CHANGELOG.md)
- OSS operator docs: [docs/oss/README.md](./docs/oss/README.md)
- OSS operator guide: [docs/fluent-oss.md](./docs/fluent-oss.md)
- known limitations: [docs/oss/fluent-oss-known-limitations.md](./docs/oss/fluent-oss-known-limitations.md)
- setup matrix: [docs/oss/fluent-oss-setup-matrix.md](./docs/oss/fluent-oss-setup-matrix.md)
- upgrade notes: [docs/oss/fluent-oss-upgrade-notes.md](./docs/oss/fluent-oss-upgrade-notes.md)
- Docker notes: [docs/oss/fluent-oss-docker-notes.md](./docs/oss/fluent-oss-docker-notes.md)
- GitHub release checklist: [docs/oss/fluent-oss-github-release-checklist.md](./docs/oss/fluent-oss-github-release-checklist.md)
- shared contract and architecture docs: [docs/shared/README.md](./docs/shared/README.md)
- release gate: [docs/fluent-release-gate.md](./docs/fluent-release-gate.md)

## About This Repo

This public repo is generated from Fluent's canonical private source repo so Hosted and OSS stay aligned. Public contributions are welcome, but the source of truth remains the canonical repo and changes are re-exported here.
