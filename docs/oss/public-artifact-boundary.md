# Public Artifact Boundary

Fluent open-source runtime keeps the public export boundary explicit so scrub rules apply only to the surfaces that ship publicly.

The manifest lives at [../../ops/public-oss-overlay/public-artifact-boundary.json](../../ops/public-oss-overlay/public-artifact-boundary.json).

Public scrub coverage includes:

- root release docs such as `README.md`, `CHANGELOG.md`, and example env files
- exported docs under `docs/`
- packaged client bundles under `plugins/`, `claude-plugin/`, and `openclaw-plugin/`
- the `openclaw-plugin/fluent` bundle is exported as the helper package `fluent-openclaw-oss-helper`, not as the published standalone `fluent-openclaw` package
- public tests and scaffold examples
- export metadata under `.oss-export/`

Internal-only docs or operator playbooks should stay outside those roots until they are intentionally exported.
