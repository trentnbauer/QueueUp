import type { LobbyGameId } from '@queueup/shared';
import { WORD_CORRECT, WORD_PRESENT } from '@queueup/shared';
import { FONT } from './theme';
import { roundRect } from './draw';
import type { Scene } from './scene';

/** How a game is played, as a picture on the countdown: slide with the left and right keys, those plus a button, tap one button, tap a square or
 * panel on the board, press and hold, or type. (Words also shows what its marks mean.) */
export type ControlKind = 'slide' | 'slideButton' | 'tap' | 'target' | 'hold' | 'words';

export const CONTROLS: Record<LobbyGameId, ControlKind> = {
  asteroids: 'slide',
  coins: 'slide',
  dodge: 'slide',
  laser: 'slide',
  lava: 'slide',
  parachute: 'slide',
  pong: 'slide',
  race: 'slide',
  snake: 'slide',
  tilt: 'slide',
  tunnel: 'slide',
  wall: 'slide',
  frogger: 'slideButton',
  sumo: 'slideButton',
  swing: 'slideButton',
  flappy: 'tap',
  gravity: 'tap',
  orbit: 'tap',
  potato: 'tap',
  rope: 'tap',
  stacker: 'tap',
  stop: 'tap',
  draw: 'tap',
  anagram: 'target',
  battleships: 'target',
  colormatch: 'target',
  memory: 'target',
  mines: 'target',
  oddoneout: 'target',
  rhythm: 'target',
  rps: 'target',
  sortit: 'target',
  tempo: 'target',
  whack: 'target',
  fishing: 'hold',
  runner: 'hold',
  words: 'words',
  simon: 'target',
  counting: 'target',
  pit: 'slideButton',
  pendulum: 'tap',
  chain: 'target',
  maths: 'target',
};

const INK = 'oklch(0.96 0.01 60)';

/** A rounded key with an arrow on it pointing `dir` (-1 left, 1 right), `w` wide, centred on (cx, cy). */
function arrowKey(sc: Scene, cx: number, cy: number, w: number, dir: number): void {
  const { ctx } = sc;
  roundRect(ctx, cx - w / 2, cy - w / 2, w, w, w * 0.22);
  ctx.fillStyle = 'oklch(1 0 0 / 0.14)';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, w * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - dir * w * 0.12, cy - w * 0.22);
  ctx.lineTo(cx + dir * w * 0.14, cy);
  ctx.lineTo(cx - dir * w * 0.12, cy + w * 0.22);
  ctx.stroke();
}

/** A round button with rings spreading from it, as for a tap. */
function tapButton(sc: Scene, cx: number, cy: number, r: number, pulse: number): void {
  const { ctx, theme } = sc;
  ctx.strokeStyle = theme.accText;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.globalAlpha = 0.6 * (1 - pulse);
  ctx.beginPath();
  ctx.arc(cx, cy, r * (1.15 + 0.6 * pulse), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.acc;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Draws the picture for how `snapshot.id` is played, centred on x = S / 2 with its middle at `cy`, `size` tall. */
export function drawControls(sc: Scene, cy: number, size: number): void {
  const { ctx, S, now, snapshot, fx } = sc;
  const kind = CONTROLS[snapshot.id] ?? 'tap';
  const cx = S / 2;
  const pulse = fx.reduced ? 0.4 : (now % 1100) / 1100;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'slide') {
    arrowKey(sc, cx - size * 0.75, cy, size, -1);
    arrowKey(sc, cx + size * 0.75, cy, size, 1);
  } else if (kind === 'slideButton') {
    arrowKey(sc, cx - size * 1.3, cy, size, -1);
    arrowKey(sc, cx - size * 0.2, cy, size, 1);
    roundRect(ctx, cx + size * 0.55, cy - size / 2, size * 1.6, size, size * 0.3);
    ctx.fillStyle = sc.theme.acc;
    ctx.fill();
  } else if (kind === 'tap') {
    tapButton(sc, cx, cy, size * 0.5, pulse);
  } else if (kind === 'hold') {
    // A button with a ring filling round it: press and keep pressing.
    tapButton(sc, cx, cy, size * 0.42, 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pulse);
    ctx.stroke();
  } else if (kind === 'target') {
    // A board of squares with one being tapped.
    const cell = size * 0.42;
    for (let i = 0; i < 4; i++) {
      const x = cx - cell - size * 0.03 + (i % 2) * (cell + size * 0.06);
      const y = cy - cell - size * 0.03 + Math.floor(i / 2) * (cell + size * 0.06);
      roundRect(ctx, x, y, cell, cell, cell * 0.2);
      ctx.fillStyle = i === 1 ? sc.theme.acc : 'oklch(1 0 0 / 0.14)';
      ctx.fill();
    }
    ctx.strokeStyle = sc.theme.accText;
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.globalAlpha = 0.6 * (1 - pulse);
    ctx.beginPath();
    ctx.arc(cx + cell * 0.55, cy - cell * 0.55, cell * (0.4 + 0.5 * pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    // Words: three letters as they score. A dot is the right place, a ring somewhere else, and nothing is not in the word.
    const cell = size * 0.62;
    const marks = [WORD_CORRECT, WORD_PRESENT, -1];
    const letters = ['C', 'A', 'T'];
    marks.forEach((state, i) => {
      const x = cx + (i - 1) * (cell + size * 0.1);
      roundRect(ctx, x - cell / 2, cy - cell / 2, cell, cell, cell * 0.14);
      ctx.fillStyle = state === WORD_CORRECT ? sc.theme.mint : state === WORD_PRESENT ? sc.theme.star : 'oklch(0.34 0.01 60)';
      ctx.fill();
      ctx.font = `800 ${Math.round(cell * 0.55)}px ${FONT.display}`;
      ctx.fillStyle = state === -1 ? INK : 'oklch(0.16 0.01 60)';
      ctx.fillText(letters[i], x, cy + cell * 0.03);
      if (state !== -1) {
        ctx.strokeStyle = ctx.fillStyle = 'oklch(0.16 0.01 60)';
        ctx.lineWidth = Math.max(1.5, cell * 0.04);
        ctx.beginPath();
        ctx.arc(x + cell * 0.32, cy - cell * 0.32, cell * 0.09, 0, Math.PI * 2);
        if (state === WORD_CORRECT) ctx.fill();
        else ctx.stroke();
      }
    });
  }
  ctx.restore();
}
