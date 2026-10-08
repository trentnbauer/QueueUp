import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useScope, SHELF_ID } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useAttention } from '../hooks/useAttention';
import { useIncomingFriendRequestCount } from '../hooks/useFriends';
import { useNotificationSummary } from '../hooks/useNotifications';
import { usePendingImportsCount } from '../hooks/usePendingImports';
import { initialsOf } from '../ui/primitives';
import { useT } from '../i18n';

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
  const { user, shelfColor } = useAuth();
  const scope = useScope();
  const ui = useUi();
  const t = useT();
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
    name: t('shell.glance.personalShelf'),
    short: initialsOf(user?.displayName ?? 'T').slice(0, 1),
    // The colour picked in Shelf settings, like a room's own colour; the avatar colour until one is picked.
    color: shelfColor ?? user?.avatarColor ?? '#E8734A',
    sub: t('shell.tile.shelfSub'),
    active: scope.isShelf,
    dot: pendingImports > 0,
    go: go('/'),
  };

  const roomTiles: TileModel[] = scope.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    short: initialsOf(r.name),
    color: r.accentColor,
    sub: t(r.memberCount === 1 ? 'shell.tile.roomSub.one' : 'shell.tile.roomSub.other', { n: r.memberCount ?? 0, queued: r.queuedCount ?? 0 }),
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
