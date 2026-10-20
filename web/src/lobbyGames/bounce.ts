import { BOUNCE_PLATFORM_H, BOUNCE_PLATFORM_W, BOUNCE_PLAYER_W, type BounceSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { coverTile, hueOf, renderScene, type Scene, type SceneGame } from './kit';

function drawWorld(sc: Scene<BounceSnapshot>): void {
  const { ctx, S, snapshot, drift, theme, now } = sc;
  // Between snapshots the screen carries on climbing (things slide down it) and each ball on along the way it was going.
  const age = sc.fx.age(snapshot, now);

  // The bottom of the screen is where you are out: a red glow along it.
  const glow = ctx.createLinearGradient(0, S * 0.9, 0, S);
  glow.addColorStop(0, 'oklch(0.68 0.2 25 / 0)');
  glow.addColorStop(1, 'oklch(0.68 0.2 25 / 0.35)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, S * 0.9, S, S * 0.1);

  // The platforms: game covers laid flat (the ground everyone starts on spans the screen). The ones that slide have a bright edge.
  const h = BOUNCE_PLATFORM_H * S;
  for (const plat of snapshot.platforms) {
    const y = (plat.y + drift) * S;
    if (y < -h || y > S) continue;
    const w = plat.wide ? S : BOUNCE_PLATFORM_W * S;
    const x = plat.wide ? 0 : plat.x * S - w / 2;
    coverTile(ctx, x, y, w, h, hueOf(plat.n), S * 0.008);
    if (plat.moving) {
      ctx.strokeStyle = theme.acc;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
    }
  }

  const r = (BOUNCE_PLAYER_W * S) / 2;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // fell off the bottom: the burst has taken them
    const feet = (p.y + (snapshot.speed - p.vy) * age) * S;
    // The screen wraps: near an edge the ball is drawn again on the other side.
    for (const x of [p.x * S, p.x * S - S, p.x * S + S]) if (x > -r && x < S + r) sc.drawPlayer(p.id, x, feet - r, r, r);
  }
}

const scene: SceneGame<BounceSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: Math.min(0.96, snapshot.players[index].y) }),
};

export const bounceView: LobbyGameView<BounceSnapshot> = {
  // Just left and right: the ball bounces by itself.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.bounce.name',
  taglineKey: 'spin.lobby.bounce.tagline',
  hintKey: 'spin.lobby.bounce.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
