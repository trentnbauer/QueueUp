import { getBasePath } from '../utils/basePath';
import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@queueup/shared';
import { playTogetherApi } from '../api/playTogether';
import { notificationsApi } from '../api/notifications';
import { useConfirm } from '../context/ConfirmContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useUi } from '../context/UiContext';
import { useAiJobs } from '../hooks/useAiActivity';
import { useFriends } from '../hooks/useFriends';
import { useMarkAllNotificationsRead, useNotificationFeed } from '../hooks/useNotifications';
import { usePendingImportsCount } from '../hooks/usePendingImports';
import { NotificationActions, hasActions } from './NotificationActions';
import { Dialog } from '../ui/Dialog';
import { Avatar, Banner, Btn, Spinner } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { rich, useT, type MessageKey } from '../i18n';

/** Notifications only administrators get; each opens the Administrator page. */
const ADMIN_TYPES: Notification['type'][] = ['admin_report', 'admin_unban_request', 'admin_backup_failed'];
const SHELF_TYPES: Notification['type'][] = ['merge_suggestions', 'friend_recommendation', 'price_drop', 'good_time_to_buy', 'release_watch', 'playnite_sync_reminder', 'wishlist_bundle_deal', 'playtime_mark_playing', 'sensitive_games'];

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
/** The kinds of AI request that have their own wording in the activity list; anything else reads "an AI request". */
const AI_JOB_LABELS = new Set(['duplicates', 'importMatch', 'importClassify', 'picks', 'search', 'tonight', 'story', 'coach', 'recap', 'test', 'ai']);

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
  // What the AI is doing for this person right now, and anything waiting its turn.
  const aiJobs = useAiJobs(true);

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
    // An AI request failed: the message says why; the AI settings are where it gets fixed.
    if (n.type === 'ai_error') {
      if (notifications.length > 0) markAllRead();
      ui.closeDialog('notifications');
      navigate('/settings/ai');
      return;
    }
    // A background AI job finished with nothing to review: nothing to open.
    if (n.type === 'ai_update') return;
    // A sync found games that look adult: straight to the "hide from your public library?" prompt.
    if (n.type === 'sensitive_games') {
      if (notifications.length > 0) markAllRead();
      ui.closeDialog('notifications');
      ui.openDialog('sensitiveGames');
      return;
    }
    // Something for administrators (a report, an unban request, a failed backup): the Administrator page.
    if (ADMIN_TYPES.includes(n.type)) {
      if (notifications.length > 0) markAllRead();
      ui.closeDialog('notifications');
      navigate('/admin');
      return;
    }
    // A friend beat your mini game high score: the Mini games page, with that game picked, ready to take it back.
    if (n.type === 'minigame_beaten') {
      if (notifications.length > 0) markAllRead();
      ui.closeDialog('notifications');
      navigate(n.miniGame ? `/games?game=${encodeURIComponent(n.miniGame)}` : '/games');
      return;
    }
    // A failed library sync: straight to Settings › Libraries, where it can be fixed or tried again.
    if (n.type === 'library_sync_error' || n.type === 'library_sync_available') {
      if (notifications.length > 0) markAllRead();
      ui.closeDialog('notifications');
      navigate('/settings/libraries');
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

  const hasAnything = friends.incoming.length > 0 || pending > 0 || notifications.length > 0 || !!importStatus || aiJobs.length > 0;

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
      {aiJobs.map((job) => {
        const what = t((`social.notifications.ai.job.${AI_JOB_LABELS.has(job.label) ? job.label : 'ai'}`) as MessageKey);
        return (
          <div key={job.label} role="status" style={st('margin:0 0 8px;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:var(--surf);font:500 13.5px/1.4 var(--font-ui)')}>
            <Spinner />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
              {job.running > 0 && <span>{job.running > 1 ? t('social.notifications.ai.runningMany', { what, n: job.running }) : t('social.notifications.ai.running', { what })}</span>}
              {job.queued > 0 && (
                <span style={st('color:var(--text2)')}>
                  {job.queued > 1 ? t('social.notifications.ai.queuedMany', { what, n: job.queued }) : t('social.notifications.ai.queued', { what })}
                  {job.nextPosition ? ` ${t('social.notifications.ai.position', { n: job.nextPosition })}` : ''}
                </span>
              )}
            </span>
          </div>
        );
      })}
      {importStatus && (
        <div style={st('margin:0 0 8px;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:var(--surf);font:500 13.5px var(--font-ui)')}>
          {steam.busy && <span style={st('flex-shrink:0;width:14px;height:14px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />}
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-line' }}>{importStatus}</span>
          {!steam.busy && steam.resultNeedsMatching && (
            <button
              type="button"
              onClick={() => {
                ui.closeDialog('notifications');
                ui.openDialog('needsReview');
              }}
              style={st('flex-shrink:0;height:32px;padding:0 14px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 13px var(--font-ui)')}
            >
              {t('add.steamImport.matchGames')}
            </button>
          )}
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
        const where = n.roomId
          ? n.roomName
          : ADMIN_TYPES.includes(n.type)
            ? t('social.notifications.administration')
            : n.type === 'library_sync_error' || n.type === 'library_sync_available'
              ? t('social.notifications.libraries')
              : n.type === 'minigame_beaten'
                ? t('social.notifications.miniGames')
                : SHELF_TYPES.includes(n.type)
                ? t('social.notifications.personalShelf')
                : t('social.notifications.announcement');
        const clickable = !!n.roomId || ADMIN_TYPES.includes(n.type) || n.type === 'library_sync_error' || n.type === 'library_sync_available' || n.type === 'minigame_beaten' || SHELF_TYPES.includes(n.type);
        return (
          <Fragment key={n.id}>
          <button
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
          {hasActions(n) && !n.read && <NotificationActions n={n} onDone={() => ui.closeDialog('notifications')} />}
          </Fragment>
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
