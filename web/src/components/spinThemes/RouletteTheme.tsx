import { useEffect, useMemo, useRef } from 'react';
import type { SpinThemeProps } from './types';
import styles from './RouletteTheme.module.css';

// Fallback wedge color for a candidate with no cover art on file - alternated per-slice so a run
// of art-less candidates doesn't read as one solid blob.
const FALLBACK_COLORS = ['#4b69ff', '#eb4b4b', '#e4ae39', '#1dd1a1', '#a55eea', '#54a0ff', '#ff6b6b', '#feca57'];

/** Rotation (degrees) that brings whichever strip slot `position` currently sits within to the
 * fixed pointer at the top of the wheel - segment i's center sits at (i + 0.5) * segmentAngle
 * clockwise from the top, so rotating the *wheel* by the negative of that (adjusted for the live,
 * possibly-fractional `position`) brings it under the pointer. Exported for testing - the wheel
 * itself just renders this. */
export function wheelRotation(position: number, stripLength: number): number {
  const segmentAngle = 360 / stripLength;
  return -(position + 0.5) * segmentAngle;
}

/** One soft click as the wheel passes each pocket boundary - same "fires live as position crosses
 * an integer" reasoning as the slot machine's playTick, pitched differently so the two themes
 * don't sound identical. */
function playPocketTick() {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.13, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
    setTimeout(() => ctx.close(), 60);
  } catch {
    // Best-effort - autoplay restrictions or no Web Audio support shouldn't break the spin itself.
  }
}

/** A literal spinning wheel with a fixed pointer (issue #300): every strip slot (see
 * spinPicker.ts's buildSpinStrip) is one equal-angle pocket around the wheel - a higher-weighted
 * candidate simply occupies more (not wider) pockets, the same density-based fairness the slot
 * machine's reel uses, rather than each candidate getting one variably-sized wedge sized directly
 * by its odds (the pre-issue-#356 approach). Issue #356's follow-up reworked this from a
 * fixed-duration spin toward a pre-decided winner into continuously rotating by `position` - a
 * nudge's speed change is exactly as visible here as it is on the reel. */
export function RouletteTheme({ strip, position, settled }: SpinThemeProps) {
  const segmentAngle = 360 / strip.length;
  const rotation = wheelRotation(position, strip.length);

  const segmentStyles = useMemo(
    () =>
      strip.map((game, i) => {
        const startAngle = i * segmentAngle;
        const mask = `conic-gradient(from ${startAngle}deg, #fff 0deg, #fff ${segmentAngle}deg, transparent ${segmentAngle}deg)`;
        return {
          backgroundImage: game.coverImageUrl ? `url(${game.coverImageUrl})` : undefined,
          backgroundColor: game.coverImageUrl ? undefined : FALLBACK_COLORS[i % FALLBACK_COLORS.length],
          WebkitMaskImage: mask,
          maskImage: mask,
        };
      }),
    [strip, segmentAngle],
  );

  const lastTickedSlot = useRef(Math.floor(position));
  useEffect(() => {
    if (settled) return;
    const floored = Math.floor(position);
    if (floored !== lastTickedSlot.current) {
      lastTickedSlot.current = floored;
      playPocketTick();
    }
  }, [position, settled]);

  return (
    <div className={styles.stage}>
      <div className={styles.pointer} aria-hidden="true" />
      <div className={styles.wheel} style={{ transform: `rotate(${rotation}deg)` }}>
        {strip.map((game, i) => (
          <div key={`${i}-${game.id}`} className={styles.segment} style={segmentStyles[i]} title={game.title} />
        ))}
      </div>
      <div className={styles.hub} aria-hidden="true">
        🎯
      </div>
    </div>
  );
}
