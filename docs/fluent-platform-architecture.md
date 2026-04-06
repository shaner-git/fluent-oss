# Fluent Platform Architecture

## Summary

Fluent is one product with one MCP contract and two supported deployment tracks:

- `Fluent Cloud`
- `Fluent OSS`

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

- `d1-r2`: Fluent Cloud on native Cloudflare storage bindings
- `sqlite-fs`: default Fluent OSS on SQLite plus filesystem artifacts
- `postgres-s3`: experimental Fluent OSS backend on Postgres plus S3-compatible blobs

Cloud and default OSS remain the supported production tracks. `postgres-s3` is experimental and intentionally additive.

## Fluent Cloud

Cloud owns:

- Cloudflare Workers deployment
- Cloudflare Access for SaaS OAuth
- D1 and R2 managed runtime state
- the default packaged backend path

Cloud is the paid managed offering.

## Fluent OSS

OSS owns:

- single-user self-hosted runtime behavior
- bearer-token auth on `/mcp`
- local DB and artifact storage
- snapshot import/export from Cloud
- laptop, LAN, and VPS-style operator workflows
- optional experimental Postgres + S3 backend

OSS is intentionally single-user in v1. It does not try to replicate the Cloud control plane.

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
