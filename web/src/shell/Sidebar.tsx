import type { ReactNode } from 'react';
import { useUi } from '../context/UiContext';
import { Avatar, BellIcon, CollapseIcon, PulseIcon, StatsIcon, Wordmark } from '../ui/primitives';
import { st } from '../ui/st';
import { useShell, type TileModel } from './useShell';
import { useT } from '../i18n';
import { useLiftReorder } from './useLiftReorder';

const DOT = 'background:var(--dot)';

function Row({ tile, active, onClick, lift, children }: { tile: TileModel; active: boolean; onClick: () => void; lift?: ReturnType<ReturnType<typeof useLiftReorder>['bind']>; children?: ReactNode }) {
  return (
    <button
      type="button"
      {...lift}
      onClick={lift?.onClick ?? onClick}
      className="hv-surf"
      aria-current={active ? 'page' : undefined}
      style={st(
        `display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:8px 10px;border-radius:14px;border:none;background:${active ? 'var(--surf)' : 'transparent'};color:var(--text);text-align:left`,
        lift?.style,
      )}
    >
      <span
        style={st(
          `width:36px;height:36px;flex-shrink:0;border-radius:11px;background:${tile.color};color:#fff;display:flex;align-items:center;justify-content:center;font:600 11.5px var(--font-mono)`,
        )}
      >
        {tile.short}
      </span>
      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
        <span
          style={st(
            `font:${active ? 700 : 600} 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis`,
          )}
        >
          {tile.name}
        </span>
        <span style={st('font:400 12px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{tile.sub}</span>
      </span>
      {tile.dot && <span style={st(`width:9px;height:9px;flex-shrink:0;border-radius:50%;${DOT}`)} />}
      {children}
    </button>
  );
}

/** A sidebar row for a page of its own (Friends, Your stats): an outline icon tile instead of a colour. */
function PageRow({ icon, title, sub, active, badge, onClick }: { icon: ReactNode; title: string; sub: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hv-surf"
      aria-current={active ? 'page' : undefined}
      style={st(
        `display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:8px 10px;border-radius:14px;border:none;background:${active ? 'var(--surf)' : 'transparent'};color:var(--text);text-align:left`,
      )}
    >
      <span style={st('width:36px;height:36px;flex-shrink:0;border-radius:11px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>{icon}</span>
      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
        <span style={st(`font:${active ? 700 : 600} 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{title}</span>
        <span style={st('font:400 12px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{sub}</span>
      </span>
      {!!badge && (
        <span style={st('min-width:22px;height:22px;padding:0 7px;flex-shrink:0;border-radius:999px;background:var(--acc);color:var(--ink);font:700 11.5px var(--font-ui);display:flex;align-items:center;justify-content:center')}>{badge}</span>
      )}
    </button>
  );
}

/** The 264px labelled sidebar. */
export function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const shell = useShell();
  const ui = useUi();
  const t = useT();
  const { user } = shell;
  const lift = useLiftReorder(shell.roomTiles, 'y');

  return (
    <aside
      style={st('width:264px;flex-shrink:0;height:100%;display:flex;flex-direction:column;border-right:1px solid var(--chip);background:var(--bg2)')}
    >
      <div style={st('flex-shrink:0;display:flex;align-items:center;gap:10px;padding:22px 22px 16px')}>
        <span style={{ flex: 1, display: 'flex' }}>
          <Wordmark size={23} />
        </span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t('shell.sidebar.collapse')}
          title={t('shell.sidebar.collapse')}
          className="hv-surf"
          style={st('width:32px;height:32px;flex-shrink:0;border-radius:10px;border:none;background:transparent;color:var(--muted);display:flex;align-items:center;justify-content:center;padding:0')}
        >
          <CollapseIcon />
        </button>
      </div>

      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:4px 12px 16px;display:flex;flex-direction:column;gap:2px')}>
        <Row tile={shell.shelfTile} active={shell.shelfTile.active && !shell.onPage} onClick={shell.shelfTile.go} />

        <PageRow
          icon={<PulseIcon />}
          title={t('shell.sidebar.friends')}
          sub={t('shell.sidebar.friendsSub')}
          active={shell.onFriends}
          badge={shell.incomingFriendRequests}
          onClick={shell.goFriends}
        />
        <PageRow icon={<StatsIcon />} title={t('shell.sidebar.stats')} sub={t('shell.sidebar.statsSub')} active={shell.onStats} onClick={shell.goStats} />

        <div style={st('display:flex;align-items:center;justify-content:space-between;padding:18px 10px 6px')}>
          <span style={st('font:600 11.5px var(--font-mono);letter-spacing:0.08em;color:var(--muted)')}>{t('shell.sidebar.rooms', { n: shell.roomCount })}</span>
          <span style={st('display:flex;align-items:center;gap:6px')}>
            {shell.roomCount > 1 && (
              <button
                type="button"
                onClick={() => ui.openDialog('reorderRooms')}
                aria-label={t('shell.sidebar.reorderRooms')}
                title={t('shell.sidebar.reorderRooms')}
                style={st("width:28px;height:28px;border-radius:9px;border:1px dashed var(--line);background:transparent;color:var(--muted);font:500 15px/1 var(--font-ui);padding:0")}
              >
                ⇅
              </button>
            )}
            <button
              type="button"
              onClick={() => ui.openDialog('addRoom', { step: 'options' })}
              aria-label={t('shell.mobile.createOrJoin')}
              style={st("width:28px;height:28px;border-radius:9px;border:1px dashed var(--line);background:transparent;color:var(--muted);font:500 16px/1 var(--font-ui);padding:0")}
            >
              +
            </button>
          </span>
        </div>
        {lift.ordered.map((tile) => (
          <Row key={tile.id} tile={tile} active={tile.active && !shell.onPage} onClick={tile.go} lift={lift.bind(tile, tile.go)} />
        ))}
      </div>

      <div style={st('flex-shrink:0;display:flex;align-items:center;gap:8px;padding:12px;border-top:1px solid var(--chip)')}>
        <button
          type="button"
          onClick={shell.goSettings}
          className="hv-surf"
          aria-current={shell.onSettings ? 'page' : undefined}
          style={st(`flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:14px;border:none;background:${shell.onSettings ? 'var(--surf)' : 'transparent'};color:var(--text);text-align:left`)}
        >
          <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor ?? '#E8734A'} avatarUrl={user?.avatarUrl} size={36} fontSize={14} />
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
            <span style={st('font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{user?.displayName}</span>
            <span style={st('font:400 12px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t('shell.sidebar.accountSettings')}</span>
          </span>
        </button>
        <BellButton size={40} ring="var(--bg2)" />
      </div>
    </aside>
  );
}

function BellButton({ size, ring }: { size: number; ring: string }) {
  const shell = useShell();
  const ui = useUi();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => ui.openDialog('notifications')}
      aria-label={t('shell.nav.notifications')}
      title={t('shell.nav.notifications')}
      style={st(
        `position:relative;flex-shrink:0;width:${size}px;height:${size}px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);display:flex;align-items:center;justify-content:center;padding:0`,
      )}
    >
      <BellIcon />
      {shell.hasUnread && (
        <span style={st(`position:absolute;right:1px;top:1px;width:10px;height:10px;border-radius:50%;${DOT};border:2px solid ${ring}`)} />
      )}
    </button>
  );
}

/** A round outline button on the rail for a page of its own, filled while on it. */
function RailButton({ label, active, dot, onClick, children }: { label: string; active: boolean; dot?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      style={st(
        `position:relative;flex-shrink:0;width:42px;height:42px;border-radius:50%;border:1px solid ${active ? 'var(--text)' : 'var(--line)'};background:${active ? 'var(--text)' : 'transparent'};color:${active ? 'var(--onText)' : 'var(--text)'};display:flex;align-items:center;justify-content:center;padding:0`,
      )}
    >
      {children}
      {dot && <span style={st(`position:absolute;right:1px;top:1px;width:10px;height:10px;border-radius:50%;${DOT};border:2px solid var(--bg2)`)} />}
    </button>
  );
}

/** The 80px icon rail (collapsed sidebar / narrow desktop windows). */
export function Rail({ onExpand }: { onExpand: () => void }) {
  const shell = useShell();
  const ui = useUi();
  const t = useT();
  const { user } = shell;
  const lift = useLiftReorder(shell.roomTiles, 'y');
  const tiles = [shell.shelfTile, ...lift.ordered];

  return (
    <aside
      style={st('width:80px;flex-shrink:0;height:100%;display:flex;flex-direction:column;align-items:center;gap:12px;padding:18px 0 16px;border-right:1px solid var(--chip);background:var(--bg2)')}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={t('shell.sidebar.expand')}
        title={t('shell.sidebar.expand')}
        className="hv-surf2"
        style={st('width:46px;height:46px;flex-shrink:0;border-radius:14px;border:none;padding:0;margin-bottom:8px;background:var(--surf);color:var(--text);display:flex;align-items:center;justify-content:center')}
      >
        <span style={st('display:flex;align-items:flex-start;font:800 21px/1 var(--font-display);letter-spacing:-0.05em')}>
          <span style={{ paddingTop: 6 }}>q</span>
          <span style={{ color: 'var(--acc)' }}>u</span>
        </span>
      </button>
      <div
        style={st('flex:1;min-height:0;width:100%;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;align-items:center;gap:12px;padding:6px 0')}
      >
        {tiles.map((tile) => {
          const a = tile.active && !shell.onPage;
          const b = tile === shell.shelfTile ? undefined : lift.bind(tile, tile.go);
          return (
            <button
              key={tile.id}
              type="button"
              {...b}
              onClick={b?.onClick ?? tile.go}
              aria-label={tile.name}
              title={tile.name}
              style={st(
                `position:relative;flex-shrink:0;width:46px;height:46px;border:none;border-radius:${a ? '15px' : '50%'};background:${tile.color};color:#fff;font:600 12px var(--font-mono);box-shadow:${a ? '0 0 0 2px var(--bg2), 0 0 0 4px var(--text)' : 'none'}`,
                b?.style,
              )}
            >
              {tile.short}
              {tile.dot && <span style={st(`position:absolute;right:-2px;top:-2px;width:11px;height:11px;border-radius:50%;${DOT};border:2px solid var(--bg2)`)} />}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => ui.openDialog('addRoom', { step: 'options' })}
          aria-label={t('shell.mobile.createOrJoin')}
          title={t('shell.mobile.createOrJoin')}
          style={st("flex-shrink:0;width:46px;height:46px;border-radius:16px;border:1.5px dashed var(--line);background:transparent;color:var(--muted);font:500 20px var(--font-ui)")}
        >
          +
        </button>
      </div>
      <RailButton label={t('shell.sidebar.friends')} active={shell.onFriends} dot={shell.incomingFriendRequests > 0} onClick={shell.goFriends}>
        <PulseIcon />
      </RailButton>
      <RailButton label={t('shell.sidebar.stats')} active={shell.onStats} onClick={shell.goStats}>
        <StatsIcon />
      </RailButton>
      <BellButton size={42} ring="var(--bg2)" />
      <button
        type="button"
        onClick={shell.goSettings}
        aria-label={t('shell.nav.settings')}
        title={t('shell.nav.settings')}
        aria-current={shell.onSettings ? 'page' : undefined}
        style={st(`flex-shrink:0;width:42px;height:42px;border-radius:50%;border:2px solid ${shell.onSettings ? 'var(--text)' : 'var(--line)'};padding:0;background:transparent;overflow:hidden`)}
      >
        <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor ?? '#E8734A'} avatarUrl={user?.avatarUrl} size={38} fontSize={14} />
      </button>
    </aside>
  );
}
