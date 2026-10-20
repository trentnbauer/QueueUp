import { LAVA_PLATFORM_H, LAVA_PLATFORM_W, LAVA_PLAYER_W, type LavaSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { coverTile, hueOf, renderScene, type Scene, type SceneGame } from './kit';

function drawWorld(sc: Scene<LavaSnapshot>): void {
  const { ctx, S, snapshot, drift, theme, now } = sc;
  // Between snapshots the screen carries on climbing (things slide down it) and each ball on along the way it was going.
  const age = sc.fx.age(snapshot, now);

  // The bottom of the screen is where you are out: a glowing orange pool of lava with a wavering surface.
  const top = S * 0.94;
  const pool = ctx.createLinearGradient(0, top, 0, S);
  pool.addColorStop(0, 'oklch(0.72 0.19 50)');
  pool.addColorStop(1, 'oklch(0.45 0.18 30)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.moveTo(0, S);
  for (let x = 0; x <= S; x += S / 24) ctx.lineTo(x, top + Math.sin((x / S) * 14 + now / 400) * S * 0.006);
  ctx.lineTo(S, S);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createLinearGradient(0, top - S * 0.16, 0, top);
  glow.addColorStop(0, 'oklch(0.72 0.19 50 / 0)');
  glow.addColorStop(1, 'oklch(0.72 0.19 50 / 0.25)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, top - S * 0.16, S, S * 0.16);

  // The platforms: game covers laid flat (the ground everyone starts on spans the screen). The ones that slide have a bright edge.
  const h = LAVA_PLATFORM_H * S;
  for (const plat of snapshot.platforms) {
    const y = (plat.y + drift) * S;
    if (y < -h || y > S) continue;
    const w = plat.wide ? S : LAVA_PLATFORM_W * S;
    const x = plat.wide ? 0 : plat.x * S - w / 2;
    coverTile(ctx, x, y, w, h, hueOf(plat.n), S * 0.008);
    if (plat.moving) {
      ctx.strokeStyle = theme.acc;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
    }
  }

  const r = (LAVA_PLAYER_W * S) / 2;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // fell off the bottom: the burst has taken them
    const feet = (p.y + (snapshot.speed - p.vy) * age) * S;
    // The screen wraps: near an edge the ball is drawn again on the other side.
    for (const x of [p.x * S, p.x * S - S, p.x * S + S]) if (x > -r && x < S + r) sc.drawPlayer(p.id, x, feet - r, r, r);
  }
}

const scene: SceneGame<LavaSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: Math.min(0.96, snapshot.players[index].y) }),
};

export const lavaView: LobbyGameView<LavaSnapshot> = {
  // Just left and right: the ball bounces by itself.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.lava.name',
  taglineKey: 'spin.lobby.lava.tagline',
  hintKey: 'spin.lobby.lava.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
