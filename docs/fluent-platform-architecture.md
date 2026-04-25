# Fluent Platform Architecture

## Summary

Fluent is one product with one MCP contract and two supported deployment tracks:

- `Fluent early access`
- `Fluent open-source runtime`

The contract is shared. Runtime-specific auth and infrastructure concerns are not.

## Shared Core

Shared across Cloud and OSS:

- the Fluent MCP contract
- domain lifecycle and onboarding truth
- profile and capability reads
- meals, health, and style domain semantics
- audit event semantics

Current runtime boundary in code:

- `CoreRuntimeBindings`: contract-facing runtime inputs used by the shared server
- `CloudRuntimeEnv`: Cloudflare and OAuth bindings used only by the Cloud entrypoint
- `FluentDatabase`: thin Fluent-owned database interface for `prepare().bind().first()/all()/run()` plus `batch()`
- `FluentBlobStore`: thin Fluent-owned blob interface for `get()`, `put()`, and `delete()`

This pass keeps persistence SQL-heavy and D1-shaped at the callsite while moving runtime concerns away from Cloudflare-specific env types.

## Storage Adapters

Current storage backends:

- `d1-r2`: Fluent early access on native Cloudflare storage bindings
- `sqlite-fs`: default Fluent open-source runtime on SQLite plus filesystem artifacts
- `postgres-s3`: experimental Fluent open-source runtime backend on Postgres plus S3-compatible blobs

Cloud and default OSS remain the supported production tracks. `postgres-s3` is experimental and intentionally additive.

## Fluent early access

Cloud owns:

- Cloudflare Workers deployment
- current Cloudflare Access beta auth path
- Better Auth hosted login and session surface
- D1 and R2 managed runtime state
- the default packaged backend path

Cloud is the paid managed offering.

Public hosted direction:

- Better Auth owns end-user login, sessions, and the hosted OAuth provider cutover
- Cloudflare Email Service owns outbound magic-link delivery from the Worker runtime
- Cloudflare Access is being reduced to an operator or beta-only compatibility path
- Fluent still needs request-scoped tenant resolution before hosted multi-user is complete

## Fluent open-source runtime

OSS owns:

- single-user self-hosted runtime behavior
- bearer-token auth on `/mcp`
- local DB and artifact storage
- snapshot import/export from Cloud
- laptop, LAN, and VPS-style operator workflows
- optional experimental Postgres + S3 backend

OSS is intentionally single-user in v1. It does not try to replicate the Cloud control plane.

## Client Bundles

Packaged client bundles currently target:

- `Codex`
- `Claude`
- `OpenClaw`

Client packaging stays platform-specific even though the MCP contract is shared:

- Codex keeps the main bundle with local helper scripts for execution-heavy skills.
- Claude keeps a parallel bundle tuned to Claude's plugin layout.
- OpenClaw ships as a native plugin for the shared `skills/` tree, but the checked-in `openclaw-plugin/fluent` copy is a bundled OSS helper package rather than the published standalone `fluent-openclaw` release line.
- OpenClaw's hosted or OSS MCP connection is applied through native `mcp.servers` profile config rather than package-loaded HTTP MCP state.

## Domain Model

Current domains:

- `meals`
- `style`
- `health`

Lifecycle states:

- `available`
- `enabled`
- `disabled`

Onboarding state remains separate from lifecycle state.

## Capability Discovery

Capability discovery remains contract-stable through:

- resource: `fluent://core/capabilities`
- tool: `fluent_get_capabilities`

Current payload includes:

- `backendMode`
- additive `deploymentTrack`
- additive `storageBackend`
- contract version
- available, enabled, and ready domains
- onboarding state
- profile summary
- tool discovery hints

`backendMode` stays wire-compatible in this pass. `deploymentTrack` is additive and product-facing.

## Boundary Rules

- Cloud-only: OAuth, Cloudflare env bindings, protected-resource metadata
- OSS-only: bearer-token auth, self-host deployment workflows
- Shared: MCP tool/resource surface and domain behavior
- Out of scope for both core runtimes: retailer browser automation and cart execution

Retailer automation remains owned by `fluent-meals`, not by Fluent Core.
