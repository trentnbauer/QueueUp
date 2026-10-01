# Features

This page describes QueueUp **v2** (the redesigned UI that landed on 1 October 2026). Everything from the old UI that still exists is covered here; a few old settings (wheel themes, room icon size, colour palettes) are gone.

## Layout

QueueUp has a phone layout and a desktop layout.

![A room on desktop: sidebar, queue and the At a glance panel](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-room.png)

- **Desktop:** a sidebar on the left (264px, or collapsed to an 80px icon rail), the main list in the middle, and a 400px panel on the right. With nothing selected the right panel shows **At a glance** (top of the queue, plus a "Can't decide?" shortcut to the picker); clicking a game shows its full detail there instead.
- **Phone:** a top bar of room tiles, bottom sheets instead of dialogs, and a floating "add game" button.

The sidebar lists your Personal Shelf first, then your rooms, then the button to create or join a room. Its footer holds Notifications, Friend activity and your profile.

<img src="https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/mobile-shelf.png" alt="The Personal Shelf on a phone" width="300" />

## Personal Shelf and rooms

Every user has a private **Personal Shelf**: a backlog only they manage. Its tabs are **Wishlist**, **Backlog**, **Playing** (Playing and Play Next), **Beaten** and **Replay**. A **+** button opens the less-used lists: **Dropped**, **Won't play**, and two lists of titles from a library sync that never became games, **Needs matching** and **Dismissed** (a dismissed title can be restored).

A **room** is a shared backlog for a group. Its tabs are **Queue**, **Playing**, **Beaten** (Beaten and Replay) and **Dropped** (Dropped and Won't play). Both views can be shown as a list or as covers, and can be searched.

![The Personal Shelf on desktop: Wishlist, Backlog, Playing, Beaten and Replay tabs, with the + button for more lists](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-shelf.png)

- A room can be locked to one platform or left as **Any platform**. The platform scopes game search and what can be added.
- Rooms are invite-only by default (an invite code or link, which elevated members can regenerate). A Room Master can make a room **public** so anyone can find it under "Browse public rooms" and join without a code.
- Turning off **Anyone can add games** makes a plain Member's additions into **suggestions** that a Room Master or Moderator approves or declines. This also applies when a Member moves a game into the room from their shelf, which is refused while approval is on.
- A game can be moved between your shelf and a room, or between rooms you're in. The person moving it becomes its "added by".
- Each room has its own colour: one of the presets, or any colour from a colour picker or hex field. With the **Room theme** accent (see [Appearance](#appearance)) the room's colour tints that room's view.

![Room settings: invite code, members with roles, adding friends, and room details](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-room-settings.png)

## Platforms

Rooms, "systems I own" and search scoping cover PC, Xbox 360 / One / Series X|S, PlayStation 1–5, PSP, PS Vita, Switch and Switch 2, Meta Quest 1–3, NES, SNES, Nintendo 64, GameCube, Wii, Wii U, Game Boy / Color / Advance, DS, 3DS, Master System, Mega Drive / Genesis, Saturn and Dreamcast.

**Backwards compatibility** is understood: a PS5 room (or PS5 owner) can add PS4 games, Switch 2 takes Switch games, Xbox Series takes Xbox One and 360, and likewise 3DS → DS, Wii U → Wii and PS2 → PS1. This applies to search, adding a game and moving a game into a room.

## Adding games

- **Search** IGDB, scoped to the room's platform (or the systems you own, on the shelf). Search also offers **Trending** games and whole **series** (add several entries of a franchise at once).
- **Scan a barcode** of a physical game box with your phone's camera (Personal Shelf only; needs `SCANDEX_API_KEY`).
- **DLC** is linked to its base game. Adding DLC adds the base game too if it's missing, and a game's detail lists its DLC.
- The same game can be on your shelf and in a room, but never twice in the same list.

## Library sync

From **Profile & settings** (or Add game → Import):

- **Sync libraries** pulls your Steam library and Steam wishlist in one click. Games already on your shelf are skipped; imported library games count as owned on PC.
- **Sync trophies and achievements** looks for games you've 100%'d but haven't marked Beaten and lists them for you to review. Nothing is marked automatically.
- Both buttons run every linked source. Steam is the only one today; you need a Steam account linked, which you can do from Sign-in methods even if you signed in another way.
- **Sync Playnite** walks you through the [QueueUp Playnite extension](https://github.com/trentnbauer/QueueUpPlayniteExtension), with a link that downloads the latest `.pext` file directly. Playnite gathers Epic, GOG, emulators and your Xbox, PlayStation and Switch libraries in one place. The setup creates an API key for the extension. Each push adds new games, records playtime, and suggests Beaten for games Playnite reports as completed. A title QueueUp can't match goes to **Needs matching** for you to pick the right game. Your pick is remembered for your future syncs only, not anyone else's.

## Voting

Every game in a room gets a five-point "how much do you want to play this" vote:

| Value | Emoji | Label |
|---|---|---|
| 1 | 😴 | Meh |
| 2 | 🙂 | Sure |
| 3 | 😃 | Keen |
| 4 | 🤩 | Hyped |
| 5 | 🔥 | Must |

A game's score is the sum of (vote − 2), so "Sure" is neutral and "Meh" counts against it. The game detail shows each member's vote. Tapping your active vote again clears it.

![Game detail: squad vote, ownership, play after, DLC and status](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-detail.png)

The **vote deck** steps through games you haven't voted on yet, one card at a time, playing the game's trailer in place of its cover when it has one. Rooms show a red dot in the sidebar when you have games left to vote on (or, for Room Masters and Moderators, suggestions to approve).

## Game status

A game is always in one of eight statuses: **Wishlist**, **Backlog**, **Play Next**, **Playing**, **Beaten**, **Replay**, **Dropped** or **Won't play**. Replay is a beaten game queued to play again. Won't play is for something you've decided to skip without playing it.

- **Play after:** a game can be set to wait for another game in the same room (Borderlands 1 before 2). Until the first is Beaten, the picker and ranked queue skip the second.
- **Play journal:** every Playing → Beaten/Dropped stretch is logged with dates (and hours, where playtime is tracked), so a replayed game keeps both playthroughs.
- **Coming soon:** unreleased games with a release date appear in a Coming soon row. Turn on a game's **release alert** bell to get a notification on release day. Unreleased games can't be picked.
- **Collecting dust:** backlog games untouched for months are listed in Backlog insights.

## Reviews

When you mark a game Beaten you can leave an optional review: art, gameplay, story and sound scores (1–5) and a one-line note. It appears in your friends' activity feed and on your public profile. For a room game it's also posted to the room's Discord "Reviews" event. Reviews are stored on the game, so a room game keeps the latest review only.

![A review opened from a profile: overall score, the four category scores and the note](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-review.png)

## Deciding what to play

- **What are we playing?** is the picker reel. It draws from Backlog, Replay and Play Next games that are released and not waiting on a "play after". Each game's weight is its vote score (on a square-root curve, with a small floor so unvoted games still have a chance), then:
  - ×2 if its genre differs from what's Playing or was last Beaten
  - ×2 for Play Next
  - ×2 for a release in the last 3 months
  - ×0.75 to ×1.5 by the game's IGDB review score

  Filters narrow the pool by price, length (time to beat) or "everyone owns it". In a room the spin is shared: everyone in the room sees the same reel land on the same game.
- A room's **Spin price limit** (Room settings) limits the room's picker to games every member owns, plus games at or under that price.
- **Ranked queue** is the same pool in a fixed order by score.

![The "What are we playing?" picker reel, light mode](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-spin-light.png)

## Pricing and ownership

- **Live prices** come from gg.deals and are **PC/Steam only**. gg.deals is keyed by Steam App ID, so a console room never shows a live price. Prices are cached; the refresh button re-checks one game (rate-limited, and a gg.deals rate limit is shown as a message).
- If the automatic Steam match is wrong or missing, **Steam match** lets you search the Steam store and pick the right release.
- A game with no live price can carry a **manual price**, shown with a "~".
- A **price alert** notifies you (or the room) when the price drops to your target; then the alert clears. People who own the game are skipped.
- **Ownership** is per platform. A room game shows how many members own it on the room's platform, and a game everyone owns sorts to the top. Mark ownership from the game detail; it carries across rooms.

## Room roles

- **Room Master** (one per room): every setting, member roles, removing anyone, deleting the room, and handing ownership to someone else (the outgoing master becomes a Moderator).
- **Moderator:** add friends to the room, regenerate the invite, approve or decline suggestions, and remove plain Members.
- **Member:** vote, add and remove their own games, leave.

Members can be added directly only from your friends (on a private instance, that's everyone); anyone else joins with the invite. Clicking a member opens their profile, and the member list shows their completed and 100%'d counts for that room.

## Friends and profiles

- **Friends:** each user has a friend code. Send a request by code, or to someone you share a room with. Friends get an **activity feed** (games added, started, Beaten, dropped, reviews, achievements) from the sidebar's Friend activity.
- **`PRIVATE_INSTANCE=true`** makes everyone on the server a friend of everyone else, for a server used by one group. Friend codes and requests are hidden then.
- **Profile page** (`/u/<id or custom link>`): currently playing, up next, beaten games (click one for its review and scores), achievements, and a **Library** of games you own. Your friends see your activity too.
- **Public profile** is on by default for new accounts and can be turned off in Profile & settings → Sharing, where you can also choose a **custom link** (`/u/your-name`). You and your friends can always open your profile; strangers only when it's public.
- **Hide from others:** any shelf game can be hidden from friends, your public profile and Discord member activity. When games with adult content land on your shelf, QueueUp asks whether to hide them.

![Friend activity: games started and beaten, reviews and achievements](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-activity.png)

![A profile page: currently playing, up next and beaten games](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-profile.png)

## Notifications and activity

- The **Notifications** bell collects:
  - room events: games added, members joining, renames, platform changes, ownership changes, room deletion
  - suggestions to approve
  - price drops
  - release-day alerts
  - a new sequel or DLC appearing for a game you've beaten
  - playtime nudges
  - a reminder when Playnite hasn't synced for a couple of days

  Your own actions don't notify you.
- **Room activity** and **shelf activity** (in Room settings and Shelf settings) are a history of what happened there.
- **Discord webhook** (Room settings): each room can post to a Discord channel, with a switch per kind of event:
  - Games added
  - Suggestions
  - Votes
  - Spins
  - Playing & beaten
  - Reviews
  - Members join or leave
  - Member activity (each member's own shelf milestones; hidden games are excluded)

  Posts are best-effort; a broken webhook never blocks anything.

![Room colour picker and the Discord webhook with a switch per event](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-room-discord.png)

## Trailers

Games with a YouTube trailer on IGDB have a **Watch trailer** button (it opens in a modal) and play the trailer in the vote deck. The player uses YouTube's privacy-enhanced domain.

## Steam playtime, achievements and insights

- With `PLAYTIME_TRACKING_ENABLED=true`, QueueUp checks Steam playtime every few hours and nudges you to mark a game Playing or Beaten ("Played anything?"). It needs a public Steam games list. Playnite playtime feeds the same nudges.
- Game detail shows Steam achievement progress for you (shelf) or each member (room).
- **Achievements** (badges) page: the badges you've earned and how rare each one is.
- **Backlog insights:** average days and hours to beat, backlog size and age, and your most neglected game.
- **Year in games:** a trailing-12-month recap of what you finished. Rooms have their own **Year in review** in Room settings.

## Appearance

Profile & settings → Appearance:

- **Mode:** Dark, Light or Auto (follows your device).
- **Accent:** **Room theme** (the current room's colour tints the room view's buttons, highlights and background) or **Monochrome** (no room colour). Settings, profiles and other dialogs always keep the default colours.
- **Covers per row:** the cover grid's density.

![Profile & settings: friends, insights, library sync and appearance](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-settings.png)

![Room theme accent: a blue room tints its buttons and highlights](https://raw.githubusercontent.com/trentnbauer/QueueUp/main/docs/screenshots/desktop-room-theme.png)

## Account and data

- Change your **display name**, **price currency**, **systems owned** and linked **sign-in methods** in Profile & settings.
- **API keys** for the Playnite extension and the `/api/v1` API.
- **Download my data** exports your shelf, room games, votes, memberships and linked sign-ins as JSON. Shelf settings and Room settings export games as CSV or JSON.
- **Delete my account** is permanent and is blocked while you still own a room (delete it or hand it off first).

## Sign-in

Google, Discord, Steam, or any OIDC provider (Authelia, Keycloak, Authentik, …). Each one that's configured gets a button, and a signed-in user can link more of them to the same account. See [Configuration](Configuration#sign-in-methods).

## Administration

Admins (see `ADMIN_EMAILS` in [Configuration](Configuration#administration)) get an **Administrator settings** page:

- Integration keys (gg.deals, IGDB, ScanDex), showing whether each comes from `.env` or the database.
- Users: promote, demote or remove.
- Rooms: delete any room.
- **Backups:** nightly by default; change the schedule and how many to keep, back up now, download, delete, restore, or import a backup from another server (see [Configuration](Configuration#backups)).
- An audit log of admin actions.
- A download of the server's recent logs.
