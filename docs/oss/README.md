# Open-Source Runtime Docs

Use this bucket if you want to run Fluent yourself.

Public release references:

- public repo: [shaner-git/fluent-oss](https://github.com/shaner-git/fluent-oss)
- current quickstart: [docs/fluent-oss.md](https://github.com/shaner-git/fluent-oss/blob/main/docs/fluent-oss.md)
- release history: [Fluent open-source runtime releases](https://github.com/shaner-git/fluent-oss/releases)

- operator guide: [../fluent-oss.md](../fluent-oss.md)
- artifact boundary: [./fluent-oss-artifact-boundary.md](./fluent-oss-artifact-boundary.md)
- experimental Postgres + S3 guide: [./fluent-oss-postgres-s3.md](./fluent-oss-postgres-s3.md)
- known limitations: [./fluent-oss-known-limitations.md](./fluent-oss-known-limitations.md)
- setup matrix: [./fluent-oss-setup-matrix.md](./fluent-oss-setup-matrix.md)
- upgrade notes: [./fluent-oss-upgrade-notes.md](./fluent-oss-upgrade-notes.md)
- Docker notes: [./fluent-oss-docker-notes.md](./fluent-oss-docker-notes.md)
- GitHub release checklist: [./fluent-oss-github-release-checklist.md](./fluent-oss-github-release-checklist.md)
- release gate: [../fluent-release-gate.md](../fluent-release-gate.md)

Primary open-source runtime expectations:

- single-user in v1
- self-hostable over HTTP
- bearer-token protected `/mcp`
- contract-compatible with managed Fluent early access
- Docker-first distribution plus raw Node runtime support
- direct runtime requirement: Node.js `22.x`
- supported minimum contract version: `2026-04-26.fluent-core-v1.48`

See [fluent-oss-artifact-boundary.md](./fluent-oss-artifact-boundary.md) for the generated-export boundary, public exclusions, and scrub gates that protect this repo.
