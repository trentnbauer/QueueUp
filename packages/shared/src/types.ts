export type GameStatus = 'backlog' | 'playing' | 'done';

export type RoomRole = 'room_master' | 'moderator' | 'member';

export type RoomPlatform = 'pc' | 'xbox' | 'playstation' | 'switch' | 'switch2';

export const ROOM_PLATFORM_LABELS: Record<RoomPlatform, string> = {
  pc: 'PC',
  xbox: 'Xbox',
  playstation: 'PlayStation',
  switch: 'Switch',
  switch2: 'Switch 2',
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
   * as `amount`. Null if unavailable or if the current price already is the historic low. */
  historicalLow: string | null;
}

export interface VoteSummary {
  user: User;
  value: VoteValue;
}

export interface Game {
  id: string;
  roomId: string | null;
  addedBy: User;
  title: string;
  platform: string;
  genre: string | null;
  maxCoopPlayers: number | null;
  ggDealsUrl: string | null;
  coverImageUrl: string | null;
  status: GameStatus;
  price: GamePrice;
  votes: VoteSummary[];
  myVote: VoteValue | null;
  voteScore: number;
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

/** A search result fully resolved (price, gg.deals link) once the user picks it. */
export interface GameIntakeCandidate {
  igdbId: number;
  title: string;
  platform: string;
  genre: string | null;
  ggDealsUrl: string | null;
  coverImageUrl: string | null;
  price: GamePrice;
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

export interface JoinRoomRequest {
  inviteCode: string;
}

export interface VoteRequest {
  value: VoteValue;
}

export interface UpdateGameStatusRequest {
  status: GameStatus;
}

/** Admin-only views — never sent to non-admin users. */
export interface AdminIntegrationStatus {
  ggDealsApiKeyConfigured: boolean;
  igdbConfigured: boolean;
  devFakeAuth: boolean;
  activeAuthProviders: string[];
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
