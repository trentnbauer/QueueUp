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

export interface Game {
  id: string;
  roomId: string | null;
  addedBy: User;
  title: string;
  platform: string;
  genre: string | null;
  releaseYear: number | null;
  maxCoopPlayers: number | null;
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

export interface ImportSteamLibraryResult {
  totalOwned: number;
  consideredCount: number;
  imported: number;
  skipped: number;
}

/** Where a configurable integration credential currently comes from - env vars always take
 * precedence over the DB-stored fallback; "unset" means neither is configured. */
export type ConfigSource = 'env' | 'db' | 'unset';

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
