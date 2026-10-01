# Deployment

## Production stack

```sh
docker compose --env-file .env -f docker-compose.prod.yml up -d
```

This pulls the pre-built `app` image (serving both the API and the built frontend) from `ghcr.io/trentnbauer/queueup` and runs it alongside Postgres and Redis, all wired from the same `.env` — see [Configuration](Configuration) for every variable it needs. Postgres/Redis data live in named Docker volumes (not a host-mounted directory), so a fresh `docker compose up` after cloning doesn't need a `data/` folder set up first. On first boot the container runs `prisma db push` automatically to sync the database schema. Nothing is built locally - see [Pre-built images](#pre-built-images) below for where the image comes from and how to pin a specific one.

The image itself has a built-in health check (`HEALTHCHECK` in `docker/Dockerfile.server`, hitting `/healthz`, which verifies both Postgres and Redis connectivity — not just that the process is alive) — `docker ps` will show `healthy`/`unhealthy` once the container's had time to start, and `docker-compose.prod.yml` also gates `app` behind Postgres/Redis's own health checks so it doesn't start against a database that isn't ready yet.

## Running behind a reverse proxy

Most self-hosted setups put something in front of this container — a Cloudflare Tunnel, NGINX Proxy Manager, Traefik, etc. — so it isn't exposed to the internet directly. `TRUST_PROXY` (in `.env`) defaults to `true`, which tells Fastify to derive the client's real IP/protocol from the `X-Forwarded-For`/`X-Forwarded-Proto` headers your proxy sets, rather than the raw connection it sees (which is typically plain HTTP inside Docker even when the outside world reaches you over HTTPS). This affects two things:

- **Session cookies** are marked `Secure` only once TLS is confirmed via `X-Forwarded-Proto` — so sign-in still works whether the proxy talks HTTP or HTTPS to the container, as long as your proxy forwards that header (Cloudflare Tunnel and NGINX Proxy Manager both do this by default).
- **Rate limiting** buckets requests by client IP — without `TRUST_PROXY`, every request looks like it comes from the proxy's own IP, so all your users would share one rate-limit bucket.

Only set `TRUST_PROXY=false` if this container is exposed directly with nothing in front of it (those headers are otherwise attacker-controllable). Whichever proxy you use, make sure `APP_BASE_URL` points at your real public HTTPS domain, not `localhost`, and register `https://<your domain>/auth/<provider>/callback` with each sign-in provider (the `*_REDIRECT_URI` variables default to that, so they can stay unset).

## Hosting on a sub-path

By default QueueUp expects its own domain or subdomain. If you'd rather run several apps off one domain - e.g. `mydomain.com/queueup` alongside other services - set `BASE_PATH` (see [Configuration](Configuration)) and update `APP_BASE_URL` to include the same path (e.g. `APP_BASE_URL=https://mydomain.com/queueup`, `BASE_PATH=/queueup`). The container is fully self-contained about which path it answers on, so your reverse proxy just needs a plain pass-through to it - no path-rewriting rule required, unlike some other self-hosted apps. This works against the published image directly; no rebuild needed. A mismatch between `APP_BASE_URL`'s path and `BASE_PATH` is logged as a warning at container startup (sign-in redirects would land on the wrong path) but won't stop it from starting.

`BASE_PATH` defaults to unset (root hosting) and is a complete no-op in that case - existing deployments are unaffected by upgrading.

## Backups

QueueUp backs up its database every night by default, into the `backups` named volume, and admins can back up, download, restore or import from **Administrator settings → Backups** - see [Configuration](Configuration#backups). Click **Back up now** before upgrading across a big release, and copy the `backups` volume off the machine from time to time: a backup on the same disk as the database won't survive that disk.

## Upgrading and schema changes

The container runs `prisma db push` on every start to bring the database schema up to date. Additive changes (new tables, new columns, new enum values such as the platforms added in October 2026) apply on their own. A change Prisma can't prove is safe - for example adding a **unique** column, as the custom profile link (`profile_slug`) did - makes the container refuse to start and log why. When that happens:

1. Take a backup (Administrator settings → Backups → Back up now).
2. Read the logged change and make sure it's what you expect.
3. Set `ALLOW_DESTRUCTIVE_SCHEMA_PUSH=true` in `.env`, start the container once, then remove it again.

## Pre-built images

A GitHub Actions workflow (`.github/workflows/build-docker-image.yml`) builds and pushes multi-arch (`linux/amd64`, `linux/arm64`) images to `ghcr.io/trentnbauer/queueup`, capped at once per 24h via `schedule` (only actually builds/pushes if there are new commits since the last build) plus `workflow_dispatch` for an on-demand rebuild. Each build gets real `major.minor.patch` semver, computed from Conventional Commits prefixes on every commit since the last build (any `!`/`BREAKING CHANGE:` bumps major, `feat:` bumps minor, anything else is a patch — highest tier across the range wins), plus the usual rolling tags built from it:

- `latest` — always the most recent build
- `sha-<short-commit>` — the exact source commit
- `<major>.<minor>.<patch>` (e.g. `2.1.3`) — this exact build, tagged permanently as a git tag too (`v2.1.3`) so the next build knows what to bump from
- `<major>` / `<major>.<minor>` (e.g. `2` / `2.1`) — rolling tags, repointed to the latest build within that major/minor
- `dev` / `dev-<short-commit>` — built from `main` on every merge (`.github/workflows/build-docker-image-dev.yml`). Not a tested release; useful for trying a fix before the next daily build

To pin a specific build instead of always tracking `latest`, set `IMAGE_TAG` in `.env` to any of the tags above (e.g. `IMAGE_TAG=2.1.3`).

The running app reports exactly which build it is - `GET /api/version` (no auth required) returns `{"version": "v<major.minor.patch>", "sha": "<full commit sha>"}`, and the same is shown in the web UI's footer, linked to that commit on GitHub.

## Health check details

`/healthz` (see `server/src/routes/health.ts`) checks Postgres (`SELECT 1`) and Redis (`PING`) directly rather than trusting connection-pool state, with a 3-second timeout per check so a fully unreachable dependency can't hang the endpoint. It returns `200` with `{"status":"ok","checks":{"database":"ok","redis":"ok"}}` when both are reachable, or `503` with `"error"` for whichever isn't.
