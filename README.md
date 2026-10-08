# Fluent open-source runtime

> [!WARNING]
> **This repository is archived. Fluent's open-source runtime is no longer maintained as of 2026-10-08.**
>
> - **Final version:** this export, contract `2026-10-08.fluent-core-v2.3`. The runtime is closet-only: Meals, budgets and Health are retired.
> - **No security updates.** No fixes, security patches or support will be released. If you keep running it, keep it on `127.0.0.1` or behind your own network controls.
> - **Hosted Fluent continues** at [meetfluent.app](https://meetfluent.app/).
> - **Export your data** with `npm run oss:export:snapshot -- --out ./fluent-snapshot.json` (see [Backups](#backups)).
> - The license is unchanged (see [LICENSE](./LICENSE)).

**Make your AI fluent in what matters.**

Fluent works inside compatible AI apps, bringing in the information that matters for each question. A clothing purchase can draw on your closet.

This repo is the final snapshot of Fluent running on infrastructure you control. Managed Fluent is available at [meetfluent.app](https://meetfluent.app/), and Fluent itself is free to use. At the time of archiving, both paths shared the same MCP contract; the hosted service may change after this point.

## Public Release

- public repo: [shaner-git/fluent-oss](https://github.com/shaner-git/fluent-oss)
- current quickstart: [docs/fluent-oss.md](https://github.com/shaner-git/fluent-oss/blob/main/docs/fluent-oss.md)
- current docs bucket: [docs/oss](https://github.com/shaner-git/fluent-oss/tree/main/docs/oss)
- release history: [Fluent open-source runtime releases](https://github.com/shaner-git/fluent-oss/releases)
- supported direct runtime: Node.js `22.x`
- supported minimum contract version: `2026-10-08.fluent-core-v2.3`

## Who This Is For

- people who want Fluent running on their own machine, NAS, VPS, or homelab
- Codex, Claude, and OpenClaw users who want an MCP server they control
- power users who are comfortable with a local token, local storage, and a small amount of setup

If you want Fluent managed for you, start at [meetfluent.app](https://meetfluent.app/). If you want control, local data, and self-hosting flexibility, start here.

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
- this repo focuses on self-hosting; managed operation lives at `meetfluent.app`
- the runtime does not download image links server-side, except files uploaded through ChatGPT (it cannot verify where other hostnames resolve): ordinary photo links are kept as references, and a Catalog-ready photo must be sent as image bytes (`image_file` or a `data:` URL)
- `npm run scaffold:mcp -- --track cloud` remains a compatibility scaffold and requires an explicit `--base-url` in this public repo

## Managed Fluent And Running Fluent Yourself

| Option | Best for | Auth | Ops model |
| --- | --- | --- | --- |
| Managed Fluent | people who want managed setup | OAuth | Fluent runs it for you |
| Fluent open-source runtime | self-hosters and power users | bearer token | you run it yourself |

## Prerequisites

- Node.js 22.x if you want to run Fluent open-source runtime directly. Check with `node --version`; with `nvm`, run `nvm install 22 && nvm use 22`.
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

Optional but recommended for evaluation: isolate Fluent state from your real home directory before bootstrapping a token.

```bash
export FLUENT_OSS_ROOT="$(pwd)/tmp/fluent-oss-demo-root"
```

PowerShell:

```powershell
$env:FLUENT_OSS_ROOT = Join-Path (Get-Location) 'tmp\fluent-oss-demo-root'
```

```bash
npm run oss:token:bootstrap
```

Expected result:
- Fluent creates local auth state under `$FLUENT_OSS_ROOT` when set, otherwise under `~/.fluent/`
- `npm run oss:token:print` prints the token you will use with your MCP client

### 3. Seed demo data

```bash
npm run oss:seed:demo
```

Expected result:
- Fluent writes a demo closet into the same local root used by the server (the seed also writes legacy recipe, meal-plan and inventory rows from the retired Meals domain; the closet-only tools do not expose them)
- The seed is safe to rerun: stable records update

### 4. Start the server

```bash
npm run oss:start -- --host 127.0.0.1 --port 8788
```

Expected result:
- Fluent open-source runtime starts on `http://127.0.0.1:8788`

Optional health check:

```bash
curl http://127.0.0.1:8788/health
```

Authenticated `/mcp` proof with the seeded closet:

```bash
export TOKEN="$(npm run -s oss:token:print | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token))')"
node --input-type=module -e "import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8788/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + process.env.TOKEN } } }); const client = new Client({ name: 'fluent-oss-proof', version: '1.0.0' }, { capabilities: {} }); await client.connect(transport); const result = await client.callTool({ name: 'fluent_list_closet_items', arguments: { domain: 'style', item_type: 'style_item', limit: 5 } }); console.log(JSON.stringify(result.structuredContent ?? result.content, null, 2)); await transport.close();"
```

### 5. Generate MCP client config

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

### 6. Verify the local setup

```bash
npm run verify:oss-parity -- --base-url http://127.0.0.1:8788
```

For isolated evaluation, keep `FLUENT_OSS_ROOT` exported in the same shell, or pass `--root ./tmp/fluent-oss-demo-root`. The verifier also honors `FLUENT_OSS_BASE_URL` if npm flag forwarding is unavailable in your shell.

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

This public repo was generated from Fluent's canonical private source repo so managed and open-source paths stayed aligned. It is archived and read-only: no further exports, contributions or releases will be made.

The export boundary is documented in [docs/oss/fluent-oss-artifact-boundary.md](./docs/oss/fluent-oss-artifact-boundary.md), including what ships publicly, what stays private, and which scrub gates block unsafe exports.
