import { STACKER_COLS, STACKER_ROWS, type StackerSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** The run's time limit (RUN_LIMIT_S in the rules), for the bar along the top. */
const RUN_MS = 300_000;
// Where things are on the arena, as fractions of its side: the one tower on the left, and everyone's rows
// down the right.
const TOWER_X = 0.05;
const CELL = 0.068;
const TOWER_BOTTOM = 0.96;
const TOWER_W = CELL * STACKER_COLS;
const TOWER_H = CELL * STACKER_ROWS;
const LIST_X = 0.75;
const LIST_Y = 0.14;
const ROW_H = 0.058;
const ROW_GAP = 0.008;

/** The top of row `row` (0 is the bottom), as a fraction of the arena's side. */
const rowTop = (row: number) => TOWER_BOTTOM - (row + 1) * CELL;

function drawWorld(sc: Scene<StackerSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;

  // Time left in the run, as a bar draining along the top edge.
  if (snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / RUN_MS), S * 0.008);
  }

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

  // Everyone's rows down the right, you ringed (the kit rings you); knocked-out players are dimmed.
  ctx.textBaseline = 'middle';
  snapshot.players.forEach((p, i) => {
    const y = (LIST_Y + i * (ROW_H + ROW_GAP) + ROW_H / 2) * S;
    ctx.save();
    if (!p.alive) ctx.globalAlpha = 0.4;
    sc.drawPlayer(p.id, (LIST_X + 0.025) * S, y, S * 0.022, S * 0.022);
    ctx.restore();
    ctx.font = `700 ${Math.round(S * 0.03)}px ${FONT.mono}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    ctx.fillText(String(p.meters), (LIST_X + 0.062) * S, y);
  });
}

const scene: SceneGame<StackerSnapshot> = {
  scroll: 'y',
  drawWorld,
  // Where a knock-out burst starts: over the list of players.
  anchor: (_snapshot, index) => ({ x: LIST_X + 0.025, y: LIST_Y + ROW_H / 2 + index * (ROW_H + ROW_GAP) }),
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
