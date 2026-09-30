import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Game, GameSuggestion, Room, RoomMember, RoomRole } from '@queueup/shared';
import { roomsApi, gameSuggestionsApi } from '../api/rooms';
import { useGames } from '../hooks/useGames';
import { useRooms } from '../hooks/useRooms';
import { useAuth } from './AuthContext';

export const SHELF_ID = 'shelf';

type GamesHook = ReturnType<typeof useGames>;

/** Everything the home screen, game detail, Spin, Ranked and the glance panel need about whichever
 * shelf/room is currently in focus - loaded once here and shared, instead of each screen querying
 * the same list on its own. */
export interface ScopeValue {
  /** 'shelf' or a room id. */
  scopeId: string;
  isShelf: boolean;
  room: Room | null;
  rooms: Room[];
  roomsLoading: boolean;
  members: RoomMember[];
  myRole: RoomRole;
  /** Room Master / Moderator (always true on the shelf). */
  canManage: boolean;
  games: Game[];
  truncated: boolean;
  totalCount: number;
  gamesLoading: boolean;
  gamesError: string | null;
  ops: GamesHook;
  suggestions: GameSuggestion[];
  refetchSuggestions: () => void;
}

const ScopeContext = createContext<ScopeValue | null>(null);

/** Route -> scope: `/room/:id` is that room, everything else (shelf, activity, pages...) keeps
 * whatever shelf/room was last in focus so the list stays put behind overlays and pages. */
function roomIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/room\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const { rooms, isLoading: roomsLoading } = useRooms();

  const routeRoomId = roomIdFromPath(location.pathname);
  const isHome = location.pathname === '/';
  const [lastScope, setLastScope] = useState<string>(SHELF_ID);
  const seenRoute = useRef<string | null>(null);
  useEffect(() => {
    if (routeRoomId) {
      if (seenRoute.current !== routeRoomId) setLastScope(routeRoomId);
      seenRoute.current = routeRoomId;
    } else if (isHome) {
      seenRoute.current = null;
      setLastScope(SHELF_ID);
    }
  }, [routeRoomId, isHome]);

  const requested = routeRoomId ?? (isHome ? SHELF_ID : lastScope);
  // A room that's gone (left/deleted) falls back to the shelf rather than showing an empty shell.
  const room = requested === SHELF_ID ? null : (rooms.find((r) => r.id === requested) ?? null);
  const scopeId = requested !== SHELF_ID && !room && !roomsLoading ? SHELF_ID : requested;
  const roomId = scopeId === SHELF_ID ? null : scopeId;

  const ops = useGames(roomId);

  const membersQuery = useQuery({
    queryKey: ['room-members', roomId],
    queryFn: () => roomsApi.members(roomId!),
    enabled: !!roomId,
  });

  const myRole: RoomRole = roomId ? (room?.myRole ?? 'member') : 'room_master';
  const canManage = myRole === 'room_master' || myRole === 'moderator';

  const suggestionsQuery = useQuery({
    queryKey: ['room-suggestions', roomId],
    queryFn: () => gameSuggestionsApi.list(roomId!),
    enabled: !!roomId && canManage,
    refetchInterval: 30_000,
  });

  const members = useMemo<RoomMember[]>(() => {
    if (!roomId) {
      return user
        ? [{ roomId: '', user, role: 'room_master', joinedAt: new Date(0).toISOString() }]
        : [];
    }
    return membersQuery.data?.members ?? [];
  }, [roomId, membersQuery.data, user]);

  const value = useMemo<ScopeValue>(
    () => ({
      scopeId,
      isShelf: !roomId,
      room,
      rooms,
      roomsLoading,
      members,
      myRole,
      canManage,
      games: ops.games,
      truncated: ops.truncated,
      totalCount: ops.totalCount,
      gamesLoading: ops.isLoading,
      gamesError: ops.loadError,
      ops,
      suggestions: suggestionsQuery.data?.suggestions ?? [],
      refetchSuggestions: () => {
        void suggestionsQuery.refetch();
      },
    }),
    // `ops` is a fresh object every render (it wraps mutation callbacks and pending state), so the
    // value is effectively rebuilt per render - which is what consumers of `ops` need.
    [scopeId, room, rooms, roomsLoading, members, myRole, canManage, ops, suggestionsQuery.data],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used within ScopeProvider');
  return ctx;
}
