# Architecture

## Stack

- **Server**: Fastify 5 (Node 22, TypeScript), Prisma ORM over PostgreSQL, ioredis for caching and sessions, `openid-client` for OAuth/OIDC sign-in (Steam's OpenID 2.0 is handled by hand), Zod for env validation, `@fastify/rate-limit` for abuse protection
- **Web**: React 19 + Vite, TanStack Query for server state, React Router. No UI framework and no CSS modules: v2 styles components inline from design tokens (CSS custom properties in `theme/global.css`) via a small `st()` helper. Fonts are Bricolage Grotesque (display), Geist (UI) and Geist Mono
- **Infra**: Docker (one server image serving both the API and the built frontend), Postgres 18, Redis 8

## Monorepo layout

```
packages/shared/   # Types, constants and pure logic shared by server and web
                   #   (Game, Room, VOTE_SCALE, platforms, spin weighting, Discord event defaults, ...)
server/            # Fastify API
  src/routes/       # One file per area: auth, rooms, roomSpin, games, gameSuggestions, tags,
                    #   notifications, friends, publicProfile, badges, pendingLibraryImports,
                    #   playniteCompletionSuggestions, admin, adminBackups, playniteExtension (redirect to
                    #   the latest .pext), apiV1 (bearer-token API), health, version
  src/services/     # Business logic - roomAccess, gameAccess, gameIntake, gameOwnership, friendships,
                    #   notifications, roomActivity, priceService, igdbClient, steamLibrary,
                    #   playniteImport, playtimeTracking, badges, authProviders/, ...
  src/jobs/         # In-process scheduled work - database backups (admin-set cron), price refresh and
                    #   price alerts, release watch (release-day and new sequel/DLC alerts), playtime
                    #   snapshots, Playnite sync reminders, anniversary badges
  src/config/       # Zod-validated env parsing (env.ts)
  src/db/           # Prisma schema + client
  src/plugins/      # Fastify plugins - auth, session, static (serves the built web app)
web/                # React app (v2 UI)
  src/shell/        # App frame - sidebar, phone top bar, glance panel, overlays, onboarding
  src/home/         # Shelf / room home: tabs, list and cover rows, bulk bar, pending imports
  src/game/         # Game detail, Steam match picker, trailer
  src/dialogs/      # Add game, import, spin, vote deck, ranked queue, review sheet, room/shelf
                    #   settings, profile & settings, friends, ...
  src/pages/        # Full pages - activity, profile, insights/achievements/year, admin, login, invite
  src/ui/           # Primitives - dialog/sheet, toasts, achievement celebration, st() style helper
  src/theme/        # Design tokens, dark/light/auto mode, room-colour theming
  src/context/      # App-wide state - auth, scope (current shelf/room), UI, theme, toasts, ...
  src/hooks/        # Data-fetching hooks (React Query wrappers)
  src/api/          # Thin fetch wrappers per resource, matching server/src/routes/*
docker/             # Dockerfile + entrypoints (the compose files live at the repo root)
```

`packages/shared` is what keeps the API and frontend from drifting apart. Anything both sides must agree on - shapes like `Game`, the list of platforms, or the spin candidate pool and weights - lives there instead of being written twice.

## Data model (high level)

**Identity**: `User` is the root identity (one row per account, `oidcSub` unique; the prefix says which provider it came from). More providers can be linked through `LinkedIdentity`. Steam is the exception: linking Steam writes `User.steamId64`. `ApiKey` holds hashed personal access tokens for the `/api/v1` API (used by the Playnite extension). `GameOwnership`, `AchievementCompletion` and `UserBadge` are keyed by user (and, for the first two, by `igdbId`), not by any one `Game` row - owning a title or having 100%'d it is a fact about the person and the title, wherever it's listed. `GameOwnership.platforms` scopes a claim to particular platforms.

**Social**: `Friendship` (requester, addressee, `pending`/`accepted`) plus `User.friendCode`. `User.publicProfileEnabled` (default on for new accounts) and `User.profileSlug` (the custom `/u/<name>` link) control the public profile. With `PRIVATE_INSTANCE=true` the server treats every user as a friend without writing anything.

**Rooms**: `User` → `RoomMember` (carrying a `RoomRole` - `room_master` / `moderator` / `member` - and a notifications read cursor) → `Room`. A `Room` has an optional `RoomPlatform` (null means any platform), an `accentColor` (hex), `isPublic`, `requireGameApproval`, an optional Discord webhook with per-event switches (`discordEvents`), and `spinOwnershipMaxPrice`. `RoomSpin` holds a room's in-progress shared spin so every member's screen shows the same reel. (`spinWheelTheme` is still in the schema and API but the v2 UI no longer uses it.)

**Games**: A `Game` belongs to either a `Room` (`roomId` set) or a user's Personal Shelf (`roomId: null`, scoped by `addedBy`) - never both, and the same `igdbId` can't appear twice in the same list (enforced by partial unique indexes). `status` is one of eight `GameStatus` values: `wishlist`, `backlog`, `play_next`, `playing`, `done` (Beaten), `replay`, `dropped` and `wont_play`. A game also carries:
- `prerequisiteGameId` ("play after") and `baseGameId` (DLC → base game)
- `hiddenFromOthers`, `sensitiveContent` (adult-tagged on IGDB), `releaseAlert`
- pricing fields (Steam App ID, target price, manual price)

`GameReview` holds reviews, one row per (game, person), so every member of a room keeps their own. `PlayLog` records each playthrough's start and finish. `GameSuggestion` is a pending-approval row for rooms with approval on. `Tag`/`GameTag` are personal labels.

**Imports and playtime**: `PlaytimeSnapshot` (Steam) and `PlaynitePlaytimeSnapshot` drive the "mark as Playing/Beaten" nudges. `PlayniteCompletionSuggestion` holds Beaten suggestions from Playnite. `PendingLibraryImport` is a synced title that couldn't be matched (it can be dismissed and restored). `TitleMatchAlias` caches title → game matches: exact IGDB matches are shared by everyone, and a person's manual matches are stored under their own source so they only affect their own imports.

**Voting and activity**: `Vote` is one row per (game, user), 1-5, enforced by both the API and a database CHECK constraint applied at boot. `Notification` rows feed the bell: room-scoped ones are shared by the room, and direct ones go to one user (a deleted room, release and sequel alerts, playtime nudges, Playnite sync reminders, wishlist sales). `RoomActivity` backs both a room's activity feed (`roomId`) and a user's shelf activity (`recipientId`). Shelf rows carry a `payload` snapshot that the friends feed is built from. `ReleaseWatchNotification` makes sure each "a new sequel or DLC is out for a game you've beaten" alert fires once per user.

**Admin**: `AdminAuditLog` is an append-only trail of admin actions (actor and target saved as labels so an entry survives account deletion). `AppSetting` is a key-value store for integration keys not set in `.env` and for the backup settings (on/off, cron schedule, retention).

## A few deliberate design decisions

- **Schema sync via `prisma db push`, not migrations.** The container applies `schema.prisma` on every start. Anything `db push` can't prove is safe stops the container until you allow it once with `ALLOW_DESTRUCTIVE_SCHEMA_PUSH=true` (see [Deployment](Deployment#upgrading-and-schema-changes)).
- **Backups are done by the app, not `pg_dump`.** `pg_dump` has to match the Postgres server's major version and the app image has no Postgres client, so the backup job reads every table with `json_agg` and restores with `json_populate_recordset`. Postgres does all the type handling, and new tables and columns are included without any change to the backup code. The job checks the cron schedule once a minute, so schedule changes need no restart.
- **One-off data fixes run at boot.** Alongside `prisma db push`, the server runs small idempotent data migrations on start (e.g. moving reviews into `GameReview`). Ones that must only ever run once leave a marker row in `AppSetting`. A failure is logged, not fatal.
- **The Cloudflare Tunnel is a supervised child process.** With a tunnel token set, the server spawns the bundled `cloudflared`, reads its log lines for connection state and errors (shown in Administrator settings), restarts it with backoff if it exits, and stops it on shutdown or when the token is cleared.
- **The sign-in captcha fails closed.** With Turnstile configured, `/auth/<provider>/login` verifies the token with Cloudflare before redirecting to the provider; if Cloudflare can't be reached, sign-in is refused rather than let through.
- **Redis failures fail fast, not slow.** Redis backs sessions and caches, so a hung connection would stall every request. The client has a command timeout, and the rate limiter skips its check if Redis errors rather than blocking all traffic.
- **IGDB for identity, gg.deals for price.** Search, covers, platforms, trailers and Steam App ID lookup come from IGDB; gg.deals' API is queried only once a Steam App ID is known. Nothing scrapes gg.deals' website.
- **Two separate auth paths.** The web app uses a cookie session (`SameSite=Lax`, `HttpOnly`); `/api/v1` uses bearer API keys only. A key can't reach a cookie route and a session can't reach `/api/v1`. Every sign-in flow, including Steam's, is tied to the browser session that started it.
- **No real-time push.** The UI refetches after actions and polls a few things (notifications, shared spins, import progress) rather than holding websocket connections. It's an app for a handful of friends, not a live multiplayer surface.
- **Voting and short reviews, no chat.** A review's one-line note is as close to comments as QueueUp gets. Discussion belongs in your group's chat app.
- **Attribution is visible by design.** Who added a game and how everyone voted is shown, because this is a small-group tool. Hiding is opt-in per game, for your shelf's public side (friends, profile, Discord).
