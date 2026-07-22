import { useEffect, useState, type CSSProperties } from 'react';
import styles from './ConfettiBurst.module.css';

const PARTICLE_COUNT = 36;
const COLORS = ['#ff6b6b', '#feca57', '#1dd1a1', '#54a0ff', '#a55eea', '#ff9ff3'];
// Kept a bit longer than the longest per-particle animation (below) so nothing visibly cuts off
// mid-fall before this unmounts itself.
const LIFETIME_MS = 1900;

interface Particle {
  id: number;
  left: number;
  color: string;
  delayMs: number;
  durationMs: number;
  rotateDeg: number;
  driftPx: number;
}

type ParticleStyle = CSSProperties & { '--drift': string; '--rotate': string };

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delayMs: Math.random() * 250,
    durationMs: 1000 + Math.random() * 500,
    rotateDeg: Math.random() * 360,
    driftPx: (Math.random() - 0.5) * 140,
  }));
}

/** A one-shot celebratory confetti burst for the Spin the Wheel reveal (issue #296) - plain CSS
 * keyframe particles, no canvas or npm confetti dependency. Mount fresh each time a burst should
 * fire (e.g. `key={spinKey}` from the caller, so React remounts rather than reusing state across
 * spins) - it generates its own random particle set on mount and unmounts itself once the
 * animation finishes, so repeated "Spin again" bursts don't pile up DOM nodes. */
export function ConfettiBurst() {
  const [particles] = useState(makeParticles);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), LIFETIME_MS);
    return () => clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.container} aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className={styles.particle}
          style={
            {
              left: `${p.left}%`,
              backgroundColor: p.color,
              animationDelay: `${p.delayMs}ms`,
              animationDuration: `${p.durationMs}ms`,
              '--drift': `${p.driftPx}px`,
              '--rotate': `${p.rotateDeg}deg`,
            } as ParticleStyle
          }
        />
      ))}
    </div>
  );
}
