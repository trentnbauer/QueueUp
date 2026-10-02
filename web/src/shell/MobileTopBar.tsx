import { useEffect, useState, type ReactNode } from 'react';
import { useUi } from '../context/UiContext';
import { Avatar, BellIcon, PulseIcon } from '../ui/primitives';
import { st } from '../ui/st';
import { useShell } from './useShell';

/** Phone top bar: a scrolling row of shelf/room tiles, then one button that opens Activity, Notifications and profile. */
export function MobileTopBar() {
  const shell = useShell();
  const ui = useUi();
  const { user } = shell;
  const tiles = [shell.shelfTile, ...shell.roomTiles];
  // Activity, notifications and settings share one button that opens a small menu, which leaves
  // the top bar's width to the rooms.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const pick = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div style={st('display:flex;align-items:center;gap:8px')}>
      <div
        style={st('flex:1;min-width:0;display:flex;gap:10px;overflow-x:auto;margin:-6px 0 -6px -16px;padding:6px 6px 6px 16px')}
      >
        {tiles.map((t) => {
          const a = t.active && !shell.onActivity;
          return (
            <button
              key={t.id}
              type="button"
              onClick={t.go}
              aria-label={t.name}
              style={st(
                `position:relative;flex-shrink:0;width:44px;height:44px;border:none;border-radius:${a ? '15px' : '50%'};background:${t.color};color:#fff;font:600 12px var(--font-mono);box-shadow:${a ? '0 0 0 2px var(--bg), 0 0 0 4px var(--text)' : 'none'}`,
              )}
            >
              {t.short}
              {t.dot && (
                <span style={st('position:absolute;right:-2px;top:-2px;width:11px;height:11px;border-radius:50%;background:var(--dot);border:2px solid var(--bg)')} />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => ui.openDialog('addRoom', { step: 'options' })}
          aria-label="Create or join a room"
          style={st("flex-shrink:0;width:44px;height:44px;border-radius:16px;border:1.5px dashed var(--line);background:transparent;color:var(--muted);font:500 20px var(--font-ui)")}
        >
          +
        </button>
      </div>
      <div style={st('position:relative;flex-shrink:0')}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Activity, notifications and settings"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          style={st(`position:relative;width:40px;height:40px;border-radius:50%;border:2px solid ${menuOpen || shell.onActivity ? 'var(--text)' : 'var(--line)'};padding:0;background:transparent`)}
        >
          <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor ?? '#E8734A'} avatarUrl={user?.avatarUrl} size={36} fontSize={14} />
          {shell.hasUnread && (
            <span style={st('position:absolute;right:-2px;top:-2px;width:11px;height:11px;border-radius:50%;background:var(--dot);border:2px solid var(--bg)')} />
          )}
        </button>
        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              onClick={() => setMenuOpen(false)}
              style={st('position:fixed;inset:0;z-index:40;border:none;background:transparent;padding:0')}
            />
            <div
              role="menu"
              style={st('position:absolute;right:0;top:48px;z-index:41;min-width:210px;display:flex;flex-direction:column;padding:6px;border-radius:18px;border:1px solid var(--line);background:var(--surf);box-shadow:0 12px 32px rgba(0,0,0,0.28)')}
            >
              <MenuItem label="Friend activity" active={shell.onActivity} onClick={pick(shell.goActivity)}>
                <PulseIcon />
              </MenuItem>
              <MenuItem label="Notifications" dot={shell.hasUnread} onClick={pick(() => ui.openDialog('notifications'))}>
                <BellIcon />
              </MenuItem>
              <MenuItem label="Profile and settings" onClick={pick(() => ui.openDialog('me'))}>
                <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor ?? '#E8734A'} avatarUrl={user?.avatarUrl} size={20} fontSize={9} />
              </MenuItem>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MenuItem({ label, onClick, children, dot, active }: { label: string; onClick: () => void; children: ReactNode; dot?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={st(`display:flex;align-items:center;gap:12px;height:48px;padding:0 12px;border:none;border-radius:12px;background:${active ? 'var(--chip)' : 'transparent'};color:var(--text);font:600 14.5px var(--font-ui);text-align:left`)}
    >
      <span style={st('position:relative;width:24px;display:flex;align-items:center;justify-content:center')}>
        {children}
        {dot && <span style={st('position:absolute;right:-3px;top:-3px;width:9px;height:9px;border-radius:50%;background:var(--dot);border:2px solid var(--surf)')} />}
      </span>
      {label}
    </button>
  );
}
