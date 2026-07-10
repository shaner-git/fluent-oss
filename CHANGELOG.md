# Changelog

All notable Fluent open-source runtime release-facing changes are documented here.

## v0.2.0 - 2026-07-09

Fluent 2.0 removes the pre-launch compatibility surface and makes one small, explicit contract the Cloud and OSS baseline.

### Highlights

- freezes the public contract at `2026-07-09.fluent-core-v2.0`
- exposes 26 tools, 14 explicit writes, three render adapters, and three MCP Apps resources
- removes the public full, candidate, compatibility, Home, Health, and earlier domain-tool lanes
- keeps Meals, Style, and two manual budget envelopes aligned across Codex, Claude, and OpenClaw packages
- requires fresh real-host product-quality proof before any current app surface is marked deployment-ready

### Supported Contract Version

- minimum supported contract version: `2026-07-09.fluent-core-v2.0`
- frozen contract artifact: [contracts/fluent-contract.v2.json](./contracts/fluent-contract.v2.json)
- machine-readable public profile: [contracts/fluent-public-profile.json](./contracts/fluent-public-profile.json)

## v0.1.0 - 2026-04-19

First public Fluent open-source runtime release.

### Highlights

- publishes the supported single-user Fluent open-source runtime
- ships Docker-first and direct Node.js 22.x setup paths
- supports the shared Fluent MCP contract used by Fluent managed early access
- includes Codex, Claude, and OpenClaw scaffold generation for OSS
- includes snapshot export and import support for OSS operators

### Supported Contract Version

- minimum supported contract version: `2026-06-01.fluent-core-v1.85`
- frozen contract artifact: [contracts/fluent-contract.v2.json](./contracts/fluent-contract.v2.json)
- contract notes: [docs/fluent-contract-v2.md](./docs/fluent-contract-v2.md)
- contract change: current product-wide vNext contract is v1.85. The public assistant/app profile uses one canonical `/mcp` surface with nine tools, zero resources, and one explicit shared/Meals write primitive. Legacy rich render, action/apply, Home, lifecycle, Style-write, Health/Wellbeing, and Finance surfaces remain outside the public vNext profile unless a future survival packet proves they improve the product.

### Supported Setup Matrix

- setup matrix: [docs/oss/fluent-oss-setup-matrix.md](./docs/oss/fluent-oss-setup-matrix.md)

### Known Limitations

- known limitations: [docs/oss/fluent-oss-known-limitations.md](./docs/oss/fluent-oss-known-limitations.md)

### Upgrade Notes

- upgrade guide: [docs/oss/fluent-oss-upgrade-notes.md](./docs/oss/fluent-oss-upgrade-notes.md)

### Docker Notes

- Docker operator notes: [docs/oss/fluent-oss-docker-notes.md](./docs/oss/fluent-oss-docker-notes.md)

### Release Operations

- GitHub release checklist: [docs/oss/fluent-oss-github-release-checklist.md](./docs/oss/fluent-oss-github-release-checklist.md)
- public release page: [Fluent open-source runtime v0.1.0](https://github.com/shaner-git/fluent-oss/releases/tag/v0.1.0)
