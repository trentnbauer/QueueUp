export type GameStatus = 'backlog' | 'playing' | 'done' | 'dropped' | 'wishlist' | 'replay' | 'play_next';

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
  /** Null means "any platform" (issue #473) - the room isn't locked to a single console/PC, so
   * suggestion-matching, ownership, and IGDB platform resolution fall back to per-game/per-user
   * platform data instead of this one field. */
  platform: RoomPlatform | null;
  accentColor: string;
  createdBy: string;
  createdAt: string;
  myRole: RoomRole;
  /** Only present when the caller has permission to see it (any member, per current rules). */
  inviteCode?: string;
  /** Posts room activity to this Discord channel webhook, if set. Room Master only to view/edit. */
  discordWebhookUrl?: string | null;
  /** Spin the Wheel draws from games every current member owns, plus games with a live price at
   * or under this many dollars. 0 reproduces the old "fully owned only" behavior. */
  spinOwnershipMaxPrice: number;
  /** Which visual presentation Spin the Wheel uses - see SpinWheelTheme. */
  spinWheelTheme: SpinWheelTheme;
  /** When true, this room is listed in the public room directory and any signed-in user can
   * self-join it instantly (no invite code, no approval step). Defaults to false. */
  isPublic: boolean;
  /** When true, a plain Member's "add a game" becomes a suggestion a Room Master/Moderator must
   * approve or decline (issue #362), instead of adding directly. Room Masters/Moderators always
   * add directly regardless of this flag. Defaults to false. */
  requireGameApproval: boolean;
}

/** A member's lightweight nomination for a room game, pending a Room Master/Moderator's approval
 * (issue #362) - only created when the room's requireGameApproval is on and the suggester is a
 * plain Member. See GameSuggestion in schema.prisma for why this is a separate concept from Game
 * rather than a GameStatus value. */
/** A room's shared, in-progress Spin the Wheel session (see RoomSpin in schema.prisma) - polled by
 * every member currently viewing the room so the modal opens/updates for all of them together, not
 * just whoever clicked "Pick a Game". Clicking the left/right side of the spin nudges its physics
 * (see spinPhysics.ts in this package) rather than instantly rerolling - `position0`/`velocity0`/
 * `timestamp0` are a snapshot every client derives the same live position from, and `settlesAt`/
 * `settledPosition` are computed once (at start, or on each nudge) so every observer - regardless
 * of when they happen to check - agrees on the same eventual winner:
 * `strip[candidateIndexAt(settledPosition, strip.length)]`, once `Date.now() >= settlesAt`.
 * `nudgeCount` bumps on every nudge, the same "did the base change" signal `shakeCount` used to be. */
export interface RoomSpinSession {
  id: string;
  theme: ConcreteSpinWheelTheme;
  strip: Game[];
  position0: number;
  velocity0: number;
  /** ISO timestamp. */
  timestamp0: string;
  /** ISO timestamp. */
  settlesAt: string;
  settledPosition: number;
  nudgeCount: number;
  /** How many distinct members have opened Spin the Wheel while it's still in its pre-start
   * waiting room (issue #488) - lets the waiting-room countdown show who's actually shown up
   * instead of counting down blind. Meaningless once the spin has started moving (nothing clears
   * it then, but nothing reads it then either - see SPIN_WAITING_ROOM_MS in roomSpin.ts). */
  readyCount: number;
}

/** A room's spin session, but only the sliver a cross-room "someone just started a spin" popup
 * needs (issue #555) - deliberately not RoomSpinSession itself, which carries the full strip/
 * physics state and is only worth fetching per-room, at the fast poll useRoomSpin already runs
 * for whoever's actually looking at that room. This is the opposite shape: cheap enough to poll
 * across every room a member is in, so someone who *isn't* currently looking gets pulled in before
 * the spin's pre-start waiting room (SPIN_WAITING_ROOM_MS, see roomSpin.ts) closes. Only ever
 * includes a spin still in that waiting window - once a spin has started moving, joining a popup
 * doesn't meaningfully let anyone participate anymore. */
export interface ActiveRoomSpin {
  spinId: string;
  roomId: string;
  roomName: string;
}

export interface GameSuggestion {
  id: string;
  roomId: string;
  igdbId: number;
  title: string;
  platform: string;
  coverImageUrl: string | null;
  releaseYear: number | null;
  suggestedBy: User;
  createdAt: string;
}

/** Minimal shape returned by GET /api/rooms/public for the room directory - the caller isn't a
 * member yet, so this deliberately omits invite codes, webhook URLs, and other member-only data
 * that the full Room DTO carries. */
export interface PublicRoomSummary {
  id: string;
  name: string;
  /** Null means "any platform" (issue #473) - see Room.platform. */
  platform: RoomPlatform | null;
  accentColor: string;
  memberCount: number;
}

/** Which visual presentation Spin the Wheel uses, room-settable. "random" resolves to one of the
 * other four at spin time (see resolveConcreteTheme in the web app) rather than being a renderable
 * theme itself - ConcreteSpinWheelTheme is what a caller actually renders. */
export type SpinWheelTheme = 'slot' | 'crate' | 'card_flip' | 'roulette' | 'random';

export const SPIN_WHEEL_THEME_LABELS: Record<SpinWheelTheme, string> = {
  slot: 'Slot Machine',
  crate: 'Loot Crate',
  card_flip: 'Card Flip',
  roulette: 'Roulette Wheel',
  random: 'Random',
};

export type ConcreteSpinWheelTheme = Exclude<SpinWheelTheme, 'random'>;

export const CONCRETE_SPIN_WHEEL_THEMES: ConcreteSpinWheelTheme[] = ['slot', 'crate', 'card_flip', 'roulette'];

export interface RoomMember {
  roomId: string;
  user: User;
  role: RoomRole;
  joinedAt: string;
}

/** A room member's completion stats within that room (issue: member list click-to-expand).
 * completedCount is games they added to this room that are Beaten or queued for Replay;
 * fullyCompletedCount is how many of this room's titles their own Steam account has 100%'d,
 * regardless of who added them - see AchievementCompletion. */
export interface RoomMemberStats {
  completedCount: number;
  fullyCompletedCount: number;
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
  /** True once any player's Steam achievement progress on this game has ever been observed at
   * 100% - drives the card ribbon showing "Clocked" (gold) instead of "Beaten" (green) for a Done
   * game. Sticky - a later Replay doesn't clear it. */
  steamFullyCompleted: boolean;
  price: GamePrice;
  /** A price to alert at, if set (issue #162) - shared per-game, not per-user, so a room game
   * notifies everyone in the room once it's hit. Null when no alert is set. */
  targetPrice: string | null;
  /** A user-set fallback dollar amount (issue #385) - shown wherever the price otherwise displays
   * as unavailable (see GamePrice.amount/source), for games gg.deals/Steam can't match at all.
   * Null when unset, or ignored once a live price is available. */
  manualPrice: string | null;
  votes: VoteSummary[];
  myVote: VoteValue | null;
  voteScore: number;
  /** Whether the current user owns this game (see GameOwnership) - meaningful on the Personal
   * Shelf too (a simple "is there any claim at all" there, deferring to `status` - see
   * getOwnershipInfo's doc comment), not just Communal Rooms. */
  youOwn: boolean;
  /** How many of the room's *current* members own this game, out of how many current members
   * there are - e.g. {owned: 3, total: 4}. Null on the Personal Shelf, where there's no group
   * ownership to count. */
  ownership: { owned: number; total: number } | null;
  /** How many of the room's *current* members also have this game wishlisted on their own
   * Personal Shelf, out of how many current members there are (issue #368) - parallel to
   * `ownership` above. Null on the Personal Shelf, where there's no group to count. */
  wishlist: { wishlisted: number; total: number } | null;
  /** Which platform(s) the current viewer owns this on (issue #456) - Personal Shelf only, always
   * [] for a room game (its single Room.platform already says which platform). Also [] when not
   * owned, or when owned but the claim predates platform tracking (pre-migration GameOwnership
   * rows - see that model's doc comment) - treat all of those the same: nothing to show. */
  ownedPlatforms: RoomPlatform[];
  /** The *viewer's own* tags applied to this specific game row (issue #247) - always empty for a
   * room game someone else added, since only the person who added a game may tag it (tags are a
   * personal filing scheme, not a room feature - see Tag/GameTag in schema.prisma). Empty array,
   * never omitted, when the viewer has tagged nothing here. */
  tags: Tag[];
  /** IGDB's franchise/series id, if this game belongs to one - null otherwise, and on games added
   * before this was captured. Used to compute the "play after" dropdown's default suggestion
   * (the closest-released earlier entry from the same collection already in the room). */
  igdbCollectionId: number | null;
  /** 0-100 IGDB review score (issue #311) - null when IGDB has no review data for this game, or
   * on games added before this was captured. Nudges Spin the Wheel's weighted pick toward
   * better-reviewed games - see spinCandidateWeight in gameGridLogic.ts. */
  reviewScore: number | null;
  /** User-set "play this after" pointer to another game in the same room (e.g. Borderlands 2 ->
   * Borderlands 1) - null when unset. Room games only; always null on the Personal Shelf. Spin the
   * Wheel excludes a backlog game from its candidate pool while its prerequisite isn't yet Done -
   * see hasUnmetPrerequisite in gameGridLogic.ts. */
  prerequisiteGameId: string | null;
  /** Set when IGDB identifies this game as DLC/an expansion with a known parent (issue #338) -
   * points at the base game's row in the same room/shelf, auto-added if it wasn't already there.
   * Null for a main game, or a DLC/expansion IGDB has no parent link on file for. Unlike
   * prerequisiteGameId, this isn't user-editable - it's set once at intake, not an organizational
   * pointer someone picks from a dropdown. */
  baseGameId: string | null;
  /** Minutes of Steam playtime logged since this game's last tracked checkpoint (its last PlayLog
   * entry's start/finish playtime, or the playtime it had at its very first snapshot if it's never
   * had one) - issue #548's raw signal for "did someone actually play this." Null whenever there's
   * nothing to compare: playtime tracking is off, this isn't a Steam-matched Personal Shelf game
   * (room games have no single unambiguous player), or its owner has no playtime snapshot yet.
   * Always Personal-Shelf-only. Resets toward 0 on a status change (a new PlayLog checkpoint) -
   * see currentPlaytimeMinutes for the figure that doesn't. */
  playtimeSinceCheckpointMinutes: number | null;
  /** Raw, always-increasing total Steam playtime minutes from the latest snapshot (issue #548).
   * Same null conditions as playtimeSinceCheckpointMinutes, but never resets - the batch "review
   * your played games" prompt (usePlaytimeReview.ts) tracks its own per-game high-watermark
   * against this rather than the checkpoint-relative figure, since it needs something that keeps
   * climbing instead of zeroing out the moment an individual nudge gets acted on. */
  currentPlaytimeMinutes: number | null;
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

/** Result of looking up a scanned physical-game barcode (issue #402) - same shape as a normal
 * search result (see GameSearchResult), so the Add Game modal can feed it straight into the same
 * owned/platforms step, plus the specific platform ScanDex resolved for this physical copy.
 * `matchedPlatform` is null when ScanDex's platform name doesn't map to any RoomPlatform QueueUp
 * tracks (still shown/addable - just nothing to pre-check in the platforms step). */
export interface BarcodeGameMatch {
  igdbId: number;
  title: string;
  platform: string;
  coverImageUrl: string | null;
  releaseYear: number | null;
  matchedPlatform: RoomPlatform | null;
}

/** A franchise/series match, shown alongside individual games in the add-game search dropdown -
 * picking one drills into CollectionGamesResult rather than adding directly. */
export interface CollectionSearchResult {
  collectionId: number;
  name: string;
}

/** A collection's games, already filtered/deduped the same way normal search results are (room
 * platform, or the user's owned systems; games already added are excluded) and sorted oldest
 * release first, so "add the whole series" naturally lands in play order. */
export interface CollectionGamesResult {
  name: string;
  games: GameSearchResult[];
  /** True if the collection had more games than were returned - see MAX_COLLECTION_GAMES. */
  truncated: boolean;
}

export interface CreateGameRequest {
  igdbId: number;
  roomId?: string | null;
  /** Explicit initial status - Personal Shelf's Add Game modal asks owned ('backlog') or not
   * ('wishlist') up front instead of leaving it to defaultStatusForRelease's release-date guess.
   * Omitted (rooms, and Steam import) keeps that release-date fallback unchanged. Only 'backlog'
   * or 'wishlist' are accepted here - this isn't a general status override. */
  status?: 'backlog' | 'wishlist';
  /** Platforms to mark this game owned on immediately (Personal Shelf's Add Game modal) - only
   * meaningful alongside `status: 'backlog'` (owned); ignored otherwise, and rejected outright for
   * a room add (see the route) since room ownership is scoped to the room's own platform instead. */
  ownedPlatforms?: RoomPlatform[];
}

/** POST /api/games normally adds the game directly. In a room with requireGameApproval on, a
 * plain Member's add instead creates a GameSuggestion for a Room Master/Moderator to approve or
 * decline (issue #362) - callers must check which key is present. */
export type CreateGameResponse = ({ game: Game } | { suggestion: GameSuggestion }) & { unlockedBadges: BadgeDefinition[] };

export interface CreateRoomRequest {
  name: string;
  /** Omit (or pass null) for "any platform" (issue #473) - the room won't be locked to a single
   * console/PC. */
  platform?: RoomPlatform | null;
  accentColor: string;
  /** Defaults to false (invite-only) if omitted. */
  isPublic?: boolean;
}

/** Room Master only. Any subset of fields may be provided. */
export interface UpdateRoomRequest {
  name?: string;
  /** Pass null to clear the room's platform restriction (issue #473); omit to leave it unchanged. */
  platform?: RoomPlatform | null;
  accentColor?: string;
  /** Set to null to clear/disable the webhook. */
  discordWebhookUrl?: string | null;
  spinOwnershipMaxPrice?: number;
  spinWheelTheme?: SpinWheelTheme;
  isPublic?: boolean;
  requireGameApproval?: boolean;
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

/** Toggles User.publicProfileEnabled (issue #511) - see that field's schema doc. */
export interface UpdatePublicProfileRequest {
  enabled: boolean;
}

export interface UpdateGameStatusRequest {
  status: GameStatus;
}

/** A room game just got marked Beaten, and the same game (by igdbId) either isn't on the caller's
 * Personal Shelf at all, or is there but not yet marked Beaten - offered as a one-tap sync rather
 * than making someone remember to go update it separately. `shelfGameId` is null when the game
 * isn't on the shelf yet at all - accepting the suggestion adds it there (already marked Beaten)
 * instead of just updating an existing row. Never generated the other way around - marking a game
 * Beaten on the Personal Shelf doesn't prompt about any room copies. */
export interface ShelfSyncSuggestion {
  shelfGameId: string | null;
  igdbId: number;
  title: string;
}

export interface UpdateGameStatusResponse {
  game: Game;
  shelfSync?: ShelfSyncSuggestion;
  unlockedBadges: BadgeDefinition[];
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

/** Sets (or clears, with null) the fallback price for a game - see Game.manualPrice. */
export interface SetManualPriceRequest {
  manualPrice: string | null;
}

/** Marks (or clears) the current user's ownership claim on a game - see GameOwnership. */
export interface SetGameOwnershipRequest {
  owned: boolean;
}

/** Sets (or clears, with null) which other game in the same room this one should be played after -
 * see Game.prerequisiteGameId. */
export interface SetGamePrerequisiteRequest {
  prerequisiteGameId: string | null;
}

/** One candidate from a Steam store title search - used for manually picking which Steam release
 * a game's pricing should be matched to, when the automatic match (IGDB, then an exact-title
 * Steam search) either found nothing or picked the wrong edition/remaster. */
export interface SteamStoreMatch {
  steamAppId: number;
  title: string;
  thumbnailUrl: string | null;
}

/** Manually sets (or clears, with null) which Steam App ID a game's gg.deals pricing should be
 * matched to - see Game.steamAppid. */
export interface SetSteamMatchRequest {
  steamAppId: number | null;
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
  unlockedBadges: BadgeDefinition[];
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
  /** Only ever populated on the final `done: true` payload (issue #489) - the import runs entirely
   * in the background, so there's no synchronous response to attach these to; the client checks
   * this the moment `done` flips true instead. */
  unlockedBadges?: BadgeDefinition[];
}

/** Wishlist counterpart to SteamImportProgress (issue #245) - same reasoning/shape, but for a
 * wishlist import (see SteamWishlistImportStarted) rather than a library import. */
export interface SteamWishlistImportProgress {
  totalWishlisted: number;
  consideredCount: number;
  imported: number;
  skipped: number;
  done: boolean;
  /** Same as SteamImportProgress.unlockedBadges - only set on the final `done: true` payload. */
  unlockedBadges?: BadgeDefinition[];
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

/** One playthrough attempt's dated record (issue #361) - see PlayLog in schema.prisma for why this
 * exists separately from Game.status. `finishedAt` is null while still in progress (or paused -
 * see recordStatusTransition.ts). Newest attempt first. */
export interface PlayLogEntry {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  /** Minutes actually played during this specific attempt (issue #559) - finishPlaytimeMinutes
   * minus startPlaytimeMinutes on the underlying PlayLog row, distinct from the wall-clock time
   * between startedAt/finishedAt (which includes any stretch the game sat untouched). Null while
   * still in progress (finishedAt is also null then), or whenever either playtime stamp is missing
   * - playtime tracking was off, this game was never Steam-matched, or the entry predates issue
   * #548 entirely. */
  minutesPlayed: number | null;
}

/** The integration credentials that can be set via env var or, as a fallback, via the admin
 * Settings panel (see server/src/services/configResolver.ts). */
export type IntegrationConfigKey = 'GGDEALS_API_KEY' | 'IGDB_CLIENT_ID' | 'IGDB_CLIENT_SECRET' | 'SCANDEX_API_KEY';

/** Admin-only views — never sent to non-admin users. */
export interface AdminIntegrationStatus {
  ggDealsApiKeyConfigured: boolean;
  ggDealsApiKeySource: ConfigSource;
  igdbConfigured: boolean;
  igdbClientIdSource: ConfigSource;
  igdbClientSecretSource: ConfigSource;
  /** ScanDex (issue #402) - barcode-to-IGDB lookup for "scan a physical game" on Add Game. Not
   * required for the rest of the app to function, unlike gg.deals/IGDB above - unset just means
   * the camera-scan option degrades to "couldn't look that up," search still works normally. */
  scandexApiKeyConfigured: boolean;
  scandexApiKeySource: ConfigSource;
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
  /** Null means "any platform" (issue #473) - see Room.platform. */
  platform: RoomPlatform | null;
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
  | 'price_drop'
  | 'game_suggested'
  | 'release_watch'
  | 'playtime_mark_playing';

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
  /** The specific game this notification is about, if any (issue #554) - null for every type
   * except playtime_mark_playing. Lets a client action button (e.g. "Mark Playing") target the
   * right game without parsing `message`. */
  gameId: string | null;
}

/** Issue #509 - a room's full, paginated activity history, distinct from NotificationType above:
 * see RoomActivity's schema doc for why this is a separate, unread-state-free feed rather than a
 * reuse of the notification bell's table. */
export type RoomActivityType =
  | 'game_added'
  | 'game_suggested'
  | 'member_joined'
  | 'room_renamed'
  | 'room_platform_changed'
  | 'room_owner_changed'
  | 'price_drop'
  | 'status_changed'
  | 'vote_cast'
  | 'spin_result'
  | 'member_promoted'
  | 'member_left';

export interface RoomActivityEntry {
  id: string;
  type: RoomActivityType;
  message: string;
  actor: User | null;
  createdAt: string;
}

/** Response for GET /api/rooms/:roomId/activity - `nextBefore` is the createdAt cursor to pass as
 * the `before` query param for the next older page, or null once there's nothing further back. */
export interface RoomActivityPage {
  entries: RoomActivityEntry[];
  nextBefore: string | null;
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

/** One group of Currently Playing games in the cross-room dashboard (issue #364) - either a room
 * the caller is a member of, or their Personal Shelf (`roomId: null`, `roomName: null`). Only
 * groups with at least one Playing/Play Next game are included - see the route for why an empty
 * room is omitted rather than shown with a "nothing playing" placeholder. */
export interface CrossRoomPlayingGroup {
  roomId: string | null;
  roomName: string | null;
  games: Game[];
}

/** Aggregates "Currently Playing" (and Play Next) across every room the caller is in, plus their
 * Personal Shelf, into one view (issue #364) - `Game.status` is per-game, not per-member, so this
 * is "what games are active where," same scope as the per-room PlayingStrip, just merged across
 * every room at once instead of requiring a switch into each one. */
export interface CrossRoomPlaying {
  groups: CrossRoomPlayingGroup[];
}

/** One group of Beaten games in the cross-room dashboard (issue #481) - either a room the caller
 * is a member of, or their Personal Shelf (`roomId: null`, `roomName: null`). Includes Replay
 * alongside Done, same as BeatenStrip.tsx's own grouping (a Replay is by definition already-
 * beaten). Only groups with at least one Done/Replay game are included, same reasoning as
 * CrossRoomPlayingGroup. */
export interface CrossRoomBeatenGroup {
  roomId: string | null;
  roomName: string | null;
  games: Game[];
}

/** Aggregates Beaten (and Replay) across every room the caller is in, plus their Personal Shelf,
 * into one view (issue #481) - a user asked for "an easy way to display my beaten list, including
 * communal rooms" without switching into each room individually, the same problem #364's Currently
 * Playing dashboard solved for Playing/Play Next. */
export interface CrossRoomBeaten {
  groups: CrossRoomBeatenGroup[];
}

/** Which heuristic picked a /api/me/next-pick suggestion (issue #508) - shown to the caller
 * alongside the pick so "why this game" is never a mystery. Checked in this order, first
 * non-empty pool wins: `shortest` (least timeToBeatHours among backlog games that have it on
 * file), `oldest_wishlist` (longest-wishlisted title, for when nothing backlog-side has
 * time-to-beat data), `franchise_progress` (the backlog game furthest into an already-started
 * series - see collectionProgress), `neglected` (a weighted-random pick among backlog games
 * that have sat untouched 3+ months - see isNeglectedBacklogGame - weighted toward the most
 * neglected rather than a flat coin flip among them). */
export type NextPickReason = 'shortest' | 'oldest_wishlist' | 'franchise_progress' | 'neglected';

/** The slimmer, DB-shaped game view a next-pick suggestion carries - same reasoning as
 * DataExportGame below: no live price lookup or serialized ownership, just enough to render a
 * card and link through to the real game. */
export interface NextPickGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  platform: string;
  status: GameStatus;
  timeToBeatHours: number | null;
  createdAt: string;
}

export interface NextPickSuggestion {
  game: NextPickGame;
  reason: NextPickReason;
  /** Human-readable justification for the pick, e.g. "Shortest game in your backlog (4h)" or
   * "2 of 3 Mass Effect games beaten - finish the series" - computed server-side so the reasoning
   * (hours, counts, dates) stays in one place rather than being reconstructed client-side from
   * `reason` alone. */
  detail: string;
}

/** Response for GET /api/me/next-pick (issue #508) - a personal "what should I play next" picker
 * over the caller's own Personal Shelf backlog/wishlist, distinct from the existing "🎲 Pick a
 * Game" Spin the Wheel button (packages/shared/src/spinPicker.ts): Spin the Wheel is a uniform-ish
 * random draw the caller explicitly spins for fun; this is a deterministic-first recommendation
 * (shortest, then oldest wishlist, then franchise progress, then neglected-weighted-random as a
 * last resort) meant to answer the question literally, not entertain. `suggestion` is null only
 * when the caller's Personal Shelf has no backlog or wishlist games at all. */
export interface NextPickResponse {
  suggestion: NextPickSuggestion | null;
}

/** One age bucket in a backlog age distribution (issue #512) - "age" is time since a backlog
 * game was added (`createdAt`), a related but distinct question from "is it neglected" (that's
 * what `isNeglectedBacklogGame` already answers, via `updatedAt`/votes, not `createdAt` alone).
 * Boundaries are ~90/180/365 days (roughly 3/6/12 months) - the first edge deliberately echoes
 * `NEGLECTED_BACKLOG_MONTHS` so the distribution visually lines up with the same threshold used
 * elsewhere, but bucketing itself is plain day math, not the calendar-month arithmetic
 * `isNeglectedBacklogGame` uses (a fixed day count is close enough for a histogram bucket and
 * avoids reimplementing that month-overflow-safe logic for three more edges) - labels are phrased
 * in days for that reason, so nothing here implies exact month boundaries. Always four buckets, in
 * order, even when a bucket's count is 0 - so the shape of the distribution is stable to render. */
export interface BacklogAgeBucket {
  /** "Under 90 days" | "90-180 days" | "180-365 days" | "365+ days". */
  label: string;
  count: number;
}

/** The single backlog game that's gone the longest with no activity (issue #512) - "activity"
 * is exactly the three signals `isNeglectedBacklogGame` already checks (createdAt/updatedAt/
 * latest vote createdAt), just used here to rank every currently-neglected candidate by how far
 * past the threshold it is, rather than a plain in/out check. Null when nothing in the backlog
 * currently reads as neglected (not just "the least-recently-touched game," which would always
 * return something and misleadingly imply a problem when there isn't one yet). */
export interface MostNeglectedGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  /** Whichever of createdAt/updatedAt/latest-vote is most recent - the same "last touched"
   * instant `isNeglectedBacklogGame` checks against its threshold. */
  lastActivityAt: string;
  /** Days since `lastActivityAt`, floored - the headline number the UI shows. */
  daysSinceActivity: number;
}

/** On-demand insights view beyond Year in Review (issue #512), now genuinely possible since
 * `PlayLog` records real per-session start/finish timestamps (added for the Marathoner/Comeback
 * badges - issue #489) rather than only the current status. Scoped the same way Year in Review
 * scopes its Done games: every non-archived game the caller personally added, Personal Shelf or
 * any room - not just the Personal Shelf. */
export interface BacklogInsights {
  /** Average calendar time from a game being marked Playing to being marked Done/Replay, in
   * days, across the caller's most recent closed `PlayLog` entries belonging to a Done or Replay
   * game they added (capped defensively at MAX_GAMES_PER_LIST - see the route) - the actual
   * recorded stretch, not `Game.timeToBeatHours` (an IGDB estimate of active playtime hours,
   * unrelated to how long a copy sat in Playing). Days, not hours, because `PlayLog` only knows
   * when a session opened and closed, not how much was actually played in between - same reason
   * Marathoner/Comeback measure in days rather than hours. Entries with zero elapsed time (a game
   * marked Done/Dropped without ever passing through Playing - see the PlayLog model doc) are
   * excluded, same as the Not For Me badge's own duration > 0 gate, otherwise they'd drag the
   * average toward zero without reflecting a real playthrough length. Null when there are no
   * qualifying entries yet. */
  averageDaysToBeat: number | null;
  /** How many closed `PlayLog` entries contributed to `averageDaysToBeat` - shown alongside it so
   * a "14 days" average backed by one entry doesn't read as more solid than it is. */
  finishedEntryCount: number;
  /** Non-archived games currently in the caller's backlog (Personal Shelf + rooms), across every
   * bucket in `ageDistribution` - an at-a-glance denominator for the distribution below. Capped
   * defensively at MAX_GAMES_PER_LIST, same ceiling the rest of this route's queries use - a
   * genuinely real-world backlog is expected to stay well under this. */
  backlogCount: number;
  mostNeglectedGame: MostNeglectedGame | null;
  /** The current backlog bucketed by time since added - see `BacklogAgeBucket`. */
  ageDistribution: BacklogAgeBucket[];
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

/** A personal access token for the read/write API (issue #435) - see server's ApiKey model.
 * Never carries the raw key or its hash; that's only ever returned once, at creation, by
 * CreateApiKeyResponse below. */
export interface ApiKeySummary {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreateApiKeyRequest {
  label: string;
}

/** Same fields as ApiKeySummary, plus the one and only time the raw key itself is ever sent to
 * the client - shown once in the UI with a "copy now, you won't see this again" warning, same
 * principle as a session secret. */
export interface CreateApiKeyResponse extends ApiKeySummary {
  key: string;
}

/** One distinct title from an external library source (e.g. Playnite), already deduped/grouped by
 * the client - QueueUp expects one entry per title with the union of every platform that title was
 * reported owned on, not one entry per platform-specific row a source like Playnite lists
 * separately (see QueueUpPlayniteExtension#7's dedupe-before-push step). */
export interface LibraryImportEntry {
  title: string;
  platforms: RoomPlatform[];
}

/** Response from POST /api/v1/library/import-playnite - confirms the import started; poll
 * PlayniteImportProgress for live counts and to know when it's actually done. Same
 * background-and-poll shape as SteamImportStarted/SteamImportProgress. */
export interface PlayniteImportStarted {
  consideredCount: number;
}

export interface PlayniteImportProgress {
  consideredCount: number;
  /** Resolved to an igdbId (via TitleMatchAlias or an exact IGDB title match) and either newly
   * created or had its owned platforms updated on an existing shelf game. */
  matched: number;
  /** Didn't resolve to an igdbId - written to PendingLibraryImport for later manual review. */
  unmatched: number;
  /** Resolved but failed for some other reason (an IGDB hiccup, etc.) - same "don't abort the
   * batch over one bad entry" reasoning as Steam import's `skipped`. */
  errored: number;
  done: boolean;
  /** Same as SteamImportProgress.unlockedBadges - only set on the final `done: true` payload.
   * Nothing in this app's own UI polls this (see routes/apiV1.ts - this import is driven by the
   * Playnite extension via a bearer API key, not a browser session), but the badges themselves
   * are still real unlocks either way - a person just sees them next time they open the panel
   * rather than via a toast at the moment they land. */
  unlockedBadges?: BadgeDefinition[];
}

/** A PendingLibraryImport row (server/src/db/prisma/schema.prisma) as sent to the client - an
 * external-library title that didn't resolve to an igdbId, with whatever IGDB search candidates
 * were found for it at import time, for the "pick one" review UI in Profile Settings
 * (PendingImportsSection, #452). */
export interface PendingLibraryImportDto {
  id: string;
  title: string;
  platforms: RoomPlatform[];
  source: string;
  candidates: GameSearchResult[];
  createdAt: string;
}

/** Body for POST /api/library/pending-imports/:id/resolve - the candidate igdbId the user picked
 * (from `candidates`, or one they searched for themselves instead). */
export interface ResolvePendingLibraryImportRequest {
  igdbId: number;
}

/** QueueUp's own gamification system (issue #489) - stable, one-shot "first time you did X"
 * unlocks. Named "badge" throughout the code, not "achievement": PlayerAchievements/
 * AchievementCompletion above (and AchievementRow.tsx/useGameAchievements.ts on the client) already
 * mean "this user's Steam achievement progress on a specific title," an unrelated, pre-existing
 * concept - user-facing copy still says "Achievements" (the sidebar icon, the panel title) to match
 * the issue, but no code identifier reuses that word so the two systems can't be confused with each
 * other while reading the source. `BadgeKey` is also the literal string stored in
 * UserBadge.badgeKey (schema.prisma) - there's no separate catalog table in the DB, so adding a
 * badge later is just adding an entry here plus a call to unlockBadge() at the right hook point,
 * not a migration. */
export type BadgeKey =
  | 'first_solo_beat'
  | 'first_room_beat'
  | 'first_drop'
  | 'first_replay'
  | 'first_100_percent'
  | 'first_spin_ready'
  | 'first_room_created'
  | 'first_public_join'
  | 'first_private_join'
  | 'first_ownership_marked'
  | 'first_wishlist'
  | 'first_library_sync'
  | 'first_pc_sync'
  | 'first_xbox_sync'
  | 'first_playstation_sync'
  | 'first_switch_sync'
  | 'first_franchise_finished'
  | 'first_tag_applied'
  | 'first_dlc_completionist'
  | 'first_full_house'
  | 'first_promoted'
  | 'first_spin_winner'
  | 'first_patient'
  | 'first_bargain_hunter'
  | 'first_backlog_buster'
  | 'first_quick_drop'
  | 'first_marathoner'
  | 'first_comeback'
  | 'first_anniversary'
  | 'first_full_collection';

export interface BadgeDefinition {
  key: BadgeKey;
  name: string;
  description: string;
  emoji: string;
}

export const BADGE_DEFINITIONS: Record<BadgeKey, BadgeDefinition> = {
  first_solo_beat: {
    key: 'first_solo_beat',
    name: 'Solo Beaten',
    description: 'Marked a game Beaten on your Personal Shelf.',
    emoji: '🏅',
  },
  first_room_beat: {
    key: 'first_room_beat',
    name: 'Room Champion',
    description: 'Marked a game Beaten in a room.',
    emoji: '🏆',
  },
  first_drop: {
    key: 'first_drop',
    name: 'No Regrets',
    description: 'Dropped a game.',
    emoji: '🏳️',
  },
  first_replay: {
    key: 'first_replay',
    name: 'Going Back In',
    description: 'Queued a game for Replay.',
    emoji: '🔁',
  },
  first_100_percent: {
    key: 'first_100_percent',
    name: '100% Club',
    description: "Fully completed a game's achievements.",
    emoji: '💯',
  },
  first_spin_ready: {
    key: 'first_spin_ready',
    name: 'Ready to Roll',
    description: 'Joined in on a Spin the Wheel pick.',
    emoji: '🎡',
  },
  first_room_created: {
    key: 'first_room_created',
    name: 'Room Master',
    description: 'Created a room.',
    emoji: '🛠️',
  },
  first_public_join: {
    key: 'first_public_join',
    name: 'Open Door',
    description: 'Joined a public room.',
    emoji: '🚪',
  },
  first_private_join: {
    key: 'first_private_join',
    name: 'Invited',
    description: 'Joined a room via invite code.',
    emoji: '🔑',
  },
  first_ownership_marked: {
    key: 'first_ownership_marked',
    name: 'Collector',
    description: 'Marked a game as owned.',
    emoji: '📦',
  },
  first_wishlist: {
    key: 'first_wishlist',
    name: 'Wishful Thinking',
    description: 'Added a game to your wishlist.',
    emoji: '⭐',
  },
  first_library_sync: {
    key: 'first_library_sync',
    name: 'Synced Up',
    description: 'Synced your library from Steam.',
    emoji: '🔄',
  },
  // The four below are Playnite-specific (issue: "an achievement for syncing a game for each
  // console") - Steam import is PC-only, so first_library_sync above can't tell these apart; the
  // Playnite sync is the only import path that reports which platform each game came from.
  first_pc_sync: {
    key: 'first_pc_sync',
    name: 'Rig Ready',
    description: 'Synced a PC game via Playnite.',
    emoji: '🖥️',
  },
  first_xbox_sync: {
    key: 'first_xbox_sync',
    name: 'Green Team',
    description: 'Synced an Xbox game via Playnite.',
    emoji: '🎮',
  },
  first_playstation_sync: {
    key: 'first_playstation_sync',
    name: 'Blue Team',
    description: 'Synced a PlayStation game via Playnite.',
    emoji: '🕹️',
  },
  first_switch_sync: {
    key: 'first_switch_sync',
    name: 'Docked & Ready',
    description: 'Synced a Switch game via Playnite.',
    emoji: '🍄',
  },
  first_franchise_finished: {
    key: 'first_franchise_finished',
    name: 'Franchise Finisher',
    description: "Beat every entry of a series you've added.",
    emoji: '📚',
  },
  first_tag_applied: {
    key: 'first_tag_applied',
    name: 'Archivist',
    description: 'Applied your first tag.',
    emoji: '🗂️',
  },
  first_dlc_completionist: {
    key: 'first_dlc_completionist',
    name: 'Full Package',
    description: "Beat a base game and every DLC you've added for it.",
    emoji: '🎁',
  },
  first_full_house: {
    key: 'first_full_house',
    name: 'Full House',
    description: 'Every member of a room voted on the same game.',
    emoji: '🃏',
  },
  first_promoted: {
    key: 'first_promoted',
    name: 'Promoted',
    description: 'Got promoted to Moderator or Room Master by someone else.',
    emoji: '🎖️',
  },
  first_spin_winner: {
    key: 'first_spin_winner',
    name: 'Jackpot',
    description: 'A game you added got picked by Spin the Wheel.',
    emoji: '🎰',
  },
  first_patient: {
    key: 'first_patient',
    name: 'Patient',
    description: 'A price alert fired for something on your wishlist.',
    emoji: '⏳',
  },
  first_bargain_hunter: {
    key: 'first_bargain_hunter',
    name: 'Bargain Hunter',
    description: 'Marked a game owned after it hit an all-time-low price alert.',
    emoji: '🏷️',
  },
  first_backlog_buster: {
    key: 'first_backlog_buster',
    name: 'Backlog Buster',
    description: 'Finally dealt with a long-neglected backlog game.',
    emoji: '🧹',
  },
  // Distinct from first_drop ("No Regrets", any drop at all) - this one specifically rewards
  // bailing on something fast, the mirror image of first_marathoner below.
  first_quick_drop: {
    key: 'first_quick_drop',
    name: 'Not For Me',
    description: 'Dropped a game within a day of starting it.',
    emoji: '👋',
  },
  first_marathoner: {
    key: 'first_marathoner',
    name: 'Marathoner',
    description: "Finished a game you'd been playing for a month or more straight.",
    emoji: '🏃',
  },
  first_comeback: {
    key: 'first_comeback',
    name: 'Comeback',
    description: 'Replayed a game and beat it again.',
    emoji: '🔂',
  },
  first_anniversary: {
    key: 'first_anniversary',
    name: 'Year One',
    description: "Been part of QueueUp for a year.",
    emoji: '🎂',
  },
  // Deliberately last, and deliberately excluded from its own completion check (see
  // unlockBadges in services/badges.ts) - otherwise it could never reach 100% itself.
  first_full_collection: {
    key: 'first_full_collection',
    name: 'Full Collection',
    description: 'Unlocked every other badge.',
    emoji: '👑',
  },
};

export const ALL_BADGE_KEYS = Object.keys(BADGE_DEFINITIONS) as BadgeKey[];

/** Which platform-sync badge (issue: "an achievement for syncing a game for each console") a given
 * RoomPlatform counts toward - grouped by family (Xbox/PlayStation generations share one badge
 * each) rather than one per hardware generation, so the panel doesn't end up with nine near-
 * duplicate tiles for what's really "have you synced anything from this console line yet." PC is
 * included even though it's not a "console" in the literal sense - Playnite commonly aggregates PC
 * storefronts (GOG, Epic, itself) too, and it's the only sync path that can tell platforms apart at
 * all (Steam import, first_library_sync, is PC-only by construction). Shared between the Playnite
 * import route (server/src/routes/apiV1.ts, unlocks live on import) and the "Refresh Achievements"
 * recheck (server/src/services/badges.ts, retroactively grants based on current ownership for
 * anyone who synced before these badges existed) so both key off exactly the same mapping. */
export const PLATFORM_SYNC_BADGE_KEY: Record<RoomPlatform, BadgeKey> = {
  pc: 'first_pc_sync',
  xbox_360: 'first_xbox_sync',
  xbox_one: 'first_xbox_sync',
  xbox_series: 'first_xbox_sync',
  ps3: 'first_playstation_sync',
  ps4: 'first_playstation_sync',
  ps5: 'first_playstation_sync',
  switch: 'first_switch_sync',
  switch2: 'first_switch_sync',
};

/** One row of GET /api/me/badges - the full catalog, always all `ALL_BADGE_KEYS.length` entries
 * regardless of whether the current user has unlocked them, so the panel can render locked tiles.
 * `rarityPercent` is computed against every user in the database (not room/friends-scoped) - see
 * server/src/routes/badges.ts. */
export interface BadgeSummary {
  key: BadgeKey;
  name: string;
  description: string;
  emoji: string;
  unlockedAt: string | null;
  rarityPercent: number;
}

export interface BadgesResponse {
  badges: BadgeSummary[];
}

/** Response for POST /api/me/badges/refresh ("Refresh Achievements") - whichever badges this call
 * newly unlocked (often empty - most calls find nothing new). Same shape as every other
 * unlockedBadges field returned around the app, so the caller can feed it straight into the same
 * unlock-celebration plumbing (useAnnounceUnlock). */
export interface RefreshBadgesResponse {
  unlockedBadges: BadgeDefinition[];
}

/** One currently-playing/play-next entry on a public profile page (issue #511) - a deliberately
 * small slice of Game, not the full shape, since the viewer might not even be signed in and this
 * is scoped to only what a public showcase should ever expose. */
export interface PublicProfileGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  platform: string;
}

/** Response for GET /api/public/users/:id (issue #511) - the shareable, unauthenticated
 * counterpart to a user's Personal Shelf, reachable at `/u/:id` regardless of whether the viewer
 * is signed in. Only ever returned when the target user has opted in (User.publicProfileEnabled);
 * a disabled or nonexistent id 404s identically, so a scan of ids can't distinguish "no such user"
 * from "exists but private." Only unlocked badges are included (unlike GET /api/me/badges' full
 * locked+unlocked catalog) - a public showcase is "here's what I've earned," not "here's what I
 * haven't done yet." Personal Shelf only, same scope as the release-watch alerts (#510) and the
 * Franchise Finisher/DLC Completionist badges this reuses data alongside - a room game isn't
 * "theirs" to show off the same way. */
export interface PublicUserProfile {
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  badges: BadgeSummary[];
  beatenGameCount: number;
  currentlyPlaying: PublicProfileGame[];
}
