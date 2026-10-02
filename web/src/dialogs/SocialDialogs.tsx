import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@queueup/shared';
import { useConfirm } from '../context/ConfirmContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useUi } from '../context/UiContext';
import { useFriends } from '../hooks/useFriends';
import { useMarkAllNotificationsRead, useNotificationFeed } from '../hooks/useNotifications';
import { usePendingImportsCount } from '../hooks/usePendingImports';
import { Dialog } from '../ui/Dialog';
import { Avatar, Banner, Btn, Group, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';

const SHELF_TYPES: Notification['type'][] = ['price_drop', 'release_watch', 'playnite_sync_reminder', 'wishlist_bundle_deal'];

/** Bell: friend requests, import status, anything waiting for a match, then the unread feed.
 * Closing marks the feed read (so it's empty next time), same as before. */
export function NotificationsDialog() {
  const ui = useUi();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const friends = useFriends();
  const pending = usePendingImportsCount();
  const steam = useSteamImportContext();
  const { notifications, isLoading } = useNotificationFeed(true);
  const markAllRead = useMarkAllNotificationsRead();
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (notifications.length > 0) markAllRead();
    ui.closeDialog('notifications');
  };

  const importStatus = steam.busy
    ? steam.activeKind === 'wishlist'
      ? steam.wishlistProgress
        ? `Importing your Steam wishlist… ${steam.wishlistProgress.imported} added so far`
        : 'Importing your Steam wishlist…'
      : steam.progress
        ? `Importing your Steam library… ${steam.progress.imported} added so far`
        : 'Importing your Steam library…'
    : (steam.result ?? steam.error);

  async function dismissAll() {
    const ok = await confirm({ title: 'Clear notifications?', message: 'This clears every notification for you. Other members still see theirs.', confirmLabel: 'Clear' });
    if (ok) markAllRead();
  }

  function open(n: Notification) {
    const to = n.roomId ? `/room/${n.roomId}` : SHELF_TYPES.includes(n.type) ? '/' : null;
    if (!to) return;
    if (notifications.length > 0) markAllRead();
    ui.closeDialog('notifications');
    ui.selectGame(null);
    navigate(to);
  }

  async function act(fn: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await fn();
      ui.notify(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  const hasAnything = friends.incoming.length > 0 || pending > 0 || notifications.length > 0 || !!importStatus;

  return (
    <Dialog
      onClose={close}
      gap={4}
      padded
      bodyStyle={{ padding: '0 12px 30px' }}
      header={
        <>
          <span style={st('flex:1;font:700 22px var(--font-display);letter-spacing:-0.02em')}>Notifications</span>
          {notifications.length > 0 && (
            <Btn kind="ghost" height={34} padX={12} fontSize={13} onClick={dismissAll}>
              Dismiss all
            </Btn>
          )}
        </>
      }
    >
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {friends.incoming.length > 0 && (
        <>
          <span style={st('padding:4px 8px;font:600 11.5px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>FRIEND REQUESTS</span>
          {friends.incoming.map((r) => (
            <div key={r.id} style={st('display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:var(--surf)')}>
              <Avatar name={r.user.displayName} color={r.user.avatarColor} avatarUrl={r.user.avatarUrl} size={36} fontSize={14} />
              <span style={st('flex:1;min-width:0;font:500 14px/1.35 var(--font-ui)')}>
                <b style={{ fontWeight: 600 }}>{r.user.displayName}</b> wants to be friends
              </span>
              <Btn kind="ghost" height={34} padX={8} fontSize={12.5} onClick={() => act(() => friends.removeRequest(r.id), 'Request declined')}>
                Decline
              </Btn>
              <Btn kind="text" height={34} padX={14} fontSize={12.5} weight={700} onClick={() => act(() => friends.accept(r.id), `You and ${r.user.displayName} are friends`)}>
                Accept
              </Btn>
            </div>
          ))}
          <span style={st('padding:12px 8px 4px;font:600 11.5px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>UPDATES</span>
        </>
      )}
      {pending > 0 && (
        <button
          type="button"
          onClick={() => {
            ui.closeDialog('notifications');
            ui.openDialog('needsReview');
          }}
          style={st('display:flex;align-items:center;gap:12px;margin-bottom:6px;padding:12px;border-radius:16px;border:none;background:var(--surf);color:var(--text);text-align:left')}
        >
          <span style={st('width:36px;height:36px;flex-shrink:0;border-radius:12px;background:var(--accSoft2);color:var(--accText);display:flex;align-items:center;justify-content:center;font:700 14px var(--font-ui)')}>{pending}</span>
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14px var(--font-ui)')}>{pending === 1 ? '1 synced game needs a match' : `${pending} synced games need a match`}</span>
            <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>From your imports</span>
          </span>
          <span style={st('height:32px;padding:0 12px;border-radius:999px;background:var(--text);color:var(--onText);font:700 12.5px var(--font-ui);display:flex;align-items:center')}>Review</span>
        </button>
      )}
      {importStatus && (
        <div style={st('margin:0 0 8px;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:var(--surf);font:500 13.5px var(--font-ui)')}>
          {steam.busy && <span style={st('flex-shrink:0;width:14px;height:14px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />}
          <span style={{ flex: 1, minWidth: 0 }}>{importStatus}</span>
          {!steam.busy && (
            <button type="button" onClick={steam.dismissResult} aria-label="Dismiss import status" style={st('width:28px;height:28px;border:none;background:none;color:var(--muted);font-size:17px;line-height:1')}>
              ×
            </button>
          )}
        </div>
      )}
      {isLoading && <div style={st('padding:24px 12px;color:var(--muted);font:400 14px var(--font-ui)')}>Loading…</div>}
      {notifications.map((n) => {
        const where = n.roomId ? n.roomName : SHELF_TYPES.includes(n.type) ? 'Personal Shelf' : 'Announcement';
        const clickable = !!n.roomId || SHELF_TYPES.includes(n.type);
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n)}
            disabled={!clickable}
            className={clickable ? 'hv-surf' : undefined}
            style={st(`display:flex;gap:12px;padding:12px;border-radius:16px;border:none;background:${n.read ? 'transparent' : 'var(--surf)'};color:var(--text);text-align:left;cursor:${clickable ? 'pointer' : 'default'}`)}
          >
            <span style={st(`width:8px;height:8px;margin-top:6px;flex-shrink:0;border-radius:50%;background:${n.read ? 'transparent' : 'var(--acc)'}`)} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
              <span style={st('font:600 11.5px var(--font-mono);color:var(--muted)')}>{where.toUpperCase()}</span>
              <span style={st('font:500 14px/1.4 var(--font-ui);text-wrap:pretty')}>{n.message}</span>
              <span style={st('font:400 12px var(--font-ui);color:var(--faint)')}>{formatRelativeTime(n.createdAt)}</span>
            </span>
          </button>
        );
      })}
      {!isLoading && !hasAnything && (
        <div style={st('padding:24px 12px;color:var(--muted);font:400 14px/1.5 var(--font-ui)')}>You're all caught up. Game adds, member changes and room updates will show up here.</div>
      )}
    </Dialog>
  );
}

/** Friends list + add by code. Tapping a friend opens their profile page. */
export function FriendsDialog() {
  const ui = useUi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const friends = useFriends();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function resolve(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      ui.notify(done);
    } catch (e) {
      setError(friends.errorMessage(e, 'Something went wrong'));
    }
  }

  async function send() {
    const c = code.trim();
    if (!c) return;
    setSending(true);
    setError(null);
    try {
      const res = await friends.sendRequest(c);
      setCode('');
      ui.notify(res.accepted ? `You and ${res.user.displayName} are friends` : `Request sent to ${res.user.displayName}`);
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      setError(friends.errorMessage(e, 'Could not send that request'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      onClose={() => ui.closeDialog('friends')}
      height="tall"
      padded={false}
      header={
        <span style={st('flex:1;font:700 22px var(--font-display);letter-spacing:-0.02em')}>
          Friends <span style={st('font:500 14px var(--font-mono);color:var(--muted)')}>{friends.friends.length}</span>
        </span>
      }
      footer={
        friends.privateInstance ? undefined : (
        <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:8px;padding:12px 20px 26px;border-top:1px solid var(--chip)')}>
          {error && <span style={st('font:500 13px var(--font-ui);color:var(--danger)')}>{error}</span>}
          <div style={st('display:flex;gap:8px')}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Add by friend code"
              aria-label="Friend code"
              style={st(inputPill, { flex: 1, minWidth: 0, border: '1px solid var(--line)' })}
            />
            <Btn kind="accent" height={44} padX={16} weight={700} disabled={!code.trim() || sending} onClick={send}>
              Send
            </Btn>
          </div>
          {friends.myCode && (
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(friends.myCode);
                ui.notify('Friend code copied');
              }}
              style={st('align-self:flex-start;border:none;background:none;padding:2px 0;color:var(--muted);font:500 12.5px var(--font-ui)')}
            >
              Your code: <span style={st('font-family:var(--font-mono);color:var(--text)')}>{friends.myCode}</span> · tap to copy
            </button>
          )}
        </div>
        )
      }
    >
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:0 20px 12px;display:flex;flex-direction:column;gap:14px')}>
        {(friends.incoming.length > 0 || friends.outgoing.length > 0) && (
          <div style={st('display:flex;flex-direction:column;gap:8px')}>
            <span style={st('padding:4px 4px 0;font:600 11.5px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>
              PENDING REQUESTS · {friends.incoming.length + friends.outgoing.length}
            </span>
            {friends.incoming.map((r) => (
              <div key={r.id} style={st('display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:var(--surf)')}>
                <Avatar name={r.user.displayName} color={r.user.avatarColor} avatarUrl={r.user.avatarUrl} size={36} fontSize={14} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 14px var(--font-ui)')}>{r.user.displayName}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Wants to be friends</span>
                </span>
                <Btn kind="ghost" height={34} padX={8} fontSize={12.5} onClick={() => resolve(() => friends.removeRequest(r.id), 'Request declined')}>
                  Decline
                </Btn>
                <Btn kind="text" height={34} padX={14} fontSize={12.5} weight={700} onClick={() => resolve(() => friends.accept(r.id), `You and ${r.user.displayName} are friends`)}>
                  Accept
                </Btn>
              </div>
            ))}
            {friends.outgoing.map((r) => (
              <div key={r.id} style={st('display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:var(--surf)')}>
                <Avatar name={r.user.displayName} color={r.user.avatarColor} avatarUrl={r.user.avatarUrl} size={36} fontSize={14} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 14px var(--font-ui)')}>{r.user.displayName}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Request sent · waiting for a reply</span>
                </span>
                <Btn kind="ghost" height={34} padX={10} fontSize={12.5} onClick={() => resolve(() => friends.removeRequest(r.id), 'Request cancelled')}>
                  Cancel
                </Btn>
              </div>
            ))}
          </div>
        )}
        <Group>
          {friends.friends.map((f) => (
            <button
              key={f.id}
              type="button"
              className="hv-surf2"
              onClick={() => {
                ui.closeDialog('friends');
                ui.selectGame(null);
                navigate(`/friends/${f.id}`);
              }}
              style={st('display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 16px 10px 14px;border:none;background:var(--surf);color:var(--text);text-align:left;width:100%')}
            >
              <Avatar name={f.displayName} color={f.avatarColor} avatarUrl={f.avatarUrl} size={40} fontSize={15} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{f.displayName}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                  {f.beatenCount} beaten · {f.sharedRoomCount} shared room{f.sharedRoomCount === 1 ? '' : 's'}
                </span>
              </span>
              <span style={st('color:var(--muted);font-size:20px')}>›</span>
            </button>
          ))}
        </Group>
        {!friends.isLoading && friends.friends.length === 0 && <div style={st('padding:20px 4px;color:var(--muted);font-size:14.5px')}>No friends yet. Share your code below.</div>}
      </div>
    </Dialog>
  );
}
