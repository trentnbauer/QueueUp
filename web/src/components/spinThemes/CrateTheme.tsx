import { useEffect, useState } from 'react';
import type { SpinThemeProps } from './types';
import styles from './CrateTheme.module.css';

const SHAKE_MS = 900;
const BURST_MS = 350;

// A few rarity-tier-flavored colors, picked randomly per spin (issue #298) - not any single
// existing game's exact palette, just the general "the crate's glow color says how exciting the
// pull was" loot-box convention.
const RARITY_COLORS = ['#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#e4ae39'];

function randomRarityColor(random: () => number): string {
  return RARITY_COLORS[Math.floor(random() * RARITY_COLORS.length)];
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

/** CS:GO-style loot crate opening (issue #298): a closed case shakes with anticipation, bursts
 * open, and the winner's cover art pops out with a randomized rarity-colored glow. */
export function CrateTheme({ winner, spinKey, onRevealed }: SpinThemeProps) {
  const [phase, setPhase] = useState<Phase>('shaking');
  const [rarityColor, setRarityColor] = useState(() => randomRarityColor(Math.random));

  useEffect(() => {
    setPhase('shaking');
    setRarityColor(randomRarityColor(Math.random));

    const burstTimeout = setTimeout(() => {
      setPhase('bursting');
      playPopSound();
    }, SHAKE_MS);
    const revealTimeout = setTimeout(() => {
      setPhase('revealed');
      onRevealed();
    }, SHAKE_MS + BURST_MS);

    return () => {
      clearTimeout(burstTimeout);
      clearTimeout(revealTimeout);
    };
    // Intentionally only re-runs on spinKey ("Spin again") - same convention as the slot machine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  return (
    <div className={styles.stage}>
      {phase !== 'revealed' ? (
        <div className={`${styles.crate} ${phase === 'shaking' ? styles.shaking : styles.bursting}`} aria-hidden="true">
          📦
        </div>
      ) : (
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
      )}
      {phase === 'bursting' && <div className={styles.burstFlash} style={{ backgroundColor: rarityColor }} aria-hidden="true" />}
    </div>
  );
}
