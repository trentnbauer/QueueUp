import { useUi } from '../context/UiContext';
import { Avatar, BellIcon, PulseIcon } from '../ui/primitives';
import { st } from '../ui/st';
import { useShell } from './useShell';

/** Phone top bar: a scrolling row of shelf/room tiles, then Activity, Notifications and profile. */
export function MobileTopBar() {
  const shell = useShell();
  const ui = useUi();
  const { user } = shell;
  const tiles = [shell.shelfTile, ...shell.roomTiles];

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
      <button
        type="button"
        onClick={shell.goActivity}
        aria-label="Friend activity"
        style={st(
          `flex-shrink:0;width:40px;height:40px;border-radius:50%;border:1px solid ${shell.onActivity ? 'var(--text)' : 'var(--line)'};background:${shell.onActivity ? 'var(--text)' : 'transparent'};color:${shell.onActivity ? 'var(--onText)' : 'var(--text)'};display:flex;align-items:center;justify-content:center;padding:0`,
        )}
      >
        <PulseIcon />
      </button>
      <button
        type="button"
        onClick={() => ui.openDialog('notifications')}
        aria-label="Notifications"
        style={st('position:relative;flex-shrink:0;width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:transparent;color:var(--text);display:flex;align-items:center;justify-content:center;padding:0')}
      >
        <BellIcon />
        {shell.hasUnread && (
          <span style={st('position:absolute;right:1px;top:1px;width:10px;height:10px;border-radius:50%;background:var(--dot);border:2px solid var(--bg)')} />
        )}
      </button>
      <button
        type="button"
        onClick={() => ui.openDialog('me')}
        aria-label="Profile and settings"
        style={st('position:relative;flex-shrink:0;width:40px;height:40px;border-radius:50%;border:2px solid var(--line);padding:0;background:transparent')}
      >
        <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor ?? '#E8734A'} avatarUrl={user?.avatarUrl} size={36} fontSize={14} />
      </button>
    </div>
  );
}
