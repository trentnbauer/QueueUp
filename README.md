# SquadQueue

A self-hosted game backlog and voting system for a friend group — a private "Personal Shelf" plus shared "Communal Rooms," real pricing from gg.deals, and a 5-emoji voting scale. See `mission statement.md` for the full product spec.

This is Milestone 1: a working vertical slice (auth, game intake with real pricing, rooms, voting) meant to run locally and be iterated on.

## Stack

Node/TypeScript monorepo — Fastify API, React (Vite) frontend, PostgreSQL via Prisma, Redis for caching/sessions. `packages/shared` holds types shared between server and web.

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop (for Postgres + Redis locally, and for the production image)
- A free [gg.deals API key](https://gg.deals/api/) (account settings → API) — used for live Steam pricing
- A free IGDB app via [Twitch developer console](https://dev.twitch.tv/console/apps) (Category: "Application Integration") — used for game search/identity
- Optionally, a sign-in method (Google, Discord, Steam, or a generic OIDC provider like Authelia/Keycloak/Authentik) — or use the local dev bypass below while you build

## First-time setup

```sh
cp .env.example .env
# edit .env: set GGDEALS_API_KEY, IGDB_CLIENT_ID and IGDB_CLIENT_SECRET at minimum. Leave
# DEV_FAKE_AUTH=true and the sign-in vars blank to sign in as a hardcoded dev user until
# you've set up a real sign-in method.

npm install

# start Postgres + Redis in Docker
docker compose --env-file .env --project-directory . -f docker/docker-compose.yml up -d

# create the database schema
npm run db:push

# start the API (port 3000) and the Vite dev server (port 5173) together
npm run dev
```

Open http://localhost:5173. With `DEV_FAKE_AUTH=true` you're signed in automatically as a dev user — no sign-in method needed yet.

Useful commands:
- `npm run db:studio` — opens Prisma Studio, a GUI to browse/edit the database directly.
- `npm run build` — production build of all three packages (used by the Docker image too).
- `npm test` — runs the Vitest suite (pure logic only — sort/recommendation rules, platform
  mapping, duplicate-scope rules; no DB/network integration tests).

## Setting up real sign-in

Once you're ready to move off the dev bypass, set `DEV_FAKE_AUTH=false` and configure one or more sign-in methods in `.env` — the login screen shows a button for each one that's fully filled in.

- **Google**: create an OAuth client at [console.cloud.google.com](https://console.cloud.google.com/) (APIs & Services → Credentials), fill in `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- **Discord**: create an application at [discord.com/developers/applications](https://discord.com/developers/applications) → OAuth2, fill in `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`.
- **Steam**: grab a free Web API key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey), fill in `STEAM_API_KEY`. Steam uses a different, older login protocol (OpenID 2.0, not OAuth2) and doesn't need a client id/secret — just the key. Steam accounts have no email address, so users who sign in with Steam get a placeholder one under the hood.
- **Generic OIDC**: any standards-compliant provider (Authelia, Keycloak, Authentik, ...) — fill in `OIDC_ISSUER_URL`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`.

Each method's `*_REDIRECT_URI` must exactly match what you register with that provider (swap `localhost:3000` for your real domain in production).

## Production deployment (Docker)

```sh
docker compose --env-file .env --project-directory . -f docker/docker-compose.prod.yml up -d --build
```

This builds and runs a single `server` container (serving both the API and the built frontend) alongside Postgres and Redis, all wired from the same `.env`. On first boot the container runs `prisma db push` automatically to create the schema.

## Backups

Postgres and Redis data are bind-mounted to `./data/postgres` and `./data/redis` (override the root with `DATA_DIR` in `.env`). Point Borg, or any backup tool, at that `data/` directory.

## What's in Milestone 1 (and what isn't)

See the "Explicitly OUT of scope for Milestone 1" section of the implementation plan for the full list. Notably: no comment/discussion feature (voting only, by design), no real-time push (the UI refetches after actions), and console-platform games (Xbox/PlayStation/Switch) show metadata but no live price or gg.deals link — gg.deals' price API only covers Steam.

Game search/identity (title, cover art, platforms, Steam App ID) comes from IGDB; live pricing and the gg.deals purchase link come from gg.deals' official Prices API once a Steam App ID is known. Nothing scrapes gg.deals' website directly.
