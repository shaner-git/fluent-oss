# Fluent OSS

Fluent OSS is the public self-hosted runtime for Fluent.

It ships the shared MCP contract plus the supported OSS operator path for:

- meals and grocery planning
- health planning and workout logging
- closet-aware style workflows

This repo is generated from the private canonical source repo. Public changes should be replayed into that canonical source and then re-exported to keep Hosted and OSS aligned.

## What You Get Here

- OSS-first install and run docs
- Docker and raw Node runtime support
- snapshot backup and restore tooling
- MCP client config assets for Codex and Claude
- the shared contract and architecture docs that apply to both Hosted and OSS
- an experimental Postgres + S3 backend, clearly labeled as experimental

## Quickstart

Install dependencies:

```bash
npm install
```

Bootstrap an OSS token:

```bash
npm run oss:token:bootstrap
```

Start Fluent OSS:

```bash
npm run oss:start -- --host 127.0.0.1 --port 8788
```

Generate a Codex config:

```bash
npm run scaffold:mcp -- --client codex --track oss --base-url http://127.0.0.1:8788
```

Run the local check suite:

```bash
npm run check
```

## Docs

- OSS operator docs: [docs/oss/README.md](./docs/oss/README.md)
- shared contract and architecture docs: [docs/shared/README.md](./docs/shared/README.md)
- OSS operator guide: [docs/fluent-oss.md](./docs/fluent-oss.md)
- release gate: [docs/fluent-release-gate.md](./docs/fluent-release-gate.md)

## Product Shape

- Hosted Fluent is the managed commercial offering.
- Fluent OSS is the supported self-hosted track.
- Both tracks share the same MCP contract.

Hosted onboarding and pricing live outside this repo. This repo stays focused on self-hosting and shared contract-facing code.
