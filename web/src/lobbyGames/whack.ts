import { ENDLESS_LIVES, WHACK_COLS, WHACK_HOLES, type WhackSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STRIP_Y, drawLives, drawStandings, drawTimer, renderScene, rememberSnapshot, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

/** Where the grid is on the arena, as fractions of its side: one shared 3 x 3 grid, under the standings strip and its row of lives. */
const CELL = 0.24;
const GRID_X = (1 - CELL * WHACK_COLS) / 2;
const GRID_Y = 0.25;
const MOLE = 'oklch(0.62 0.07 55)';
const MOLE_DARK = 'oklch(0.4 0.05 50)';

/** The holes are the controller: each is a tap target, drawn exactly where it is hit, numbered row by row.
 * On a keyboard the number keys lay out like a numpad (7 8 9 / 4 5 6 / 1 2 3). */
export const WHACK_TAPS: TapTargets = {
  rects: Array.from({ length: WHACK_HOLES }, (_, i): TapRect => ({ x: GRID_X + (i % WHACK_COLS) * CELL, y: GRID_Y + Math.floor(i / WHACK_COLS) * CELL, w: CELL, h: CELL })),
  keys: ['7', '8', '9', '4', '5', '6', '1', '2', '3'],
};

function drawBomb(sc: Scene<WhackSnapshot>, cx: number, cy: number, r: number): void {
  const { ctx } = sc;
  ctx.fillStyle = 'oklch(0.22 0.01 280)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.strokeStyle = sc.theme.danger;
  ctx.stroke();
  const flicker = 0.7 + 0.3 * Math.sin(sc.now / 50);
  ctx.fillStyle = sc.theme.danger;
  ctx.beginPath();
  ctx.arc(cx + r * 0.7, cy - r * 0.9, r * 0.2 * flicker, 0, Math.PI * 2);
  ctx.fill();
}

function drawMole(sc: Scene<WhackSnapshot>, cx: number, cy: number, r: number): void {
  const { ctx } = sc;
  ctx.fillStyle = MOLE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MOLE_DARK;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.25, r * 0.38, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'oklch(0.2 0.02 20)';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.12, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.fillStyle = 'oklch(0.97 0 0)';
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.36, cy - r * 0.25, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'oklch(0.2 0.02 20)';
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.36, cy - r * 0.25, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

const previousHoles = rememberSnapshot<{ n: number; taps: number }[]>();

function celebrate(sc: Scene<WhackSnapshot>): void {
  const { snapshot } = sc;
  const before = previousHoles(snapshot, () => snapshot.holes.map((h) => ({ n: h.n, taps: h.by.length })));
  if (!before) return;
  snapshot.holes.forEach((h, i) => {
    if (h.kind === 'empty' || h.n !== before[i].n || h.by.length <= before[i].taps) return;
    const x = GRID_X + (i % WHACK_COLS) * CELL + CELL / 2;
    const y = GRID_Y + Math.floor(i / WHACK_COLS) * CELL + CELL * 0.45;
    const who = snapshot.players[h.by[h.by.length - 1]];
    if (h.kind === 'bomb') sc.fx.confettiAt(x, y, sc.theme.danger, 16);
    else sc.fx.confettiAt(x, y, who ? sc.info(who.id).color : 55, 20);
  });
}

function drawWorld(sc: Scene<WhackSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  celebrate(sc);

  drawTimer(sc, snapshot.phase === 'playing' && snapshot.limitMs > 0 ? snapshot.roundLeftMs / snapshot.limitMs : null);
  // Everyone's points, with their lives under them: it is a race, so every score is on screen.
  drawStandings(sc, { under: (p, cx, y) => drawLives(ctx, cx, y, p.lives, ENDLESS_LIVES, S * 0.01, theme.danger) });

  for (let i = 0; i < WHACK_HOLES; i++) {
    const hole = snapshot.holes[i];
    const cx = (GRID_X + (i % WHACK_COLS) * CELL + CELL / 2) * S;
    const cy = (GRID_Y + Math.floor(i / WHACK_COLS) * CELL + CELL * 0.62) * S;
    const r = CELL * 0.3 * S;

    ctx.fillStyle = 'oklch(0.3 0.03 60 / 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.15, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'oklch(0.14 0.01 60)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.1, r * 0.95, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    if (hole.kind === 'mole' || hole.kind === 'bomb') {
      const rise = 0.9 + 0.1 * Math.sin(sc.now / 120 + hole.n);
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - r * 1.5, cy - r * 2.2, r * 3, r * 2.2 + r * 0.1);
      ctx.clip();
      const y = cy + r * (1 - rise) * 1.2 - r * 0.1;
      if (hole.kind === 'mole') drawMole(sc, cx, y, r);
      else drawBomb(sc, cx, y, r);
      ctx.restore();
      ctx.lineWidth = Math.max(2, S * 0.008);
      hole.by.forEach((who, k) => {
        const p = snapshot.players[who];
        ctx.strokeStyle = hole.kind === 'bomb' ? theme.danger : p ? sc.info(p.id).color : theme.acc;
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.5, r * (1.1 + 0.18 * k), 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  }
}

const scene: SceneGame<WhackSnapshot> = {
  scroll: 'y',
  taps: WHACK_TAPS,
  drawWorld,
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const whackView: LobbyGameView<WhackSnapshot> = {
  pad: 'none',
  actions: [],
  taps: WHACK_TAPS,
  nameKey: 'spin.lobby.whack.name',
  taglineKey: 'spin.lobby.whack.tagline',
  hintKey: 'spin.lobby.whack.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
