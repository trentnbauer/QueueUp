import { DODGE_BLOCK_HEIGHT, DODGE_PLAYER_WIDTH, DODGE_PLAYER_Y, type DodgeSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { coverTile, drawFloor, groundShadow, hueOf, renderScene, type Scene, type SceneGame } from './kit';

/** Where the floor is, just under the players. */
const FLOOR = 0.95;

function drawWorld(sc: Scene<DodgeSnapshot>): void {
  const { ctx, S, snapshot, drift } = sc;
  const floor = S * FLOOR;
  drawFloor(sc, floor);

  // Falling blocks: game covers, each with a motion streak above it and a shadow that grows on the floor.
  const blockH = DODGE_BLOCK_HEIGHT * S;
  for (const b of snapshot.blocks) {
    const w = b.w * S;
    const x = b.x * S - w / 2;
    const y = (b.y + drift) * S - blockH / 2;
    const hue = hueOf(b.n);
    const streak = ctx.createLinearGradient(0, y - blockH * 2, 0, y);
    streak.addColorStop(0, `oklch(0.66 0.12 ${hue} / 0)`);
    streak.addColorStop(1, `oklch(0.66 0.12 ${hue} / 0.28)`);
    ctx.fillStyle = streak;
    ctx.fillRect(x + w * 0.15, y - blockH * 2, w * 0.7, blockH * 2);
    coverTile(ctx, x, y, w, blockH, hue, S * 0.016);
    if (b.y > 0.6) {
      const k = Math.min(1, (b.y - 0.6) / 0.32);
      ctx.fillStyle = `oklch(0 0 0 / ${0.3 * k})`;
      ctx.beginPath();
      ctx.ellipse(b.x * S, floor, w * 0.5 * k, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const radius = (DODGE_PLAYER_WIDTH * S) / 2;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // knocked out: the burst has taken them
    const cx = sc.ease(p.id, p.x, 0).x * S;
    const cy = DODGE_PLAYER_Y * S;
    groundShadow(ctx, cx, floor, radius);
    if (p.dir) {
      // A faint after-image on the side they are moving away from.
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = sc.info(p.id).color;
      ctx.beginPath();
      ctx.ellipse(cx - p.dir * radius * 1.1, cy, radius * 0.8, radius * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    sc.drawPlayer(p.id, cx, cy, radius, radius);
  }
}

const scene: SceneGame<DodgeSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: DODGE_PLAYER_Y }),
};

export const dodgeView: LobbyGameView<DodgeSnapshot> = {
  // Just left and right.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.dodge.name',
  taglineKey: 'spin.lobby.dodge.tagline',
  hintKey: 'spin.lobby.dodge.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
