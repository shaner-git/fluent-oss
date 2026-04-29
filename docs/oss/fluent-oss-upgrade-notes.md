# Fluent open-source runtime Upgrade Notes

Use these notes when moving an existing Fluent open-source runtime or legacy Fluent Local install onto the public `v0.1.0` release.

## Before You Upgrade

1. Back up your current data with `npm run oss:export:snapshot -- --out "./tmp/fluent-oss-snapshot.json"`.
2. Record your current token with `npm run oss:token:print`.
3. If you use a generated MCP client config, plan to re-run the scaffold command after upgrading.

## What Changed For v0.1.0

- `Fluent open-source runtime` is now the supported public naming
- direct runtime docs are pinned to Node.js `22.x`
- open-source release docs now treat Docker as the default packaged path
- the supported contract floor is `2026-04-26.fluent-core-v1.48`

## Legacy Fluent Local Compatibility

Bridge compatibility remains available for one cycle:

- `local:*` scripts still work as aliases
- `verify:local-parity` still maps to the OSS parity verifier
- `FLUENT_LOCAL_TOKEN` still works as a compatibility variable
- `~/.fluent/auth/local-access-token.json` still works as a compatibility token path

New setup should prefer:

- `oss:*` scripts
- `FLUENT_OSS_TOKEN`
- `~/.fluent/auth/oss-access-token.json`

## Recommended Upgrade Flow

1. Install dependencies with Node.js `22.x` or rebuild the Docker image.
2. Export a snapshot before changing anything.
3. Upgrade the repo checkout to the `v0.1.0` release tag or a newer supported release.
4. Re-run `npm run oss:token:bootstrap` only if you do not already have a working OSS token.
5. Re-run the scaffold command for each MCP client you use so the generated config matches the current base URL and token.
6. Run `npm run verify:oss-parity -- --base-url "http://127.0.0.1:8788"` after restart.

## Docker Upgrade Flow

1. Save a snapshot.
2. Pull or check out the `v0.1.0` release content.
3. Rebuild with `docker compose --env-file .env.oss.example up --build`.
4. Confirm the token with `docker compose exec fluent-oss npm run oss:token:print`.
5. Re-run client scaffolding if the exposed URL changed.
