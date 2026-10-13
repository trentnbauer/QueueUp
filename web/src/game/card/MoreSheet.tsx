import type { Game } from '@queueup/shared';
import { ROOM_PLATFORM_LABELS, sortPlatforms } from '@queueup/shared';
import { useScope } from '../../context/ScopeContext';
import { useUi } from '../../context/UiContext';
import { useGamePlayLog } from '../../hooks/useGamePlayLog';
import { fmtMoney } from '../../lib/gameView';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { SYNC_SOURCE_KEY } from './syncSources';
import { priceModeOf } from './cardLogic';
import { Kicker, Row, RowGroup } from './ui';
import type { ReactNode } from 'react';

export type MoreTarget = 'price' | 'alert' | 'journal' | 'tags' | 'achievements' | 'series' | 'fix';

/** More: everything else the old card carried, grouped. Review and tags are yours; fix-it tools are for whoever added the game or runs the room. */
export function MoreSheet({
  game,
  canTag,
  canFix,
  onOpenReview,
  onOpen,
  onDuplicate,
  onBundle,
}: {
  game: Game;
  canTag: boolean;
  canFix: boolean;
  onOpenReview: () => void;
  onOpen: (target: MoreTarget) => void;
  onDuplicate: () => void;
  onBundle: () => void;
}) {
  const t = useT();
  const ui = useUi();
  const { ops, isShelf } = useScope();
  const { entries } = useGamePlayLog(game.id);
  const mode = priceModeOf(game);
  const finished = game.status === 'done' || game.status === 'replay' || game.status === 'dropped';
  const ach = game.myAchievements;

  const group = (title: string, rows: ReactNode) => (
    <div style={st('display:flex;flex-direction:column;gap:8px')}>
      <Kicker>{title}</Kicker>
      <RowGroup radius={16}>{rows}</RowGroup>
    </div>
  );

  return (
    <div style={st('display:flex;flex-direction:column;gap:14px')}>
      {group(
        t('card.more.yourTake'),
        <>
          <Row compact icon="✍️" label={t('card.more.review')} value={game.review ? t('card.more.edit') : t('card.more.writeOne')} valueColor="var(--accText)" sub={finished ? undefined : t('card.more.reviewAnytime')} onClick={onOpenReview} />
          <Row compact icon="📓" label={t('card.more.journal')} value={entries.length ? t(entries.length === 1 ? 'card.more.entries.one' : 'card.more.entries.other', { n: entries.length }) : undefined} onClick={() => onOpen('journal')} />
          {canTag && (
            <Row
              compact
              icon="🏷️"
              label={t('game.detail.tags')}
              value={game.tags.length ? game.tags.slice(0, 2).map((x) => x.name).join(', ') + (game.tags.length > 2 ? ` +${game.tags.length - 2}` : '') : undefined}
              onClick={() => onOpen('tags')}
            />
          )}
        </>,
      )}

      {group(
        t('card.more.about'),
        <>
          <Row compact icon="🏆" label={t('card.more.achievements')} value={ach && ach.total > 0 ? `${ach.unlocked} / ${ach.total}` : undefined} onClick={() => onOpen('achievements')} />
          <Row compact icon="📚" label={t('card.more.series')} onClick={() => onOpen('series')} />
        </>,
      )}

      {isShelf &&
        group(
          t('card.more.library'),
          <>
            <Row
              compact
              icon="🙈"
              label={t('card.more.hide')}
              sub={t('card.more.hideSub')}
              value={game.hiddenFromOthers ? t('card.more.hidden') : t('card.more.visible')}
              valueColor={game.hiddenFromOthers ? 'var(--accText)' : 'var(--muted)'}
              chevron={false}
              onClick={() => {
                const v = !game.hiddenFromOthers;
                ops.setHidden(game.id, v);
                ui.notify(v ? t('game.detail.hide.nowHidden', { title: game.title }) : t('game.detail.hide.visible', { title: game.title }));
              }}
            />
            {game.ownedPlatforms.length > 0 && <Row compact icon="🎮" label={t('card.more.ownedOn')} value={sortPlatforms(game.ownedPlatforms).map((p) => ROOM_PLATFORM_LABELS[p]).join(' · ')} chevron={false} onClick={() => undefined} />}
            {game.syncSources.length > 0 && <Row compact icon="🔄" label={t('card.more.syncedFrom')} value={game.syncSources.map((s) => t(SYNC_SOURCE_KEY[s])).join(' · ')} chevron={false} onClick={() => undefined} />}
          </>,
        )}

      {group(
        t('card.more.price'),
        <>
          <Row
            compact
            icon="🔔"
            label={t('card.more.alert')}
            value={mode !== 'live' ? t('card.more.needsLive') : game.targetPrice ? t('card.more.alertAt', { price: fmtMoney(game.targetPrice, game.price.currency) }) : t('card.more.off')}
            valueColor={game.targetPrice && mode === 'live' ? 'var(--accText)' : 'var(--muted)'}
            dim={mode !== 'live'}
            onClick={() => onOpen('alert')}
          />
          <Row compact icon="💲" label={t('card.more.manualPrice')} value={t('card.more.setRefresh')} onClick={() => onOpen('price')} />
        </>,
      )}

      {canFix &&
        group(
          t('card.more.fix'),
          <>
            <Row compact icon="🧩" label={t('card.more.fixMatch')} sub={t('card.more.fixMatchSub')} value="IGDB · Steam" onClick={() => onOpen('fix')} />
            <Row compact icon="⧉" label={t('game.duplicate.button')} onClick={onDuplicate} />
            {isShelf && <Row compact icon="📦" label={t('game.bundle.button')} onClick={onBundle} />}
          </>,
        )}
    </div>
  );
}

/** Fix match: re-match the game to the right IGDB entry, or fix which Steam app its price comes from. */
export function FixMatchSheet({ game, onRematch, onSteam }: { game: Game; onRematch: () => void; onSteam: () => void }) {
  const t = useT();
  const live = !!game.price.amount;
  return (
    <RowGroup radius={16}>
      <Row compact icon="🎯" label={t('game.igdbMatch.button')} sub={t('card.fix.igdbSub')} onClick={onRematch} />
      <Row compact icon="🛒" label={live ? t('game.detail.match.wrong') : t('game.detail.match.fix')} sub={t('card.fix.steamSub')} onClick={onSteam} />
    </RowGroup>
  );
}
