import { useEffect, useState } from 'react';
import type { Game } from '@queueup/shared';
import type { SpinThemeProps } from './types';
import styles from './CardFlipTheme.module.css';

const CARD_COUNT = 5;
// How many full sweeps across the row before the highlight settles on the winner - more loops,
// more suspense, same idea as the slot machine's reel length.
const LOOPS = 3;
const BASE_STEP_MS = 90;
const MAX_EXTRA_STEP_MS = 260;
const SETTLE_PAUSE_MS = 300;
const FLIP_DURATION_MS = 550;

interface Deal {
  cards: Game[];
  winnerIndex: number;
}

function dealCards(candidates: Game[], winner: Game, random: () => number): Deal {
  const winnerIndex = Math.floor(random() * CARD_COUNT);
  const others = candidates.filter((g) => g.id !== winner.id);
  const cards: Game[] = [];
  for (let i = 0; i < CARD_COUNT; i++) {
    if (i === winnerIndex || others.length === 0) {
      cards.push(winner);
    } else {
      cards.push(others[Math.floor(random() * others.length)]);
    }
  }
  return { cards, winnerIndex };
}

/** One soft blip per highlight step - synthesized rather than loaded from an audio file, same
 * reasoning as the other themes' sound effects, pitched differently so it doesn't feel identical
 * to the slot machine's reel ticks. */
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

/** Face-down-cards-that-flip presentation (issue #299): a highlight sweeps across the row,
 * decelerating (more time between steps as it goes, same shape as the slot machine's reel) until
 * it settles on the winner's card, which then flips over to reveal it. The other cards never flip
 * - only the winner's identity is ever shown. */
export function CardFlipTheme({ candidates, winner, spinKey, onRevealed }: SpinThemeProps) {
  const [{ cards, winnerIndex }, setDeal] = useState<Deal>(() => dealCards(candidates, winner, Math.random));
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const dealt = dealCards(candidates, winner, Math.random);
    setDeal(dealt);
    setHighlightIndex(0);
    setFlipped(false);

    const totalSteps = CARD_COUNT * LOOPS + dealt.winnerIndex + 1;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let cumulativeMs = 0;
    for (let i = 0; i < totalSteps; i++) {
      const progress = i / (totalSteps - 1);
      cumulativeMs += BASE_STEP_MS + progress ** 2 * MAX_EXTRA_STEP_MS;
      const index = i % CARD_COUNT;
      timeouts.push(
        setTimeout(() => {
          setHighlightIndex(index);
          playBlip();
        }, cumulativeMs),
      );
    }
    timeouts.push(setTimeout(() => setFlipped(true), cumulativeMs + SETTLE_PAUSE_MS));
    timeouts.push(setTimeout(onRevealed, cumulativeMs + SETTLE_PAUSE_MS + FLIP_DURATION_MS));

    return () => timeouts.forEach(clearTimeout);
    // Intentionally only re-runs on spinKey ("Spin again") - same convention as the other themes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  return (
    <div className={styles.row}>
      {cards.map((game, i) => (
        <div key={i} className={`${styles.cardSlot} ${i === highlightIndex && !flipped ? styles.highlighted : ''}`}>
          <div className={`${styles.card} ${i === winnerIndex && flipped ? styles.flipped : ''}`}>
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
      ))}
    </div>
  );
}
