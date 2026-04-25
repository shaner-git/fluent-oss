# Fluent open-source runtime GitHub Release Checklist

Use this checklist when cutting a public OSS release such as `v0.1.0`.

## Before Tagging

- confirm `package.json` version matches the intended release
- confirm `CHANGELOG.md` includes the release entry
- confirm [docs/oss/fluent-oss-known-limitations.md](./fluent-oss-known-limitations.md) is current
- confirm [docs/oss/fluent-oss-setup-matrix.md](./fluent-oss-setup-matrix.md) is current
- confirm [docs/oss/fluent-oss-upgrade-notes.md](./fluent-oss-upgrade-notes.md) is current
- confirm [docs/oss/fluent-oss-docker-notes.md](./fluent-oss-docker-notes.md) is current
- confirm [docs/oss/public-artifact-boundary.md](./public-artifact-boundary.md) is current
- confirm [docs/oss/openclaw-package-versioning.md](./openclaw-package-versioning.md) is current
- confirm the supported contract version is `2026-04-20.fluent-core-v1.37`
- confirm Node.js `22.x` is the stated direct-runtime requirement across README, docs, and CI
- confirm `openclaw-plugin/fluent/package.json` still uses the helper package name `fluent-openclaw-oss-helper`
- confirm no OSS release-facing doc presents `openclaw-plugin/fluent` as the published `fluent-openclaw` package

## Verification

- run `npm run typecheck`
- run `npm run export:oss:dry-run`
- run `npm run export:oss:check`
- run `npm run check:public-scrub`
- if release-facing docs or exported OSS surfaces changed materially, run `npm run test`

## Public Repo Sync

- export the public OSS tree
- sync the exported tree into the public `fluent-oss` repository
- verify the public README links to the current release notes and quickstart docs
- verify the public quickstart docs and OSS docs bucket resolve without local-path references

## GitHub Release

- create tag `v0.1.0` in the public `fluent-oss` repository
- create the GitHub release titled `Fluent open-source runtime v0.1.0`
- use the `v0.1.0` changelog entry as the release body
- verify the release page renders without missing links

## After Publish

- open the public release page and confirm it loads
- open the public README and quickstart docs from GitHub and confirm the release links resolve
- confirm the release notes call out known limitations, setup options, upgrade notes, and Docker notes
- if scrubbed values were personal examples only, a normal public scrub commit is enough
- if any secret-like value or production credential leaked, rotate it first and consider history cleanup
