import { useEffect, useState } from 'react';
import type { Game } from '@squadqueue/shared';
import { useModalA11y } from '../hooks/useModalA11y';
import { pickSpinWinner } from './gameGridLogic';
import styles from './SpinWheelModal.module.css';

interface SpinWheelModalProps {
  games: Game[];
  candidates: Game[];
  onClose: () => void;
}

const TILE_WIDTH = 108;
const TILE_GAP = 8;
const TILE_PITCH = TILE_WIDTH + TILE_GAP;
const VISIBLE_TILES = 5;
// The strip always ends on the actual winner - everything before it is decorative filler, weighted
// toward each candidate the same way the real pick was, so the reel's density roughly mirrors the
// actual odds rather than looking like a coin flip regardless of votes.
const REEL_LENGTH = 28;
const SPIN_DURATION_MS = 3400;
const CENTER_OFFSET = (VISIBLE_TILES * TILE_PITCH) / 2 - TILE_WIDTH / 2;

function targetTranslateX(index: number): number {
  return CENTER_OFFSET - index * TILE_PITCH;
}

function buildReel(candidates: Game[], winner: Game, random: () => number): Game[] {
  const strip: Game[] = [];
  for (let i = 0; i < REEL_LENGTH - 1; i++) {
    strip.push(candidates[Math.floor(random() * candidates.length)]);
  }
  strip.push(winner);
  return strip;
}

/** The actual "spin": a horizontal reel of cover art scrolls past a fixed center marker and
 * decelerates onto the winner. The pick (and the reel built around it) is locked in once per
 * `spinKey` - re-derived only when the user hits "Spin again", not on every prop change, so a
 * background refetch of `games` (e.g. someone else votes while this is open) can't silently swap
 * the winner out from under an animation that's already playing or already revealed. */
export function SpinWheelModal({ games, candidates, onClose }: SpinWheelModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [spinKey, setSpinKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [translateX, setTranslateX] = useState(targetTranslateX(0));
  const [winner, setWinner] = useState<Game | null>(null);
  const [reel, setReel] = useState<Game[]>([]);

  useEffect(() => {
    const picked = pickSpinWinner(games, candidates);
    if (!picked) {
      setWinner(null);
      return undefined;
    }
    const strip = buildReel(candidates, picked, Math.random);

    setWinner(picked);
    setReel(strip);
    setRevealed(false);
    setTranslateX(targetTranslateX(0));

    const raf = requestAnimationFrame(() => setTranslateX(targetTranslateX(strip.length - 1)));
    const timeout = setTimeout(() => setRevealed(true), SPIN_DURATION_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
    // Intentionally only re-runs on spinKey ("Spin again") - see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        <div className={styles.reelViewport} style={{ width: VISIBLE_TILES * TILE_PITCH - TILE_GAP }}>
          <div className={styles.centerMarker} aria-hidden="true" />
          <div
            className={styles.reelStrip}
            style={{ transform: `translateX(${translateX}px)`, transitionDuration: `${SPIN_DURATION_MS}ms` }}
          >
            {reel.map((game, i) => (
              <div
                key={i}
                className={styles.reelTile}
                style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
              >
                <div className={styles.reelTileLabel}>{game.title}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.revealZone} aria-live="polite">
          {revealed && (
            <>
              <div className={styles.revealLabel}>Tonight's pick</div>
              <div className={styles.revealTitle}>{winner.title}</div>
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
      </div>
    </div>
  );
}
