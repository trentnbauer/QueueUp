import type { SnakeSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, coverTile, hueOf, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** The board sits in the middle of the arena with this margin all round (a fraction of its side). */
const MARGIN = 0.04;

function drawWorld(sc: Scene<SnakeSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  const G = snapshot.grid;
  const board = S * (1 - MARGIN * 2);
  const cell = board / G;
  const left = S * MARGIN;
  const top = S * MARGIN;

  // The board: a faint grid inside a rounded frame.
  roundRect(ctx, left, top, board, board, S * 0.02);
  ctx.fillStyle = 'oklch(0 0 0 / 0.18)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = STAGE.groundTick;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  for (let i = 1; i < G; i++) {
    ctx.moveTo(left + i * cell, top);
    ctx.lineTo(left + i * cell, top + board);
    ctx.moveTo(left, top + i * cell);
    ctx.lineTo(left + board, top + i * cell);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Pickups are small game covers.
  for (const q of snapshot.pickups) {
    const bob = 1 + 0.06 * Math.sin(sc.now / 200 + q.n);
    const size = cell * 0.8 * bob;
    coverTile(ctx, left + (q.x + 0.5) * cell - size / 2, top + (q.y + 0.5) * cell - size / 2, size, size, hueOf(q.n), cell * 0.2);
  }

  // Snakes: a rounded block for each cell in the player's colour, the head brighter with eyes on its front.
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive || p.cells.length === 0) continue; // out: the burst has taken them
    const color = sc.info(p.id).color;
    p.cells.forEach((c, k) => {
      const x = left + (c % G) * cell;
      const y = top + Math.floor(c / G) * cell;
      const inset = k === 0 ? cell * 0.04 : cell * 0.1;
      roundRect(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.28);
      ctx.fillStyle = color;
      ctx.globalAlpha = k === 0 ? 1 : 0.78;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    const head = p.cells[0];
    const hx = left + ((head % G) + 0.5) * cell;
    const hy = top + (Math.floor(head / G) + 0.5) * cell;
    const fx = [0, 1, 0, -1][p.heading];
    const fy = [-1, 0, 1, 0][p.heading];
    ctx.fillStyle = '#fff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + fx * cell * 0.18 - fy * side * cell * 0.2, hy + fy * cell * 0.18 + fx * side * cell * 0.2, cell * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.id === sc.me) {
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 2;
      ctx.strokeRect(left + (head % G) * cell, top + Math.floor(head / G) * cell, cell, cell);
    }
  }
}

const scene: SceneGame<SnakeSnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => {
    const head = snapshot.players[index].cells[0] ?? 0;
    const G = snapshot.grid;
    return { x: MARGIN + (((head % G) + 0.5) / G) * (1 - MARGIN * 2), y: MARGIN + ((Math.floor(head / G) + 0.5) / G) * (1 - MARGIN * 2) };
  },
};

export const snakeView: LobbyGameView<SnakeSnapshot> = {
  // Turn left and turn right: the snake always moves on. Arrow keys or A / D.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.snake.name',
  taglineKey: 'spin.lobby.snake.tagline',
  hintKey: 'spin.lobby.snake.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
