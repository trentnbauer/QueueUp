import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@queueup/shared';
import { apiPost } from '../api/client';
import { gamesApi } from '../api/games';
import { notificationsApi } from '../api/notifications';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Notification types that ask the person to do something. The toasts already carry these buttons; this is the
 * same set for the rows in the notification list, so a notification that needs an answer can always be answered
 * from where it is, not only from a toast that has since gone. */
export const ACTIONABLE_TYPES: Notification['type'][] = ['platform_unowned', 'playtime_mark_playing', 'room_game_beaten'];

export function hasActions(n: Notification): boolean {
  return ACTIONABLE_TYPES.includes(n.type) && (n.type === 'platform_unowned' ? !!n.platform : !!n.gameId);
}

const BTN = 'height:32px;padding:0 14px;border-radius:999px;border:none;font:700 13px var(--font-ui)';
const PRIMARY = `${BTN};background:var(--acc);color:var(--ink)`;
const SECONDARY = `${BTN};background:var(--chip);color:var(--text2)`;

/** The buttons under a notification row that needs an answer. Answering marks it read. */
export function NotificationActions({ n, onDone }: { n: Notification; onDone: () => void }) {
  const t = useT();
  const ui = useUi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refetch } = useAuth();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, failed: string) {
    setBusy(true);
    try {
      await action();
      await notificationsApi.markRead(n.id).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      ui.showError(err instanceof Error ? err.message : failed);
    } finally {
      setBusy(false);
    }
  }

  const openGame = () => {
    onDone();
    navigate(n.roomId ? `/room/${n.roomId}` : '/');
    ui.selectGame(n.gameId);
  };

  const buttons: { label: string; primary?: boolean; onClick: () => void }[] = [];
  if (n.type === 'platform_unowned' && n.platform) {
    const platform = n.platform;
    const answer = (add: boolean) =>
      run(async () => {
        await apiPost(`/api/me/owned-platforms/${platform}/answer`, { add });
        if (add) void refetch();
      }, t('shell.toasts.saveFailed'));
    buttons.push({ label: t('shell.toasts.yesAddIt'), primary: true, onClick: () => void answer(true) }, { label: t('common.no'), onClick: () => void answer(false) });
  } else if (n.type === 'playtime_mark_playing' && n.gameId) {
    const gameId = n.gameId;
    buttons.push(
      {
        label: t('shell.toasts.markPlaying'),
        primary: true,
        onClick: () =>
          void run(async () => {
            await gamesApi.updateStatus(gameId, { status: 'playing' });
            void queryClient.invalidateQueries({ queryKey: ['games'] });
          }, t('shell.toasts.saveFailed')),
      },
      { label: t('common.view'), onClick: openGame },
    );
  } else if (n.type === 'room_game_beaten' && n.gameId) {
    const gameId = n.gameId;
    buttons.push(
      {
        label: t('shell.toasts.reviewIt'),
        primary: true,
        onClick: () => {
          openGame();
          ui.openDialog('review', { gameId, syncShelf: true });
        },
      },
      {
        label: t('shell.toasts.markBeaten'),
        onClick: () =>
          void run(async () => {
            await gamesApi.syncShelfBeaten(gameId);
            void queryClient.invalidateQueries({ queryKey: ['games'] });
            ui.notify(t('shell.toasts.markedBeaten'));
          }, t('shell.toasts.shelfFailed')),
      },
    );
  }
  if (buttons.length === 0) return null;

  return (
    <div style={st('display:flex;flex-wrap:wrap;gap:8px;padding:0 12px 12px 32px')}>
      {buttons.map((b) => (
        <button key={b.label} type="button" disabled={busy} onClick={b.onClick} style={st(`${b.primary ? PRIMARY : SECONDARY};${busy ? 'opacity:0.6' : ''}`)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}
