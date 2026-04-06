# Fluent OSS Experimental Postgres + S3

This is the experimental storage backend for `Fluent OSS`.

It keeps the same deployment track and MCP contract as default OSS, but replaces the storage layer with:

- Postgres for relational state
- S3-compatible object storage for artifacts

## What This Is

- single-user OSS, just like the default SQLite runtime
- bearer-token protected `/mcp`
- additive `storageBackend: "postgres-s3"` metadata in health, probe, and capabilities
- experimental operator path, not the default supported production OSS backend

## Required Environment

Start from the example file:

```bash
cp .env.postgres-s3.example .env.postgres-s3
```

Required env vars:

- `FLUENT_POSTGRES_URL`
- `FLUENT_S3_ENDPOINT`
- `FLUENT_S3_REGION`
- `FLUENT_S3_BUCKET`
- `FLUENT_S3_ACCESS_KEY_ID`
- `FLUENT_S3_SECRET_ACCESS_KEY`
- `FLUENT_S3_FORCE_PATH_STYLE`

Optional OSS runtime env vars:

- `FLUENT_OSS_HOST`
- `FLUENT_OSS_PORT`
- `FLUENT_OSS_ROOT`

`FLUENT_OSS_ROOT` is still used for auth state and local operator files even though relational data and artifacts live outside the filesystem.

## Local Postgres + MinIO Stack

One practical local setup is:

- Postgres on `127.0.0.1:55432`
- MinIO on `127.0.0.1:59000`
- Fluent OSS experimental on `127.0.0.1:8788`

The example env file is already shaped for that style of stack.

## Validation

Check connectivity, schema bootstrap, and bucket access:

```bash
npm run oss:check:postgres-s3 -- --host 127.0.0.1 --port 8788
```

Start the runtime:

```bash
npm run oss:start:postgres-s3 -- --host 127.0.0.1 --port 8788
```

Then verify:

```bash
curl http://127.0.0.1:8788/health
curl http://127.0.0.1:8788/codex-probe
```

## Snapshot Import / Export

Export:

```bash
npm run oss:export:snapshot -- --backend postgres-s3 --out "./tmp/fluent-oss-postgres-s3-snapshot.json"
```

Import:

```bash
npm run oss:import:snapshot -- --backend postgres-s3 --file "./tmp/fluent-oss-postgres-s3-snapshot.json"
```

Portability in this pass covers:

- relational rows
- artifact metadata rows

Portability does not yet cover:

- artifact binary bytes inside the snapshot JSON
- automated object-store-to-object-store blob migration

## Notes

- The checked-in bootstrap schema is a current-state Postgres snapshot, not a replay of every historical SQLite/D1 migration.
- This backend exists to prove Fluent can run on a third storage stack without changing the MCP contract.
- Cloud and default SQLite OSS remain the supported release paths.
