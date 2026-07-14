# Run Fluent Yourself

Fluent is open source. This guide covers the supported self-hosted open-source runtime for Fluent.

Public release references:

- public repo: [shaner-git/fluent-oss](https://github.com/shaner-git/fluent-oss)
- current open-source runtime docs: [docs/oss/README.md](https://github.com/shaner-git/fluent-oss/blob/main/docs/oss/README.md)
- release history: [Fluent open-source runtime releases](https://github.com/shaner-git/fluent-oss/releases)
- changelog: [../CHANGELOG.md](../CHANGELOG.md)
- known limitations: [./oss/fluent-oss-known-limitations.md](./oss/fluent-oss-known-limitations.md)
- setup matrix: [./oss/fluent-oss-setup-matrix.md](./oss/fluent-oss-setup-matrix.md)
- upgrade notes: [./oss/fluent-oss-upgrade-notes.md](./oss/fluent-oss-upgrade-notes.md)
- Docker notes: [./oss/fluent-oss-docker-notes.md](./oss/fluent-oss-docker-notes.md)

## Runtime Boundaries

- single-user in v1
- self-hostable over HTTP
- bearer-token protected `/mcp`
- open `GET /health`
- open `GET /codex-probe`
- same MCP contract as Fluent at meetfluent.app
- supported minimum contract version: `2026-07-09.fluent-core-v2.0`
- local DB and artifacts stored under `~/.fluent/` by default
- no OAuth, no `/authorize`, no `/token`
- direct runtime support is documented for Node.js `22.x`
- public `--track cloud` scaffolds are compatibility helpers and require an explicit `--base-url`

## Public Export Boundary

This guide ships in both the canonical source repo and the generated public repo. The detailed export boundary, excluded artifact classes, and scrub gates live in [./oss/fluent-oss-artifact-boundary.md](./oss/fluent-oss-artifact-boundary.md).

## Local Laptop Usage

Use Node.js 22.x for the direct runtime. With `nvm`, run:

```bash
nvm install 22
nvm use 22
node --version
```

Install dependencies:

```bash
npm install
```

Optional but recommended for evaluation: isolate Fluent state from your real home directory before bootstrapping a token. `FLUENT_OSS_ROOT` is honored by `oss:token:*`, `oss:seed:demo`, `oss:start`, `scaffold:mcp`, and `verify:oss-parity`.

```bash
export FLUENT_OSS_ROOT="$(pwd)/tmp/fluent-oss-demo-root"
```

PowerShell:

```powershell
$env:FLUENT_OSS_ROOT = Join-Path (Get-Location) 'tmp\fluent-oss-demo-root'
```

Bootstrap a token:

```bash
npm run oss:token:bootstrap
```

Seed the OSS demo profile. This command is safe to rerun: stable style, recipe, meal-plan, inventory, and budget records are updated; budget spend is only topped up to the fixture target.

```bash
npm run oss:seed:demo
```

Start the server:

```bash
npm run oss:start -- --host 127.0.0.1 --port 8788
```

Print the token:

```bash
npm run oss:token:print
```

Prove `/mcp` answers with the bearer token and seeded data:

```bash
export TOKEN="$(npm run -s oss:token:print | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token))')"
node --input-type=module -e "import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8788/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + process.env.TOKEN } } }); const client = new Client({ name: 'fluent-oss-proof', version: '1.0.0' }, { capabilities: {} }); await client.connect(transport); const result = await client.callTool({ name: 'fluent_list_items', arguments: { domain: 'style', item_type: 'style_item', limit: 5 } }); console.log(JSON.stringify(result.structuredContent ?? result.content, null, 2)); await transport.close();"
```

Generate a Codex config:

```bash
npm run scaffold:mcp -- --client codex --track oss --base-url http://127.0.0.1:8788
```

Generate a Claude config:

```bash
npm run scaffold:mcp -- --client claude --track oss --base-url http://127.0.0.1:8788
```

Generate an OpenClaw config:

```bash
npm run scaffold:mcp -- --client openclaw --track oss --base-url http://127.0.0.1:8788
```

For OpenClaw, this scaffold output is the native `mcp.servers.fluent` JSON block you should register with `openclaw mcp set fluent ...`.

OpenClaw package ownership:

- the supported public OpenClaw install surface is the standalone `fluent-openclaw` package
- `openclaw-plugin/fluent` in this public repo is the bundled helper copy with its own metadata and versioning
- do not describe the bundled helper version as the published `fluent-openclaw` release line

## Docker Compose Usage

Start Fluent with the bundled open-source defaults:

```bash
docker compose --env-file .env.oss.example up --build
```

If you want to customize ports or the persistent root, copy the example environment file first:

```bash
cp .env.oss.example .env.oss
```

Then run:

```bash
docker compose --env-file .env.oss up --build
```

Print the token from inside the container:

```bash
docker compose exec fluent-oss npm run oss:token:print
```

The named volume persists:

- SQLite data
- artifact storage
- local token state

## LAN / VPS / Self-Hosted Deployment

Bind intentionally outside localhost when you want another machine or a reverse proxy to reach the server:

```bash
npm run oss:start -- --host 0.0.0.0 --port 8788
```

Recommended pattern:

1. Run Fluent on a private interface or internal port.
2. Put TLS and any extra perimeter controls at the reverse proxy layer.
3. Forward only `/mcp`, `/health`, `/codex-probe`, and any image routes you intend to expose.
4. Keep the bearer token secret even behind the proxy.

## Token Management

Bootstrap:

```bash
npm run oss:token:bootstrap
```

Print:

```bash
npm run oss:token:print
```

Rotate:

```bash
npm run oss:token:rotate
```

Token state lives under:

- `~/.fluent/auth/oss-access-token.json`

If `FLUENT_OSS_ROOT` is set, token state instead lives under:

- `$FLUENT_OSS_ROOT/auth/oss-access-token.json`

Preferred auth environment variable:

- `FLUENT_OSS_TOKEN`

Bridge compatibility remains available for:

- `FLUENT_LOCAL_TOKEN`
- `~/.fluent/auth/local-access-token.json`

Preferred storage-root environment variable:

- `FLUENT_OSS_ROOT`

## Snapshot Import / Export

Export an OSS backup:

```bash
npm run oss:export:snapshot -- --out "./tmp/fluent-oss-snapshot.json"
```

Export from the experimental Postgres + S3 backend with the same snapshot format:

```bash
npm run oss:export:snapshot -- --backend postgres-s3 --out "./tmp/fluent-oss-postgres-s3-snapshot.json"
```

Restore that backup into a fresh root:

```bash
npm run oss:import:snapshot -- --root "./tmp/fluent-restore" --file "./tmp/fluent-oss-snapshot.json"
```

Restore into the experimental Postgres + S3 backend:

```bash
npm run oss:import:snapshot -- --backend postgres-s3 --file "./tmp/fluent-oss-postgres-s3-snapshot.json"
```

Current portability boundary:

- relational rows and artifact metadata move cleanly between SQLite OSS and Postgres + S3 OSS
- artifact bytes themselves are not embedded in the snapshot JSON
- moving binary artifact content between storage backends remains an operator workflow outside this pass

## Experimental Postgres + S3 OSS Backend

The default supported OSS backend remains SQLite plus filesystem storage. There is also an experimental OSS backend that keeps the same MCP contract while swapping storage to:

- Postgres for relational state
- S3-compatible object storage for artifacts

Bootstrap with the example env file:

```bash
cp .env.postgres-s3.example .env.postgres-s3
```

Export those env vars into your shell, then validate the backend:

```bash
npm run oss:check:postgres-s3 -- --host 127.0.0.1 --port 8788
```

Start the experimental runtime:

```bash
npm run oss:start:postgres-s3 -- --host 127.0.0.1 --port 8788
```

## Verification

Start OSS, then run:

```bash
npm run verify:oss-parity -- --base-url "http://127.0.0.1:8788"
```

For isolated evaluation, keep `FLUENT_OSS_ROOT` exported in the same shell, or pass `--root ./tmp/fluent-oss-demo-root`. The verifier also honors `FLUENT_OSS_BASE_URL` if npm flag forwarding is unavailable in your shell.

This verifies:

- open health and probe endpoints
- bearer-token protection on `/mcp`
- contract parity
- reversible writes
- domain-event logging
