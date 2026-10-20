import { TUNNEL_SHIP_W, TUNNEL_SHIP_Y, tunnelAt, type TunnelSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { groundShadow, renderScene, type Scene, type SceneGame } from './kit';

/** How many bands the walls are drawn in down the screen (each a straight piece). */
const BANDS = 56;
/** A mark on the walls every this many screens of tunnel, so the speed can be seen. */
const TICK_EVERY = 0.15;

function drawWorld(sc: Scene<TunnelSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  // Between snapshots the tunnel carries on coming at the speed it was going.
  const dist = snapshot.dist + snapshot.speed * sc.fx.age(snapshot, now);
  /** How far into the course the screen's row `y` (0 top, 1 bottom) is: what is higher up is further ahead. */
  const zAt = (y: number) => dist + (TUNNEL_SHIP_Y - y);

  // The open space, then the rock either side of it.
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= BANDS; i++) {
    const { mid, half } = tunnelAt(snapshot.course, zAt(i / BANDS));
    left.push((mid - half) * S);
    right.push((mid + half) * S);
  }
  const side = (edge: number[], outer: number): void => {
    ctx.beginPath();
    ctx.moveTo(outer, 0);
    for (let i = 0; i <= BANDS; i++) ctx.lineTo(edge[i], (i / BANDS) * S);
    ctx.lineTo(outer, S);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = 'oklch(0.28 0.03 40)';
  side(left, 0);
  side(right, S);
  // A glowing edge along each wall.
  ctx.lineWidth = 3;
  ctx.strokeStyle = theme.danger;
  ctx.shadowColor = theme.danger;
  ctx.shadowBlur = S * 0.02;
  for (const edge of [left, right]) {
    ctx.beginPath();
    for (let i = 0; i <= BANDS; i++) (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, edge[i], (i / BANDS) * S);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // Marks on the rock at fixed places in the course, so they slide past at exactly the tunnel's speed.
  ctx.fillStyle = 'oklch(1 0 0 / 0.12)';
  const first = Math.ceil(zAt(1) / TICK_EVERY) * TICK_EVERY;
  for (let z = first; z <= zAt(0); z += TICK_EVERY) {
    const y = (TUNNEL_SHIP_Y - (z - dist)) * S;
    const { mid, half } = tunnelAt(snapshot.course, z);
    ctx.fillRect((mid - half) * S - S * 0.03, y, S * 0.03, 2);
    ctx.fillRect((mid + half) * S, y, S * 0.03, 2);
  }

  const r = (TUNNEL_SHIP_W * S) / 2;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const x = sc.ease(p.id, p.x, 0).x * S;
    groundShadow(ctx, x, (TUNNEL_SHIP_Y + TUNNEL_SHIP_W) * S, r);
    sc.drawPlayer(p.id, x, TUNNEL_SHIP_Y * S, r, r);
  }
}

const scene: SceneGame<TunnelSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: TUNNEL_SHIP_Y }),
};

export const tunnelView: LobbyGameView<TunnelSnapshot> = {
  // Just left and right.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.tunnel.name',
  taglineKey: 'spin.lobby.tunnel.tagline',
  hintKey: 'spin.lobby.tunnel.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
