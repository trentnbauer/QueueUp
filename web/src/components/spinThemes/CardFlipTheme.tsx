import { useEffect, useRef } from 'react';
import { candidateIndexAt } from '@queueup/shared';
import type { SpinThemeProps } from './types';
import styles from './CardFlipTheme.module.css';

// The row always shows this many cards, centered on the slot currently under the marker (offset
// 0 below) - an odd count so there's a true center card, same idea as the slot machine's reel
// having one tile dead-center under its marker.
const OFFSETS = [-2, -1, 0, 1, 2];

/** One soft blip per card the row settles onto as it slides past, synthesized rather than loaded
 * from an audio file - same reasoning as the other themes' sound effects, pitched differently so
 * it doesn't feel identical to the slot machine's reel ticks. */
function playBlip() {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
    setTimeout(() => ctx.close(), 200);
  } catch {
    // Best-effort - autoplay restrictions or no Web Audio support shouldn't break the spin itself.
  }
}

/** Face-down-cards-that-flip presentation (issue #299, reworked for issue #356's follow-up): a row
 * of 5 cards slides along the strip (see spinPicker.ts's buildSpinStrip) exactly like the slot
 * machine's reel, always centered on whichever slot `position` currently sits within - that center
 * card is the one that flips to reveal itself once settled, so what's displayed and what's
 * eventually declared the winner can never disagree (unlike the old design, which dealt an
 * independent, fixed set of 5 cards up front and animated a highlight toward one of them - fine
 * for a single pre-decided winner, but with no way to keep an arbitrary settle position lined up
 * with one of five fixed slots once nudges could land anywhere). Only the center card ever flips -
 * the others never reveal their identity, same as before. */
export function CardFlipTheme({ strip, position, settled }: SpinThemeProps) {
  const centerSlot = Math.round(position);

  const lastTickedSlot = useRef(centerSlot);
  useEffect(() => {
    if (settled) return;
    if (centerSlot !== lastTickedSlot.current) {
      lastTickedSlot.current = centerSlot;
      playBlip();
    }
  }, [centerSlot, settled]);

  return (
    <div className={styles.row}>
      {OFFSETS.map((offset) => {
        const slotIndex = centerSlot + offset;
        const game = strip[candidateIndexAt(slotIndex, strip.length)];
        const isCenter = offset === 0;
        const flipped = isCenter && settled;
        return (
          <div key={slotIndex} className={`${styles.cardSlot} ${isCenter && !settled ? styles.highlighted : ''}`}>
            <div className={`${styles.card} ${flipped ? styles.flipped : ''}`}>
              <div className={styles.cardBack} aria-hidden="true">
                🎮
              </div>
              <div
                className={styles.cardFront}
                style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
              >
                {!game.coverImageUrl && <span className={styles.cardFrontLabel}>{game.title}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
