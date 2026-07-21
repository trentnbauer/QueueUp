#### More AI slop!


# QueueUp

A self-hosted game backlog and voting system for a friend group — a private "Personal Shelf" plus shared "Communal Rooms," real pricing from gg.deals, and a 5-emoji voting scale.

This is Milestone 1: a working vertical slice (auth, game intake with real pricing, rooms, voting) meant to run locally and be iterated on.

## Stack

Node/TypeScript monorepo — Fastify API, React (Vite) frontend, PostgreSQL via Prisma, Redis for caching/sessions. `packages/shared` holds types shared between server and web. None of that matters if you're just running it, though — see below.

## Running QueueUp (Docker)

This is the normal way to run QueueUp — you only need Docker, not Node.js or npm; the API, frontend, Postgres, and Redis all run as containers from a pre-built image.

Prerequisites:

- Docker + Docker Compose
- A free [gg.deals API key](https://gg.deals/api/) (account settings → API) — used for live Steam pricing
- A free IGDB app via [Twitch developer console](https://dev.twitch.tv/console/apps) (Category: "Application Integration") — used for game search/identity
- Optionally, a sign-in method (Google, Discord, Steam, or a generic OIDC provider like Authelia/Keycloak/Authentik) — or use the dev bypass below while you try it out

```sh
cp .env.example .env
# edit .env: set GGDEALS_API_KEY, IGDB_CLIENT_ID and IGDB_CLIENT_SECRET at minimum. Leave
# DEV_FAKE_AUTH=true and the sign-in vars blank to sign in as a hardcoded dev user until
# you've set up a real sign-in method.

docker compose --env-file .env -f docker-compose.prod.yml up -d
```

This pulls the pre-built `server` image (serving both the API and the built frontend) from `ghcr.io/trentnbauer/queueup` - published automatically by the "Build and Publish Docker Image" GitHub Actions workflow on every change to `main` - and runs it alongside Postgres and Redis, all wired from the same `.env`. On first boot the container runs `prisma db push` automatically to create the schema. To pin a specific build instead of always tracking the latest, set `IMAGE_TAG` in `.env` to one of the tags that workflow publishes: `sha-<short-commit>` (exact source), or `build-<N>` (that workflow run's number - monotonically increasing, but not gap-free, since a scheduled run with no changes to publish is skipped rather than reusing the previous number).

Open http://localhost:3000. With `DEV_FAKE_AUTH=true` you're signed in automatically as a dev user — no sign-in method needed yet.

## Setting up real sign-in

Once you're ready to move off the dev bypass, set `DEV_FAKE_AUTH=false` and configure one or more sign-in methods in `.env` — the login screen shows a button for each one that's fully filled in.

- **Google**: create an OAuth client at [console.cloud.google.com](https://console.cloud.google.com/) (APIs & Services → Credentials), fill in `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- **Discord**: create an application at [discord.com/developers/applications](https://discord.com/developers/applications) → OAuth2, fill in `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`.
- **Steam**: grab a free Web API key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey), fill in `STEAM_API_KEY`. Steam uses a different, older login protocol (OpenID 2.0, not OAuth2) and doesn't need a client id/secret — just the key. Steam accounts have no email address, so users who sign in with Steam get a placeholder one under the hood.
- **Generic OIDC**: any standards-compliant provider (Authelia, Keycloak, Authentik, ...) — fill in `OIDC_ISSUER_URL`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`.

Each method's `*_REDIRECT_URI` must exactly match what you register with that provider. In the production setup (`docker-compose.prod.yml`), you can leave `*_REDIRECT_URI` unset entirely - it defaults to `${APP_BASE_URL}/auth/<provider>/callback`, since that one server container serves both the API and the frontend. You still need to register that exact URL with the provider; only set `*_REDIRECT_URI` explicitly if your deployment doesn't serve the API from `APP_BASE_URL`'s own origin (local dev's split `:5173`/`:3000` ports being the main example).

### Running behind a reverse proxy

Most self-hosted setups put something in front of this container - a Cloudflare Tunnel, NGINX Proxy Manager, Traefik, etc - so it isn't exposed to the internet directly. `TRUST_PROXY` (in `.env`) defaults to `true`, which tells Fastify to derive the client's real IP/protocol from the `X-Forwarded-For`/`X-Forwarded-Proto` headers your proxy sets, rather than the raw connection it sees (which is typically plain HTTP inside Docker even when the outside world reaches you over HTTPS). This affects two things:

- **Session cookies** are marked `Secure` only once TLS is confirmed via `X-Forwarded-Proto` - so sign-in still works whether the proxy talks HTTP or HTTPS to the container, as long as your proxy forwards that header (Cloudflare Tunnel and NGINX Proxy Manager both do this by default).
- **Rate limiting** buckets requests by client IP - without `TRUST_PROXY`, every request looks like it comes from the proxy's own IP, so all your users would share one rate-limit bucket.

Only set `TRUST_PROXY=false` if this container is exposed directly with nothing in front of it (those headers are otherwise attacker-controllable). Whichever proxy you use, make sure `APP_BASE_URL` points at your real public HTTPS domain, not `localhost` - any `*_REDIRECT_URI` left unset derives from it automatically (see above), and any set explicitly needs the same treatment.

## Backups

Postgres and Redis data are bind-mounted to `./data/postgres` and `./data/redis` (override the root with `DATA_DIR` in `.env`). Point Borg, or any backup tool, at that `data/` directory for a full filesystem-level backup.

On top of that, `docker-compose.prod.yml` also runs a small `backup` service that takes care of Postgres on its own: every `BACKUP_INTERVAL_HOURS` (default 24), it runs `pg_dump` and writes a gzipped, timestamped dump to `./data/backups` (e.g. `squadqueue-20260415T030000Z.sql.gz`), then deletes older dumps beyond `BACKUP_RETENTION_COUNT` (default 14, i.e. two weeks of daily backups). It uses the same `postgres:18-alpine` image as the `postgres` service itself, so `pg_dump` always matches the server version in use — see `docker/backup-entrypoint.sh`. This is a full logical dump each run (no WAL archiving/point-in-time recovery) and only covers Postgres, not Redis (sessions/cache, safe to lose) — for anything beyond "restore to the last dump," keep using a filesystem-level tool against `data/` as above.

### Restoring from a backup

1. Pick a dump from `./data/backups` (or wherever `DATA_DIR` points), e.g. `squadqueue-20260415T030000Z.sql.gz`.
2. Make sure the stack is up so `postgres` is reachable (`docker compose --env-file .env -f docker-compose.prod.yml up -d postgres`). Restoring into a fresh/empty database is cleanest — if you're recovering onto an existing (possibly corrupted) database, either drop and recreate it first or expect errors from objects that already exist.
3. Restore the dump through the same `postgres:18-alpine` image the `backup` service uses, so `psql`'s version matches:
   ```sh
   gunzip -c ./data/backups/squadqueue-20260415T030000Z.sql.gz | \
     docker compose --env-file .env -f docker-compose.prod.yml exec -T postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
   ```
   (Fill in `$POSTGRES_USER`/`$POSTGRES_DB`, or source `.env` first, if they're not already in your shell's environment — they default to `squadqueue` if you never changed them.)
4. Restart the `server` service (`docker compose --env-file .env -f docker-compose.prod.yml restart server`) so it reconnects cleanly against the restored data.

## Local development

Only needed if you're modifying the code - running the app doesn't require any of this (see above).

Prerequisites: everything above, plus Node.js 20+ and npm.

```sh
cp .env.example .env
# edit .env: set GGDEALS_API_KEY, IGDB_CLIENT_ID and IGDB_CLIENT_SECRET at minimum. Leave
# DEV_FAKE_AUTH=true and the sign-in vars blank to sign in as a hardcoded dev user until
# you've set up a real sign-in method.

npm install

# start Postgres + Redis in Docker
docker compose --env-file .env up -d

# create the database schema
npm run db:push

# start the API (port 3000) and the Vite dev server (port 5173) together
npm run dev
```

Open http://localhost:5173.

Useful commands:
- `npm run db:studio` — opens Prisma Studio, a GUI to browse/edit the database directly.
- `npm run build` — production build of all three packages (used by the Docker image too).
- `npm test` — runs the Vitest suite (pure logic only — sort/recommendation rules, platform
  mapping, duplicate-scope rules; no DB/network integration tests).

## What's in Milestone 1 (and what isn't)

See the "Explicitly OUT of scope for Milestone 1" section of the implementation plan for the full list. Notably: no comment/discussion feature (voting only, by design), no real-time push (the UI refetches after actions), and console-platform games (Xbox/PlayStation/Switch) show metadata but no live price or gg.deals link — gg.deals' price API only covers Steam.

Game search/identity (title, cover art, platforms, Steam App ID) comes from IGDB; live pricing and the gg.deals purchase link come from gg.deals' official Prices API once a Steam App ID is known. Nothing scrapes gg.deals' website directly.
