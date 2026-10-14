import { BATTLESHIPS_SIZE, SQUARE_HIT, SQUARE_MISS, SQUARE_SUNK, type BattleshipsSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';
import type { TapTargets } from './taps';

const SIZE = BATTLESHIPS_SIZE;
const CELLS = SIZE * SIZE;
/** Where the board is on the arena, as fractions of its side: below the counters, above the scores. */
const BOARD_X = 0.14;
const BOARD_Y = 0.14;
const CELL = 0.09;
const SIDE = CELL * SIZE;
/** The round's time limit (server/shared battleships.ts ROUND_LIMIT_S), for the bar along the top. */
const ROUND_MS = 90_000;
/** After a shot you wait this long (SHOT_COOLDOWN_S in the rules), for the bar under the board. */
const COOLDOWN_MS = 800;

/** The squares are the controller: each is a tap target, drawn exactly where it is hit. */
export const BOARD_TAPS: TapTargets = {
  rects: Array.from({ length: CELLS }, (_, i) => ({ x: BOARD_X + (i % SIZE) * CELL, y: BOARD_Y + Math.floor(i / SIZE) * CELL, w: CELL, h: CELL })),
};

function drawWorld(sc: Scene<BattleshipsSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Time left in the round, as a bar draining along the top edge.
  if (snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / ROUND_MS), S * 0.008);
  }

  // The fleet still out there, as a row of ships by length (sunk ones are dimmed), between the counters.
  const pip = S * 0.014;
  const total = snapshot.fleet.reduce((n, s) => n + s.len, 0) * (pip + 1.5) + snapshot.fleet.length * pip * 0.9;
  let fx = S / 2 - total / 2;
  const fy = S * 0.052;
  for (const ship of snapshot.fleet) {
    ctx.globalAlpha = ship.sunk ? 0.25 : 0.9;
    ctx.fillStyle = ship.sunk ? theme.danger : theme.text;
    for (let k = 0; k < ship.len; k++) {
      roundRect(ctx, fx, fy, pip, pip, 2);
      ctx.fill();
      fx += pip + 1.5;
    }
    fx += pip * 0.9;
  }
  ctx.globalAlpha = 1;

  // The water, then each square.
  const bx = BOARD_X * S;
  const by = BOARD_Y * S;
  const cell = CELL * S;
  roundRect(ctx, bx - cell * 0.12, by - cell * 0.12, cell * SIZE + cell * 0.24, cell * SIZE + cell * 0.24, cell * 0.3);
  ctx.fillStyle = 'oklch(0.2 0.03 245 / 0.55)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const inset = cell * 0.06;
  for (let i = 0; i < CELLS; i++) {
    const x = bx + (i % SIZE) * cell + inset;
    const y = by + Math.floor(i / SIZE) * cell + inset;
    const w = cell - inset * 2;
    const state = snapshot.cells[i];
    const shooter = snapshot.by[i] >= 0 ? snapshot.players[snapshot.by[i]] : undefined;
    const colour = shooter ? sc.info(shooter.id).color : theme.acc;
    roundRect(ctx, x, y, w, w, cell * 0.16);
    if (state === SQUARE_HIT || state === SQUARE_SUNK) {
      ctx.fillStyle = state === SQUARE_SUNK ? 'oklch(0.28 0.02 25)' : colour;
      ctx.globalAlpha = state === SQUARE_SUNK ? 1 : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (state === SQUARE_SUNK) {
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.strokeStyle = colour;
        ctx.stroke();
      }
      // A cross: a hit.
      const m = w * 0.28;
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.lineCap = 'round';
      ctx.strokeStyle = state === SQUARE_SUNK ? theme.danger : 'oklch(1 0 0 / 0.9)';
      ctx.beginPath();
      ctx.moveTo(x + m, y + m);
      ctx.lineTo(x + w - m, y + w - m);
      ctx.moveTo(x + w - m, y + m);
      ctx.lineTo(x + m, y + w - m);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'oklch(1 0 0 / 0.07)';
      ctx.fill();
      if (state === SQUARE_MISS) {
        // A dot in the colour of whoever missed.
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + w / 2, w * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // The wait after your own shot, as a bar under the board.
  const mine = snapshot.players.find((p) => p.id === sc.me);
  if (mine && mine.cooldownMs > 0 && snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(bx, by + SIDE * S + cell * 0.22, SIDE * S * Math.min(1, mine.cooldownMs / COOLDOWN_MS), S * 0.008);
    ctx.globalAlpha = 1;
  }

  // Everyone's points along the bottom, in their colour: it is a race for the most, so all of it is on show.
  const n = snapshot.players.length;
  if (n > 0) {
    const slot = (S * 0.9) / n;
    ctx.font = `700 ${Math.round(S * 0.03)}px ${FONT.mono}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    snapshot.players.forEach((p, i) => {
      const x = S * 0.05 + i * slot;
      const y = S * 0.935;
      const dot = S * 0.016;
      ctx.globalAlpha = p.alive ? 1 : 0.35;
      ctx.fillStyle = sc.info(p.id).color;
      ctx.beginPath();
      ctx.arc(x + dot, y, dot, 0, Math.PI * 2);
      ctx.fill();
      if (p.id === sc.me) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.text;
        ctx.stroke();
      }
      ctx.fillStyle = theme.text;
      ctx.fillText(String(p.meters), x + dot * 2.5, y + 1);
    });
    ctx.globalAlpha = 1;
  }
}

const scene: SceneGame<BattleshipsSnapshot> = {
  scroll: 'x',
  taps: BOARD_TAPS,
  drawWorld,
  anchor: () => ({ x: 0.5, y: 0.5 }),
};

export const battleshipsView: LobbyGameView<BattleshipsSnapshot> = {
  // The board is the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: BOARD_TAPS,
  nameKey: 'spin.lobby.battleships.name',
  taglineKey: 'spin.lobby.battleships.tagline',
  hintKey: 'spin.lobby.battleships.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
