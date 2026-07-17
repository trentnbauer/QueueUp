import { useState, type FormEvent } from 'react';
import type { Game, GameStatus, User, VoteValue } from '@squadqueue/shared';
import { AvatarBadge } from './AvatarBadge';
import { StatusBadge } from './StatusBadge';
import { VoteRow } from './VoteRow';
import { VoteHeatmap } from './VoteHeatmap';
import { useConfirm } from '../context/ConfirmContext';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './GameCard.module.css';

interface GameCardProps {
  game: Game;
  currentUserId: string;
  memberCount?: number;
  roomMembers?: User[];
  onStatusChange: (status: GameStatus) => void;
  onVote: (value: VoteValue) => void;
  onRemove: () => void;
  onRefreshPrice: () => void;
  /** Drives the refresh button's spinner. Defaults to false (e.g. contexts that don't track it). */
  isRefreshingPrice?: boolean;
  /** Sets (or clears, with null) the price to alert at (issue #162) - only offered for games with
   * a live tracked price, since there's nothing to compare a target against otherwise. */
  onSetTargetPrice: (targetPrice: string | null) => void;
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
  roomMembers,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice = false,
  onSetTargetPrice,
}: GameCardProps) {
  const confirm = useConfirm();
  const [editingTargetPrice, setEditingTargetPrice] = useState(false);
  const [targetPriceDraft, setTargetPriceDraft] = useState('');
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

  function startEditingTargetPrice() {
    setTargetPriceDraft(game.targetPrice ?? '');
    setEditingTargetPrice(true);
  }

  function handleSaveTargetPrice(e: FormEvent) {
    e.preventDefault();
    const value = targetPriceDraft.trim();
    if (!value) return;
    onSetTargetPrice(value);
    setEditingTargetPrice(false);
  }

  function handleClearTargetPrice() {
    onSetTargetPrice(null);
    setEditingTargetPrice(false);
  }

  return (
    <div className={styles.card}>
      <div
        className={styles.cover}
        style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
      >
        {!game.coverImageUrl && <span className={styles.coverLabel}>COVER ART</span>}
        {game.status === 'done' && <div className={styles.doneStrike} />}

        <div className={styles.statusFloating}>
          <StatusBadge status={game.status} onClick={onStatusChange} />
        </div>

        <div className={styles.coverOverlay}>
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
      </div>

      <div className={styles.body}>
        <span className={styles.addedBy}>
          <AvatarBadge name={game.addedBy.displayName} color={game.addedBy.avatarColor} avatarUrl={game.addedBy.avatarUrl} size={16} />
          <span className={styles.addedByText}>added by {game.addedBy.displayName}</span>
        </span>

        <div className={styles.priceRow}>
          {game.ggDealsUrl ? (
            <a href={game.ggDealsUrl} target="_blank" rel="noreferrer" className={styles.buyButton}>
              <span className={styles.controllerIcon} aria-hidden="true">🎮</span>
              {formatPrice(game)}
            </a>
          ) : (
            <span className={styles.priceStatic}>
              <span className={styles.controllerIcon} aria-hidden="true">🎮</span>
              {formatPrice(game)}
            </span>
          )}
          {game.price.source === 'live' && (
            <button
              type="button"
              className={`${styles.refreshPriceButton} ${isRefreshingPrice ? styles.spinning : ''}`}
              onClick={onRefreshPrice}
              disabled={isRefreshingPrice}
              title={isRefreshingPrice ? 'Refreshing price…' : 'Check for a fresh price'}
              aria-label="Refresh price"
              aria-busy={isRefreshingPrice}
            >
              ↻
            </button>
          )}
        </div>

        {((game.price.source === 'live' && game.price.lastRefreshedAt) || game.price.historicalLow) && (
          <div className={styles.priceMetaRow}>
            {game.price.source === 'live' && game.price.lastRefreshedAt && (
              <span className={styles.lastRefreshed}>
                Updated {formatRelativeTime(game.price.lastRefreshedAt)}
              </span>
            )}
            {game.price.historicalLow && (
              <span className={styles.historicalLow} title="Lowest price this game has been tracked at">
                All-time low: {formatAmount(game.price.historicalLow, game.price.currency)}
              </span>
            )}
          </div>
        )}

        {game.price.source === 'live' && (
          <div className={styles.targetPriceRow}>
            {editingTargetPrice ? (
              <form onSubmit={handleSaveTargetPrice} className={styles.targetPriceForm}>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  autoFocus
                  className={styles.targetPriceInput}
                  value={targetPriceDraft}
                  onChange={(e) => setTargetPriceDraft(e.target.value)}
                  placeholder="Alert price"
                  aria-label="Price to alert at"
                />
                <button type="submit" className={styles.targetPriceSave}>Set</button>
                <button type="button" className={styles.targetPriceCancel} onClick={() => setEditingTargetPrice(false)}>
                  Cancel
                </button>
              </form>
            ) : game.targetPrice ? (
              <span
                className={styles.targetPricePill}
                title={`Alerts when the price drops to ${formatAmount(game.targetPrice, game.price.currency)} or below`}
              >
                🔔 {formatAmount(game.targetPrice, game.price.currency)}
                <button
                  type="button"
                  className={styles.targetPriceClear}
                  onClick={handleClearTargetPrice}
                  aria-label="Remove price alert"
                >
                  ×
                </button>
              </span>
            ) : (
              <button type="button" className={styles.targetPriceButton} onClick={startEditingTargetPrice}>
                🔔 Alert me on a price drop
              </button>
            )}
          </div>
        )}

        {coopWarning && <div className={styles.coopWarning}>⚠ {coopWarning}</div>}

        <div className={styles.divider} />

        <VoteRow myVote={game.myVote} onVote={onVote} />
        <VoteHeatmap votes={game.votes} currentUserId={currentUserId} roomMembers={roomMembers} />

        <div className={styles.footerRow}>
          <button className={styles.removeButton} onClick={handleRemove}>
            Remove Game
          </button>
        </div>
      </div>
    </div>
  );
}
