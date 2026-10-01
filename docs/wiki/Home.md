# QueueUp

A self-hosted game backlog and voting system for a friend group — a private **Personal Shelf** plus shared **rooms**, friends with an activity feed and short reviews, real pricing from gg.deals, and a 5-emoji voting scale to decide what to play next.

This wiki covers the app itself: what it does, how it's put together, and how to run it. For the day-to-day "clone it and go" instructions, the [README](https://github.com/trentnbauer/QueueUp#readme) is the fastest path — this wiki goes deeper.

## Pages

- **[Features](Features)** — the v2 layout, Personal Shelf and rooms, voting, the picker reel, friends and profiles, pricing, room roles, notifications, and everything else the app does today
- **[Getting Started](GettingStarted)** — local development setup, from a fresh clone to a running app
- **[Configuration](Configuration)** — every environment variable, what it's for, and which ones are required
- **[Deployment](Deployment)** — running the production Docker stack, including reverse proxy setup
- **[Architecture](Architecture)** — the monorepo layout, the stack, and a few of the bigger design decisions

## What QueueUp is (and isn't)

QueueUp exists to answer one question for a small group of friends: *what are we playing next?* It tracks a shared backlog per room, lets everyone vote on what they're in the mood for, pulls real pricing so "is it worth buying" isn't a separate lookup, and keeps a personal backlog for games that aren't a group decision.

It's deliberately **not** a chat app, a social network, a game library manager, or a general-purpose project tracker — no messaging, no calling, no arbitrary task lists. Friends, activity and one-line reviews exist to help your group decide, not to replace your group chat. If a feature doesn't serve "help a small squad pick and track games together," it's out of scope.

## Status

This is an actively developed, self-hosted app (Node/TypeScript, Postgres, Redis). The v2 UI shipped on 1 October 2026 along with a lot of changes in the same week, and the README currently warns that **data may be wiped** while things settle, so keep backups (see [Configuration](Configuration#backups)). See [Architecture](Architecture) for the stack and [Deployment](Deployment) for running it yourself.

## Editing this wiki

The pages live in the main repository under [`docs/wiki/`](https://github.com/trentnbauer/QueueUp/tree/main/docs/wiki) and are copied here automatically whenever a change to them merges (`.github/workflows/wiki-sync.yml`). Change them there through a pull request - edits made directly in the wiki's web editor are overwritten on the next sync.
