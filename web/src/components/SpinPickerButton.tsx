import { useState } from 'react';
import type { Game, SpinWheelTheme } from '@queueup/shared';
import { backlogGames, isFullyOwned } from './gameGridLogic';
import { SpinWheelModal } from './SpinWheelModal';
import { SteamMatchPicker } from './SteamMatchPicker';
import { useSteamAutoMatch } from '../hooks/useSteamAutoMatch';
import styles from './SpinPickerButton.module.css';

interface SpinPickerButtonProps {
  games: Game[];
  /** Room Settings dollar threshold (issue #339, replacing the old spinOnlyFullyOwned toggle) -
   * eligible games are ones every current member owns, plus ones with a live price at or under
   * this amount. Undefined on the Personal Shelf, which has no group of members to own anything
   * "fully" and so no threshold setting of its own. */
  spinOwnershipMaxPrice?: number;
  /** Room Settings choice of presentation (issue #297) - undefined on the Personal Shelf, which
   * has no room/theme setting of its own; SpinWheelModal defaults to the slot machine either way. */
  spinWheelTheme?: SpinWheelTheme;
  /** Lets a game get linked to a Steam store listing so its live price can be checked against
   * spinOwnershipMaxPrice (issue #339) - same mutation GameCard/GameDetailModal already use.
   * Undefined on the Personal Shelf, alongside spinOwnershipMaxPrice. */
  onSetSteamMatch?: (gameId: string, steamAppId: number | null) => void;
}

function hasSteamMatch(game: Game): boolean {
  return game.price.source === 'live' || game.ggDealsUrl !== null;
}

/** undefined maxPrice means no threshold is set at all (Personal Shelf) - never satisfied by price. */
function underPriceCap(game: Game, maxPrice: number | undefined): boolean {
  if (maxPrice === undefined) return false;
  return game.price.source === 'live' && game.price.amount !== null && Number(game.price.amount) <= maxPrice;
}

/** Header action button that picks tonight's game (issue #356) - previously a tile sitting in the
 * games grid itself, taking up a whole card's worth of space permanently just to be a launcher for
 * SpinWheelModal. Moved next to Add Game/Filters instead, freeing that space back up for the
 * actual games list. Opens the same SpinWheelModal reveal; this component only decides whether
 * there's anything to draw from and (issue #339) walks any price-undecided backlog games through
 * the silent Steam auto-match first, same as the tile it replaces. */
export function SpinPickerButton({ games, spinOwnershipMaxPrice, spinWheelTheme, onSetSteamMatch }: SpinPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  // Games we've already run the silent auto-match search for this visit - tracked so a game whose
  // search came back ambiguous/empty isn't silently re-searched every time the button is clicked;
  // it goes straight to the manual picker instead.
  const [checkedGameIds, setCheckedGameIds] = useState<Set<string>>(new Set());
  const { pickerGameId, attemptAutoMatch, closePicker } = useSteamAutoMatch();

  const backlog = backlogGames(games);
  const gated = spinOwnershipMaxPrice !== undefined;
  const candidates = gated
    ? backlog.filter((g) => isFullyOwned(g) || underPriceCap(g, spinOwnershipMaxPrice))
    : backlog;
  const locked = candidates.length === 0;

  // Not fully owned, not already known to be cheap enough, and never matched to a Steam listing -
  // these are the ones spinOwnershipMaxPrice can't yet judge, because we don't know their price.
  const undecided = gated
    ? backlog.filter((g) => !isFullyOwned(g) && !underPriceCap(g, spinOwnershipMaxPrice) && !hasSteamMatch(g))
    : [];

  const hint = locked
    ? gated
      ? `No backlog game is owned by everyone or priced at $${spinOwnershipMaxPrice} or under yet`
      : 'Add a backlog game to unlock'
    : `Picks from your ${candidates.length}-game backlog`;

  async function handleClick() {
    if (!onSetSteamMatch) {
      setOpen(true);
      return;
    }
    setResolving(true);
    try {
      for (const game of undecided) {
        if (checkedGameIds.has(game.id)) continue;
        setCheckedGameIds((prev) => new Set(prev).add(game.id));
        let resolved: number | null | undefined;
        // eslint-disable-next-line no-await-in-loop
        await attemptAutoMatch(game.id, game.title, (steamAppId) => {
          resolved = steamAppId;
          onSetSteamMatch(game.id, steamAppId);
        });
        if (resolved === undefined) {
          // Ambiguous or no results - useSteamAutoMatch has opened the manual picker for this
          // game. Stop here; the person can click again once they've resolved (or skipped past)
          // it, same as if they'd never clicked at all.
          return;
        }
      }
      setOpen(true);
    } finally {
      setResolving(false);
    }
  }

  const pickerGame = pickerGameId ? games.find((g) => g.id === pickerGameId) : undefined;

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        disabled={locked || resolving}
        title={hint}
      >
        🎲 {resolving ? 'Checking prices…' : 'Pick a Game'}
      </button>

      {pickerGame && (
        <SteamMatchPicker
          gameId={pickerGame.id}
          gameTitle={pickerGame.title}
          hasExistingMatch={hasSteamMatch(pickerGame)}
          onMatched={(steamAppId) => {
            onSetSteamMatch?.(pickerGame.id, steamAppId);
            closePicker();
          }}
          onClose={closePicker}
        />
      )}

      {open && (
        <SpinWheelModal games={games} candidates={candidates} theme={spinWheelTheme} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
