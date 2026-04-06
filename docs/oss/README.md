# Fluent OSS Docs

Use this bucket if you want to run Fluent yourself.

- operator guide: [../fluent-oss.md](../fluent-oss.md)
- experimental Postgres + S3 guide: [./fluent-oss-postgres-s3.md](./fluent-oss-postgres-s3.md)
- release gate: [../fluent-release-gate.md](../fluent-release-gate.md)

Primary OSS expectations:

- single-user in v1
- self-hostable over HTTP
- bearer-token protected `/mcp`
- contract-compatible with Hosted Fluent
- Docker-first distribution plus raw Node runtime support
