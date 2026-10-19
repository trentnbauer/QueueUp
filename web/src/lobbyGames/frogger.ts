import { FROGGER_CAR_MARGIN, FROGGER_FROG_W, FROGGER_ROW_H, type FroggerSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, coverTile, groundShadow, hueOf, renderScene, type Scene, type SceneGame } from './kit';

const LOOP = 1 + 2 * FROGGER_CAR_MARGIN;
/** A car is this much of its row tall (the rules only look sideways, so this is for the eye). */
const CAR_H = 0.66;
/** The hazard band along the bottom edge, where the screen sweeps you away, as a fraction of the arena. */
const EDGE_BAND = 0.045;

/** Where a row sits on the arena (0 at the top, 1 at the bottom) given where the bottom edge is: the edge is the bottom of the screen
 * and everything is measured up from it. `z` is a height in arenas up from the start of the run. */
const screenY = (z: number, edge: number) => 1 - (z - edge);

function drawRows(sc: Scene<FroggerSnapshot>, edge: number, age: number): void {
  const { ctx, S, snapshot, theme } = sc;
  const rowH = FROGGER_ROW_H * S;
  const byRow = new Map(snapshot.rows.map((r) => [r.r, r]));

  for (const row of snapshot.rows) {
    const top = screenY((row.r + 1) * FROGGER_ROW_H, edge) * S;
    if (top > S || top + rowH < 0) continue;
    if (row.kind === 'grass') {
      ctx.fillStyle = 'oklch(0.3 0.06 150 / 0.55)';
      ctx.fillRect(0, top, S, rowH);
      // Blades of grass: a few short ticks, always in the same places on a row.
      ctx.fillStyle = 'oklch(0.55 0.1 150 / 0.4)';
      for (let i = 0; i < 14; i++) ctx.fillRect(((row.r * 37 + i * 71) % 100) / 100 * S, top + rowH * (0.2 + ((i * 29 + row.r * 13) % 60) / 100), 2, rowH * 0.16);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = STAGE.ground;
    ctx.fillRect(0, top, S, rowH);
    ctx.restore();
    // The line between two road rows is dashed; a road beside grass has a solid kerb.
    const above = byRow.get(row.r + 1);
    ctx.fillStyle = above?.kind === 'road' ? STAGE.groundTick : STAGE.groundLine;
    if (above?.kind === 'road') for (let x = 0; x < S; x += S * 0.08) ctx.fillRect(x, top - 1, S * 0.04, 2);
    else ctx.fillRect(0, top - 1, S, 2);
  }

  // Cars last, so none is hidden by the next row's surface. They keep driving while the next snapshot is on its way.
  for (const row of snapshot.rows) {
    if (row.kind !== 'road') continue;
    const top = screenY((row.r + 1) * FROGGER_ROW_H, edge) * S;
    if (top > S || top + rowH < 0) continue;
    const w = row.w * S;
    const h = rowH * CAR_H;
    const cy = top + rowH / 2;
    row.cars.forEach((x0, i) => {
      const at = (((x0 + FROGGER_CAR_MARGIN + row.v * age) % LOOP) + LOOP) % LOOP - FROGGER_CAR_MARGIN;
      const cx = at * S;
      if (cx + w / 2 < 0 || cx - w / 2 > S) return;
      groundShadow(ctx, cx + S * 0.004, cy + h / 2, w * 0.5);
      coverTile(ctx, cx - w / 2, cy - h / 2, w, h, hueOf(row.r * 5 + i), S * 0.008, true);
      // A bright strip on the end it is driving toward, so the way it is going reads at a glance.
      ctx.fillStyle = 'oklch(1 0 0 / 0.6)';
      ctx.fillRect(row.v > 0 ? cx + w / 2 - S * 0.012 : cx - w / 2 + S * 0.004, cy - h * 0.3, S * 0.008, h * 0.6);
    });
  }

  // The bottom edge: a glow and a hazard band. Whatever it reaches is out.
  const band = S * EDGE_BAND;
  const glow = ctx.createLinearGradient(0, S - band * 4, 0, S);
  glow.addColorStop(0, 'oklch(0.68 0.2 25 / 0)');
  glow.addColorStop(1, 'oklch(0.68 0.2 25 / 0.3)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, S - band * 4, S, band * 4);
  ctx.fillStyle = 'oklch(0.14 0.008 55 / 0.85)';
  ctx.fillRect(0, S - band, S, band);
  ctx.fillStyle = theme.danger;
  const stripe = band * 1.2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, S - band, S, band);
  ctx.clip();
  for (let x = -band; x < S + band; x += stripe * 2) {
    ctx.beginPath();
    ctx.moveTo(x, S);
    ctx.lineTo(x + stripe, S);
    ctx.lineTo(x + stripe + band, S - band);
    ctx.lineTo(x + band, S - band);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWorld(sc: Scene<FroggerSnapshot>): void {
  const { S, snapshot, drift } = sc;
  const age = snapshot.phase === 'playing' ? sc.fx.age(snapshot, sc.now) : 0;
  // The bottom edge keeps rising while the next snapshot is on its way.
  const edge = snapshot.edge + drift;
  drawRows(sc, edge, age);

  const r = (FROGGER_FROG_W / 2) * S * 1.15;
  for (const i of sc.order()) {
    const c = snapshot.players[i];
    if (!c.alive) continue; // out: the burst has taken them
    // Eased in the road's own rows, so a hopper standing on a row stays on it as the screen rises.
    const row = sc.ease(`${c.id}:row`, 0, c.row).y;
    const x = sc.ease(`${c.id}:x`, c.x, 0).x;
    sc.drawPlayer(c.id, x * S, screenY((row + 0.5) * FROGGER_ROW_H, edge) * S, r, r);
  }
}

const scene: SceneGame<FroggerSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: screenY((snapshot.players[index].row + 0.5) * FROGGER_ROW_H, snapshot.edge) }),
};

export const froggerView: LobbyGameView<FroggerSnapshot> = {
  // Left and right to slide, and one Hop button (Space or Up), or tap anywhere on the arena.
  pad: 'leftRight',
  actions: [{ name: 'hop', labelKey: 'spin.lobby.frogger.hop', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'hop',
  nameKey: 'spin.lobby.frogger.name',
  taglineKey: 'spin.lobby.frogger.tagline',
  hintKey: 'spin.lobby.frogger.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
