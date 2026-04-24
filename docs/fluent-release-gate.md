# Fluent Release Gate

This public repo publishes Fluent OSS artifacts. Hosted Cloud and operator-only release gates stay outside this export boundary.

## Required Checks

Run these first:

```bash
npm install
npm run check
npm run export:oss:check
npm run check:public-scrub
```

## Public Artifact Boundary

The public scrub gate scans only the exported public surface defined in
[`../ops/public-oss-overlay/public-artifact-boundary.json`](../ops/public-oss-overlay/public-artifact-boundary.json).
Keep internal-only docs, operator playbooks, and hosted-only runbooks outside that boundary until they are intentionally exported.

## Fluent OSS Gate

Required OSS checks:

```bash
npm run oss:token:bootstrap
npm run oss:start -- --host 127.0.0.1 --port 8788
npm run verify:oss-parity -- --base-url "http://127.0.0.1:8788"
npm run scaffold:mcp -- --client codex --track oss --base-url "http://127.0.0.1:8788"
npm run scaffold:mcp -- --client claude --track oss --base-url "http://127.0.0.1:8788"
npm run scaffold:mcp -- --client openclaw --track oss --base-url "http://127.0.0.1:8788"
npm run oss:export:snapshot -- --out "./tmp/fluent-oss-snapshot.json"
npm run oss:import:snapshot -- --root "./tmp/fluent-restore" --file "./tmp/fluent-oss-snapshot.json"
```

OSS expectations:

- OSS exposes the same MCP contract as the supported public contract artifact
- `/mcp` remains bearer-token protected
- localhost remains the default bind
- the runtime can intentionally bind outside localhost when requested
- Codex and Claude bundles point at the same supported OSS endpoint shape, and OpenClaw scaffolds the same Fluent server as a native `mcp.servers.fluent` entry
- the checked-in OpenClaw bundle stays identified as the helper package `fluent-openclaw-oss-helper`, not as the published `fluent-openclaw` package
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
- snapshot shape remains the same table-oriented JSON envelope used by Cloud and SQLite OSS

## Scrub Response

If the scrub gate finds real personal fixture data:

- replace it with documentation-safe synthetic fixtures before export
- treat exposed personal examples as a privacy issue even when they are not credentials
- use a normal scrub commit when the exposed values are non-secret examples only
- rotate the value and consider public history cleanup when anything secret-like or account-bearing was exposed
