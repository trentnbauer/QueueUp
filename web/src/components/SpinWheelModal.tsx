import { useEffect, useMemo, useState } from 'react';
import type { ConcreteSpinWheelTheme, Game, GameStatus, SpinWheelTheme } from '@queueup/shared';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { pickSpinWinner, avoidedGenres, spinCandidateWeight } from './gameGridLogic';
import { ConfettiBurst } from './ConfettiBurst';
import { SpinThemeRenderer } from './spinThemes/SpinThemeRenderer';
import { resolveConcreteTheme } from './spinThemes/resolveTheme';
import { formatPrice } from '../utils/formatPrice';
import styles from './SpinWheelModal.module.css';

/** A room's shared spin (see RoomSpinSession/useRoomSpin) - when set, this modal renders *that*
 * winner/theme instead of picking its own, and every reroll goes through `onShake` instead of a
 * purely local spinKey bump, so every member currently looking at the room sees the identical
 * winner/animation-restart, not just whoever's clicking. Absent on the Personal Shelf, which has
 * no room to share a spin with and keeps the original fully-local behavior below. */
interface SharedSpinSession {
  winner: Game;
  theme: ConcreteSpinWheelTheme;
  shakeCount: number;
  onShake: () => void;
  /** True while a shake request is in flight - ignored (not disabled) so a click still feels
   * responsive, just not re-sent until the last one resolves. */
  shaking: boolean;
  /** Ends the session for every member - fired only once a winner's actually committed to
   * ("Let's play"), never for a plain dismiss (see RoomSpin's schema doc: closing the modal is
   * local/per-viewer only). */
  onCommit: () => void;
}

interface SpinWheelModalProps {
  games: Game[];
  candidates: Game[];
  /** Which presentation to use - room-settable (issue #297), defaults to the original slot machine
   * on the Personal Shelf (which has no room, so no theme setting of its own). Ignored when
   * `session` is set - the room's already-resolved concrete theme takes over instead. */
  theme?: SpinWheelTheme;
  session?: SharedSpinSession;
  /** Marks the winner Playing before closing - "Let's play" is the one moment someone's actually
   * committing to tonight's pick, so it should land in the Currently Playing strip immediately
   * rather than requiring a separate manual status change afterward. */
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onClose: () => void;
}

/** The shared dispatcher every Spin the Wheel theme renders through (issue #297): picks the winner
 * once per spin, resolves "random" to a concrete theme, hands both to whichever theme component
 * is selected, and owns the reveal panel + confetti celebration so no theme has to reimplement
 * either. A theme's only job is its own pre-reveal animation, ending with a call to onRevealed.
 *
 * Clicking anywhere on the theme animation "shakes" it and rerolls the winner (issue #356 follow-
 * up) - the same reroll "Spin again" already did post-reveal, just also reachable mid-animation
 * and (in a room, via `session`) shared with everyone watching instead of only the clicker. */
export function SpinWheelModal({ games, candidates, theme = 'slot', session, onStatusChange, onClose }: SpinWheelModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [localSpinKey, setLocalSpinKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Plays a quick wiggle on click regardless of local/session mode, independent of how long the
  // actual reroll (instant locally, a round-trip in a room) takes to land - the shake should feel
  // immediate even before a new winner shows up.
  const [shaking, setShaking] = useState(false);

  const spinKey = session ? session.shakeCount : localSpinKey;

  // Locked in once per spinKey ("Spin again"/shake) - re-derived only when it changes, not on
  // every prop change, so a background refetch of `games` (e.g. someone else votes while this is
  // open) can't silently swap the winner out from under an animation that's already playing or
  // already revealed. The concrete theme (if "random") is re-rolled on that same cadence, so it
  // stays a surprise across repeat spins rather than locking in on first open. Skipped entirely in
  // session mode - the room's server-picked winner/theme are used as-is instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localWinner = useMemo(() => (session ? null : pickSpinWinner(games, candidates)), [spinKey, session]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const localConcreteTheme = useMemo(() => resolveConcreteTheme(theme), [theme, spinKey]);
  const winner = session ? session.winner : localWinner;
  const concreteTheme = session ? session.theme : localConcreteTheme;

  // Same "locked in once per spinKey" reasoning as winner/concreteTheme above - the roulette theme
  // (issue #355) sizes each slice by its actual odds, which should stay fixed for the duration of
  // one spin's animation even if `games` changes underneath it (someone else voting, say). Uses
  // the live `games`/`candidates` either way (both already agree across every member's client -
  // see spinCandidates in packages/shared), not anything room-specific from `session`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const candidateWeights = useMemo(() => {
    const avoided = avoidedGenres(games);
    return new Map(candidates.map((g) => [g.id, spinCandidateWeight(g, avoided)]));
  }, [spinKey]);

  useEffect(() => {
    setRevealed(false);
  }, [spinKey]);

  function handleReroll() {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
    if (session) {
      if (!session.shaking) session.onShake();
    } else {
      setLocalSpinKey((k) => k + 1);
    }
  }

  if (!winner) return null;

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Spin the Wheel"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>🎰 Spin the Wheel</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <button
          type="button"
          className={`${styles.shakeArea} ${shaking ? styles.shaking : ''}`}
          onClick={handleReroll}
          title="Click to shake and reroll"
        >
          <SpinThemeRenderer
            theme={concreteTheme}
            candidates={candidates}
            winner={winner}
            candidateWeights={candidateWeights}
            spinKey={spinKey}
            onRevealed={() => setRevealed(true)}
          />
        </button>

        <div className={styles.revealZone} aria-live="polite">
          {revealed && (
            <>
              <div className={styles.revealLabel}>Tonight's pick</div>
              <div className={styles.revealTitle}>{winner.title}</div>
              {winner.timeToBeatHours != null && (
                <div className={styles.revealTimeToBeat}>~{winner.timeToBeatHours}h to beat</div>
              )}
              <div className={styles.revealPrice}>{formatPrice(winner)}</div>
              <div className={styles.actions}>
                <button type="button" className={styles.spinAgainButton} onClick={handleReroll}>
                  Spin again
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    onStatusChange(winner.id, 'playing');
                    session?.onCommit();
                    onClose();
                  }}
                >
                  Let's play
                </button>
              </div>
            </>
          )}
        </div>

        {/* Celebrates the reveal (issue #296) - keyed on spinKey so "Spin again"/a shake mounts a
            fresh burst with its own random particles instead of reusing/replaying the previous one. */}
        {revealed && <ConfettiBurst key={spinKey} />}
      </div>
    </div>
  );
}
