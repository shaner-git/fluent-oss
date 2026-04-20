# Fluent OSS GitHub Release Checklist

Use this checklist when cutting a public OSS release such as `v0.1.0`.

## Before Tagging

- confirm `package.json` version matches the intended release
- confirm `CHANGELOG.md` includes the release entry
- confirm [docs/oss/fluent-oss-known-limitations.md](/Users/accou/fluent-mcp/docs/oss/fluent-oss-known-limitations.md) is current
- confirm [docs/oss/fluent-oss-setup-matrix.md](/Users/accou/fluent-mcp/docs/oss/fluent-oss-setup-matrix.md) is current
- confirm [docs/oss/fluent-oss-upgrade-notes.md](/Users/accou/fluent-mcp/docs/oss/fluent-oss-upgrade-notes.md) is current
- confirm [docs/oss/fluent-oss-docker-notes.md](/Users/accou/fluent-mcp/docs/oss/fluent-oss-docker-notes.md) is current
- confirm the supported contract version is `2026-04-13.fluent-core-v1.34`
- confirm Node.js `22.x` is the stated direct-runtime requirement across README, docs, and CI

## Verification

- run `npm run typecheck`
- run `npm run export:oss:dry-run`
- if release-facing docs or exported OSS surfaces changed materially, run `npm run test`

## Public Repo Sync

- export the public OSS tree
- sync the exported tree into `shaner-git/fluent-oss`
- verify the public README links to the release page
- verify the quickstart docs link to the `v0.1.0` tag or another stable public ref

## GitHub Release

- create tag `v0.1.0` in `shaner-git/fluent-oss`
- create the GitHub release titled `Fluent OSS v0.1.0`
- use the `v0.1.0` changelog entry as the release body
- verify the release page renders without missing links

## After Publish

- open the public release page and confirm it loads
- open the public README and quickstart docs from GitHub and confirm the release links resolve
- confirm the release notes call out known limitations, setup options, upgrade notes, and Docker notes
