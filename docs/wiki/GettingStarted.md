# Getting Started

This covers local development. For running the production Docker stack instead, see [Deployment](Deployment).

## Prerequisites

- Node.js 22.22+ and npm
- Docker Desktop (for Postgres + Redis locally)
- A free [gg.deals API key](https://gg.deals/api/) (account settings → API) — used for live Steam pricing
- A free IGDB app via the [Twitch developer console](https://dev.twitch.tv/console/apps) (Category: "Application Integration") — used for game search/identity
- Optionally, a sign-in method (Google, Discord, Steam, or a generic OIDC provider) — or use the local dev bypass below while you build

## Setup

```sh
git clone <your-fork-or-clone-url>
cd QueueUp
cp .env.example .env
```

Edit `.env`: set `GGDEALS_API_KEY`, `IGDB_CLIENT_ID`, and `IGDB_CLIENT_SECRET` at minimum. Leave `DEV_FAKE_AUTH=true` and the sign-in vars blank to sign in as a hardcoded dev user until you've set up a real sign-in method (see [Configuration](Configuration)).

```sh
npm install

# start Postgres + Redis in Docker
docker compose --env-file .env up -d

# create the database schema
npm run db:push

# start the API (port 3000) and the Vite dev server (port 5173) together
npm run dev
```

Open http://localhost:5173. With `DEV_FAKE_AUTH=true` you're signed in automatically — no sign-in method needed yet.

## Useful commands

- `npm run db:studio` — opens Prisma Studio, a GUI to browse/edit the database directly
- `npm run build` — production build of all three packages (shared, server, web)
- `npm test` — runs the Vitest suite (pure logic only — spin weighting and filters, platform mapping, duplicate-scope rules, notification and Discord-event logic, sign-in checks, home list ordering; no DB/network integration tests). The server tests read `.env` at import time, so create one first (the values only need to pass validation - see the `test` job in `.github/workflows` for the dummy values CI uses)

## Repo layout

See [Architecture](Architecture) for the full breakdown, but the short version: `packages/shared` holds types and logic used by both `server` and `web`, `server` is the Fastify API, `web` is the React (Vite) frontend.

If you're signing in with a real provider locally, its redirect URI points at the API port (`http://localhost:3000/auth/<provider>/callback`), as filled in by `.env.example`.

## Next steps

- [Configuration](Configuration) — every env var, including how to wire up a real sign-in method
- [Features](Features) — what the app actually does once it's running
