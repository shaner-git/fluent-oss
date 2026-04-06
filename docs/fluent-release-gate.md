# Fluent OSS Release Gate

This is the public OSS release stack.

## Required Checks

Run these first:

```bash
npm install
npm run check
```

## Required OSS Checks

```bash
npm run oss:token:bootstrap
npm run oss:start -- --host 127.0.0.1 --port 8788
npm run verify:oss-parity -- --base-url "http://127.0.0.1:8788"
npm run scaffold:mcp -- --client codex --track oss --base-url "http://127.0.0.1:8788"
npm run scaffold:mcp -- --client claude --track oss --base-url "http://127.0.0.1:8788"
npm run oss:export:snapshot -- --out "./tmp/fluent-oss-snapshot.json"
npm run oss:import:snapshot -- --root "./tmp/fluent-restore" --file "./tmp/fluent-oss-snapshot.json"
```

OSS expectations:

- OSS exposes the shared MCP contract
- `/mcp` remains bearer-token protected
- localhost remains the default bind
- the runtime can intentionally bind outside localhost when requested
- Docker image and container smoke checks remain green
- OSS snapshot backup and restore stay format-compatible across supported OSS backends

## Experimental Postgres + S3 Validation

This backend is not required for supported-release readiness, but it has an explicit validation path:

```bash
npm run oss:check:postgres-s3 -- --host 127.0.0.1 --port 8788
npm run oss:start:postgres-s3 -- --host 127.0.0.1 --port 8788
npm run oss:export:snapshot -- --backend postgres-s3 --out "./tmp/fluent-oss-postgres-s3-snapshot.json"
npm run oss:import:snapshot -- --backend postgres-s3 --file "./tmp/fluent-oss-postgres-s3-snapshot.json"
npm run test:experimental:postgres-s3
```

Experimental expectations:

- the Postgres schema bootstraps from the checked-in current-state bootstrap file
- the runtime exposes additive `storageBackend: "postgres-s3"` metadata
- probe, health, and `/mcp` auth behavior stay contract-compatible
- snapshot shape remains the same table-oriented JSON envelope used by default OSS
