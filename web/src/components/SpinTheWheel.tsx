import { useState } from 'react';
import type { Game } from '@squadqueue/shared';
import { playNextGames, pickWeightedRandom } from './gameGridLogic';
import styles from './SpinTheWheel.module.css';

interface SpinTheWheelProps {
  games: Game[];
}

export function SpinTheWheel({ games }: SpinTheWheelProps) {
  const [winner, setWinner] = useState<Game | null>(null);
  const [spinning, setSpinning] = useState(false);
  const candidates = playNextGames(games);

  function handleSpin() {
    if (candidates.length === 0) return;
    setSpinning(true);
    setWinner(null);
    // Brief suspense before revealing the pick - the outcome is decided immediately, this is
    // purely a "the wheel is spinning" flourish.
    setTimeout(() => {
      setWinner(pickWeightedRandom(candidates));
      setSpinning(false);
    }, 700);
  }

  if (candidates.length === 0) {
    return (
      <div className={styles.bar}>
        <span className={styles.hint}>Vote on a few backlog games to unlock the wheel.</span>
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.spinButton} onClick={handleSpin} disabled={spinning}>
        {spinning ? 'Spinning…' : '🎡 Spin the Wheel'}
      </button>
      {winner && (
        <div className={styles.result} role="status">
          Tonight's pick: <strong>{winner.title}</strong>
        </div>
      )}
    </div>
  );
}
