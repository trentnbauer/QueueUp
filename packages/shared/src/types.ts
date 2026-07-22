export type GameStatus = 'backlog' | 'playing' | 'done' | 'dropped' | 'wishlist';

export type RoomRole = 'room_master' | 'moderator' | 'member';

export type RoomPlatform =
  | 'pc'
  | 'xbox_360'
  | 'xbox_one'
  | 'xbox_series'
  | 'ps3'
  | 'ps4'
  | 'ps5'
  | 'switch'
  | 'switch2';

export const ROOM_PLATFORM_LABELS: Record<RoomPlatform, string> = {
  pc: 'PC',
  xbox_360: 'Xbox 360',
  xbox_one: 'Xbox One',
  xbox_series: 'Xbox Series X|S',
  ps3: 'PlayStation 3',
  ps4: 'PlayStation 4',
  ps5: 'PlayStation 5',
  switch: 'Switch',
  switch2: 'Switch 2',
};

/** The exact IGDB platform name(s) each RoomPlatform family corresponds to - shared so both the
 * server (scoping an IGDB search query to a room/owned-systems platform) and the web client
 * (matching a game's free-text `platform` label against a user's owned systems) use the same
 * mapping instead of two copies drifting apart. */
export const IGDB_PLATFORM_NAMES: Record<RoomPlatform, string[]> = {
  switch: ['Nintendo Switch'],
  switch2: ['Nintendo Switch 2'],
  xbox_360: ['Xbox 360'],
  xbox_one: ['Xbox One'],
  xbox_series: ['Xbox Series X|S'],
  ps3: ['PlayStation 3'],
  ps4: ['PlayStation 4'],
  ps5: ['PlayStation 5'],
  pc: ['PC (Microsoft Windows)', 'Mac', 'Linux'],
};

// Confirmed against gg.deals' real Prices API response before picking these - not every country
// code works (e.g. "uk" 404s, the ISO code "gb" is what it actually wants).
export type PriceRegion = 'us' | 'gb' | 'eu' | 'au' | 'ca' | 'br';

export const PRICE_REGION_LABELS: Record<PriceRegion, string> = {
  us: 'US ($)',
  gb: 'UK (£)',
  eu: 'EU (€)',
  au: 'Australia ($)',
  ca: 'Canada ($)',
  br: 'Brazil (R$)',
};

export type VoteValue = 1 | 2 | 3 | 4 | 5;

export const VOTE_SCALE: Record<VoteValue, string> = {
  1: '😴',
  2: '🙂',
  3: '😃',
  4: '🤩',
  5: '🔥',
};

export interface User {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface Room {
  id: string;
  name: string;
  platform: RoomPlatform;
  accentColor: string;
  createdBy: string;
  createdAt: string;
  myRole: RoomRole;
  /** Only present when the caller has permission to see it (any member, per current rules). */
  inviteCode?: string;
  /** Posts room activity to this Discord channel webhook, if set. Room Master only to view/edit. */
  discordWebhookUrl?: string | null;
  /** When true, Spin the Wheel only draws from games every current member owns. */
  spinOnlyFullyOwned: boolean;
}

export interface RoomMember {
  roomId: string;
  user: User;
  role: RoomRole;
  joinedAt: string;
}

export interface GamePrice {
  amount: string | null;
  currency: string | null;
  source: 'live' | 'unavailable';
  /** All-time-low price seen for this game (from gg.deals' historical price data), same currency
   * as `amount`. Null only when gg.deals has no historical data at all - unlike `amount`, this is
   * the raw value even when it equals (or is above) the current price; callers displaying it as a
   * "here's a discount" callout should compare against `amount` themselves before showing it. */
  historicalLow: string | null;
  /** When this price entry was last fetched from gg.deals (ISO string) - i.e. the age of the
   * cached/served value, not necessarily "just now". Null only when no fetch has ever happened
   * (e.g. the game has no Steam app id at all). */
  lastRefreshedAt: string | null;
}

export interface VoteSummary {
  user: User;
  value: VoteValue;
  /** When this vote was cast/last changed (ISO string) - a vote from months ago carries the same
   * weight as a fresh one everywhere it's used (sorting, Spin the Wheel), but the UI surfaces its
   * age so a stale 🔥 doesn't read as current. */
  createdAt: string;
}

/** A user-defined organizational label, layered on top of the fixed GameStatus enum (issue #247) -
 * e.g. "Co-op only" or "Short & sweet". Per-user, not shared/room-level - see Tag in schema.prisma. */
export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

export interface Game {
  id: string;
  roomId: string | null;
  addedBy: User;
  title: string;
  platform: string;
  genre: string | null;
  releaseYear: number | null;
  /** Full release date/time (issue #284) - releaseYear alone is only precise to the year. Null on
   * games added before this field existed, or when IGDB has no release date at all. */
  releaseDate: string | null;
  maxCoopPlayers: number | null;
  /** Hours for an average "main story" playthrough, from IGDB (issue #189). Null when IGDB has no
   * time-to-beat data for this game. */
  timeToBeatHours: number | null;
  /** Hours for a rushed/speedrun-style playthrough, from IGDB's "hastily" time-to-beat figure
   * (issue #248) - always the smallest of the three figures IGDB exposes (hastily < normally <
   * completely for any given game), i.e. less time than timeToBeatHours, not more. Null when
   * IGDB has no time-to-beat data. */
  timeToBeatRushedHours: number | null;
  /** Hours for a full completionist (100%) playthrough, from IGDB's "completely" time-to-beat
   * figure (issue #248). Null when IGDB has no time-to-beat data. */
  timeToBeatCompletionistHours: number | null;
  ggDealsUrl: string | null;
  coverImageUrl: string | null;
  status: GameStatus;
  price: GamePrice;
  /** A price to alert at, if set (issue #162) - shared per-game, not per-user, so a room game
   * notifies everyone in the room once it's hit. Null when no alert is set. */
  targetPrice: string | null;
  votes: VoteSummary[];
  myVote: VoteValue | null;
  voteScore: number;
  /** Whether the current user owns this game (see GameOwnership) - not meaningful/omitted concept
   * for the Personal Shelf, only used in Communal Rooms. */
  youOwn: boolean;
  /** How many of the room's *current* members own this game, out of how many current members
   * there are - e.g. {owned: 3, total: 4}. Null on the Personal Shelf, where there's no group
   * ownership to count. */
  ownership: { owned: number; total: number } | null;
  /** The *viewer's own* tags applied to this specific game row (issue #247) - always empty for a
   * room game someone else added, since only the person who added a game may tag it (tags are a
   * personal filing scheme, not a room feature - see Tag/GameTag in schema.prisma). Empty array,
   * never omitted, when the viewer has tagged nothing here. */
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

/** A lightweight title-search match, shown in the add-game search dropdown. */
export interface GameSearchResult {
  igdbId: number;
  title: string;
  platform: string;
  coverImageUrl: string | null;
  releaseYear: number | null;
}

export interface CreateGameRequest {
  igdbId: number;
  roomId?: string | null;
}

export interface CreateRoomRequest {
  name: string;
  platform: RoomPlatform;
  accentColor: string;
}

/** Room Master only. Any subset of fields may be provided. */
export interface UpdateRoomRequest {
  name?: string;
  platform?: RoomPlatform;
  accentColor?: string;
  /** Set to null to clear/disable the webhook. */
  discordWebhookUrl?: string | null;
  spinOnlyFullyOwned?: boolean;
}

export interface JoinRoomRequest {
  inviteCode: string;
}

export interface VoteRequest {
  value: VoteValue;
}

/** The systems a user has ticked as "owned" on their Personal Shelf - an empty array means no
 * filter has been opted into yet, so the add-game search/create flow shows everything. */
export interface UpdateOwnedPlatformsRequest {
  platforms: RoomPlatform[];
}

export interface UpdateGameStatusRequest {
  status: GameStatus;
}

/** Applies one status to many Personal Shelf games at once (issue #205) - scoped to the shelf since
 * that's where large single-player backlogs pile up; rooms are small/shared enough that per-card
 * status changes stay easy. */
export interface BulkUpdateGameStatusRequest {
  gameIds: string[];
  status: GameStatus;
}

/** Removes many Personal Shelf games at once - same shelf-only scoping as
 * BulkUpdateGameStatusRequest, for the same reason. */
export interface BulkRemoveGamesRequest {
  gameIds: string[];
}

/** Sets (or clears, with null) the price to alert at for a game - see Game.targetPrice. */
export interface SetTargetPriceRequest {
  targetPrice: string | null;
}

/** Marks (or clears) the current user's ownership claim on a game - see GameOwnership. */
export interface SetGameOwnershipRequest {
  owned: boolean;
}

/** Relocates a game to a different room, or to the mover's Personal Shelf (roomId: null). */
export interface MoveGameRequest {
  roomId: string | null;
}

/** Creates a new tag for the caller. Rejected with 409 if they already have one with this name
 * (case-sensitive - see Tag's @@unique in schema.prisma). */
export interface CreateTagRequest {
  name: string;
}

/** Renames a tag the caller owns. Same name-collision handling as CreateTagRequest. */
export interface RenameTagRequest {
  name: string;
}

/** Applies a tag to a game by name (issue #247) - finds-or-creates the caller's tag with this name
 * in one request, so the "type a new tag and hit enter" flow in GameDetailModal doesn't need a
 * separate create-then-apply round trip. Applying a tag that's already on the game is a no-op. */
export interface ApplyTagRequest {
  name: string;
}

/** Response from POST /api/games/import-steam-library. The actual import (one IGDB lookup per
 * unowned game) runs in the background rather than blocking this response on it - a real
 * deployment saw a big library run past a reverse proxy/CDN's connection timeout, surfacing as a
 * client-side error even though the import was still completing server-side (see routes/games.ts).
 * This response only confirms the import started; poll SteamImportProgress for live counts and to
 * know when it's actually done. */
export interface SteamImportStarted {
  totalOwned: number;
  consideredCount: number;
}

/** Response from POST /api/games/import-steam-wishlist (issue #228 added the route, #245 moved it
 * to this same background-and-poll shape as library import - see SteamImportStarted). Added with
 * status `wishlist` rather than the default, and never marked owned. This response only confirms
 * the import started; poll SteamWishlistImportProgress for live counts and to know when it's
 * actually done. */
export interface SteamWishlistImportStarted {
  totalWishlisted: number;
  consideredCount: number;
}

/** One Personal Shelf game "Sync completions from Steam" (issue #244) found 100%'d on Steam but
 * not yet marked Done in the app - see SteamCompletionsSyncResult. Purely a suggestion: nothing is
 * changed server-side until the caller explicitly applies Done to some/all of these, the same
 * opt-in-by-design pattern as the single-game nudge in GameDetailModal.tsx (issue #227). */
export interface SteamCompletionCandidate {
  id: string;
  title: string;
  coverImageUrl: string | null;
  /** ISO 8601 - the most recent Steam achievement unlock on file for this game. */
  lastUnlockedAt: string;
}

/** Response from POST /api/games/sync-steam-completions. Runs the same candidate-scanning logic as
 * the Year in Review recap's auto-detection, but across all time instead of a 12-month window (see
 * findDetectedSteamCompletions in server/src/services/steamCompletionDetection.ts).
 * `consideredCount` is how many not-yet-Done, Steam-linked shelf games were actually checked
 * (bounded by STEAM_COMPLETIONS_SYNC_CANDIDATE_LIMIT) - not the size of `candidates`, since most
 * checked games won't turn out to be 100%'d. */
export interface SteamCompletionsSyncResult {
  consideredCount: number;
  candidates: SteamCompletionCandidate[];
}

/** Polled by the shelf UI while an import is running (see routes/games.ts and
 * SteamImportCard.tsx) so a slow import (one IGDB lookup per unowned game) shows live counts
 * instead of sitting on a bare "Importing…" the whole time - also the only source of the final
 * result once `done` is true, since the import runs entirely in the background (see
 * SteamImportStarted). */
export interface SteamImportProgress {
  totalOwned: number;
  consideredCount: number;
  imported: number;
  skipped: number;
  done: boolean;
}

/** Wishlist counterpart to SteamImportProgress (issue #245) - same reasoning/shape, but for a
 * wishlist import (see SteamWishlistImportStarted) rather than a library import. */
export interface SteamWishlistImportProgress {
  totalWishlisted: number;
  consideredCount: number;
  imported: number;
  skipped: number;
  done: boolean;
}

/** Where a configurable integration credential currently comes from - env vars always take
 * precedence over the DB-stored fallback; "unset" means neither is configured. */
export type ConfigSource = 'env' | 'db' | 'unset';

/** One player's Steam achievement progress for a specific game - room members for a room game, or
 * just the current user for a Personal Shelf game. Only includes players with a usable Steam
 * account (see resolveSteamId64) for a game that actually has achievements to report; everyone
 * else is simply omitted rather than shown as a zero. */
export interface PlayerAchievements {
  user: User;
  unlocked: number;
  total: number;
}

/** The integration credentials that can be set via env var or, as a fallback, via the admin
 * Settings panel (see server/src/services/configResolver.ts). */
export type IntegrationConfigKey = 'GGDEALS_API_KEY' | 'IGDB_CLIENT_ID' | 'IGDB_CLIENT_SECRET';

/** Admin-only views — never sent to non-admin users. */
export interface AdminIntegrationStatus {
  ggDealsApiKeyConfigured: boolean;
  ggDealsApiKeySource: ConfigSource;
  igdbConfigured: boolean;
  igdbClientIdSource: ConfigSource;
  igdbClientSecretSource: ConfigSource;
  devFakeAuth: boolean;
  activeAuthProviders: string[];
}

/** Sets (or replaces) the DB-stored fallback value for one integration credential. Rejected by
 * the server if the corresponding env var is already set (env vars always win, so writing here
 * for an env-sourced key would be silently ineffective). */
export interface SetIntegrationConfigRequest {
  key: IntegrationConfigKey;
  value: string;
}

export interface AdminUserSummary {
  id: string;
  displayName: string;
  email: string;
  avatarColor: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface AdminRoomSummary {
  id: string;
  name: string;
  platform: RoomPlatform;
  createdBy: string;
  creatorDisplayName: string;
  memberCount: number;
  gameCount: number;
  createdAt: string;
}

/** A durable record of a destructive admin action - see AdminAuditLog in schema.prisma.
 * actorLabel/targetLabel are snapshots taken at write time, so they stay meaningful even after
 * the account/room/etc they refer to is gone. */
export interface AdminAuditLogEntry {
  id: string;
  actorLabel: string;
  action: string;
  targetLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export type NotificationType =
  | 'game_added'
  | 'member_joined'
  | 'room_renamed'
  | 'room_platform_changed'
  | 'room_owner_changed'
  | 'room_deleted'
  | 'price_drop';

export interface Notification {
  id: string;
  /** Null once the room itself is gone - see `room_deleted`, the only type this happens for. */
  roomId: string | null;
  /** Snapshot of the room's name at the time this notification was created. */
  roomName: string;
  type: NotificationType;
  message: string;
  actor: User | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationRoomUnread {
  roomId: string;
  unreadCount: number;
}

export interface NotificationSummary {
  totalUnread: number;
  rooms: NotificationRoomUnread[];
}

/** One entry in a Year in Review's top-voted list (issue #230) - just enough of a game to render a
 * small result row, not the full Game DTO. */
export interface YearInReviewTopVotedGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  voteScore: number;
}

export interface YearInReviewGenreCount {
  genre: string;
  count: number;
}

export interface YearInReviewGameHours {
  id: string;
  title: string;
  hours: number;
}

/** One unlocked Steam achievement, picked out as one of the rarest earned in the window (lowest
 * community-wide unlock percentage). */
export interface YearInReviewRareAchievement {
  gameTitle: string;
  achievementName: string;
  /** 0-100, community-wide. Lower = rarer. */
  globalUnlockPercent: number;
  unlockedAt: string;
}

/** One room (or the Personal Shelf, when `roomId` is null) the caller finished at least one game
 * in during the window - lets the recap say "completed with ..." instead of just a flat list.
 * `memberNames` reflects who's currently in the room, not who was there when each game was
 * actually finished (room membership history isn't tracked), and excludes the caller themselves. */
export interface YearInReviewGroupCompletion {
  roomId: string | null;
  roomName: string | null;
  memberNames: string[];
  games: { id: string; title: string }[];
}

/** On-demand summary of the last 12 months, generated from data already on hand - no new tracking
 * (issue #230). `doneCount`/`estimatedHours` cover games the caller personally added (Personal
 * Shelf or any room) and marked Done in the window, PLUS games not marked Done in the app but that
 * Steam says the caller 100%'d within the window (see `steamAutoDetectedCount`) - the app's status
 * field is opt-in (see the Done-suggestion nudge in GameDetailModal.tsx), so relying on it alone
 * undercounts anyone who tracks completion via Steam instead of clicking "Done" here. `topVoted`
 * covers every game in a room the caller is currently a member of, ranked by vote weight cast in
 * the window (regardless of who added the game or who cast the votes) - a "what did the squad
 * like" view, not a personal one. */
export interface YearInReview {
  windowStart: string;
  windowEnd: string;
  doneCount: number;
  /** How many of `doneCount` were detected from Steam achievements rather than the app's Done
   * status - 0 when the caller has no usable Steam account, no STEAM_API_KEY is configured, or
   * every completion was already tracked manually. */
  steamAutoDetectedCount: number;
  /** Sum of `timeToBeatHours` across the Done games counted above - games with no time-to-beat
   * data on file just don't contribute, rather than skewing the total with a guess. */
  estimatedHours: number;
  topVoted: YearInReviewTopVotedGame[];
  /** Genres of the Done games counted above, tallied by count, highest first. Games with no genre
   * on file are omitted rather than lumped into an "Unknown" bucket. */
  genreSpread: YearInReviewGenreCount[];
  /** The Done games counted above with the highest `timeToBeatHours`, highest first (capped to a
   * handful) - games with no time-to-beat data on file are omitted, same reasoning as
   * estimatedHours. */
  mostTimeConsuming: YearInReviewGameHours[];
  /** The Done games counted above, grouped by which room (if any) they were in - see
   * YearInReviewGroupCompletion. */
  completedByGroup: YearInReviewGroupCompletion[];
  /** Total Steam achievements unlocked in the window, across every Done/owned game with a linked
   * Steam app id - 0 (not omitted) when the caller has no usable Steam account or no
   * STEAM_API_KEY is configured, same as the rest of this recap degrading gracefully rather than
   * erroring. */
  achievementsUnlocked: number;
  /** The rarest achievements (lowest community-wide unlock %) the caller unlocked in the window,
   * across every game with a linked Steam app id - empty under the same conditions as
   * achievementsUnlocked being 0. */
  rarestAchievements: YearInReviewRareAchievement[];
}

/** One game the caller added, in the "Download my data" export - a slimmer, DB-shaped view than
 * the full `Game` DTO (no live price lookup, no other members' votes), since this is a bulk
 * point-in-time snapshot rather than something rendered as a card. `roomId`/`roomName` are null
 * for a Personal Shelf entry. */
export interface DataExportGame {
  id: string;
  title: string;
  platform: string;
  genre: string | null;
  status: GameStatus;
  roomId: string | null;
  roomName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One vote the caller cast, in the "Download my data" export. `gameTitle`/`roomId`/`roomName`
 * are snapshotted alongside the vote itself so the export reads standalone even for a vote on a
 * game the caller didn't add. */
export interface DataExportVote {
  gameId: string;
  gameTitle: string;
  roomId: string | null;
  roomName: string | null;
  value: VoteValue;
  createdAt: string;
}

/** One room the caller is (or was, at export time) a member of. */
export interface DataExportRoomMembership {
  roomId: string;
  roomName: string;
  role: RoomRole;
  joinedAt: string;
}

/** One provider that can sign into the caller's account - the primary sign-in identity
 * (User.oidcSub) plus any secondary providers linked afterward (see LinkedIdentity in
 * schema.prisma), Steam included even though a linked Steam account lives on `User.steamId64`
 * rather than a LinkedIdentity row. Provider name and the provider's own account id only, never
 * a token/secret, since none are ever stored for a linked identity to begin with. */
export interface DataExportLinkedIdentity {
  provider: string;
  providerAccountId: string;
}

/** Full point-in-time JSON snapshot of everything the app knows about the caller, downloadable
 * from Profile Settings' Danger Zone as a safety net before account deletion (issue #243) - not
 * scheduled/automatic, generated fresh on each request from the same tables Year in Review reads
 * (see `/api/me/year-in-review`). Deliberately excludes anything not owned by the caller (e.g.
 * other members' votes on a shared room game) and any credential/token material. */
export interface DataExport {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    createdAt: string;
    /** Systems ticked as "owned" on the Personal Shelf - see User.ownedPlatforms. */
    ownedPlatforms: RoomPlatform[];
  };
  /** Every provider that can sign into this account - the primary sign-in identity plus any
   * linked afterward (including Steam, if linked). */
  linkedIdentities: DataExportLinkedIdentity[];
  /** Personal Shelf games (`roomId` null) and games added to a room, combined - same `addedBy`
   * scoping as Year in Review's own queries. */
  gamesAdded: DataExportGame[];
  votesCast: DataExportVote[];
  roomMemberships: DataExportRoomMembership[];
}
