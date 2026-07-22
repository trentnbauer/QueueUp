import { useEffect, useMemo, useState } from 'react';
import type { Game } from '@queueup/shared';
import type { SpinThemeProps } from './types';
import styles from './RouletteTheme.module.css';

const SEGMENT_COUNT = 8;
const FULL_SPINS = 5;
const SPIN_DURATION_MS = 3200;
// Alternating colors around the wheel, not tied to any per-game meaning (unlike the crate theme's
const SEGMENT_COLORS = ['#4b69ff', '#eb4b4b', '#e4ae39', '#1dd1a1', '#a55eea', '#54a0ff', '#ff6b6b', '#feca57'];

interface Wheel {
  segments: Game[];
  winnerIndex: number;
}

function buildWheel(candidates: Game[], winner: Game, random: () => number): Wheel {
  const winnerIndex = Math.floor(random() * SEGMENT_COUNT);
  const others = candidates.filter((g) => g.id !== winner.id);
  const segments: Game[] = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    if (i === winnerIndex || others.length === 0) {
      segments.push(winner);
    } else {
      segments.push(others[Math.floor(random() * others.length)]);
    }
  }
  return { segments, winnerIndex };
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
 * Wheel" but never actually looked like one until this theme. Segments are colored, not labeled -
 * there's no readable way to fit game titles into narrow pie wedges at this size, and the winner's
 * title already shows in the shared reveal panel right after. */
export function RouletteTheme({ candidates, winner, spinKey, onRevealed }: SpinThemeProps) {
  const [{ segments, winnerIndex }, setWheel] = useState<Wheel>(() => buildWheel(candidates, winner, Math.random));
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const built = buildWheel(candidates, winner, Math.random);
    setWheel(built);
    setSpinning(false);
    setRotation(0);

    // The pointer is fixed at the top (0deg) - rotating the wheel clockwise by this amount brings
    // the winning segment's center to that same top position. Extra full turns (FULL_SPINS) don't
    // change where it lands, just how many times it visibly spins past first.
    const segmentAngle = 360 / SEGMENT_COUNT;
    const target = FULL_SPINS * 360 + (360 - (built.winnerIndex * segmentAngle + segmentAngle / 2));

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

  const gradient = useMemo(() => {
    const segmentAngle = 360 / SEGMENT_COUNT;
    const stops = segments.map((_, i) => {
      const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      return `${color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [segments]);
  // Referenced only for the rotation math above - kept in state so a future theme tweak (e.g. a
  // winner-segment highlight ring) has it on hand without re-deriving.
  void winnerIndex;

  return (
    <div className={styles.stage}>
      <div className={styles.pointer} aria-hidden="true" />
      <div
        className={styles.wheel}
        style={{
          background: gradient,
          transform: `rotate(${rotation}deg)`,
          transitionDuration: spinning ? `${SPIN_DURATION_MS}ms` : '0ms',
        }}
      />
      <div className={styles.hub} aria-hidden="true">
        🎯
      </div>
    </div>
  );
}
