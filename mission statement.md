SquadQueue Project Specification
Project Overview

Goal: A self-hosted (Docker) game backlog and voting system.

Architecture: A hard split between a private "Personal Shelf" and collaborative "Communal Rooms" for backlog management.

Scope: The system is strictly for adding, reviewing, and tracking game progress; it does not include instant messaging or calling features.

Tech Stack & Infrastructure

User Management: OAuth/OIDC-based authentication.

Caching: A Redis sidecar container to cache gg.deals price checks and game metadata, minimizing API load.

Persistence: All application data and Redis volumes must be mapped for easy integration with external backup solutions (e.g., Borg).

Core Feature Set

Game Intake: A persistent, high-visibility input bar to paste gg.deals links.

Real-time Metadata: Automated service to fetch and refresh pricing; results should be cached in Redis with appropriate TTL.

Collaborative Voting:

A 5-point emoji scale (😴 to 🔥) for users to vote on their interest levels.

Aggregated vote display on each game card as a "heat map" of interest.

Room System: Unique, invite-only rooms with a "Room Master" role for list management.

Attribution: Social indicators showing which member added which game, utilizing avatar-colored badges.

UI/UX Design Requirements

Visual Style: Modern, dark aesthetic (background: #0f0e16) using 'Space Grotesk' fonts.

Layout: Responsive, mobile-first grid layout for game cards.

Game Cards: Display title, platform, price, "added by" info, voting block, and status badges (Backlog, Playing, Done).

Customization: Support for room-specific themes via a modular configuration object.

Room Logic

Context Management: Use global state to handle the split between personal and room views.
