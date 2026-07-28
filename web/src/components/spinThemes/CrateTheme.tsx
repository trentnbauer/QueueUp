import { useEffect, useMemo, useState } from 'react';
import { SPIN_MAX_VELOCITY } from '@queueup/shared';
import type { SpinThemeProps } from './types';
import styles from './CrateTheme.module.css';

// Crate never displays individual candidates while spinning (unlike the other themes) - there's
// no strip position to visualize, so its only signal of "how hard is this being nudged right now"
// is the live `velocity` prop, mapped onto how fast the case rattles.
const FASTEST_SHAKE_MS = 150; // at/above SPIN_MAX_VELOCITY
const SLOWEST_SHAKE_MS = 700; // near a standstill
const BURST_MS = 350;

// A few rarity-tier-flavored colors, picked randomly per spin (issue #298) - not any single
// existing game's exact palette, just the general "the crate's glow color says how exciting the
// pull was" loot-box convention.
const RARITY_COLORS = ['#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#e4ae39'];

function randomRarityColor(random: () => number): string {
  return RARITY_COLORS[Math.floor(random() * RARITY_COLORS.length)];
}

function shakeDurationMs(velocity: number): number {
  const t = Math.max(0, Math.min(1, velocity / SPIN_MAX_VELOCITY));
  return SLOWEST_SHAKE_MS - t * (SLOWEST_SHAKE_MS - FASTEST_SHAKE_MS);
}

/** A single sweeping "pop" as the crate bursts open - synthesized rather than loaded from an
 * audio file, same reasoning as the slot machine's reel ticks. */
function playPopSound() {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Best-effort - autoplay restrictions or no Web Audio support shouldn't break the spin itself.
  }
}

type Phase = 'shaking' | 'bursting' | 'revealed';

/** CS:GO-style loot crate opening (issue #298, reworked for issue #356's follow-up): a closed case
 * rattles - faster the harder it's currently being nudged (see `velocity`, since Crate has no
 * candidate strip position to visualize the way the other themes do) - then bursts open once
 * settled, and the winner's cover art pops out with a randomized rarity-colored glow. The burst
 * itself is a short, fixed-length flourish (BURST_MS) that plays once settling actually happens,
 * not a countdown toward a pre-decided moment - unlike the other themes' animation, its trigger is
 * simply "did we just settle," so it works the same whether that took two seconds or twenty. */
export function CrateTheme({ strip, velocity, settled, winner }: SpinThemeProps) {
  const [phase, setPhase] = useState<Phase>('shaking');
  // Re-rolled whenever a new strip shows up (a fresh spin or "Spin again") - stable for the
  // duration of any one spin's shaking/bursting/revealed sequence, same as it always locked in
  // once per spin, just keyed on the strip identity now rather than a spinKey counter.
  const rarityColor = useMemo(() => randomRarityColor(Math.random), [strip]);

  useEffect(() => {
    if (!settled) {
      setPhase('shaking');
      return;
    }
    setPhase('bursting');
    playPopSound();
    const revealTimeout = setTimeout(() => setPhase('revealed'), BURST_MS);
    return () => clearTimeout(revealTimeout);
  }, [settled]);

  return (
    <div className={styles.stage}>
      {phase !== 'revealed' ? (
        <div
          className={`${styles.crate} ${phase === 'shaking' ? styles.shaking : styles.bursting}`}
          style={phase === 'shaking' ? { animationDuration: `${shakeDurationMs(velocity)}ms` } : undefined}
          aria-hidden="true"
        >
          📦
        </div>
      ) : (
        winner && (
          <div
            className={styles.itemReveal}
            style={{
              borderColor: rarityColor,
              boxShadow: `0 0 32px ${rarityColor}`,
              ...(winner.coverImageUrl ? { backgroundImage: `url(${winner.coverImageUrl})` } : undefined),
            }}
          >
            {!winner.coverImageUrl && <span className={styles.itemLabel}>{winner.title}</span>}
          </div>
        )
      )}
      {phase === 'bursting' && <div className={styles.burstFlash} style={{ backgroundColor: rarityColor }} aria-hidden="true" />}
    </div>
  );
}
