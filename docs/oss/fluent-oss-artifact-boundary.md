# Open-Source Runtime Artifact Boundary

This document explains how Fluent's public open-source artifacts are produced, what they are allowed to contain, and what is intentionally kept out of the public export.

## Source Of Truth

Fluent has two documentation and artifact layers for the open-source runtime:

- the canonical private source repo, where managed and open-source paths are authored together
- the generated public repo, which is exported from the canonical source through a curated allowlist plus a public overlay

The public repo is not a separate hand-maintained source tree. open-source-safe code, docs, manifests, and client assets are authored in the canonical source repo first, then exported into the public repo so managed and open-source paths do not drift.

## What The Public Export Includes

The public export intentionally includes:

- open-source runtime code and approved shared contract code
- open-source runtime operator docs and setup guides
- public contract and tools reference docs
- open-source-safe client scaffolds and packaged bundle assets for Codex, Claude, and OpenClaw
- tests and scripts that are safe to run in the public repo

Some public files come directly from the canonical source tree. Others are replaced by the public overlay when the exported repo needs a different README, release note, or scaffold default.

## What Is Intentionally Excluded

Public artifacts intentionally exclude material that would either leak private implementation context or misrepresent what the public repo owns. That includes:

- cloud-only operator flows, hosted auth operations, and managed-service runbooks
- internal planning notes, private reports, and archived operator material that is not part of the supported open-source surface
- personal data, personal file-system paths, private email addresses, and private repository references
- hosted-only endpoints, hosted environment assumptions, and non-public bootstrap helpers
- packaged extras that are intentionally kept out of the public install experience, such as browser or retailer-execution helpers that are not part of the supported public package

If a file is useful for the canonical repo but not safe or accurate for open-source runtime users, it should stay in the canonical source and out of the exported artifact set.

## Public Overlay Boundary

The export uses two layers on purpose:

- canonical source files provide the shared open-source-safe implementation and docs
- the public overlay replaces a small set of public-facing entrypoints, such as exported `README.md` files and open-source scaffolds

Use the overlay when the public repo needs different framing, different links, or a different default than the canonical source repo. Use the canonical source when the same open-source-safe content should ship to both places.

## Public Scrub Gates

The public export is protected by explicit scrub gates before publication:

- a required-path allowlist proves that key public docs and artifacts are present in the export
- forbidden-pattern scanning blocks private paths, private identities, private repo references, and hosted-only details from shipping
- README link validation blocks exported `README.md` files from linking to missing local docs
- export dry-run validation and CI run the generated repo checks before the export PR is published

If a new public doc is important enough to link from the OSS entrypoints, it should also be added to the export manifest and export validation so the link cannot silently drift.
