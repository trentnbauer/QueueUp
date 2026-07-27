import { useMemo, useState, type FormEvent } from 'react';
import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { AvatarBadge } from './AvatarBadge';
import { VoteRow } from './VoteRow';
import { VoteHeatmap } from './VoteHeatmap';
import { AchievementRow } from './AchievementRow';
import { TagPicker } from './TagPicker';
import { SteamMatchPicker } from './SteamMatchPicker';
import { GameDlcModal } from './GameDlcModal';
import { useConfirm } from '../context/ConfirmContext';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { useGameAchievements } from '../hooks/useGameAchievements';
import { useSteamAutoMatch } from '../hooks/useSteamAutoMatch';
import { formatRelativeTime } from '../utils/relativeTime';
import { formatAmount, formatPrice, ggDealsSearchUrl } from '../utils/formatPrice';
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
  onSetSteamMatch: (steamAppId: number | null) => void;
  onSetTargetPrice: (targetPrice: string | null) => void;
  /** Sets (or clears, with null) a fallback dollar price (issue #385) - offered whenever there's no
   * live price to show (game.price.amount is null), for games gg.deals/Steam couldn't match at all. */
  onSetManualPrice: (manualPrice: string | null) => void;
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
  onSetSteamMatch,
  onSetTargetPrice,
  onSetManualPrice,
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
  const [editingManualPrice, setEditingManualPrice] = useState(false);
  const [manualPriceDraft, setManualPriceDraft] = useState('');
  const [dlcModalOpen, setDlcModalOpen] = useState(false);
  const { checkingGameId, pickerGameId, attemptAutoMatch, openPicker, closePicker } = useSteamAutoMatch();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const hasSteamMatch = game.price.source === 'live' || game.ggDealsUrl !== null;
  const isCheckingMatch = checkingGameId === game.id;
  const { players: achievementPlayers, isLoading: achievementsLoading } = useGameAchievements(game.id);

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

  // Issue #338: "link DLC back to the main game" - a DLC's baseGameId is set automatically at
  // intake (see linkDlcToBaseGame), never user-editable, so this is a plain lookup rather than a
  // dropdown like "Play after" above. Falls back to nothing shown if the base game itself was since
  // removed (SetNull on delete) or roomGames wasn't passed in for this context.
  const baseGame = game.baseGameId ? (roomGames ?? []).find((g) => g.id === game.baseGameId) : undefined;

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

  function startEditingManualPrice() {
    setManualPriceDraft(game.manualPrice ?? '');
    setEditingManualPrice(true);
  }

  function handleSaveManualPrice(e: FormEvent) {
    e.preventDefault();
    const value = manualPriceDraft.trim();
    if (!value) return;
    onSetManualPrice(value);
    setEditingManualPrice(false);
  }

  function handleClearManualPrice() {
    onSetManualPrice(null);
    setEditingManualPrice(false);
  }

  // Issue #336: an owned game with no specific gg.deals listing on file (Steam match never
  // resolved, or resolved to nothing) used to render as a dead, greyed-out pill - no href, no
  // click handler, just a visual dead end. Rather than silently doing nothing, confirms the
  // (already-known) fact that this game is owned and offers a way to look it up manually anyway -
  // gifting, checking a DLC/edition price, or just double-checking - instead of pretending there's
  // nothing left to do here.
  async function handleOwnedNoPriceClick() {
    const ok = await confirm({
      title: 'You already own this game',
      message: `QueueUp doesn't have a specific gg.deals listing for "${game.title}" yet - want to look it up there anyway?`,
      confirmLabel: 'Search gg.deals',
      cancelLabel: 'Cancel',
    });
    if (ok) window.open(ggDealsSearchUrl(game.title), '_blank', 'noopener,noreferrer');
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
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
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
            {/* IGDB review score (issue #311) - moved here from the card face (list view), which
                stayed deliberately minimal - also nudges Spin the Wheel's weighted pick toward
                better-reviewed games (see spinCandidateWeight), surfaced here so that's not an
                invisible thumb on the scale. */}
            {game.reviewScore !== null && (
              <span className={styles.genre} title={`IGDB review score: ${game.reviewScore}/100`}>
                ⭐ {game.reviewScore}/100
              </span>
            )}
            {baseGame && <span className={styles.genre}>DLC for {baseGame.title}</span>}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Playing's (and Replay's - already owned and about to be played again) status section
            takes the place of price/purchase info entirely - once you're playing it, "should I
            buy it" and "what's a good deal" are no longer relevant. */}
        {game.status !== 'playing' && game.status !== 'replay' && (
          <>
            <div className={cardStyles.priceRow}>
              {game.ggDealsUrl ? (
                <a href={game.ggDealsUrl} target="_blank" rel="noreferrer" className={cardStyles.buyButton}>
                  <span className={cardStyles.controllerIcon} aria-hidden="true">🛒</span>
                  {formatPrice(game)}
                </a>
              ) : game.youOwn ? (
                <button
                  type="button"
                  className={`${cardStyles.priceStatic} ${cardStyles.priceStaticButton}`}
                  onClick={handleOwnedNoPriceClick}
                >
                  <span className={cardStyles.controllerIcon} aria-hidden="true">🎮</span>
                  {formatPrice(game)}
                </button>
              ) : (
                <span className={cardStyles.priceStatic}>
                  <span className={cardStyles.controllerIcon} aria-hidden="true">🎮</span>
                  {formatPrice(game)}
                </span>
              )}
              {/* Shown even when price is 'unavailable', not just 'live' - a game added right
                  around release (before IGDB had linked its Steam App ID yet) gets stuck
                  unavailable forever with no other way to retry once that link catches up. */}
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

            {/* Issue #385: some games just aren't findable on gg.deals/Steam at all (e.g. an
                obscure/misspelled listing) - rather than a dead-end "—", lets someone note the
                price they already know from elsewhere. Only offered once there's genuinely no live
                amount to show; a live price is always more current than a manually typed one. */}
            {game.price.amount === null && (
              <div className={cardStyles.targetPriceRow}>
                {editingManualPrice ? (
                  <form onSubmit={handleSaveManualPrice} className={cardStyles.targetPriceForm}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      autoFocus
                      className={cardStyles.targetPriceInput}
                      value={manualPriceDraft}
                      onChange={(e) => setManualPriceDraft(e.target.value)}
                      placeholder="Price"
                      aria-label="Fallback price"
                    />
                    <button type="submit" className={cardStyles.targetPriceSave}>Set</button>
                    <button type="button" className={cardStyles.targetPriceCancel} onClick={() => setEditingManualPrice(false)}>
                      Cancel
                    </button>
                  </form>
                ) : game.manualPrice ? (
                  <span
                    className={cardStyles.targetPricePill}
                    title="Manually set - QueueUp couldn't look up a live price for this game"
                  >
                    ✏️ {formatAmount(game.manualPrice, game.price.currency ?? 'USD')}
                    <button
                      type="button"
                      className={cardStyles.targetPriceClear}
                      onClick={handleClearManualPrice}
                      aria-label="Remove manual price"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <button type="button" className={cardStyles.targetPriceButton} onClick={startEditingManualPrice}>
                    ✏️ Set a price manually
                  </button>
                )}
              </div>
            )}

            {/* Always available, not just when unavailable - the automatic match (IGDB, then an
                exact-title Steam search) can pick the wrong edition/remaster for a live price too.
                Only the unmatched case (issue #337) tries a silent auto-match first - a person
                flagging an existing match as wrong goes straight to the picker, since silently
                reapplying the same single-result search would likely reproduce that same match. */}
            <button
              type="button"
              className={cardStyles.fixMatchLink}
              disabled={isCheckingMatch}
              onClick={() =>
                hasSteamMatch ? openPicker(game.id) : attemptAutoMatch(game.id, game.title, onSetSteamMatch)
              }
            >
              {isCheckingMatch ? 'Checking…' : hasSteamMatch ? 'Wrong game matched?' : 'Not finding a price? Fix match'}
            </button>

            {pickerGameId === game.id && (
              <SteamMatchPicker
                gameId={game.id}
                gameTitle={game.title}
                hasExistingMatch={hasSteamMatch}
                onMatched={(steamAppId) => {
                  onSetSteamMatch(steamAppId);
                  closePicker();
                }}
                onClose={closePicker}
              />
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
        <AchievementRow
          players={achievementPlayers}
          currentUserId={currentUserId}
          isLoading={achievementsLoading}
          roomMembers={roomMembers}
        />

        {suggestDone && (
          <div className={styles.doneSuggestion}>
            <span>🏆 Looks like you've 100%'d this — mark it Beaten?</span>
            <button type="button" className={styles.doneSuggestionButton} onClick={() => onStatusChange('done')}>
              Mark Beaten
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

        {/* Hidden for a game that's itself DLC (game.baseGameId set) - avoids a "DLC of DLC"
            browse loop, and matches the issue's own framing of this as a base-game action. */}
        {game.baseGameId === null && (
          <>
            <div className={styles.divider} />
            <div className={styles.sectionTitle}>DLC</div>
            <button type="button" className={styles.viewDlcButton} onClick={() => setDlcModalOpen(true)}>
              View DLC for this game
            </button>
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

        {dlcModalOpen && <GameDlcModal game={game} onClose={() => setDlcModalOpen(false)} />}
      </div>
    </div>
  );
}
