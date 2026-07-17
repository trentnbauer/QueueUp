import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { AvatarBadge } from './AvatarBadge';
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
  /** Toggles the current user's ownership claim on this game (issue #173) - only offered for room
   * games (game.ownership is null on the Personal Shelf, where there's no group to count). */
  onSetOwnership?: (owned: boolean) => void;
}

const STATUS_LABEL: Record<GameStatus, string> = {
  backlog: 'Backlog',
  playing: 'Playing',
  done: 'Done',
  dropped: 'Dropped',
  wishlist: 'Wishlist',
};

const ALL_STATUSES: GameStatus[] = ['wishlist', 'backlog', 'playing', 'done', 'dropped'];

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
  onSetOwnership,
}: GameCardProps) {
  const confirm = useConfirm();
  const [editingTargetPrice, setEditingTargetPrice] = useState(false);
  const [targetPriceDraft, setTargetPriceDraft] = useState('');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const coopWarning =
    game.maxCoopPlayers != null && memberCount != null && memberCount > game.maxCoopPlayers
      ? `Only supports ${game.maxCoopPlayers}-player co-op — this room has ${memberCount} members`
      : null;
  // historicalLow is the raw all-time-low value even when it isn't below the current price (see
  // GamePrice.historicalLow) - only worth showing as a "here's a discount" callout when it
  // actually is a real discount opportunity below what's showing right now.
  const showHistoricalLow =
    game.price.historicalLow != null && game.price.amount != null && Number(game.price.historicalLow) < Number(game.price.amount);

  useLayoutEffect(() => {
    if (!statusMenuOpen || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.top + rect.height / 2, left: rect.left + rect.width / 2 });
  }, [statusMenuOpen]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    function handlePointerDown(e: globalThis.MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      setStatusMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setStatusMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [statusMenuOpen]);

  // The whole card is the "change status" trigger rather than a dedicated pill button - but any
  // actual control inside it (vote, remove, price link/refresh, alert form) needs to keep working
  // as itself, not also pop the status menu, so a click is only treated as "open the menu" when it
  // didn't land on one of those.
  function handleCardClick(e: ReactMouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, form')) return;
    setStatusMenuOpen((v) => !v);
  }

  function handleSelectStatus(status: GameStatus) {
    setStatusMenuOpen(false);
    if (status !== game.status) onStatusChange(status);
  }

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
    <div ref={cardRef} className={styles.card} onClick={handleCardClick}>
      {game.status === 'done' && (
        <div className={styles.beatenRibbon} aria-hidden="true">
          <span className={styles.beatenRibbonText}>Beaten</span>
        </div>
      )}

      <div
        className={styles.cover}
        style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
      >
        {!game.coverImageUrl && <span className={styles.coverLabel}>COVER ART</span>}

        <div className={styles.coverOverlay}>
          {game.ggDealsUrl ? (
            <a
              href={game.ggDealsUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.title}
              style={{ textDecoration: 'none' }}
              onClick={(e) => e.stopPropagation()}
            >
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

      {/* Done already gets the diagonal "Beaten" ribbon over the cover art - this is Playing's
          equivalent big status callout, flush against the cover instead of diagonal. */}
      {game.status === 'playing' && <div className={styles.playingBanner}>Playing</div>}

      <div className={styles.body}>
        {/* Playing's banner takes the place of price/purchase info entirely - once you're playing
            it, "should I buy it" and "what's a good deal" are no longer the relevant questions. */}
        {game.status !== 'playing' && (
          <>
            <div className={styles.priceRow}>
              {game.ggDealsUrl ? (
                <a
                  href={game.ggDealsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.buyButton}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className={styles.controllerIcon} aria-hidden="true">🛒</span>
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

            {((game.price.source === 'live' && game.price.lastRefreshedAt) || showHistoricalLow) && (
              <div className={styles.priceMetaRow}>
                {game.price.source === 'live' && game.price.lastRefreshedAt && (
                  <span className={styles.lastRefreshed}>
                    Updated {formatRelativeTime(game.price.lastRefreshedAt)}
                  </span>
                )}
                {showHistoricalLow && (
                  <span className={styles.historicalLow} title="Lowest price this game has been tracked at">
                    All-time low: {formatAmount(game.price.historicalLow as string, game.price.currency)}
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
          </>
        )}

        {coopWarning && <div className={styles.coopWarning}>⚠ {coopWarning}</div>}

        <div className={styles.divider} />

        <VoteRow myVote={game.myVote} onVote={onVote} />
        <VoteHeatmap votes={game.votes} currentUserId={currentUserId} roomMembers={roomMembers} />

        {game.ownership && onSetOwnership && (
          <button
            type="button"
            className={`${styles.ownershipRow} ${game.youOwn ? styles.ownershipRowOwned : ''}`}
            onClick={() => onSetOwnership(!game.youOwn)}
            title={game.youOwn ? "You own this - click to un-mark it" : "Mark that you own this"}
          >
            <span aria-hidden="true">{game.youOwn ? '✅' : '➕'}</span>
            <span>
              {game.youOwn ? 'You own this' : 'Mark as owned'} · {game.ownership.owned}/{game.ownership.total} of the squad own this
            </span>
          </button>
        )}

        <span className={styles.addedBy}>
          <AvatarBadge name={game.addedBy.displayName} color={game.addedBy.avatarColor} avatarUrl={game.addedBy.avatarUrl} size={16} />
          <span className={styles.addedByText}>added by {game.addedBy.displayName}</span>
        </span>
      </div>

      {statusMenuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Set game status"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: 'translate(-50%, -50%)',
              background: 'var(--qu-surface2)',
              border: '1px solid var(--qu-border)',
              borderRadius: 12,
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              minWidth: 160,
              zIndex: 1000,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
            }}
          >
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={s === game.status}
                onClick={() => handleSelectStatus(s)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: s === game.status ? 'var(--qu-surface)' : 'transparent',
                  color: s === game.status ? 'var(--qu-text)' : 'var(--qu-muted)',
                  fontWeight: 700,
                  fontSize: 13.5,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}

            <div style={{ height: 1, background: 'var(--qu-border)', margin: '3px 2px' }} />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setStatusMenuOpen(false);
                handleRemove();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: '#ff8a80',
                fontWeight: 700,
                fontSize: 13.5,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              Remove Game
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
