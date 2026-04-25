# OpenClaw Package Versioning

Decision: `openclaw-plugin/fluent` is a bundled OSS helper package, not the published standalone `fluent-openclaw` artifact.

## Published Package

- package name: `fluent-openclaw`
- source repository: `fluent-openclaw`
- install command: `openclaw plugins install fluent-openclaw`
- supported OpenClaw tracks in that package: `cloud` and `oss`

## Embedded OSS Helper

- package name: `fluent-openclaw-oss-helper`
- package location: `openclaw-plugin/fluent`
- package role: bundled helper for the Fluent open-source runtime export
- version policy: tracks OSS helper revisions and must not be described as the published `fluent-openclaw` package line

## Rules

- keep the helper package metadata visibly distinct from `fluent-openclaw`
- keep OpenClaw install docs pointing users to the standalone `fluent-openclaw` package
- keep the helper docs framed as repo-local OSS bundle guidance
- keep the minimum Fluent contract floor at `2026-04-20.fluent-core-v1.37`
