import type { Game } from '@queueup/shared';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useScope } from '../../context/ScopeContext';
import { useUi } from '../../context/UiContext';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { SYNC_SOURCE_KEY } from './syncSources';

/** In a room only whoever added a game or a Room Master / Moderator can remove it outright; everyone else votes to, and it
 * goes once most of the room has. The shelf is always yours. */
export function useCanRemoveDirectly(game: Game): boolean {
  const { user } = useAuth();
  const { isShelf, canManage } = useScope();
  return isShelf || game.addedBy.id === user?.id || canManage;
}

/** "Added by Alex · 13 May 2020" (on the shelf, "Synced from Steam · …" for a synced game) and Remove / Vote to remove. */
export function Footer({ game }: { game: Game }) {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { ops, isShelf } = useScope();
  const canRemoveDirectly = useCanRemoveDirectly(game);

  const date = new Date(game.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const who =
    isShelf && game.syncSources.length > 0
      ? t('card.footer.syncedFrom', { source: t(SYNC_SOURCE_KEY[game.syncSources[0]]) })
      : game.addedBy.id === user?.id
        ? t('game.detail.addedByYou')
        : t('game.detail.addedBy', { name: game.addedBy.displayName });

  async function remove() {
    const ok = await confirm({
      title: t('game.detail.remove.title'),
      message: t('game.detail.remove.message', { title: game.title }),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (!ok) return;
    ops.remove(game.id);
    ui.selectGame(null);
    ui.notify(t('game.detail.remove.done', { title: game.title }));
  }

  async function voteToRemove() {
    if (game.youVotedRemove) {
      ops.unvoteRemove(game.id);
      return;
    }
    const ok = await confirm({
      title: t('game.detail.voteRemove.title'),
      message: t('game.detail.voteRemove.message', { title: game.title, needed: game.removeVotesNeeded, votes: game.removeVotes }),
      confirmLabel: t('game.detail.voteRemove.confirm'),
      danger: true,
    });
    if (!ok) return;
    if (await ops.voteRemove(game.id)) {
      ui.selectGame(null);
      ui.notify(t('game.detail.remove.done', { title: game.title }));
    } else {
      ui.notify(t('game.detail.voteRemove.recorded'));
    }
  }

  return (
    <div style={st('display:flex;justify-content:space-between;align-items:center;gap:12px;flex-shrink:0')}>
      <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);min-width:0')}>
        {who} · {date}
      </span>
      {canRemoveDirectly ? (
        <button type="button" onClick={() => void remove()} style={st('height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 13.5px var(--font-ui);flex-shrink:0')}>
          {t('game.detail.removeGame')}
        </button>
      ) : (
        <button type="button" onClick={() => void voteToRemove()} aria-pressed={game.youVotedRemove} style={st('height:40px;border:none;background:none;padding:0;color:var(--danger);font:600 13.5px var(--font-ui);flex-shrink:0')}>
          {game.youVotedRemove ? t('game.detail.voteRemove.withdraw') : t('game.detail.voteRemove.confirm')}
          {game.removeVotes > 0 && ` (${game.removeVotes}/${game.removeVotesNeeded})`}
        </button>
      )}
    </div>
  );
}
