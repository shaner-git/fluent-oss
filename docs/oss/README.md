# Fluent OSS Docs

Use this bucket if you want to run Fluent yourself.

Public release references:

- release notes: [../../CHANGELOG.md](../../CHANGELOG.md)
- public quickstart: [../fluent-oss.md](../fluent-oss.md)
- public release guide: [../fluent-release-gate.md](../fluent-release-gate.md)

- operator guide: [../fluent-oss.md](../fluent-oss.md)
- experimental Postgres + S3 guide: [./fluent-oss-postgres-s3.md](./fluent-oss-postgres-s3.md)
- known limitations: [./fluent-oss-known-limitations.md](./fluent-oss-known-limitations.md)
- setup matrix: [./fluent-oss-setup-matrix.md](./fluent-oss-setup-matrix.md)
- upgrade notes: [./fluent-oss-upgrade-notes.md](./fluent-oss-upgrade-notes.md)
- Docker notes: [./fluent-oss-docker-notes.md](./fluent-oss-docker-notes.md)
- GitHub release checklist: [./fluent-oss-github-release-checklist.md](./fluent-oss-github-release-checklist.md)
- public artifact boundary: [./public-artifact-boundary.md](./public-artifact-boundary.md)
- release gate: [../fluent-release-gate.md](../fluent-release-gate.md)

Primary OSS expectations:

- single-user in v1
- self-hostable over HTTP
- bearer-token protected `/mcp`
- contract-compatible with Hosted Fluent
- Docker-first distribution plus raw Node runtime support
- direct runtime requirement: Node.js `22.x`
- supported minimum contract version: `2026-04-20.fluent-core-v1.37`
