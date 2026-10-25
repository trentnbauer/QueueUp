import { BATTLESHIPS_SIZE, SQUARE_HIT, SQUARE_MISS, SQUARE_SUNK, type BattleshipsSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, STRIP_Y, drawStandings, drawTimer, renderScene, roundRect, rememberSnapshot, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

const SIZE = BATTLESHIPS_SIZE;
const CELLS = SIZE * SIZE;

// Where things are on the arena, as fractions of its side: one big board, centred under the standings strip (which shows how many squares of
// each player's ships are afloat).
const SIDE = 0.64;
const CELL = SIDE / SIZE;
const BOARD_X = (1 - SIDE) / 2;
const BOARD_Y = 0.285;
/** After a shot you wait this long (SHOT_COOLDOWN_S in the rules), for the bar under the board. */
const COOLDOWN_MS = 800;
/** Your own ships. */
const SHIP = 'oklch(0.62 0.05 245)';
const SHIP_SUNK = 'oklch(0.3 0.02 25)';

/** The squares are the controller: each is a tap target, drawn exactly where it is hit, numbered row by row. */
export const BATTLE_TAPS: TapTargets = {
  rects: Array.from({ length: CELLS }, (_, i): TapRect => ({ x: BOARD_X + (i % SIZE) * CELL, y: BOARD_Y + Math.floor(i / SIZE) * CELL, w: CELL, h: CELL })),
};

/** The board as of the last snapshot drawn. */
const previousBoard = rememberSnapshot<number[]>();

/** A shot that hits puts up a small burst in the shooter's colour, and each square of a ship that has just been sunk a bigger one. */
function celebrate(sc: Scene<BattleshipsSnapshot>): void {
  const { snapshot } = sc;
  const before = previousBoard(snapshot, () => [...snapshot.cells]);
  if (!before) return;
  snapshot.cells.forEach((cell, i) => {
    if (cell === before[i] || (cell !== SQUARE_HIT && cell !== SQUARE_SUNK)) return;
    const x = BOARD_X + (i % SIZE) * CELL + CELL / 2;
    const y = BOARD_Y + Math.floor(i / SIZE) * CELL + CELL / 2;
    const who = snapshot.players[snapshot.by[i]];
    sc.fx.confettiAt(x, y, who ? sc.info(who.id).color : 40, cell === SQUARE_SUNK ? 14 : 10);
  });
}

function drawWorld(sc: Scene<BattleshipsSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  celebrate(sc);

  // Time left in the round.
  if (snapshot.phase === 'playing' && snapshot.limitMs > 0) drawTimer(sc, snapshot.roundLeftMs / snapshot.limitMs);

  // The players with how many squares of their ships are afloat; anyone out or watching is dimmed.
  drawStandings(sc, { text: (p) => (p.inRound ? String(p.afloat) : '') });

  // The one board: the water, then each square. Your own ships show (nobody else's), every shot is on it, and
  // a sunk ship shows whose it was.
  const bx = BOARD_X * S;
  const by = BOARD_Y * S;
  const cell = CELL * S;
  roundRect(ctx, bx - cell * 0.1, by - cell * 0.1, cell * SIZE + cell * 0.2, cell * SIZE + cell * 0.2, cell * 0.28);
  ctx.fillStyle = 'oklch(0.2 0.03 245 / 0.55)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const ships = new Set(snapshot.mine?.flat() ?? []);
  const inset = cell * 0.05;
  const w = cell - inset * 2;
  const colourOf = (index: number) => (index >= 0 && snapshot.players[index] ? sc.info(snapshot.players[index].id).color : theme.acc);
  for (let i = 0; i < CELLS; i++) {
    const x = bx + (i % SIZE) * cell + inset;
    const y = by + Math.floor(i / SIZE) * cell + inset;
    const state = snapshot.cells[i];
    const shooter = colourOf(snapshot.by[i]);

    // The square: water, or one of your own ships (dark once it is sunk).
    roundRect(ctx, x, y, w, w, cell * 0.16);
    ctx.fillStyle = ships.has(i) ? (state === SQUARE_SUNK ? SHIP_SUNK : SHIP) : 'oklch(1 0 0 / 0.07)';
    ctx.fill();

    if (state === SQUARE_MISS) {
      // A dot in the colour of whoever missed.
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = shooter;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + w / 2, w * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (state === SQUARE_HIT || state === SQUARE_SUNK) {
      // A disc in the colour of whoever hit, with a cross; dark with a ring in the owner's colour once sunk.
      ctx.fillStyle = state === SQUARE_SUNK ? 'oklch(0.22 0.02 25)' : shooter;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + w / 2, w * 0.36, 0, Math.PI * 2);
      ctx.fill();
      if (state === SQUARE_SUNK) {
        ctx.lineWidth = Math.max(1.5, cell * 0.07);
        ctx.strokeStyle = colourOf(snapshot.owner[i]);
        ctx.stroke();
      }
      const m = w * 0.21;
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.lineCap = 'round';
      ctx.strokeStyle = state === SQUARE_SUNK ? theme.danger : 'oklch(1 0 0 / 0.95)';
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - m, y + w / 2 - m);
      ctx.lineTo(x + w / 2 + m, y + w / 2 + m);
      ctx.moveTo(x + w / 2 + m, y + w / 2 - m);
      ctx.lineTo(x + w / 2 - m, y + w / 2 + m);
      ctx.stroke();
    }
  }

  // The wait after your own shot, as a bar under the board.
  const me = snapshot.players.find((p) => p.id === sc.me);
  if (me && me.cooldownMs > 0 && snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(bx, by + SIDE * S + cell * 0.2, SIDE * S * Math.min(1, me.cooldownMs / COOLDOWN_MS), S * 0.008);
    ctx.globalAlpha = 1;
  }

  // Your own fleet by ship length under the board, in the colour of your ships (sunk ones dimmed).
  if (me && me.fleet.length > 0) {
    const pip = S * 0.016;
    const width = (p: number) => me.fleet.reduce((sum, ship) => sum + ship.len * (p + 1.5) + p * 0.9, 0);
    const size = width(pip) > SIDE * S ? (pip * SIDE * S) / width(pip) : pip;
    let fx = bx;
    const fy = (BOARD_Y + SIDE + 0.035) * S;
    for (const ship of me.fleet) {
      ctx.globalAlpha = ship.sunk ? 0.3 : 0.95;
      ctx.fillStyle = ship.sunk ? theme.danger : SHIP;
      for (let k = 0; k < ship.len; k++) {
        roundRect(ctx, fx, fy, size, size, 2);
        ctx.fill();
        fx += size + 1.5;
      }
      fx += size * 0.9;
    }
    ctx.globalAlpha = 1;
  }
}

const scene: SceneGame<BattleshipsSnapshot> = {
  scroll: 'x',
  taps: BATTLE_TAPS,
  drawWorld,
  // Where a knock-out burst starts: over the standings strip.
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const battleshipsView: LobbyGameView<BattleshipsSnapshot> = {
  // The board is the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: BATTLE_TAPS,
  nameKey: 'spin.lobby.battleships.name',
  taglineKey: 'spin.lobby.battleships.tagline',
  hintKey: 'spin.lobby.battleships.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
