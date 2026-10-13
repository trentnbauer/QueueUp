import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { gamesApi } from '../api/games';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { BundleChooser } from '../game/BundleChooser';
import { GameDetail } from '../game/GameDetail';
import { useChangeStatus } from '../game/useChangeStatus';
import { Dialog } from '../ui/Dialog';
import { useIsMobile, useMediaQuery } from '../ui/useLayout';
import { st } from '../ui/st';
import { hexToOklchHue } from '../theme/roomTheme';
import { MobileTopBar } from './MobileTopBar';
import { Overlays } from './Overlays';
import { VerifyEmailBanner } from './VerifyEmailBanner';
import { ViewingAsBanner } from './ViewingAsBanner';
import { Rail, Sidebar } from './Sidebar';

const COLLAPSED_KEY = 'qu-sidebar-collapsed';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** The signed-in frame. Phones: top bar of room tiles over a scrolling page, game detail as a
 * bottom sheet. Desktop: sidebar (or the 80px rail) | main column, with the selected game's card as a centred
 * modal over it. */
export function AppShell({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  const ui = useUi();
  const scope = useScope();
  const changeStatus = useChangeStatus();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const narrow = useMediaQuery('(max-width: 999px)');

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // The room's colour tints this shell (buttons, highlights, logo; not the background).
  // The Personal Shelf is tinted by the colour the person chose for it (if any), a room by its own.
  const { shelfColor } = useAuth();
  const roomColour = scope.room?.accentColor ?? (scope.isShelf ? shelfColor : null);
  const roomHue = roomColour ? hexToOklchHue(roomColour) : null;
  // Dialogs, sheets and the spin screen render in portals outside the shell, so the same tint is put on <body> too:
  // everything on screen then uses the room's colour, not the default orange.
  useEffect(() => {
    if (roomHue === null) return;
    document.body.setAttribute('data-room', '1');
    document.body.style.setProperty('--rh', String(roomHue));
    return () => {
      document.body.removeAttribute('data-room');
      document.body.style.removeProperty('--rh');
    };
  }, [roomHue]);
  const roomScope = roomHue === null ? {} : { 'data-room': '1', style: { '--rh': String(roomHue) } as React.CSSProperties };

  const inList = ui.selectedGameId ? scope.games.find((g) => g.id === ui.selectedGameId) : undefined;
  // A game that isn't in the loaded list (a notification that points at it, a very long list) is fetched by id, so its card still opens.
  const missing = !!ui.selectedGameId && !scope.gamesLoading && !inList;
  const fetched = useQuery({
    queryKey: ['games', 'one', ui.selectedGameId],
    queryFn: () => gamesApi.get(ui.selectedGameId!),
    enabled: missing,
    retry: false,
    staleTime: 0,
  });
  // Only in the list or place it came from: a game from another room would show against the wrong room.
  const fetchedHere = fetched.data?.game && fetched.data.game.roomId === (scope.room?.id ?? null) ? fetched.data.game : undefined;
  const selected = inList ?? (missing ? fetchedHere : undefined);
  // A selection that no longer exists (removed, or the scope changed) just closes.
  useEffect(() => {
    if (missing && (fetched.isError || (fetched.data && !fetchedHere))) ui.selectGame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, fetched.isError, fetched.data, fetchedHere]);

  // A bundle opens to "which game?" (issue #1169); its own card is one tap further.
  const [manageBundleId, setManageBundleId] = useState<string | null>(null);
  const bundled = selected ? scope.games.filter((g) => g.bundleGameId === selected.id) : [];
  const chooser =
    selected && bundled.length > 0 && manageBundleId !== selected.id ? (
      <BundleChooser bundle={selected} games={bundled} onPick={(g) => ui.selectGame(g.id)} onManage={() => setManageBundleId(selected.id)} onClose={() => ui.selectGame(null)} />
    ) : null;

  // Pages (Activity, profile...) don't show the shelf's glance/detail panel.
  const { pathname } = useLocation();
  const onHome = pathname === '/' || pathname.startsWith('/shelf/') || pathname.startsWith('/room/');

  if (mobile) {
    return (
      <div {...roomScope} style={{ ...st('min-height:100vh;background:var(--bg);color:var(--text)'), ...roomScope.style }}>
        <ViewingAsBanner />
        <VerifyEmailBanner />
        {/* Narrow phones get slightly smaller side gutters so content keeps its room. */}
        <div style={st('display:flex;flex-direction:column;gap:18px;min-width:0;padding:16px clamp(12px, 4vw, 16px) 110px')}>
          <MobileTopBar />
          {children}
        </div>
        {selected && onHome && (
          chooser ?? (
            <Dialog onClose={() => ui.selectGame(null)} bare padded={false} height="tall" ariaLabel={selected.title}>
              <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <GameDetail key={selected.id} game={selected} onClose={() => ui.selectGame(null)} changeStatus={changeStatus} />
              </div>
            </Dialog>
          )
        )}
        <Overlays />
      </div>
    );
  }

  const showRail = narrow || collapsed;

  return (
    <div {...roomScope} style={{ ...st('position:relative;height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);overflow:hidden'), ...roomScope.style }}>
      <VerifyEmailBanner />
      <div style={st('position:relative;flex:1;min-height:0;display:flex;overflow:hidden')}>
      {showRail ? <Rail onExpand={() => setCollapsed(false)} /> : <Sidebar onCollapse={() => setCollapsed(true)} />}
      <main style={st('flex:1;min-width:0;overflow-y:auto')}>
        {/* 960px on laptops, then grows with the viewport (to 1600px) so ultrawides don't waste the middle (issue #796). */}
        <div style={st('max-width:clamp(960px, 100vw - 600px, 1600px);margin:0 auto;padding:30px 36px 48px;display:flex;flex-direction:column;gap:18px')}>{children}</div>
      </main>
      </div>
      {/* The selected game's card: a centred 880x620 modal over the page, not a panel beside it. */}
      {selected && onHome && (
        chooser ?? (
          <Dialog onClose={() => ui.selectGame(null)} bare padded={false} width={880} ariaLabel={selected.title}>
            <div style={{ position: 'relative', height: 'min(620px, calc(100vh - 64px))' }}>
              <GameDetail key={selected.id} game={selected} onClose={() => ui.selectGame(null)} changeStatus={changeStatus} />
            </div>
          </Dialog>
        )
      )}
      <Overlays />
    </div>
  );
}
