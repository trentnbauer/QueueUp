import { LASER_HEIGHT, LASER_PLAYER_WIDTH, LASER_PLAYER_Y, type LaserSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { coverTile, drawFloor, groundShadow, hueOf, renderScene, type Scene, type SceneGame } from './kit';

/** Where the floor is, just under the players. */
const FLOOR = 0.96;

function drawWorld(sc: Scene<LaserSnapshot>): void {
  const { ctx, S, snapshot, drift, theme } = sc;
  drawFloor(sc, S * FLOOR);

  // Rows of lasers: a glowing beam either side of the gap, ending in a game cover that holds it.
  const h = LASER_HEIGHT * S;
  for (const row of snapshot.rows) {
    const y = (row.y + drift) * S;
    if (y < -h || y > S) continue;
    const left = (row.gap - row.width / 2) * S;
    const right = (row.gap + row.width / 2) * S;
    const glow = ctx.createLinearGradient(0, y - h, 0, y + h * 2);
    glow.addColorStop(0, 'oklch(0.68 0.2 25 / 0)');
    glow.addColorStop(0.5, 'oklch(0.68 0.2 25 / 0.35)');
    glow.addColorStop(1, 'oklch(0.68 0.2 25 / 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, y - h, left, h * 3);
    ctx.fillRect(right, y - h, S - right, h * 3);
    ctx.fillStyle = theme.danger;
    ctx.fillRect(0, y + h * 0.35, left, h * 0.3);
    ctx.fillRect(right, y + h * 0.35, S - right, h * 0.3);
    const post = S * 0.035;
    coverTile(ctx, left - post, y, post, h, hueOf(row.n), S * 0.008);
    coverTile(ctx, right, y, post, h, hueOf(row.n), S * 0.008);
  }

  const half = (LASER_PLAYER_WIDTH * S) / 2;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // knocked out: the burst has taken them
    const cx = sc.ease(p.id, p.x, 0).x * S;
    groundShadow(ctx, cx, S * FLOOR, half);
    sc.drawPlayer(p.id, cx, LASER_PLAYER_Y * S, half, half);
  }
}

const scene: SceneGame<LaserSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: LASER_PLAYER_Y }),
};

export const laserView: LobbyGameView<LaserSnapshot> = {
  // Just left and right.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.laser.name',
  taglineKey: 'spin.lobby.laser.tagline',
  hintKey: 'spin.lobby.laser.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
