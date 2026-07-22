import { useEffect, useState } from 'react';
import type { Game } from '@queueup/shared';
import { useModalA11y } from '../hooks/useModalA11y';
import { pickSpinWinner } from './gameGridLogic';
import styles from './SpinWheelModal.module.css';

interface SpinWheelModalProps {
  games: Game[];
  candidates: Game[];
  onClose: () => void;
}

// Two size tiers rather than one fixed pixel width (issue #293) - 5 full-size tiles (572px) is
// wider than a phone's entire viewport once the modal's own padding is subtracted, which forced
// the dialog itself wider than the screen. Smaller/fewer tiles below the app's standard mobile
// breakpoint (see other *.module.css files' @media queries) keeps the reel comfortably inside a
// narrow dialog instead of just clipping it, while wide screens are pixel-identical to before.
const NARROW_BREAKPOINT_QUERY = '(max-width: 640px)';
interface ReelSizing {
  tileWidth: number;
  tileGap: number;
  visibleTiles: number;
}
const WIDE_SIZING: ReelSizing = { tileWidth: 108, tileGap: 8, visibleTiles: 5 };
const NARROW_SIZING: ReelSizing = { tileWidth: 72, tileGap: 6, visibleTiles: 3 };

function useReelSizing(): ReelSizing {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_BREAKPOINT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_BREAKPOINT_QUERY);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow ? NARROW_SIZING : WIDE_SIZING;
}

// The winner always lands at this index within the strip - everything before it is decorative
// filler, weighted toward each candidate the same way the real pick was, so the reel's density
// roughly mirrors the actual odds rather than looking like a coin flip regardless of votes.
const REEL_LENGTH = 28;
const WINNER_INDEX = REEL_LENGTH - 1;
const SPIN_DURATION_MS = 3400;

function tilePitch(sizing: ReelSizing): number {
  return sizing.tileWidth + sizing.tileGap;
}

function centerOffset(sizing: ReelSizing): number {
  return (sizing.visibleTiles * tilePitch(sizing)) / 2 - sizing.tileWidth / 2;
}

function targetTranslateX(index: number, sizing: ReelSizing): number {
  return centerOffset(sizing) - index * tilePitch(sizing);
}

// A few more decorative tiles after the winner, so the reel has something to show on the far side
// of the marker once it stops instead of visibly running out of tiles right at the pick.
function trailingFillerCount(sizing: ReelSizing): number {
  return Math.ceil(sizing.visibleTiles / 2) + 1;
}

function buildReel(candidates: Game[], winner: Game, random: () => number, sizing: ReelSizing): Game[] {
  const strip: Game[] = [];
  for (let i = 0; i < WINNER_INDEX; i++) {
    strip.push(candidates[Math.floor(random() * candidates.length)]);
  }
  strip.push(winner);
  for (let i = 0; i < trailingFillerCount(sizing); i++) {
    strip.push(candidates[Math.floor(random() * candidates.length)]);
  }
  return strip;
}

/** One tick per tile as the reel passes it, synthesized rather than loaded from an audio file -
 * a short square-wave click through the Web Audio API. Tick spacing follows the same deceleration
 * shape as the CSS reel (cubic-bezier(0.1, 0.7, 0.15, 1)): tiles fly by fast at the start (ticks
 * close together) and the reel slows toward the end (ticks spread further apart), matching the
 * visual motion instead of running opposite to it. */
function playReelTicks(tileCount: number, durationMs: number) {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    for (let i = 1; i <= tileCount; i++) {
      const eased = (i / tileCount) ** 3; // ease-in: ticks bunch up early (fast), spread out late (slow)
      const when = now + (eased * durationMs) / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900, when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.15, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.04);
    }
    setTimeout(() => ctx.close(), durationMs + 200);
  } catch {
    // Best-effort - autoplay restrictions or no Web Audio support shouldn't break the spin itself.
  }
}

/** The actual "spin": a horizontal reel of cover art scrolls past a fixed center marker and
 * decelerates onto the winner. The pick (and the reel built around it) is locked in once per
 * `spinKey` - re-derived only when the user hits "Spin again", not on every prop change, so a
 * background refetch of `games` (e.g. someone else votes while this is open) can't silently swap
 * the winner out from under an animation that's already playing or already revealed. */
export function SpinWheelModal({ games, candidates, onClose }: SpinWheelModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const sizing = useReelSizing();
  const [spinKey, setSpinKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [translateX, setTranslateX] = useState(() => targetTranslateX(0, sizing));
  // The reel always ends at the same pixel offset regardless of which game wins (it depends only
  // on REEL_LENGTH, not the pick) - so on "Spin again" the reset-to-start jump must be instant
  // (transitionDuration 0) or it would itself animate under the same transition, using up the
  // visible motion before the forward spin (to that same old end position) even starts.
  const [transitioning, setTransitioning] = useState(false);
  const [winner, setWinner] = useState<Game | null>(null);
  const [reel, setReel] = useState<Game[]>([]);

  useEffect(() => {
    const picked = pickSpinWinner(games, candidates);
    if (!picked) {
      setWinner(null);
      return undefined;
    }
    const strip = buildReel(candidates, picked, Math.random, sizing);

    setWinner(picked);
    setReel(strip);
    setRevealed(false);
    setTransitioning(false);
    setTranslateX(targetTranslateX(0, sizing));

    // A single rAF isn't a reliable paint boundary - the browser can coalesce the start position
    // with the end position into one frame, skipping the transition entirely. Nesting two rAFs
    // guarantees the start position has been painted (with transitions off) before the end
    // position is set (with transitions back on).
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setTransitioning(true);
        setTranslateX(targetTranslateX(WINNER_INDEX, sizing));
        playReelTicks(WINNER_INDEX + 1, SPIN_DURATION_MS);
      });
    });
    const timeout = setTimeout(() => setRevealed(true), SPIN_DURATION_MS);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timeout);
    };
    // Intentionally only re-runs on spinKey ("Spin again") - see the doc comment above. A viewport
    // resize mid-spin (rare) is picked up on the next spin, not retroactively - consistent with
    // that same "locked in once per spin" philosophy.
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

        <div
          className={styles.reelViewport}
          style={{ width: sizing.visibleTiles * tilePitch(sizing) - sizing.tileGap, height: sizing.tileWidth + 24 }}
        >
          <div className={styles.centerMarker} aria-hidden="true" style={{ width: sizing.tileWidth }} />
          <div
            className={styles.reelStrip}
            style={{
              transform: `translateX(${translateX}px)`,
              transitionDuration: transitioning ? `${SPIN_DURATION_MS}ms` : '0ms',
              gap: sizing.tileGap,
            }}
          >
            {reel.map((game, i) => (
              <div
                key={i}
                className={styles.reelTile}
                style={{
                  width: sizing.tileWidth,
                  height: sizing.tileWidth,
                  ...(game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined),
                }}
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
              {winner.timeToBeatHours != null && (
                <div className={styles.revealTimeToBeat}>~{winner.timeToBeatHours}h to beat</div>
              )}
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
