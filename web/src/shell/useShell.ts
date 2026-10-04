import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useScope, SHELF_ID } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useAttention } from '../hooks/useAttention';
import { useIncomingFriendRequestCount } from '../hooks/useFriends';
import { useNotificationSummary } from '../hooks/useNotifications';
import { usePendingImportsCount } from '../hooks/usePendingImports';
import { initialsOf } from '../ui/primitives';

export interface TileModel {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Sidebar subtitle. */
  sub: string;
  active: boolean;
  /** Red "this needs you" dot. */
  dot: boolean;
  go: () => void;
}

/** The shelf + room tiles shared by the desktop sidebar/rail and the phone's top bar, plus the
 * bell/profile state that sits beside them. */
export function useShell() {
  const { user } = useAuth();
  const scope = useScope();
  const ui = useUi();
  const navigate = useNavigate();
  const location = useLocation();
  const attention = useAttention();
  const pendingImports = usePendingImportsCount();
  const { totalUnread } = useNotificationSummary();
  const incomingFriendRequests = useIncomingFriendRequestCount();

  const go = (path: string) => () => {
    ui.selectGame(null);
    navigate(path);
  };

  const shelfTile: TileModel = {
    id: SHELF_ID,
    name: 'Personal Shelf',
    short: initialsOf(user?.displayName ?? 'T').slice(0, 1),
    color: user?.avatarColor ?? '#E8734A',
    sub: 'Your games, every platform',
    active: scope.isShelf,
    dot: pendingImports > 0,
    go: go('/'),
  };

  const roomTiles: TileModel[] = scope.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    short: initialsOf(r.name),
    color: r.accentColor,
    sub: `${r.memberCount ?? 0} ${r.memberCount === 1 ? 'member' : 'members'} · ${r.queuedCount ?? 0} queued`,
    active: scope.scopeId === r.id,
    dot: attention.needsYou(r.id),
    go: go(`/room/${r.id}`),
  }));

  return {
    user,
    shelfTile,
    roomTiles,
    hasUnread: totalUnread > 0 || incomingFriendRequests > 0,
    pendingImports,
    roomCount: scope.rooms.length,
    onActivity: location.pathname === '/activity',
    goActivity: () => {
      ui.selectGame(null);
      navigate('/activity');
    },
  };
}
