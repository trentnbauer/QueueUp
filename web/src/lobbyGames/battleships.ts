import {
  BATTLESHIPS_SIZE,
  BATTLESHIPS_TARGET_BASE,
  SQUARE_HIT,
  SQUARE_MISS,
  SQUARE_SUNK,
  type BattleshipsBoard,
  type BattleshipsSnapshot,
} from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

const SIZE = BATTLESHIPS_SIZE;
const CELLS = SIZE * SIZE;
/** The most opponents there can be (twelve players, less yourself). */
const MAX_OPPONENTS = 11;

// Where things are on the arena, as fractions of its side. The board you shoot at is big, on the left; your
// own fleet is small, top right; the other players are chips below it, to pick whose board to shoot at.
const TARGET_X = 0.04;
const TARGET_Y = 0.17;
const TARGET_CELL = 0.075;
const TARGET_SIDE = TARGET_CELL * SIZE;
const MINE_X = 0.7;
const MINE_Y = 0.17;
const MINE_CELL = 0.0325;
const MINE_SIDE = MINE_CELL * SIZE;
const CHIP_X = 0.68;
const CHIP_Y = 0.48;
const CHIP_W = 0.135;
const CHIP_H = 0.055;
const CHIP_GAP = 0.01;
/** The round's time limit (ROUND_LIMIT_S in the rules), for the bar along the top. */
const ROUND_MS = 120_000;
/** After a shot you wait this long (SHOT_COOLDOWN_S in the rules), for the bar under the board. */
const COOLDOWN_MS = 800;

const chipRect = (k: number): TapRect => ({ x: CHIP_X + (k % 2) * (CHIP_W + CHIP_GAP), y: CHIP_Y + Math.floor(k / 2) * (CHIP_H + CHIP_GAP), w: CHIP_W, h: CHIP_H });

/** The tap targets, numbered as the rules read them: the 64 squares of the board you shoot at, row by row,
 * then one chip for each other player. Each is drawn exactly where it is hit. */
export const BATTLE_TAPS: TapTargets = {
  rects: [
    ...Array.from({ length: CELLS }, (_, i): TapRect => ({ x: TARGET_X + (i % SIZE) * TARGET_CELL, y: TARGET_Y + Math.floor(i / SIZE) * TARGET_CELL, w: TARGET_CELL, h: TARGET_CELL })),
    ...Array.from({ length: MAX_OPPONENTS }, (_, k) => chipRect(k)),
  ],
};

/** The players in the round other than you, in the order the rules number them for picking a target. */
function opponentsOf(snapshot: BattleshipsSnapshot, me: string) {
  return snapshot.players.filter((p) => p.inRound && p.id !== me);
}

/** One board, as a grid of squares. `ships` (your own) are shown, with the shots on top. */
function drawBoard(sc: Scene<BattleshipsSnapshot>, board: BattleshipsBoard, x0: number, y0: number, cell: number, ships?: Set<number>): void {
  const { ctx, theme, snapshot } = sc;
  roundRect(ctx, x0 - cell * 0.12, y0 - cell * 0.12, cell * SIZE + cell * 0.24, cell * SIZE + cell * 0.24, cell * 0.3);
  ctx.fillStyle = 'oklch(0.2 0.03 245 / 0.55)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const inset = cell * 0.06;
  for (let i = 0; i < CELLS; i++) {
    const x = x0 + (i % SIZE) * cell + inset;
    const y = y0 + Math.floor(i / SIZE) * cell + inset;
    const w = cell - inset * 2;
    const state = board.cells[i];
    const shooter = board.by[i] >= 0 ? snapshot.players[board.by[i]] : undefined;
    const colour = shooter ? sc.info(shooter.id).color : theme.acc;
    const ship = ships?.has(i) ?? false;
    roundRect(ctx, x, y, w, w, cell * 0.16);
    if (ship) {
      // One of your own ships, dark once sunk.
      ctx.fillStyle = state === SQUARE_SUNK ? 'oklch(0.3 0.02 25)' : 'oklch(0.62 0.05 245)';
      ctx.fill();
    } else if (state === SQUARE_HIT || state === SQUARE_SUNK) {
      ctx.fillStyle = state === SQUARE_SUNK ? 'oklch(0.28 0.02 25)' : colour;
      ctx.globalAlpha = state === SQUARE_SUNK ? 1 : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = 'oklch(1 0 0 / 0.07)';
      ctx.fill();
    }
    if (state === SQUARE_HIT || state === SQUARE_SUNK) {
      if (state === SQUARE_SUNK && !ship) {
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.strokeStyle = colour;
        ctx.stroke();
      }
      // A cross: a hit.
      const m = w * 0.28;
      ctx.lineWidth = Math.max(1.5, cell * 0.08);
      ctx.lineCap = 'round';
      ctx.strokeStyle = state === SQUARE_SUNK ? theme.danger : ship ? theme.danger : 'oklch(1 0 0 / 0.9)';
      ctx.beginPath();
      ctx.moveTo(x + m, y + m);
      ctx.lineTo(x + w - m, y + w - m);
      ctx.moveTo(x + w - m, y + m);
      ctx.lineTo(x + m, y + w - m);
      ctx.stroke();
    } else if (state === SQUARE_MISS) {
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

/** A row of ship lengths, as little squares (sunk ones dimmed), starting at (x, y). */
function drawFleet(sc: Scene<BattleshipsSnapshot>, fleet: BattleshipsBoard['fleet'], x: number, y: number, pip: number, maxWidth: number): void {
  const { ctx, theme } = sc;
  // Squares `pip` wide with a hair between them and a gap between ships; shrunk to fit `maxWidth` if need be.
  const width = (p: number) => fleet.reduce((sum, ship) => sum + ship.len * (p + 1.5) + p * 0.9, 0);
  const size = width(pip) > maxWidth ? (pip * maxWidth) / width(pip) : pip;
  let fx = x;
  for (const ship of fleet) {
    ctx.globalAlpha = ship.sunk ? 0.25 : 0.9;
    ctx.fillStyle = ship.sunk ? theme.danger : theme.text;
    for (let k = 0; k < ship.len; k++) {
      roundRect(ctx, fx, y, size, size, 2);
      ctx.fill();
      fx += size + 1.5;
    }
    fx += size * 0.9;
  }
  ctx.globalAlpha = 1;
}

function drawWorld(sc: Scene<BattleshipsSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;

  // Time left in the round, as a bar draining along the top edge.
  if (snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / ROUND_MS), S * 0.008);
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // The board you are shooting at, with whose it is above it.
  if (snapshot.targetBoard && snapshot.target) {
    const who = sc.info(snapshot.target);
    ctx.font = `700 ${Math.round(S * 0.03)}px ${FONT.ui}`;
    ctx.fillStyle = who.color;
    ctx.fillText(`▶ ${who.name}`, TARGET_X * S, (TARGET_Y - 0.022) * S, TARGET_SIDE * S);
    drawBoard(sc, snapshot.targetBoard, TARGET_X * S, TARGET_Y * S, TARGET_CELL * S);
    drawFleet(sc, snapshot.targetBoard.fleet, TARGET_X * S, (TARGET_Y + TARGET_SIDE + 0.045) * S, S * 0.014, TARGET_SIDE * S);
  }

  // The wait after your own shot, as a bar under the board.
  const mine = snapshot.players.find((p) => p.id === sc.me);
  if (mine && mine.cooldownMs > 0 && snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(TARGET_X * S, (TARGET_Y + TARGET_SIDE + 0.016) * S, TARGET_SIDE * S * Math.min(1, mine.cooldownMs / COOLDOWN_MS), S * 0.008);
    ctx.globalAlpha = 1;
  }

  // Your own fleet, small, with the shots at it.
  if (snapshot.mine) {
    ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
    ctx.fillStyle = theme.accText;
    ctx.fillText(sc.t('spin.lobby.hud.you'), MINE_X * S, (MINE_Y - 0.022) * S);
    drawBoard(sc, snapshot.mine, MINE_X * S, MINE_Y * S, MINE_CELL * S, new Set(snapshot.mine.ships.flat()));
    drawFleet(sc, snapshot.mine.fleet, MINE_X * S, (MINE_Y + MINE_SIDE + 0.03) * S, S * 0.011, MINE_SIDE * S);
  }

  // The other players as chips: tap one to shoot at their board. A ring marks whose you are shooting at, and the
  // number is how many squares of their ships are afloat.
  const w = CHIP_W * S;
  const h = CHIP_H * S;
  opponentsOf(snapshot, sc.me).forEach((p, k) => {
    const r = chipRect(k);
    const x = r.x * S;
    const y = r.y * S;
    ctx.globalAlpha = p.alive ? 1 : 0.35;
    roundRect(ctx, x, y, w, h, h * 0.35);
    ctx.fillStyle = 'oklch(1 0 0 / 0.08)';
    ctx.fill();
    if (p.id === snapshot.target) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.acc;
      ctx.stroke();
    }
    const dot = h * 0.34;
    ctx.fillStyle = sc.info(p.id).color;
    ctx.beginPath();
    ctx.arc(x + dot * 1.3, y + h / 2, dot, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(dot * 1.2)}px ${FONT.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sc.info(p.id).initial, x + dot * 1.3, y + h / 2 + 1);
    ctx.fillStyle = theme.text;
    ctx.font = `700 ${Math.round(S * 0.028)}px ${FONT.mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(p.afloat), x + w - h * 0.25, y + h / 2 + 1);
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

const scene: SceneGame<BattleshipsSnapshot> = {
  scroll: 'x',
  taps: BATTLE_TAPS,
  drawWorld,
  // Where a knock-out burst starts: over the chips, where the other players are.
  anchor: () => ({ x: CHIP_X + CHIP_W, y: CHIP_Y + 0.15 }),
};

export const battleshipsView: LobbyGameView<BattleshipsSnapshot> = {
  // The boards are the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: BATTLE_TAPS,
  nameKey: 'spin.lobby.battleships.name',
  taglineKey: 'spin.lobby.battleships.tagline',
  hintKey: 'spin.lobby.battleships.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};

/** The tap number that picks the k-th other player as the target (for tests). */
export const chipTarget = (k: number): number => BATTLESHIPS_TARGET_BASE + k;
