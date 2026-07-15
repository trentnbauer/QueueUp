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

function formatPrice(game: Game): string {
  if (!game.price.amount) return '—';
  if (!game.price.currency) return game.price.amount;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: game.price.currency }).format(
      Number(game.price.amount),
    );
  } catch {
    return `${game.price.amount} ${game.price.currency}`;
  }
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
          {game.ggDealsUrl ? (
            <a href={game.ggDealsUrl} target="_blank" rel="noreferrer" className={styles.title} style={{ textDecoration: 'none' }}>
              {game.title}
            </a>
          ) : (
            <span className={styles.title}>{game.title}</span>
          )}
          <div className={styles.statusRow}>
            <StatusBadge status={game.status} onClick={onStatusChange} />
          </div>
          <div className={styles.genre} title={game.genre ?? undefined}>
            {game.genre ?? '—'}
          </div>
        </div>

        <div className={styles.priceRow}>
          <div className={styles.priceGroup}>
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
            <AvatarBadge name={game.addedBy.displayName} color={game.addedBy.avatarColor} size={16} />
            added by {game.addedBy.displayName}
          </span>
        </div>

        {coopWarning && <div className={styles.coopWarning}>⚠ {coopWarning}</div>}

        <div className={styles.divider} />

        <VoteRow myVote={game.myVote} onVote={onVote} />
        <VoteHeatmap votes={game.votes} currentUserId={currentUserId} />

        <button className={styles.removeButton} onClick={handleRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
