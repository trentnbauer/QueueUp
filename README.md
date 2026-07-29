#### More AI slop!

QUEUEUP IS UNDERGOING MAJOR CHANGES - YOUR DATA MAY BE WIPED - I WOULD RECOMMEND HOLDING OFF ON USING IT FOR THE MOMENT

# QueueUp

A self-hosted game backlog and voting system for a friend group — a private "Personal Shelf" plus shared "Communal Rooms," real pricing from gg.deals, and a 5-emoji voting scale.

QueueUp has been built with a Discord-esque look, with your "Personal shelf" listed first, then "Communal rooms" (public or shared) underneath and finally the "add room" button. The rooms are where you queue your games with your friends.

<img width="1684" height="1229" alt="image" src="https://github.com/user-attachments/assets/a36e14fb-b4be-4fc5-ba17-5efaa8d467b1" />

The app also features an interactive 'pick a game' menu with multiple themes

<img width="300" alt="image" src="https://github.com/user-attachments/assets/99959171-af9f-4052-b9b7-3a40aecdcd07" /><img width="300" alt="image" src="https://github.com/user-attachments/assets/401f278e-11b0-4e03-9aff-023f05a66fb9" /><img width="300" alt="image" src="https://github.com/user-attachments/assets/a3c75503-d510-4947-ae35-02a93da72b77" />


The pick a game system has some logic behind its recommendations,
- Games of the same genre as last completed are ranked lower (to reduce the chance of playing shooter after shooter after shooter)
- Voting on a game increases its chance to be picked
- maximum game cost / everyone must own it toggle

Some other things to note
- Rooms are set per console
- Marking a game as owned syncs between rooms
- Discord webhooks for alerts

# Running your own instance of QueueUp
## Prerequisites:

- Docker + Docker Compose
- A free [gg.deals API key](https://gg.deals/api/) (account settings → API) — used for live pricing
- A free IGDB app via [Twitch developer console](https://dev.twitch.tv/console/apps) (Category: "Application Integration") — used for game search/identity
- A free [Steam API key](https://steamcommunity.com/dev) for importing Steam games (required to match agmes with gg.deals)
- Optional: A free [Scandex API key](https://scandex.gamery.app/documentation/pricing/) - used for importing phyiscal games via barcode scan
- Optional: Install the [QueueUp Playnite extension](https://github.com/trentnbauer/QueueUpPlayniteExtension) (as of writing, in development) to push your entire Playnite library (including xbox, playstation and nintendo games) into QueueUp
- A sign-in method (Google, Discord, Steam, or a generic OIDC provider like Authelia/Keycloak/Authentik)

## Docker Compose

1. Download the Docker Compose Prod file and the Example ENV file
2. Read and edit the env file to include your API keys, OAuth details etc.
3. Rename the compose file to docker-compose.yaml
4. Rename the env file to .env
5. Run `docker-compose up` to start the stack

## Authentication

- **Google**: create an OAuth client at [console.cloud.google.com](https://console.cloud.google.com/) (APIs & Services → Credentials), fill in `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- **Discord**: create an application at [discord.com/developers/applications](https://discord.com/developers/applications) → OAuth2, fill in `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`.
- **Steam**: grab a free Web API key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey), fill in `STEAM_API_KEY`. Steam uses a different, older login protocol (OpenID 2.0, not OAuth2) and doesn't need a client id/secret — just the key. Steam accounts have no email address, so users who sign in with Steam get a placeholder one under the hood.
- **Generic OIDC**: any standards-compliant provider (Authelia, Keycloak, Authentik, ...) — fill in `OIDC_ISSUER_URL`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`.

Each method's `*_REDIRECT_URI` must exactly match what you register with that provider. In the production setup (`docker-compose.prod.yml`), you can leave `*_REDIRECT_URI` unset entirely - it defaults to `${APP_BASE_URL}/auth/<provider>/callback`, since that one server container serves both the API and the frontend. You still need to register that exact URL with the provider; only set `*_REDIRECT_URI` explicitly if your deployment doesn't serve the API from `APP_BASE_URL`'s own origin (local dev's split `:5173`/`:3000` ports being the main example).

# What is / isn't QueueUp
I've set some pretty hard limits with what this app will and won't be used for. This isn't a replacement for Discord, a social media platform etc. It is just to track your game backlog, but as a group. Your scheduling, sharing screens, voice chat etc should be done outside of this app.
