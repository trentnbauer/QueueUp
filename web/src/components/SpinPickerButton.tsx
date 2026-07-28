import { useState } from 'react';
import type { Game, GameStatus, SpinWheelTheme } from '@queueup/shared';
import { backlogGames, isFullyOwned, hasSteamMatch, underPriceCap, spinCandidates } from './gameGridLogic';
import { SpinWheelModal } from './SpinWheelModal';
import { SteamMatchPicker } from './SteamMatchPicker';
import { useSteamAutoMatch } from '../hooks/useSteamAutoMatch';
import { useRoomSpin } from '../hooks/useRoomSpin';
import styles from './SpinPickerButton.module.css';

interface SpinPickerButtonProps {
  games: Game[];
  /** Set only in a room (undefined on the Personal Shelf) - switches this button from opening a
   * fully-local, single-viewer spin to starting/joining the room's shared session (issue #356
   * follow-up), which every member currently viewing the room sees and can shake, via
   * useRoomSpin. */
  roomId?: string;
  /** Room Settings dollar threshold (issue #339, replacing the old spinOnlyFullyOwned toggle) -
   * eligible games are ones every current member owns, plus ones with a live price at or under
   * this amount. Undefined on the Personal Shelf, which has no group of members to own anything
   * "fully" and so no threshold setting of its own. */
  spinOwnershipMaxPrice?: number;
  /** Room Settings choice of presentation (issue #297) - undefined on the Personal Shelf, which
   * has no room/theme setting of its own; SpinWheelModal defaults to the slot machine either way.
   * Ignored in a room - the shared session's already-resolved theme takes over instead. */
  spinWheelTheme?: SpinWheelTheme;
  /** Lets a game get linked to a Steam store listing so its live price can be checked against
   * spinOwnershipMaxPrice (issue #339) - same mutation GameCard/GameDetailModal already use.
   * Undefined on the Personal Shelf, alongside spinOwnershipMaxPrice. */
  onSetSteamMatch?: (gameId: string, steamAppId: number | null) => void;
  /** Marks the spin's winner Playing once someone hits "Let's play" in the reveal panel. */
  onStatusChange: (gameId: string, status: GameStatus) => void;
}

/** Header action button that picks tonight's game (issue #356) - previously a tile sitting in the
 * games grid itself, taking up a whole card's worth of space permanently just to be a launcher for
 * SpinWheelModal. Moved next to Add Game/Filters instead, freeing that space back up for the
 * actual games list. Opens the same SpinWheelModal reveal; this component only decides whether
 * there's anything to draw from and (issue #339) walks any price-undecided backlog games through
 * the silent Steam auto-match first, same as the tile it replaces. */
export function SpinPickerButton({ games, roomId, spinOwnershipMaxPrice, spinWheelTheme, onSetSteamMatch, onStatusChange }: SpinPickerButtonProps) {
  const [open, setOpen] = useState(false);
  // The shared spin's own id, once the *local* viewer has dismissed it (closed the modal without
  // committing) - tracked so a still-active room spin (see RoomSpin) doesn't immediately reopen
  // for just them on the next poll while it's still up for everyone else. Clicking the button
  // again clears this, same as any other "look again" action. A new spin (different id, e.g.
  // after "Let's play" ends this one and someone starts another) is unaffected.
  const [dismissedSpinId, setDismissedSpinId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  // Games we've already run the silent auto-match search for this visit - tracked so a game whose
  // search came back ambiguous/empty isn't silently re-searched every time the button is clicked;
  // it goes straight to the manual picker instead.
  const [checkedGameIds, setCheckedGameIds] = useState<Set<string>>(new Set());
  const { pickerGameId, attemptAutoMatch, closePicker } = useSteamAutoMatch();
  const { spin, startSpin, nudgeSpin, restartSpin, skipWaitSpin, closeSpin } = useRoomSpin(roomId);

  const backlog = backlogGames(games);
  const gated = spinOwnershipMaxPrice !== undefined;
  const candidates = spinCandidates(games, spinOwnershipMaxPrice);
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

  function openSpin() {
    if (roomId) {
      setDismissedSpinId(null);
      startSpin().catch(() => {});
    } else {
      setOpen(true);
    }
  }

  async function handleClick() {
    if (!onSetSteamMatch) {
      openSpin();
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
      openSpin();
    } finally {
      setResolving(false);
    }
  }

  const pickerGame = pickerGameId ? games.find((g) => g.id === pickerGameId) : undefined;
  const showRoomSpin = roomId !== undefined && spin !== null && spin.id !== dismissedSpinId;

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

      {!roomId && open && (
        <SpinWheelModal
          games={games}
          candidates={candidates}
          theme={spinWheelTheme}
          onStatusChange={onStatusChange}
          onClose={() => setOpen(false)}
        />
      )}

      {showRoomSpin && spin && (
        <SpinWheelModal
          games={games}
          candidates={candidates}
          onStatusChange={onStatusChange}
          onClose={() => setDismissedSpinId(spin.id)}
          session={{
            spin,
            onNudge: (direction) => {
              nudgeSpin(direction).catch(() => {});
            },
            onRestart: () => {
              restartSpin().catch(() => {});
            },
            onSkipWait: () => {
              skipWaitSpin().catch(() => {});
            },
            onCommit: () => {
              closeSpin().catch(() => {});
            },
          }}
        />
      )}
    </>
  );
}
