export type GameStatus = 'backlog' | 'playing' | 'done';

export type RoomRole = 'room_master' | 'moderator' | 'member';

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
}

export interface Room {
  id: string;
  name: string;
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
