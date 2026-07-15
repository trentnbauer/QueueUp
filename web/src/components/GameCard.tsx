import type { Game, GameStatus, VoteValue } from '@squadqueue/shared';
import { AvatarBadge } from './AvatarBadge';
import { StatusBadge } from './StatusBadge';
import { VoteRow } from './VoteRow';
import { VoteHeatmap } from './VoteHeatmap';
import { useConfirm } from '../context/ConfirmContext';
import styles from './GameCard.module.css';

interface GameCardProps {
  game: Game;
  currentUserId: string;
  memberCount?: number;
  isPlayNext?: boolean;
  isRecommended?: boolean;
  onStatusChange: (status: GameStatus) => void;
  onVote: (value: VoteValue) => void;
  onRemove: () => void;
  onRefreshPrice: () => void;
}

function formatAmount(amount: string, currency: string | null): string {
  if (!currency) return amount;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatPrice(game: Game): string {
  if (!game.price.amount) return '—';
  return formatAmount(game.price.amount, game.price.currency);
}

export function GameCard({
  game,
  currentUserId,
  memberCount,
  isPlayNext,
  isRecommended,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
}: GameCardProps) {
  const confirm = useConfirm();
  const coopWarning =
    game.maxCoopPlayers != null && memberCount != null && memberCount > game.maxCoopPlayers
      ? `Only supports ${game.maxCoopPlayers}-player co-op — this room has ${memberCount} members`
      : null;

  async function handleRemove() {
    const ok = await confirm({
      title: 'Remove this game?',
      message: `"${game.title}" and its votes will be removed.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) onRemove();
  }

  return (
    <div className={styles.card}>
      <div
        className={styles.cover}
        style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
      >
        {!game.coverImageUrl && <span className={styles.coverLabel}>COVER ART</span>}
        {game.status === 'done' && <div className={styles.doneStrike} />}
        {isRecommended ? (
          <div className={styles.recommendedBanner}>★ Recommended Next</div>
        ) : (
          isPlayNext && <div className={styles.playNextBanner}>▶ Play Next</div>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.titleBlock}>
          <div className={styles.titleColumn}>
            {game.ggDealsUrl ? (
              <a href={game.ggDealsUrl} target="_blank" rel="noreferrer" className={styles.title} style={{ textDecoration: 'none' }}>
                {game.title}
              </a>
            ) : (
              <span className={styles.title}>{game.title}</span>
            )}
            <div className={styles.genre} title={game.genre ?? undefined}>
              {game.genre ?? '—'}
            </div>
          </div>
          <StatusBadge status={game.status} onClick={onStatusChange} />
        </div>

        <div className={styles.priceRow}>
          <div className={styles.priceGroup}>
            <span className={styles.controllerIcon} aria-hidden="true">🎮</span>
            {game.ggDealsUrl ? (
              <a href={game.ggDealsUrl} target="_blank" rel="noreferrer" className={styles.buyButton}>
                {formatPrice(game)}
              </a>
            ) : (
              <span className={styles.priceStatic}>{formatPrice(game)}</span>
            )}
            {game.price.source === 'live' && (
              <button
                type="button"
                className={styles.refreshPriceButton}
                onClick={onRefreshPrice}
                title="Check for a fresh price"
                aria-label="Refresh price"
              >
                ↻
              </button>
            )}
          </div>
          <span className={styles.addedBy}>
            added by {game.addedBy.displayName}
            <AvatarBadge name={game.addedBy.displayName} color={game.addedBy.avatarColor} avatarUrl={game.addedBy.avatarUrl} size={16} />
          </span>
        </div>

        {game.price.historicalLow && (
          <span className={styles.historicalLow} title="Lowest price this game has been tracked at">
            All-time low: {formatAmount(game.price.historicalLow, game.price.currency)}
          </span>
        )}

        {coopWarning && <div className={styles.coopWarning}>⚠ {coopWarning}</div>}

        <div className={styles.divider} />

        <VoteRow myVote={game.myVote} onVote={onVote} />
        <VoteHeatmap votes={game.votes} currentUserId={currentUserId} />

        <div className={styles.footerRow}>
          <button className={styles.removeButton} onClick={handleRemove}>
            Remove Game
          </button>
        </div>
      </div>
    </div>
  );
}
