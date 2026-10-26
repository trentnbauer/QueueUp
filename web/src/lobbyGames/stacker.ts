import { STACKER_COLS, STACKER_ROWS, type StackerSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, STRIP_Y, drawStandings, drawTimer, renderScene, roundRect, rememberSnapshot, stripX, type Scene, type SceneGame } from './kit';

// Where things are on the arena, as fractions of its side: the one tower, centred under the standings strip.
const CELL = 0.055;
const TOWER_W = CELL * STACKER_COLS;
const TOWER_H = CELL * STACKER_ROWS;
const TOWER_X = (1 - TOWER_W) / 2;
const TOWER_BOTTOM = 0.97;

/** The top of row `row` (0 is the bottom), as a fraction of the arena's side. */
const rowTop = (row: number) => TOWER_BOTTOM - (row + 1) * CELL;

/** How many rows have been locked in as of the last snapshot drawn (counting those below the view). */
const previousRows = rememberSnapshot<number>();

/** A row that has just been locked in bursts along its squares, in the colour of whoever locked it: more of it for a narrower row. */
function celebrate(sc: Scene<StackerSnapshot>): void {
  const { snapshot } = sc;
  const total = snapshot.first + snapshot.locked.length;
  const before = previousRows(snapshot, () => total);
  if (before === null || total <= before) return;
  const row = snapshot.locked[snapshot.locked.length - 1];
  const by = snapshot.players[row.by];
  const y = rowTop(snapshot.locked.length - 1) + CELL / 2;
  for (let c = row.start; c < row.start + row.w; c++) sc.fx.confettiAt(TOWER_X + (c + 0.5) * CELL, y, by ? sc.info(by.id).color : 85, 5 + 3 * (5 - row.w));
}

function drawWorld(sc: Scene<StackerSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  celebrate(sc);

  // Time left in the run.
  if (snapshot.phase === 'playing' && snapshot.limitMs > 0) drawTimer(sc, snapshot.roundLeftMs / snapshot.limitMs);

  // Everyone's rows; knocked-out players are dimmed.
  drawStandings(sc);

  // The one tower: an empty grid, the rows already locked in, then the current row.
  const x0 = TOWER_X * S;
  const cell = CELL * S;
  roundRect(ctx, x0 - cell * 0.1, (TOWER_BOTTOM - TOWER_H) * S - cell * 0.1, TOWER_W * S + cell * 0.2, TOWER_H * S + cell * 0.2, cell * 0.25);
  ctx.fillStyle = 'oklch(0.2 0.03 60 / 0.5)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const inset = cell * 0.07;
  for (let row = 0; row < STACKER_ROWS; row++) {
    const y = rowTop(row) * S;
    for (let c = 0; c < STACKER_COLS; c++) {
      ctx.fillStyle = 'oklch(1 0 0 / 0.06)';
      roundRect(ctx, x0 + c * cell + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.15);
      ctx.fill();
    }
  }
  for (let row = 0; row < snapshot.locked.length; row++) {
    const l = snapshot.locked[row];
    const by = snapshot.players[l.by];
    ctx.fillStyle = by ? sc.info(by.id).color : theme.acc;
    for (let c = l.start; c < l.start + l.w; c++) {
      roundRect(ctx, x0 + c * cell + inset, rowTop(row) * S + inset, cell - inset * 2, cell - inset * 2, cell * 0.15);
      ctx.fill();
    }
  }

  // Row numbers beside every fifth row, so the height reads as the tower scrolls up (the view always shows the
  // rows from `first + 1` upward).
  ctx.font = `600 ${Math.round(S * 0.022)}px ${FONT.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'oklch(1 0 0 / 0.4)';
  for (let slot = 0; slot < STACKER_ROWS; slot++) {
    const n = snapshot.first + slot + 1;
    if (n % 5 === 0) ctx.fillText(String(n), (TOWER_X + TOWER_W + 0.012) * S, (rowTop(slot) + CELL / 2) * S);
  }

  if (snapshot.target && snapshot.phase === 'playing') {
    const row = snapshot.locked.length;
    const y = rowTop(row) * S;
    // The target squares, outlined and pulsing gently; the light runs along the whole row.
    ctx.strokeStyle = theme.mint;
    ctx.lineWidth = Math.max(2, S * 0.005);
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 150);
    for (let c = snapshot.target.start; c < snapshot.target.start + snapshot.target.w; c++) {
      roundRect(ctx, x0 + c * cell + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.15);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const light = Math.min(STACKER_COLS - 1, Math.max(0, sc.ease('light', snapshot.light, 0).x - 0.5));
    ctx.save();
    ctx.fillStyle = theme.star;
    ctx.shadowColor = theme.star;
    ctx.shadowBlur = S * 0.03;
    roundRect(ctx, x0 + light * cell + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.15);
    ctx.fill();
    ctx.restore();
  }
}

const scene: SceneGame<StackerSnapshot> = {
  scroll: 'y',
  drawWorld,
  // Where a knock-out burst starts: over the standings strip.
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const stackerView: LobbyGameView<StackerSnapshot> = {
  // One button: Stop (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'stop', labelKey: 'spin.lobby.stacker.stop', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'stop',
  nameKey: 'spin.lobby.stacker.name',
  taglineKey: 'spin.lobby.stacker.tagline',
  hintKey: 'spin.lobby.stacker.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
