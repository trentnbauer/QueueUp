import { useEffect, useState } from 'react';
import type { ConcreteSpinWheelTheme, Game, GameStatus, RoomSpinSession, SpinWheelTheme } from '@queueup/shared';
import {
  buildSpinStrip,
  positionAt,
  velocityAt,
  settledPositionOf,
  settlesAtOf,
  applyNudge,
  candidateIndexAt,
  SPIN_INITIAL_VELOCITY,
  type SpinBase,
} from '@queueup/shared';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { ConfettiBurst } from './ConfettiBurst';
import { SpinThemeRenderer } from './spinThemes/SpinThemeRenderer';
import { resolveConcreteTheme } from './spinThemes/resolveTheme';
import { formatPrice } from '../utils/formatPrice';
import styles from './SpinWheelModal.module.css';

/** A room's shared spin (see RoomSpinSession/useRoomSpin) - when set, this modal renders *that*
 * strip/physics instead of running its own, and every nudge/restart goes through these callbacks
 * instead of purely local state, so every member currently looking at the room sees the identical
 * spin/nudge/settle together, not just whoever's clicking. Absent on the Personal Shelf, which has
 * no room to share a spin with and runs the exact same physics purely locally instead (see
 * useLocalSpin below). */
interface SharedSpinSession {
  spin: RoomSpinSession;
  onNudge: (direction: 'left' | 'right') => void;
  onRestart: () => void;
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

/** One "run" of the spin's physics: the candidate strip it travels along, the concrete theme
 * rendering it, and the settle-time/position derived once from its current base (see
 * spinPhysics.ts) - never recomputed lazily "whenever someone happens to check," so every re-read
 * of the same base agrees on the same eventual winner. */
interface SpinRun {
  strip: Game[];
  theme: ConcreteSpinWheelTheme;
  base: SpinBase;
  settlesAtMs: number;
  settledPosition: number;
}

function runFrom(base: SpinBase, strip: Game[], theme: ConcreteSpinWheelTheme): SpinRun {
  return { strip, theme, base, settlesAtMs: settlesAtOf(base), settledPosition: settledPositionOf(base) };
}

function freshLocalRun(games: Game[], candidates: Game[], theme: SpinWheelTheme): SpinRun {
  const strip = buildSpinStrip(games, candidates);
  const concreteTheme = resolveConcreteTheme(theme);
  const base: SpinBase = { position0: 0, velocity0: SPIN_INITIAL_VELOCITY, timestamp0: Date.now() };
  return runFrom(base, strip, concreteTheme);
}

function runFromSession(spin: RoomSpinSession): SpinRun {
  const base: SpinBase = { position0: spin.position0, velocity0: spin.velocity0, timestamp0: new Date(spin.timestamp0).getTime() };
  return { strip: spin.strip, theme: spin.theme, base, settlesAtMs: new Date(spin.settlesAt).getTime(), settledPosition: spin.settledPosition };
}

/** Ticks `now` forward every animation frame while it's before `settlesAtMs`, then stops (one
 * final tick lands exactly on/after it). Restarts automatically whenever `settlesAtMs` itself
 * changes - a nudge or a restart ("Spin again") always produces a new settlesAtMs, which is
 * exactly the signal that a fresh decay curve needs animating toward. */
function useLiveNow(settlesAtMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t < settlesAtMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settlesAtMs]);
  return now;
}

/** The shared dispatcher every Spin the Wheel theme renders through (issue #297): builds the
 * weighted candidate strip, resolves "random" to a concrete theme, and owns the reveal panel +
 * confetti celebration so no theme has to reimplement either. A theme's only job is rendering
 * itself for a continuous `position` along that strip (see spinThemes/types.ts) - the dispatcher
 * decides when it's settled, not the theme.
 *
 * Clicking the left half of the spin slows it down; the right half speeds it up (issue #356
 * follow-up) - both call the exact same physics (see spinPhysics.ts's applyNudge) that decides
 * where along the strip it eventually comes to rest, so *when* someone nudges, and which side,
 * genuinely changes the outcome. In a room (`session`), every member's nudge goes through the same
 * shared base, so everyone watching steers the same spin together. */
export function SpinWheelModal({ games, candidates, theme = 'slot', session, onStatusChange, onClose }: SpinWheelModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  // Personal Shelf only - a room's run comes entirely from `session.spin` instead (see `run` below).
  const [localRun, setLocalRun] = useState<SpinRun>(() => freshLocalRun(games, candidates, theme));
  // A quick wiggle on click, independent of how long the actual nudge (instant locally, a
  // round-trip in a room) takes to land - the nudge should feel immediate even before the reel's
  // course visibly changes.
  const [nudgeFlash, setNudgeFlash] = useState<'left' | 'right' | null>(null);

  const run: SpinRun = session ? runFromSession(session.spin) : localRun;
  const now = useLiveNow(run.settlesAtMs);
  const settled = now >= run.settlesAtMs;
  const position = settled ? run.settledPosition : positionAt(run.base, now);
  const velocity = settled ? 0 : velocityAt(run.base, now);
  const winner = settled && run.strip.length > 0 ? run.strip[candidateIndexAt(run.settledPosition, run.strip.length)] : null;

  function handleNudge(direction: 'left' | 'right') {
    if (settled) return;
    setNudgeFlash(direction);
    setTimeout(() => setNudgeFlash(null), 300);
    if (session) {
      session.onNudge(direction);
    } else {
      setLocalRun((prev) => runFrom(applyNudge(prev.base, Date.now(), direction), prev.strip, prev.theme));
    }
  }

  function handleRestart() {
    if (session) {
      session.onRestart();
    } else {
      setLocalRun(freshLocalRun(games, candidates, theme));
    }
  }

  function handleNudgeAreaClick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const isRight = e.clientX - rect.left > rect.width / 2;
    handleNudge(isRight ? 'right' : 'left');
  }

  if (run.strip.length === 0) return null;

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
          className={`${styles.nudgeArea} ${nudgeFlash ? styles[`nudge${nudgeFlash === 'left' ? 'Left' : 'Right'}`] : ''}`}
          onClick={handleNudgeAreaClick}
          disabled={settled}
          title="Click the left side to slow it down, the right side to speed it up"
        >
          <span className={styles.nudgeHintLeft} aria-hidden="true">
            ◀ slow
          </span>
          <SpinThemeRenderer
            theme={run.theme}
            strip={run.strip}
            position={position}
            velocity={velocity}
            settled={settled}
            winner={winner}
          />
          <span className={styles.nudgeHintRight} aria-hidden="true">
            speed ▶
          </span>
        </button>

        <div className={styles.revealZone} aria-live="polite">
          {settled && winner && (
            <>
              <div className={styles.revealLabel}>Tonight's pick</div>
              <div className={styles.revealTitle}>{winner.title}</div>
              {winner.timeToBeatHours != null && (
                <div className={styles.revealTimeToBeat}>~{winner.timeToBeatHours}h to beat</div>
              )}
              <div className={styles.revealPrice}>{formatPrice(winner)}</div>
              <div className={styles.actions}>
                <button type="button" className={styles.spinAgainButton} onClick={handleRestart}>
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

        {/* Celebrates the reveal (issue #296) - keyed on settlesAtMs so "Spin again"/settling again
            after a nudge mounts a fresh burst with its own random particles instead of reusing/
            replaying the previous one. */}
        {settled && winner && <ConfettiBurst key={run.settlesAtMs} />}
      </div>
    </div>
  );
}
