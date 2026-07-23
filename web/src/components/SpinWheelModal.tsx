import { useEffect, useMemo, useState } from 'react';
import type { Game, SpinWheelTheme } from '@queueup/shared';
import { useModalA11y } from '../hooks/useModalA11y';
import { pickSpinWinner } from './gameGridLogic';
import { ConfettiBurst } from './ConfettiBurst';
import { SpinThemeRenderer } from './spinThemes/SpinThemeRenderer';
import { resolveConcreteTheme } from './spinThemes/resolveTheme';
import { formatPrice } from '../utils/formatPrice';
import styles from './SpinWheelModal.module.css';

interface SpinWheelModalProps {
  games: Game[];
  candidates: Game[];
  /** Which presentation to use - room-settable (issue #297), defaults to the original slot machine
   * on the Personal Shelf (which has no room, so no theme setting of its own). */
  theme?: SpinWheelTheme;
  onClose: () => void;
}

/** The shared dispatcher every Spin the Wheel theme renders through (issue #297): picks the winner
 * once per spin, resolves "random" to a concrete theme, hands both to whichever theme component
 * is selected, and owns the reveal panel + confetti celebration so no theme has to reimplement
 * either. A theme's only job is its own pre-reveal animation, ending with a call to onRevealed. */
export function SpinWheelModal({ games, candidates, theme = 'slot', onClose }: SpinWheelModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [spinKey, setSpinKey] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // Locked in once per spinKey ("Spin again") - re-derived only when the user hits it, not on
  // every prop change, so a background refetch of `games` (e.g. someone else votes while this is
  // open) can't silently swap the winner out from under an animation that's already playing or
  // already revealed. The concrete theme (if "random") is re-rolled on that same cadence, so it
  // stays a surprise across repeat spins rather than locking in on first open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const winner = useMemo(() => pickSpinWinner(games, candidates), [spinKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const concreteTheme = useMemo(() => resolveConcreteTheme(theme), [theme, spinKey]);

  useEffect(() => {
    setRevealed(false);
  }, [spinKey]);

  if (!winner) return null;

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
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

        <SpinThemeRenderer
          theme={concreteTheme}
          candidates={candidates}
          winner={winner}
          spinKey={spinKey}
          onRevealed={() => setRevealed(true)}
        />

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
                <button type="button" className={styles.spinAgainButton} onClick={() => setSpinKey((k) => k + 1)}>
                  Spin again
                </button>
                <button type="button" className={styles.primaryButton} onClick={onClose}>
                  Let's play
                </button>
              </div>
            </>
          )}
        </div>

        {/* Celebrates the reveal (issue #296) - keyed on spinKey so "Spin again" mounts a fresh
            burst with its own random particles instead of reusing/replaying the previous one. */}
        {revealed && <ConfettiBurst key={spinKey} />}
      </div>
    </div>
  );
}
