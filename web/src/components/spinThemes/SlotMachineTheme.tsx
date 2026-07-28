import { useEffect, useRef, useState } from 'react';
import { candidateIndexAt } from '@queueup/shared';
import type { SpinThemeProps } from './types';
import styles from '../SpinWheelModal.module.css';

// Two size tiers rather than one fixed pixel width (issue #293) - 5 full-size tiles (572px) is
// wider than a phone's entire viewport once the modal's own padding is subtracted, which forced
// the dialog itself wider than the screen. Smaller/fewer tiles below the app's standard mobile
// breakpoint (see other *.module.css files' @media queries) keeps the reel comfortably inside a
// narrow dialog instead of just clipping it, while wide screens are pixel-identical to before.
const NARROW_BREAKPOINT_QUERY = '(max-width: 640px)';
interface ReelSizing {
  tileWidth: number;
  tileGap: number;
  visibleTiles: number;
}
const WIDE_SIZING: ReelSizing = { tileWidth: 108, tileGap: 8, visibleTiles: 5 };
const NARROW_SIZING: ReelSizing = { tileWidth: 72, tileGap: 6, visibleTiles: 3 };

function useReelSizing(): ReelSizing {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_BREAKPOINT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_BREAKPOINT_QUERY);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow ? NARROW_SIZING : WIDE_SIZING;
}

function tilePitch(sizing: ReelSizing): number {
  return sizing.tileWidth + sizing.tileGap;
}

function centerOffset(sizing: ReelSizing): number {
  return (sizing.visibleTiles * tilePitch(sizing)) / 2 - sizing.tileWidth / 2;
}

// How many slots beyond what's strictly visible to render on each side of the marker - enough
// that a fast nudge (a sudden jump in per-frame position delta) never outruns the rendered window
// before the next render catches up.
const WINDOW_PADDING = 4;

/** One tick per tile as it crosses the center marker, synthesized rather than loaded from an audio
 * file - a short square-wave click through the Web Audio API. Unlike the old fixed-duration spin
 * (which pre-scheduled every tick's timing up front), this fires live as `position` actually
 * crosses each integer slot boundary - so ticks speed up/slow down/pause in perfect sync with a
 * nudge instead of following a canned schedule that could no longer match a spin whose length is
 * now entirely up to the players. */
function playTick() {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
    setTimeout(() => ctx.close(), 60);
  } catch {
    // Best-effort - autoplay restrictions or no Web Audio support shouldn't break the spin itself.
  }
}

/** The original Spin the Wheel presentation (issue #297 split this out of SpinWheelModal into its
 * own theme component; issue #356's follow-up reworked it from a fixed-duration animation toward a
 * pre-decided winner into a live window over the dispatcher's continuous `position` - see
 * spinThemes/types.ts): a horizontal reel of cover art scrolls past a fixed center marker,
 * decelerating (or speeding back up, on a nudge) exactly as fast as `position` itself moves. */
export function SlotMachineTheme({ strip, position, settled }: SpinThemeProps) {
  const sizing = useReelSizing();
  const halfWindow = Math.ceil(sizing.visibleTiles / 2) + WINDOW_PADDING;
  const centerFloor = Math.floor(position);
  const containerTranslateX = centerOffset(sizing) - position * tilePitch(sizing);

  const lastTickedSlot = useRef(centerFloor);
  useEffect(() => {
    if (settled) return;
    if (centerFloor !== lastTickedSlot.current) {
      lastTickedSlot.current = centerFloor;
      playTick();
    }
  }, [centerFloor, settled]);

  const offsets: number[] = [];
  for (let j = -halfWindow; j <= halfWindow; j++) offsets.push(j);

  return (
    <div
      className={styles.reelViewport}
      style={{ width: sizing.visibleTiles * tilePitch(sizing) - sizing.tileGap, height: sizing.tileWidth + 24 }}
    >
      <div className={styles.centerMarker} aria-hidden="true" style={{ width: sizing.tileWidth }} />
      <div className={styles.reelStrip} style={{ transform: `translateX(${containerTranslateX}px)` }}>
        {offsets.map((j) => {
          const slotIndex = centerFloor + j;
          const game = strip[candidateIndexAt(slotIndex, strip.length)];
          return (
            <div
              key={slotIndex}
              className={styles.reelTile}
              style={{
                position: 'absolute',
                left: slotIndex * tilePitch(sizing),
                width: sizing.tileWidth,
                height: sizing.tileWidth,
                ...(game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined),
              }}
            >
              <div className={styles.reelTileLabel}>{game.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
