# Configuration

All configuration lives in `.env`, which is gitignored so your real values never get committed. The repo has three starting points:

| File | Use it for |
|---|---|
| `.env.minimal.example` | Just what's needed to run with `docker-compose.prod.yml`: Postgres password, `APP_BASE_URL`, `SESSION_SECRET`, `ADMIN_EMAILS`, one sign-in method and IGDB |
| `.env.recommended.example` | The minimum plus Google/Steam sign-in, gg.deals prices, the Turnstile captcha and the Cloudflare Tunnel |
| `.env.example` | The full reference: every setting with an explanation. Its values are set up for local development |

Copy one to `.env` and fill it in. A test in the repo fails if a setting the server reads is missing from `.env.example`, so it stays complete.

## Core

| Variable | Default | Notes |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `squadqueue` / `changeme` / `squadqueue` | Only used by the local Postgres container - change the password before deploying anywhere real |
| `DATABASE_URL` | — | Full Postgres connection string the server actually connects with |
| `REDIS_URL` | — | Used for price-check caching and sessions |
| `PORT` | `3000` | Port the API listens on |
| `APP_BASE_URL` | `http://localhost:5173` | The web app's public URL - used for CORS and OAuth redirect construction |
| `BASE_PATH` | — (root hosting) | Serves the whole app under a path prefix instead of domain root - e.g. `mydomain.com/queueup`. Optional, defaults to root hosting; accepts `queueup`, `/queueup`, or `/queueup/` (all normalize the same way). Works against the published image with no rebuild - see [Deployment](Deployment#hosting-on-a-sub-path) |
| `SESSION_SECRET` | — | Random string of **at least 32 characters** signing session cookies (e.g. `openssl rand -hex 32`). Don't leave the placeholder |
| `TRUST_PROXY` | `true` | Whether to trust `X-Forwarded-For`/`X-Forwarded-Proto` from a reverse proxy in front of the container. See [Deployment](Deployment) for why this matters. Accepts `true`/`false`, a trusted hop count, or an IP/CIDR (comma-separated) to lock it to a known proxy |
| `PRIVATE_INSTANCE` | `false` | Set to `true` for a server used by one group who all know each other: everyone counts as everyone's friend (friends list, activity feed, profiles, "add friends to a room"), and friend codes and requests are hidden. Nothing is written to the database, so turning it off again restores real friendships as they were. Hidden games stay hidden either way |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `LOG_REQUESTS` | `false` | Requests aren't logged one by one: only rate-limited (429) and slow (2s+) ones, plus errors. Set `true` to log every request while debugging |
| `ALLOW_DESTRUCTIVE_SCHEMA_PUSH` | unset | Container start runs `prisma db push` to sync the schema; a change `prisma db push` can't apply non-destructively (e.g. it can't tell a column rename from a drop+add) makes the container refuse to start rather than risk silent data loss. Set to `true` for exactly the one boot where you've reviewed the change and want it applied, then unset it again |

## Sign-in methods

Configure one or more — the login screen shows a button for each one that's fully filled in. All are optional, but you need at least one unless `DEV_FAKE_AUTH=true`.

| Variable | Notes |
|---|---|
| `OIDC_ISSUER_URL` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` / `OIDC_SCOPES` | Any standards-compliant OIDC provider - Authelia, Keycloak, Authentik, etc. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth client from [console.cloud.google.com](https://console.cloud.google.com/) → APIs & Services → Credentials |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` | Application from [discord.com/developers/applications](https://discord.com/developers/applications) → OAuth2 |
| `STEAM_API_KEY` / `STEAM_REDIRECT_URI` | Key from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) - Steam uses OpenID 2.0, not OAuth2, so there's no client id/secret. Steam accounts have no email; users signing in with Steam get a placeholder one. The same key powers Steam library/wishlist sync, achievements and playtime tracking |
| `DEV_FAKE_AUTH` | `false` in any real deployment. When `true`, every request is signed in as a hardcoded dev user and **everyone is treated as admin** - never enable this outside local development. The production image refuses to start with it on |

Each method's `*_REDIRECT_URI` must exactly match what's registered with that provider. In production you can leave them unset: each defaults to `${APP_BASE_URL}/auth/<provider>/callback` (e.g. `https://queueup.example.com/auth/discord/callback`), which is what you register with the provider. Only set one explicitly when the API isn't served from `APP_BASE_URL`'s origin - local development's split ports (`localhost:5173` for the web app, `localhost:3000` for the API) are the usual case, which is why `.env.example` fills them in with `localhost:3000`.

## Administration

| Variable | Notes |
|---|---|
| `ADMIN_EMAILS` | Comma-separated list of emails granted admin access when that person signs in. It only **grants**: removing an email stops it granting admin on later sign-ins but doesn't take admin away from an account that already has it - demote them from Administrator settings → Users instead. Only an email the sign-in provider has **verified** counts (Discord's `verified` flag, OIDC's `email_verified` claim; Steam has no email at all), so someone can't become admin by putting your address on their own unverified account. A self-hosted OIDC provider that doesn't send `email_verified` is trusted. Admins can also promote other users from Administrator settings. Ignored (everyone is admin) when `DEV_FAKE_AUTH=true` |

## Integrations

| Variable | Notes |
|---|---|
| `GGDEALS_API_KEY` | Free key from your [gg.deals](https://gg.deals/api/) account settings. Used for live Steam (PC-only) pricing - see [Features](Features#pricing-and-ownership) for why a non-PC room never shows a gg.deals price regardless of this key |
| `GGDEALS_DEFAULT_REGION` | `us` by default - the region used for pricing when a user hasn't set their own currency/region preference |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | Free Twitch developer app at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) (Category: "Application Integration"). Used for game search, cover art, platform data, and Steam App ID lookups |
| `SCANDEX_API_KEY` | Free (during launch) access token from [scandex.gamery.app](https://scandex.gamery.app) - a third-party barcode-to-IGDB lookup used by Add Game's camera-scan option (scan a physical game's box to add it - Personal Shelf only). Fully optional: unlike the other integrations here, the rest of the app works fine without it - an unset key just disables the scan button, normal search is unaffected |

`GGDEALS_API_KEY`, the IGDB credentials, `SCANDEX_API_KEY`, the Turnstile keys and `CLOUDFLARE_TUNNEL_TOKEN` are all optional as env vars. If left blank, an admin can set them instead as a database-stored fallback from Administrator settings. An env var, if set, always takes precedence over the DB-stored value.

## Sign-in captcha (Cloudflare Turnstile)

| Variable | Notes |
|---|---|
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | From a free widget at [Cloudflare → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile). Set **both** to turn the captcha on; leave both blank for none. Add your QueueUp hostname to the widget's allowed hostnames |

With the captcha on, the sign-in buttons wait for Turnstile, and the server verifies the token with Cloudflare (with the visitor's IP) before any sign-in starts. Most visitors never see a challenge. A missing or rejected token, or Cloudflare being unreachable, is refused and sends the visitor back to the sign-in page with a message. Linking another sign-in method while already signed in, the `/api/v1` API keys and `DEV_FAKE_AUTH` aren't affected.

## Cloudflare Tunnel

| Variable | Default | Notes |
|---|---|---|
| `CLOUDFLARE_TUNNEL_TOKEN` | unset | A tunnel token from [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels. With it set, the server runs `cloudflared` itself. Saving or clearing it in Administrator settings applies straight away. See [Deployment](Deployment#built-in-cloudflare-tunnel) |
| `CLOUDFLARED_PATH` | `cloudflared` | Only matters outside Docker (the image ships `cloudflared` on its `PATH`): where the binary is |

## Steam playtime tracking

| Variable | Default | Notes |
|---|---|---|
| `PLAYTIME_TRACKING_ENABLED` | `false` | Requires `STEAM_API_KEY` above. When `true`, QueueUp polls each Steam-linked member's playtime every few hours and nudges them to mark a game Playing or Beaten based on it, on the Personal Shelf. Only works for a Steam account whose games list is public in their Steam privacy settings — a private profile just returns nothing, silently. Playtime pushed by the Playnite extension feeds the same nudges |

## Backups

QueueUp backs up its own database - no extra container or `pg_dump` needed. It's **on by default**: a backup every night at **03:00 server time**, keeping the latest **14**. Everything about it except the folder is set in the app, under **Profile & settings → Administrator settings → Backups**:

- turn it on or off, change the schedule (a cron expression such as `0 3 * * *`, with presets), and change how many to keep - changes apply within a minute, no restart
- **Back up now**, download or delete a backup
- **Restore** a stored backup, or **import** a backup file from another QueueUp server

| Variable | Default | Notes |
|---|---|---|
| `BACKUP_DIR` | `./backups` next to the server | Where backup files are written. `docker-compose.prod.yml` sets it to `/backups` on the `backups` named volume |
| `TZ` | container default (UTC) | Not a QueueUp setting, but the backup schedule runs in the container's time zone - set `TZ` (e.g. `Australia/Sydney`) on the `app` container to change it |

Things to know:

- Each backup is every table in the database as gzipped JSON (`queueup-<UTC timestamp>.json.gz`), not a `pg_dump`, so it doesn't depend on the Postgres version and picks up new tables and columns by itself. Backups from an older version restore with any newer columns set to their defaults.
- **Restore replaces the entire database.** It takes a safety backup of the current data first and runs as one transaction, so a failure leaves the database as it was.
- Restoring needs the Postgres user to be a **superuser** (it suspends foreign-key checks while loading). The user the bundled compose file creates is one; if yours isn't, the restore says so.
- The `backups` volume lives on the same machine as the database. For real disaster recovery, copy it (or downloaded backups) somewhere else.
- Redis isn't backed up - it only holds caches and sessions.

## Production image

| Variable | Default | Notes |
|---|---|---|
| `IMAGE_TAG` | `latest` | Which published image tag `docker-compose.prod.yml` pulls - see [Deployment](Deployment#pre-built-images) for the available tags and how to pin one |

## Reference

`.env.example` in the repo root is the source of truth and includes inline comments for every one of these — this page is a reference, not a replacement for reading it.
