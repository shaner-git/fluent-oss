# Fluent OSS

Fluent OSS is the supported self-hosted open-source runtime for Fluent.

Public release references:

- release notes: [../CHANGELOG.md](../CHANGELOG.md)
- current OSS docs: [./oss/README.md](./oss/README.md)
- public release guide: [./fluent-release-gate.md](./fluent-release-gate.md)
- changelog: [../CHANGELOG.md](../CHANGELOG.md)
- known limitations: [./oss/fluent-oss-known-limitations.md](./oss/fluent-oss-known-limitations.md)
- setup matrix: [./oss/fluent-oss-setup-matrix.md](./oss/fluent-oss-setup-matrix.md)
- upgrade notes: [./oss/fluent-oss-upgrade-notes.md](./oss/fluent-oss-upgrade-notes.md)
- Docker notes: [./oss/fluent-oss-docker-notes.md](./oss/fluent-oss-docker-notes.md)
- public artifact boundary: [./oss/public-artifact-boundary.md](./oss/public-artifact-boundary.md)

## OSS Boundaries

- single-user in v1
- self-hostable over HTTP
- bearer-token protected `/mcp`
- open `GET /health`
- open `GET /codex-probe`
- same MCP contract as Fluent Cloud
- supported minimum contract version: `2026-04-20.fluent-core-v1.37`
- local DB and artifacts stored under `~/.fluent/` by default
- no OAuth, no `/authorize`, no `/token`
- direct runtime support is documented for Node.js `22.x`
- public `--track cloud` scaffolds require an explicit `--base-url` until Fluent Cloud has a documented public endpoint

## Local Laptop Usage

Bootstrap a token:

```bash
npm run oss:token:bootstrap
```

Start the server:

```bash
npm run oss:start -- --host 127.0.0.1 --port 8788
```

Print the token:

```bash
npm run oss:token:print
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

Install the published OpenClaw package first:

```bash
openclaw plugins install fluent-openclaw
```

Then bind Fluent OSS with:

```bash
openclaw fluent mcp oss --base-url http://127.0.0.1:8788 --token <oss-token>
```

For OpenClaw, the scaffold output is still the native `mcp.servers.fluent` JSON block you can register manually with `openclaw mcp set fluent ...`.

The checked-in `openclaw-plugin/fluent/` bundle is the separate helper package `fluent-openclaw-oss-helper`, not the published `fluent-openclaw` package line.

## Docker Compose Usage

Start Fluent OSS with the bundled defaults:

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
- OSS token state

## LAN / VPS / Self-Hosted Deployment

Bind intentionally outside localhost when you want another machine or a reverse proxy to reach the server:

```bash
npm run oss:start -- --host 0.0.0.0 --port 8788
```

Recommended pattern:

1. Run Fluent OSS on a private interface or internal port.
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

Preferred auth environment variable:

- `FLUENT_OSS_TOKEN`

Bridge compatibility remains available for:

- `FLUENT_LOCAL_TOKEN`
- `~/.fluent/auth/local-access-token.json`

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

This verifies:

- open health and probe endpoints
- bearer-token protection on `/mcp`
- contract parity
- reversible writes
- domain-event logging
