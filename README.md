# Fluent open-source runtime

Fluent is open source. This repo runs Fluent yourself as a self-hosted MCP server for:

- meal planning and grocery workflows
- health planning and workout logging
- closet-aware style decisions

Use this repo when you want Fluent running on infrastructure you control. If you want managed onboarding, request Fluent early access on meetfluent.app. Both paths share the same MCP contract.

## Public Release

- public repo: [shaner-git/fluent-oss](https://github.com/shaner-git/fluent-oss)
- current quickstart: [docs/fluent-oss.md](https://github.com/shaner-git/fluent-oss/blob/main/docs/fluent-oss.md)
- current docs bucket: [docs/oss](https://github.com/shaner-git/fluent-oss/tree/main/docs/oss)
- release history: [Fluent open-source runtime releases](https://github.com/shaner-git/fluent-oss/releases)
- supported direct runtime: Node.js `22.x`
- supported minimum contract version: `2026-04-26.fluent-core-v1.48`

## Who This Is For

- people who want Fluent running on their own machine, NAS, VPS, or homelab
- Codex, Claude, and OpenClaw users who want an MCP server they control
- power users who are comfortable with a local token, local storage, and a small amount of setup

If you want the easiest path, managed early access is the simpler choice. If you want control, local data, and self-hosting flexibility, start here.

## What You Get

- a supported single-user open-source runtime
- Docker and direct Node.js runtime options
- MCP config generation for Codex, Claude, and OpenClaw
- snapshot backup and restore tooling
- shared contract and architecture docs
- an experimental Postgres + S3 backend for advanced self-hosting

## Current Limits

- single-user only in v1
- bearer-token auth instead of OAuth
- Postgres + S3 is experimental
- this repo focuses on self-hosting, not managed billing or onboarding
- `npm run scaffold:mcp -- --track cloud` remains a compatibility scaffold and requires an explicit `--base-url` in this public repo

## Managed Early Access And Running Fluent Yourself

| Option | Best for | Auth | Ops model |
| --- | --- | --- | --- |
| managed early access | people who want managed setup | OAuth | Fluent runs it for you |
| Fluent open-source runtime | self-hosters and power users | bearer token | you run it yourself |

## Prerequisites

- Node.js 22.x if you want to run Fluent open-source runtime directly
- Docker Desktop or Docker Engine if you prefer the container path
- an MCP client such as Codex, Claude Desktop, or OpenClaw

By default, Fluent open-source runtime:

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
- Fluent open-source runtime starts on `http://127.0.0.1:8788`

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

Fluent open-source runtime supports an experimental `Postgres + S3-compatible storage` mode for more advanced deployments.

Start with:

```bash
cp .env.postgres-s3.example .env.postgres-s3
```

Then see the operator guide:

- [docs/oss/fluent-oss-postgres-s3.md](./docs/oss/fluent-oss-postgres-s3.md)

## Docs

- changelog: [CHANGELOG.md](./CHANGELOG.md)
- open-source runtime operator docs: [docs/oss/README.md](./docs/oss/README.md)
- open-source runtime operator guide: [docs/fluent-oss.md](./docs/fluent-oss.md)
- open-source runtime artifact boundary: [docs/oss/fluent-oss-artifact-boundary.md](./docs/oss/fluent-oss-artifact-boundary.md)
- known limitations: [docs/oss/fluent-oss-known-limitations.md](./docs/oss/fluent-oss-known-limitations.md)
- setup matrix: [docs/oss/fluent-oss-setup-matrix.md](./docs/oss/fluent-oss-setup-matrix.md)
- upgrade notes: [docs/oss/fluent-oss-upgrade-notes.md](./docs/oss/fluent-oss-upgrade-notes.md)
- Docker notes: [docs/oss/fluent-oss-docker-notes.md](./docs/oss/fluent-oss-docker-notes.md)
- GitHub release checklist: [docs/oss/fluent-oss-github-release-checklist.md](./docs/oss/fluent-oss-github-release-checklist.md)
- shared contract and architecture docs: [docs/shared/README.md](./docs/shared/README.md)
- release gate: [docs/fluent-release-gate.md](./docs/fluent-release-gate.md)

## About This Repo

This public repo is generated from Fluent's canonical private source repo so managed and open-source paths stay aligned. Public contributions are welcome, but the source of truth remains the canonical repo and changes are re-exported here.

The export boundary is documented in [docs/oss/fluent-oss-artifact-boundary.md](./docs/oss/fluent-oss-artifact-boundary.md), including what ships publicly, what stays private, and which scrub gates block unsafe exports.
