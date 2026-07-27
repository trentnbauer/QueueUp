import { useEffect, useMemo, useState } from 'react';
import type { Game } from '@queueup/shared';
import type { SpinThemeProps } from './types';
import styles from './RouletteTheme.module.css';

const FULL_SPINS = 5;
const SPIN_DURATION_MS = 3200;
// Fallback wedge color for a candidate with no cover art on file - alternated per-slice so a run
// of art-less candidates doesn't read as one solid blob.
const FALLBACK_COLORS = ['#4b69ff', '#eb4b4b', '#e4ae39', '#1dd1a1', '#a55eea', '#54a0ff', '#ff6b6b', '#feca57'];

// A big backlog can have dozens of eligible candidates - drawing one wedge per candidate past this
// count would produce slivers too thin to read as artwork at all. Capped to the candidates most
// likely to matter (highest weight); the winner is force-included even if it wouldn't otherwise
// make the cut, since the wheel has to be able to land on it.
const MAX_WHEEL_SEGMENTS = 16;

export interface WheelSegment {
  game: Game;
  /** Degrees, measured clockwise from 12 o'clock (matches the wheel's own rotation convention). */
  startAngle: number;
  arcAngle: number;
}

interface Wheel {
  segments: WheelSegment[];
  winnerSegmentIndex: number;
}

/** Issue #355: each segment's arc is sized proportionally to its actual Spin the Wheel odds
 * (`weights`, one candidate's spinCandidateWeight - see SpinWheelModal) instead of a fixed equal
 * wedge - "if the game has a higher chance, give it a larger slice." A weight-missing candidate
 * (shouldn't happen in practice, since the dispatcher weights every candidate it hands down) falls
 * back to 1 rather than 0, so it can never collapse to a literally invisible sliver. */
export function buildWheel(candidates: Game[], winner: Game, weights: Map<string, number>, random: () => number): Wheel {
  const weightOf = (g: Game) => weights.get(g.id) ?? 1;

  let pool = [...candidates].sort((a, b) => weightOf(b) - weightOf(a));
  if (pool.length > MAX_WHEEL_SEGMENTS) {
    pool = pool.slice(0, MAX_WHEEL_SEGMENTS);
    if (!pool.some((g) => g.id === winner.id)) {
      pool[pool.length - 1] = winner;
    }
  }
  if (pool.length === 0) pool = [winner];

  // Shuffled after sizing decisions are made (truncation above already favored high-weight
  // candidates) - purely so same-weight games aren't always adjacent in weight-sorted order, which
  // would otherwise look suspiciously deliberate rather than like a real wheel.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const totalWeight = pool.reduce((sum, g) => sum + weightOf(g), 0);
  let cursor = 0;
  let winnerSegmentIndex = -1;
  const segments: WheelSegment[] = pool.map((g, i) => {
    const arcAngle = totalWeight > 0 ? (weightOf(g) / totalWeight) * 360 : 360 / pool.length;
    if (g.id === winner.id) winnerSegmentIndex = i;
    const segment: WheelSegment = { game: g, startAngle: cursor, arcAngle };
    cursor += arcAngle;
    return segment;
  });

  return { segments, winnerSegmentIndex };
}

/** A single descending "whoosh" spanning the whole spin - a continuous tone sweeping down in pitch
 * as the wheel decelerates, rather than trying to sync discrete ticks to segment boundaries (which
 * a pure CSS transition doesn't expose progress events for). Synthesized, same reasoning as the
 * other themes' sound effects. */
function playSpinWhoosh(durationMs: number) {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const durationSec = durationMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + durationSec);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.15);
    gain.gain.setValueAtTime(0.05, now + Math.max(0.15, durationSec - 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.05);
    setTimeout(() => ctx.close(), durationMs + 200);
  } catch {
    // Best-effort - autoplay restrictions or no Web Audio support shouldn't break the spin itself.
  }
}

/** A literal spinning wheel with a fixed pointer (issue #300) - the feature is called "Spin the
 * Wheel" but never actually looked like one until this theme. Each wedge shows a slice of that
 * candidate's own cover art (issue #355), sized proportionally to its actual odds of winning -
 * previously every wedge was a plain, equally-sized color regardless of a candidate's real chance.
 * A slice is masked (not clipped) to its angular range with a conic-gradient - clip-path polygons
 * can't cleanly express an arc over 180deg (a single dominant candidate can easily exceed that),
 * while a conic-gradient mask handles any arc natively. */
export function RouletteTheme({ candidates, winner, candidateWeights, spinKey, onRevealed }: SpinThemeProps) {
  const [{ segments, winnerSegmentIndex }, setWheel] = useState<Wheel>(() =>
    buildWheel(candidates, winner, candidateWeights, Math.random),
  );
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const built = buildWheel(candidates, winner, candidateWeights, Math.random);
    setWheel(built);
    setSpinning(false);
    setRotation(0);

    // The pointer is fixed at the top (0deg) - rotating the wheel clockwise by this amount brings
    // the winning segment's own center (not a fixed segment-index center, since segments are no
    // longer equal-sized) to that same top position. Extra full turns (FULL_SPINS) don't change
    // where it lands, just how many times it visibly spins past first.
    const winnerSegment = built.segments[built.winnerSegmentIndex];
    const winnerCenter = winnerSegment.startAngle + winnerSegment.arcAngle / 2;
    const target = FULL_SPINS * 360 + (360 - winnerCenter);

    // Same two-rAF paint-boundary reasoning as the slot machine - guarantees the 0deg reset above
    // is painted before the transition back on with the real target angle.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setSpinning(true);
        setRotation(target);
        playSpinWhoosh(SPIN_DURATION_MS);
      });
    });
    const timeout = setTimeout(onRevealed, SPIN_DURATION_MS);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timeout);
    };
    // Intentionally only re-runs on spinKey ("Spin again") - same convention as the other themes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  const segmentStyles = useMemo(
    () =>
      segments.map((seg, i) => {
        const mask = `conic-gradient(from ${seg.startAngle}deg, #fff 0deg, #fff ${seg.arcAngle}deg, transparent ${seg.arcAngle}deg)`;
        return {
          backgroundImage: seg.game.coverImageUrl ? `url(${seg.game.coverImageUrl})` : undefined,
          backgroundColor: seg.game.coverImageUrl ? undefined : FALLBACK_COLORS[i % FALLBACK_COLORS.length],
          WebkitMaskImage: mask,
          maskImage: mask,
        };
      }),
    [segments],
  );
  // Referenced only for the rotation math above - kept in state so a future theme tweak (e.g. a
  // winner-segment highlight ring) has it on hand without re-deriving.
  void winnerSegmentIndex;

  return (
    <div className={styles.stage}>
      <div className={styles.pointer} aria-hidden="true" />
      <div
        className={styles.wheel}
        style={{
          transform: `rotate(${rotation}deg)`,
          transitionDuration: spinning ? `${SPIN_DURATION_MS}ms` : '0ms',
        }}
      >
        {segments.map((seg, i) => (
          <div key={seg.game.id} className={styles.segment} style={segmentStyles[i]} title={seg.game.title} />
        ))}
      </div>
      <div className={styles.hub} aria-hidden="true">
        🎯
      </div>
    </div>
  );
}
