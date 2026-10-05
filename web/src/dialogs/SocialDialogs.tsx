import { getBasePath } from '../utils/basePath';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@queueup/shared';
import { playTogetherApi } from '../api/playTogether';
import { notificationsApi } from '../api/notifications';
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
import { rich, useT } from '../i18n';

const SHELF_TYPES: Notification['type'][] = ['merge_suggestions', 'friend_recommendation', 'price_drop', 'good_time_to_buy', 'release_watch', 'playnite_sync_reminder', 'wishlist_bundle_deal'];

/** A "wants to play this together" request: add the game to a room you're both in, or start a new
 * room with the two of you. Stays until answered (mark-all-read skips it). */
function PlayTogetherRequest({ n, onDone }: { n: Notification; onDone: () => void }) {
  const queryClient = useQueryClient();
  const ui = useUi();
  const navigate = useNavigate();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [rooms, setRooms] = useState<{ id: string; name: string }[] | null>(null);

  async function accept(roomId?: string) {
    setBusy(true);
    try {
      const res = await playTogetherApi.accept(n.id, { roomId });
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.notify(res.created ? t('social.playTogether.created', { room: res.roomName }) : t('social.playTogether.added', { room: res.roomName }));
      onDone();
      ui.selectGame(null);
      navigate(`/room/${res.roomId}`);
    } catch (e) {
      ui.notify(e instanceof Error ? e.message : t('social.error.generic'));
      setBusy(false);
    }
  }
  async function showRooms() {
    setChoosing(true);
    try {
      setRooms((await playTogetherApi.rooms(n.id)).rooms);
    } catch {
      setRooms([]);
    }
  }
  async function decline() {
    setBusy(true);
    await notificationsApi.markRead(n.id).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setBusy(false);
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:16px;background:var(--surf)')}>
      <span style={st('font:600 11.5px var(--font-mono);color:var(--muted)')}>{t('social.playTogether.label')}</span>
      <span style={st('font:500 14px/1.4 var(--font-ui);text-wrap:pretty')}>{n.message}</span>
      <div style={st('display:flex;flex-wrap:wrap;gap:8px')}>
        <Btn kind="soft" height={34} padX={14} fontSize={12.5} disabled={busy} onClick={showRooms}>
          {t('social.playTogether.addToRoom')}
        </Btn>
        <Btn kind="soft" height={34} padX={14} fontSize={12.5} disabled={busy} onClick={() => accept()}>
          {t('social.playTogether.newRoom')}
        </Btn>
        <Btn kind="ghost" height={34} padX={10} fontSize={12.5} disabled={busy} onClick={decline}>
          {t('common.notNow')}
        </Btn>
      </div>
      {choosing && (
        <div style={st('display:flex;flex-direction:column;gap:6px')}>
          {rooms === null && <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('social.playTogether.loadingRooms')}</span>}
          {rooms?.length === 0 && <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('social.playTogether.noRooms')}</span>}
          {rooms?.map((r) => (
            <Btn key={r.id} kind="ghost" height={36} padX={12} fontSize={13} disabled={busy} onClick={() => accept(r.id)}>
              {r.name}
            </Btn>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bell: friend requests, import status, anything waiting for a match, then the unread feed.
 * Closing marks the feed read (so it's empty next time), same as before. */
export function NotificationsDialog() {
  const ui = useUi();
  const navigate = useNavigate();
  const t = useT();
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
        ? t('social.notifications.importingWishlistCount', { n: steam.wishlistProgress.imported })
        : t('social.notifications.importingWishlist')
      : steam.progress
        ? t('social.notifications.importingLibraryCount', { n: steam.progress.imported })
        : t('social.notifications.importingLibrary')
    : (steam.result ?? steam.error);

  async function dismissAll() {
    const ok = await confirm({ title: t('social.notifications.clearTitle'), message: t('social.notifications.clearMessage'), confirmLabel: t('social.notifications.clearConfirm') });
    if (ok) markAllRead();
  }

  function open(n: Notification) {
    // The AI finished and found games to merge: straight to the review.
    if (n.type === 'merge_suggestions') {
      if (notifications.length > 0) markAllRead();
      ui.closeDialog('notifications');
      ui.openDialog('duplicates');
      return;
    }
    // A failed library sync: straight to the Libraries dialog, where it can be fixed or tried again.
    if (n.type === 'library_sync_error' || n.type === 'library_sync_available') {
      if (notifications.length > 0) markAllRead();
      ui.closeDialog('notifications');
      ui.openDialog('import');
      return;
    }
    const to = n.roomId ? `/room/${n.roomId}` : SHELF_TYPES.includes(n.type) ? '/' : null;
    if (!to) return;
    if (notifications.length > 0) markAllRead();
    ui.closeDialog('notifications');
    navigate(to);
    // A notification about a game opens that game's card.
    ui.selectGame(n.gameId);
  }

  async function declineRequest(id: string, name: string) {
    const ok = await confirm({ title: t('social.requests.declineTitle', { name }), message: t('social.requests.declineMessage'), confirmLabel: t('social.requests.decline'), danger: true });
    if (ok) await act(() => friends.removeRequest(id), t('social.requests.declined'));
  }

  async function act(fn: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await fn();
      ui.notify(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('social.error.generic'));
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
          <span style={st('flex:1;font:700 22px var(--font-display);letter-spacing:-0.02em')}>{t('social.notifications.title')}</span>
          {notifications.length > 0 && (
            <Btn kind="ghost" height={34} padX={12} fontSize={13} onClick={dismissAll}>
              {t('social.notifications.dismissAll')}
            </Btn>
          )}
        </>
      }
    >
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {friends.incoming.length > 0 && (
        <>
          <span style={st('padding:4px 8px;font:600 11.5px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('social.notifications.friendRequests')}</span>
          {friends.incoming.map((r) => (
            <div key={r.id} style={st('display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:var(--surf)')}>
              <Avatar name={r.user.displayName} color={r.user.avatarColor} avatarUrl={r.user.avatarUrl} size={36} fontSize={14} profileUserId={r.user.id} onOpenProfile={() => ui.closeDialog('notifications')} />
              <span style={st('flex:1;min-width:0;font:500 14px/1.35 var(--font-ui)')}>
                {rich(t('social.notifications.wantsToBeFriends'), { name: <b style={{ fontWeight: 600 }}>{r.user.displayName}</b> })}
              </span>
              <Btn kind="ghost" height={34} padX={8} fontSize={12.5} onClick={() => void declineRequest(r.id, r.user.displayName)}>
                {t('social.requests.decline')}
              </Btn>
              <Btn kind="text" height={34} padX={14} fontSize={12.5} weight={700} onClick={() => act(() => friends.accept(r.id), t('social.friends.nowFriends', { name: r.user.displayName }))}>
                {t('social.requests.accept')}
              </Btn>
            </div>
          ))}
          <span style={st('padding:12px 8px 4px;font:600 11.5px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('social.notifications.updates')}</span>
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
            <span style={st('font:600 14px var(--font-ui)')}>{t(pending === 1 ? 'social.notifications.needsMatch.one' : 'social.notifications.needsMatch.other', { n: pending })}</span>
            <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('social.notifications.fromImports')}</span>
          </span>
          <span style={st('height:32px;padding:0 12px;border-radius:999px;background:var(--text);color:var(--onText);font:700 12.5px var(--font-ui);display:flex;align-items:center')}>{t('social.notifications.review')}</span>
        </button>
      )}
      {importStatus && (
        <div style={st('margin:0 0 8px;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:var(--surf);font:500 13.5px var(--font-ui)')}>
          {steam.busy && <span style={st('flex-shrink:0;width:14px;height:14px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />}
          <span style={{ flex: 1, minWidth: 0 }}>{importStatus}</span>
          {!steam.busy && (
            <button type="button" onClick={steam.dismissResult} aria-label={t('social.notifications.dismissImport')} style={st('width:28px;height:28px;border:none;background:none;color:var(--muted);font-size:17px;line-height:1')}>
              ×
            </button>
          )}
        </div>
      )}
      {isLoading && <div style={st('padding:24px 12px;color:var(--muted);font:400 14px var(--font-ui)')}>{t('common.loading')}</div>}
      {notifications.map((n) => {
        if (n.type === 'play_together_request') return <PlayTogetherRequest key={n.id} n={n} onDone={() => ui.closeDialog('notifications')} />;
        const where = n.roomId ? n.roomName : n.type === 'library_sync_error' || n.type === 'library_sync_available' ? t('social.notifications.libraries') : SHELF_TYPES.includes(n.type) ? t('social.notifications.personalShelf') : t('social.notifications.announcement');
        const clickable = !!n.roomId || n.type === 'library_sync_error' || n.type === 'library_sync_available' || SHELF_TYPES.includes(n.type);
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
        <div style={st('padding:24px 12px;color:var(--muted);font:400 14px/1.5 var(--font-ui)')}>{t('social.notifications.empty')}</div>
      )}
    </Dialog>
  );
}

/** The shareable link for a friend code: whoever opens it (once signed in) becomes the owner's friend. */
export function friendLink(code: string): string {
  return `${window.location.origin}${getBasePath()}/add/${code}`;
}

/** Friends list + add by code. Tapping a friend opens their profile page. */
export function FriendsDialog() {
  const ui = useUi();
  const navigate = useNavigate();
  const t = useT();
  const queryClient = useQueryClient();
  const friends = useFriends();
  const confirm = useConfirm();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function removeFriend(id: string, name: string) {
    const ok = await confirm({
      title: t('social.friends.removeTitle', { name }),
      message: t('social.friends.removeMessage'),
      confirmLabel: t('social.friends.removeFriend'),
      danger: true,
    });
    if (!ok) return;
    try {
      await friends.unfriend(id);
      ui.notify(t('social.friends.removed', { name }));
    } catch (e) {
      setError(friends.errorMessage(e, t('social.friends.removeError')));
    }
  }

  async function dropRequest(id: string, name: string, cancel: boolean) {
    const ok = await confirm(
      cancel
        ? { title: t('social.requests.cancelTitle', { name }), message: t('social.requests.cancelMessage'), confirmLabel: t('social.requests.cancelConfirm'), danger: true }
        : { title: t('social.requests.declineTitle', { name }), message: t('social.requests.declineMessage'), confirmLabel: t('social.requests.decline'), danger: true },
    );
    if (ok) await resolve(() => friends.removeRequest(id), cancel ? t('social.requests.cancelled') : t('social.requests.declined'));
  }

  async function resolve(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      ui.notify(done);
    } catch (e) {
      setError(friends.errorMessage(e, t('social.error.generic')));
    }
  }

  async function send() {
    // Accepts a pasted friend link as well as a bare code.
    const c = (code.trim().match(/\/add\/([^/?#\s]+)/)?.[1] ?? code.trim());
    if (!c) return;
    setSending(true);
    setError(null);
    try {
      const res = await friends.sendRequest(c);
      setCode('');
      ui.notify(res.accepted ? t('social.friends.nowFriends', { name: res.user.displayName }) : t('social.friends.sent', { name: res.user.displayName }));
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      setError(friends.errorMessage(e, t('social.friends.sendError')));
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
          {t('social.friends.title')} <span style={st('font:500 14px var(--font-mono);color:var(--muted)')}>{friends.friends.length}</span>
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
              placeholder={t('social.friends.codePlaceholder')}
              aria-label={t('social.friends.codeAria')}
              style={st(inputPill, { flex: 1, minWidth: 0, border: '1px solid var(--line)' })}
            />
            <Btn kind="accent" height={44} padX={16} weight={700} disabled={!code.trim() || sending} onClick={send}>
              {t('social.friends.send')}
            </Btn>
          </div>
          {friends.myCode && (
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(friendLink(friends.myCode));
                ui.notify(t('social.friends.linkCopied'));
              }}
              style={st('align-self:flex-start;border:none;background:none;padding:2px 0;color:var(--muted);font:500 12.5px var(--font-ui);text-align:left')}
            >
              {rich(t('social.friends.shareLink'), { tap: <span style={st('color:var(--text)')}>{t('social.friends.tapToCopy')}</span> })}
              <br />
              {rich(t('social.friends.shareHint'), { code: <span style={st('font-family:var(--font-mono);color:var(--text)')}>{friends.myCode}</span> })}
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
              {t('social.friends.pending', { n: friends.incoming.length + friends.outgoing.length })}
            </span>
            {friends.incoming.map((r) => (
              <div key={r.id} style={st('display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:var(--surf)')}>
                <Avatar name={r.user.displayName} color={r.user.avatarColor} avatarUrl={r.user.avatarUrl} size={36} fontSize={14} profileUserId={r.user.id} onOpenProfile={() => ui.closeDialog('friends')} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 14px var(--font-ui)')}>{r.user.displayName}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('social.friends.wantsToBeFriends')}</span>
                </span>
                <Btn kind="ghost" height={34} padX={8} fontSize={12.5} onClick={() => void dropRequest(r.id, r.user.displayName, false)}>
                  {t('social.requests.decline')}
                </Btn>
                <Btn kind="text" height={34} padX={14} fontSize={12.5} weight={700} onClick={() => resolve(() => friends.accept(r.id), t('social.friends.nowFriends', { name: r.user.displayName }))}>
                  {t('social.requests.accept')}
                </Btn>
              </div>
            ))}
            {friends.outgoing.map((r) => (
              <div key={r.id} style={st('display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:var(--surf)')}>
                <Avatar name={r.user.displayName} color={r.user.avatarColor} avatarUrl={r.user.avatarUrl} size={36} fontSize={14} profileUserId={r.user.id} onOpenProfile={() => ui.closeDialog('friends')} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 14px var(--font-ui)')}>{r.user.displayName}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('social.friends.waiting')}</span>
                </span>
                <Btn kind="ghost" height={34} padX={10} fontSize={12.5} onClick={() => void dropRequest(r.id, r.user.displayName, true)}>
                  {t('common.cancel')}
                </Btn>
              </div>
            ))}
          </div>
        )}
        <Group>
          {friends.friends.map((f) => (
            <div key={f.id} style={st('display:flex;align-items:stretch;background:var(--surf)')}>
            <button
              type="button"
              className="hv-surf2"
              onClick={() => {
                ui.closeDialog('friends');
                ui.selectGame(null);
                navigate(`/friends/${f.id}`);
              }}
              style={st('display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 8px 10px 14px;border:none;background:var(--surf);color:var(--text);text-align:left;flex:1;min-width:0')}
            >
              <Avatar name={f.displayName} color={f.avatarColor} avatarUrl={f.avatarUrl} size={40} fontSize={15} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{f.displayName}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                  {f.profilePrivate ? t('social.friends.private') : t(f.sharedRoomCount === 1 ? 'social.friends.stats.one' : 'social.friends.stats.other', { beaten: f.beatenCount, n: f.sharedRoomCount })}
                </span>
              </span>
              <span style={st('color:var(--muted);font-size:20px')}>›</span>
            </button>
            <button
              type="button"
              className="hv-surf2"
              aria-label={t('social.friends.removeAria', { name: f.displayName })}
              title={t('social.friends.removeFriend')}
              onClick={() => void removeFriend(f.id, f.displayName)}
              style={st('flex-shrink:0;width:48px;border:none;background:var(--surf);color:var(--danger);font:600 20px var(--font-ui)')}
            >
              ×
            </button>
            </div>
          ))}
        </Group>
        {!friends.isLoading && friends.friends.length === 0 && <div style={st('padding:20px 4px;color:var(--muted);font-size:14.5px')}>{t('social.friends.empty')}</div>}
      </div>
    </Dialog>
  );
}
