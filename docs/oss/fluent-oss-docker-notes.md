# Fluent open-source runtime Docker Notes

These notes apply to the supported Docker path in the public `v0.1.0` release.

## Default Docker Path

Start the supported container path with:

```bash
docker compose --env-file .env.oss.example up --build
```

This path:

- builds the bundled Fluent open-source runtime image
- runs the service with the repo's Compose defaults
- persists OSS state in the named Docker volume

## Persistent Data

The Docker volume keeps:

- SQLite data
- artifact storage
- OSS token state

## Environment Notes

- use `.env.oss.example` for the default packaged path
- copy it to `.env.oss` if you want to customize ports or the persistent root
- keep `FLUENT_OSS_TOKEN` secret when you expose the service outside localhost

## Token and Health Checks

Print the token from a running container:

```bash
docker compose exec fluent-oss npm run oss:token:print
```

Check health from the host:

```bash
curl http://127.0.0.1:8788/health
```

## Reverse Proxy Notes

- terminate TLS at your reverse proxy, not inside Fluent open-source runtime
- expose only the routes you intend to support publicly
- keep Fluent open-source runtime on a private interface or internal port when possible

## Upgrade Notes

- rebuild the image when moving to a new release
- take a snapshot before upgrading
- re-run client scaffolding if your public URL changes
