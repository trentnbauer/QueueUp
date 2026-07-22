import { useMemo, useState, type FormEvent } from 'react';
import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { AvatarBadge } from './AvatarBadge';
import { VoteRow } from './VoteRow';
import { VoteHeatmap } from './VoteHeatmap';
import { AchievementRow } from './AchievementRow';
import { TagPicker } from './TagPicker';
import { useConfirm } from '../context/ConfirmContext';
import { useModalA11y } from '../hooks/useModalA11y';
import { useGameAchievements } from '../hooks/useGameAchievements';
import { formatRelativeTime } from '../utils/relativeTime';
import { formatAmount, formatPrice } from '../utils/formatPrice';
import { GAME_STATUS_LABEL, GAME_STATUS_LIST, defaultPrerequisite } from './gameGridLogic';
import cardStyles from './GameCard.module.css';
import styles from './GameDetailModal.module.css';

interface GameDetailModalProps {
  game: Game;
  currentUserId: string;
  memberCount?: number;
  roomMembers?: User[];
  onStatusChange: (status: GameStatus) => void;
  onVote: (value: VoteValue) => void;
  onRemove: () => void;
  onRefreshPrice: () => void;
  isRefreshingPrice?: boolean;
  onSetTargetPrice: (targetPrice: string | null) => void;
  onSetOwnership?: (owned: boolean) => void;
  /** Finds-or-creates a tag by name and applies it to this game (issue #247). */
  onApplyTag: (name: string) => Promise<void>;
  onRemoveTag: (tagId: string) => void;
  /** Every other game in this room, for the "Play after" dropdown - undefined on the Personal
   * Shelf, same as roomMembers/onSetOwnership, since there's no comparable group of games there. */
  roomGames?: Game[];
  onSetPrerequisite?: (prerequisiteGameId: string | null) => void;
  onClose: () => void;
}

/** Everything a card used to show inline (price detail, votes, ownership, status, remove) now
 * lives here instead - the card face is just cover/title/price so the shelf/room grid stays
 * scannable, and this is where you go to actually do anything with a game. */
export function GameDetailModal({
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
  onApplyTag,
  onRemoveTag,
  roomGames,
  onSetPrerequisite,
  onClose,
}: GameDetailModalProps) {
  const confirm = useConfirm();
  const [editingTargetPrice, setEditingTargetPrice] = useState(false);
  const [targetPriceDraft, setTargetPriceDraft] = useState('');
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const { players: achievementPlayers } = useGameAchievements(game.id);

  // Every other game in this room, alphabetical for easy scanning in the dropdown. Only shown at
  // all for a room game with roomGames actually passed in - see onSetPrerequisite's doc comment.
  const otherRoomGames = useMemo(
    () => (roomGames ?? []).filter((g) => g.id !== game.id).sort((a, b) => a.title.localeCompare(b.title)),
    [roomGames, game.id],
  );
  // Falls back to the closest-released earlier same-collection game already in the room (e.g.
  // Borderlands 2 -> Borderlands 1) when nothing's been explicitly set yet - purely a display-time
  // suggestion, not persisted until the user actually picks something in the dropdown (even if
  // that happens to be the same suggested game).
  const selectedPrerequisiteId = game.prerequisiteGameId ?? defaultPrerequisite(game, roomGames ?? [])?.id ?? '';

  // A nudge, not an automatic status change (issue #227) - the viewer's own Steam achievement
  // progress on this game, when they've 100%'d it and it isn't already Done/Dropped. Playtime
  // would be another signal here, but it isn't persisted anywhere yet (Steam library import only
  // fetches it transiently to sort the import queue), so this starts with the one signal already
  // on hand from the achievements fetch above.
  const myAchievements = achievementPlayers.find((p) => p.user.id === currentUserId);
  const suggestDone =
    myAchievements != null &&
    myAchievements.total > 0 &&
    myAchievements.unlocked === myAchievements.total &&
    game.status !== 'done' &&
    game.status !== 'dropped';

  // Full breakdown (issue #248) - IGDB's game_time_to_beats endpoint returns three figures that
  // are strictly ordered for any given game (rushed < main story < completionist), so they're
  // shown in ascending order here. Only the tiers IGDB actually has data for are shown; a game
  // with just one figure on file still reads fine as a single "Main Story ~Xh" entry.
  const timeToBeatParts = [
    game.timeToBeatRushedHours != null && `Rushed ~${game.timeToBeatRushedHours}h`,
    game.timeToBeatHours != null && `Main Story ~${game.timeToBeatHours}h`,
    game.timeToBeatCompletionistHours != null && `Completionist ~${game.timeToBeatCompletionistHours}h`,
  ].filter((part): part is string => part !== false);

  const coopWarning =
    game.maxCoopPlayers != null && memberCount != null && memberCount > game.maxCoopPlayers
      ? `Only supports ${game.maxCoopPlayers}-player co-op — this room has ${memberCount} members`
      : null;
  // historicalLow is the raw all-time-low value even when it isn't below the current price (see
  // GamePrice.historicalLow) - only worth showing as a "here's a discount" callout when it
  // actually is a real discount opportunity below what's showing right now.
  const showHistoricalLow =
    game.price.historicalLow != null && game.price.amount != null && Number(game.price.historicalLow) < Number(game.price.amount);

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
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={game.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div
            className={styles.thumb}
            style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
          />
          <div className={styles.headerText}>
            <span className={styles.title}>{game.title}</span>
            <span className={styles.genre}>{game.genre ?? '—'}</span>
            {timeToBeatParts.length > 0 && <span className={styles.genre}>{timeToBeatParts.join(' · ')}</span>}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Playing's status section takes the place of price/purchase info entirely - once
            you're playing it, "should I buy it" and "what's a good deal" are no longer relevant. */}
        {game.status !== 'playing' && (
          <>
            <div className={cardStyles.priceRow}>
              {game.ggDealsUrl ? (
                <a href={game.ggDealsUrl} target="_blank" rel="noreferrer" className={cardStyles.buyButton}>
                  <span className={cardStyles.controllerIcon} aria-hidden="true">🛒</span>
                  {formatPrice(game)}
                </a>
              ) : (
                <span className={cardStyles.priceStatic}>
                  <span className={cardStyles.controllerIcon} aria-hidden="true">🎮</span>
                  {formatPrice(game)}
                </span>
              )}
              {game.price.source === 'live' && (
                <button
                  type="button"
                  className={`${cardStyles.refreshPriceButton} ${isRefreshingPrice ? cardStyles.spinning : ''}`}
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
              <div className={cardStyles.priceMetaRow}>
                {game.price.source === 'live' && game.price.lastRefreshedAt && (
                  <span className={cardStyles.lastRefreshed}>Updated {formatRelativeTime(game.price.lastRefreshedAt)}</span>
                )}
                {showHistoricalLow && (
                  <span className={cardStyles.historicalLow} title="Lowest price this game has been tracked at">
                    All-time low: {formatAmount(game.price.historicalLow as string, game.price.currency)}
                  </span>
                )}
              </div>
            )}

            {game.price.source === 'live' && (
              <div className={cardStyles.targetPriceRow}>
                {editingTargetPrice ? (
                  <form onSubmit={handleSaveTargetPrice} className={cardStyles.targetPriceForm}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      autoFocus
                      className={cardStyles.targetPriceInput}
                      value={targetPriceDraft}
                      onChange={(e) => setTargetPriceDraft(e.target.value)}
                      placeholder="Alert price"
                      aria-label="Price to alert at"
                    />
                    <button type="submit" className={cardStyles.targetPriceSave}>Set</button>
                    <button type="button" className={cardStyles.targetPriceCancel} onClick={() => setEditingTargetPrice(false)}>
                      Cancel
                    </button>
                  </form>
                ) : game.targetPrice ? (
                  <span
                    className={cardStyles.targetPricePill}
                    title={`Alerts when the price drops to ${formatAmount(game.targetPrice, game.price.currency)} or below`}
                  >
                    🔔 {formatAmount(game.targetPrice, game.price.currency)}
                    <button
                      type="button"
                      className={cardStyles.targetPriceClear}
                      onClick={handleClearTargetPrice}
                      aria-label="Remove price alert"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <button type="button" className={cardStyles.targetPriceButton} onClick={startEditingTargetPrice}>
                    🔔 Alert me on a price drop
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {coopWarning && <div className={cardStyles.coopWarning}>⚠ {coopWarning}</div>}

        <div className={styles.divider} />

        <VoteRow myVote={game.myVote} onVote={onVote} />
        <VoteHeatmap votes={game.votes} currentUserId={currentUserId} roomMembers={roomMembers} />
        <AchievementRow players={achievementPlayers} currentUserId={currentUserId} />

        {suggestDone && (
          <div className={styles.doneSuggestion}>
            <span>🏆 Looks like you've 100%'d this — mark it Done?</span>
            <button type="button" className={styles.doneSuggestionButton} onClick={() => onStatusChange('done')}>
              Mark Done
            </button>
          </div>
        )}

        {game.ownership && onSetOwnership && (
          <button
            type="button"
            className={`${cardStyles.ownershipRow} ${game.youOwn ? cardStyles.ownershipRowOwned : ''}`}
            onClick={() => onSetOwnership(!game.youOwn)}
            title={game.youOwn ? "You own this - click to un-mark it" : "Mark that you own this"}
          >
            <span aria-hidden="true">{game.youOwn ? '✅' : '➕'}</span>
            <span>
              {game.youOwn ? 'You own this' : 'Mark as owned'} · {game.ownership.owned}/{game.ownership.total} of the squad own this
            </span>
          </button>
        )}

        {/* Tags are a personal filing scheme (issue #247) - only the game's adder can apply/remove
            one (see requireGameTagAccess server-side), so the whole section is hidden for a room
            game someone else added rather than showing controls that would just 403. */}
        {game.addedBy.id === currentUserId && (
          <>
            <div className={styles.divider} />
            <div className={styles.sectionTitle}>Tags</div>
            <TagPicker currentTags={game.tags} onApply={onApplyTag} onRemove={onRemoveTag} />
          </>
        )}

        {/* Room games only - there's no comparable "other games in this shelf" grouping to pick
            from on the Personal Shelf, same reasoning as onSetOwnership above. */}
        {game.roomId !== null && roomGames && onSetPrerequisite && (
          <>
            <div className={styles.divider} />
            <div className={styles.sectionTitle}>Play after</div>
            <select
              className={styles.playAfterSelect}
              value={selectedPrerequisiteId}
              onChange={(e) => onSetPrerequisite(e.target.value || null)}
              aria-label="Play after"
            >
              <option value="">— None —</option>
              {otherRoomGames.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </>
        )}

        <div className={styles.divider} />

        <div className={styles.sectionTitle}>Status</div>
        <div className={styles.statusList}>
          {GAME_STATUS_LIST.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === game.status}
              className={`${styles.statusButton} ${s === game.status ? styles.statusButtonActive : ''}`}
              onClick={() => onStatusChange(s)}
            >
              {GAME_STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className={styles.footer}>
          <span className={cardStyles.addedBy}>
            <AvatarBadge name={game.addedBy.displayName} color={game.addedBy.avatarColor} avatarUrl={game.addedBy.avatarUrl} size={16} />
            <span className={cardStyles.addedByText}>added by {game.addedBy.displayName}</span>
          </span>
          <button type="button" className={styles.removeButton} onClick={handleRemove}>
            Remove Game
          </button>
        </div>
      </div>
    </div>
  );
}
