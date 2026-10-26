import { ENDLESS_LIVES, WHACK_COLS, WHACK_HOLES, type WhackSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, drawLives, renderScene, rememberSnapshot, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

/** Where the grid is on the arena, as fractions of its side: one shared 3 x 3 grid. */
const GRID_X = 0.125;
const GRID_Y = 0.2;
const CELL = 0.25;
/** The row of everyone's points sits between the heads-up display and the grid. */
const CHIPS_Y = 0.15;
const CHIP_R = 0.022;
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
  ctx.fillStyle = 'oklch(0.97 0 0)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.36, cy - r * 0.25, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'oklch(0.2 0.02 20)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.36, cy - r * 0.25, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Each hole as of the last snapshot drawn: which mole or bomb is up and how many people have tapped it. */
const previousHoles = rememberSnapshot<{ n: number; taps: number }[]>();

/** A mole that has just been tapped bursts into confetti in the colour of whoever tapped it; a bomb into a red burst. */
function celebrate(sc: Scene<WhackSnapshot>): void {
  const { snapshot } = sc;
  const before = previousHoles(snapshot, () => snapshot.holes.map((h) => ({ n: h.n, taps: h.by.length })));
  if (!before) return;
  snapshot.holes.forEach((h, i) => {
    if (h.kind === 'empty' || h.n !== before[i].n || h.by.length <= before[i].taps) return;
    const x = GRID_X + (i % WHACK_COLS) * CELL + CELL / 2;
    const y = GRID_Y + Math.floor(i / WHACK_COLS) * CELL + CELL * 0.45;
    const who = snapshot.players[h.by[h.by.length - 1]];
    if (h.kind === 'bomb') sc.fx.confettiAt(x, y, 'oklch(0.7 0.2 25)', 16, 'out');
    else sc.fx.confettiAt(x, y, who ? sc.info(who.id).color : 55, 20);
  });
}

function drawWorld(sc: Scene<WhackSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  celebrate(sc);

  // Time left in the round, as a bar draining along the top edge.
  if (snapshot.phase === 'playing' && snapshot.limitMs > 0) {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / snapshot.limitMs), S * 0.008);
  }

  // Everyone's points, in one row: it is a race, so every score is on screen.
  const n = snapshot.players.length;
  const step = Math.min(0.09, 0.84 / Math.max(1, n));
  ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // watching until the next round
    const cx = (0.5 + (i - (n - 1) / 2) * step) * S;
    sc.drawPlayer(p.id, cx, CHIPS_Y * S, CHIP_R * S, CHIP_R * S);
    ctx.fillStyle = theme.text;
    ctx.fillText(String(p.meters), cx, (CHIPS_Y + CHIP_R + 0.03) * S);
    drawLives(ctx, cx, (CHIPS_Y + CHIP_R + 0.058) * S, p.lives, ENDLESS_LIVES, S * 0.011, theme.danger);
  }

  for (let i = 0; i < WHACK_HOLES; i++) {
    const hole = snapshot.holes[i];
    const cx = (GRID_X + (i % WHACK_COLS) * CELL + CELL / 2) * S;
    const cy = (GRID_Y + Math.floor(i / WHACK_COLS) * CELL + CELL * 0.62) * S;
    const r = CELL * 0.3 * S;

    // The hole: a dark oval in a mound of earth.
    ctx.fillStyle = 'oklch(0.3 0.03 60 / 0.6)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.15, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'oklch(0.14 0.01 60)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.1, r * 0.95, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    if (hole.kind === 'mole' || hole.kind === 'bomb') {
      // Sits up out of the hole with a little bob; clipped to the part above the hole's back edge.
      const rise = 0.9 + 0.1 * Math.sin(sc.now / 120 + hole.n);
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - r * 1.5, cy - r * 2.2, r * 3, r * 2.2 + r * 0.1);
      ctx.clip();
      const y = cy + r * (1 - rise) * 1.2 - r * 0.1;
      if (hole.kind === 'mole') drawMole(sc, cx, y, r);
      else drawBomb(sc, cx, y, r);
      ctx.restore();
      // A ring in the colour of each person who has tapped it (red for a bomb), one inside the next.
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
  // Where a burst would start: nobody is knocked out here, so this is only the row of points.
  anchor: (snapshot, index) => ({ x: 0.5 + (index - (snapshot.players.length - 1) / 2) * 0.09, y: CHIPS_Y }),
};

export const whackView: LobbyGameView<WhackSnapshot> = {
  // The holes are the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: WHACK_TAPS,
  nameKey: 'spin.lobby.whack.name',
  taglineKey: 'spin.lobby.whack.tagline',
  hintKey: 'spin.lobby.whack.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
