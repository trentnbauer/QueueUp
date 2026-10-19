import { LAVA_PLAYER_R, LAVA_PLANK_H, LAVA_SURFACE, type LavaSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { coverTile, hueOf, renderScene, type Scene, type SceneGame } from './kit';

/** Players share one column of planks, so they are fanned out a little across it (drawing only). */
const FAN = 0.05;

/** Where a height up from the start of the run is on the arena (0 at the top, 1 at the bottom), given where the lava
 * surface is: the lava sits at `LAVA_SURFACE` from the bottom, and everything else is measured up from it. */
const screenY = (z: number, lava: number) => 1 - LAVA_SURFACE - (z - lava);

function drawWorld(sc: Scene<LavaSnapshot>): void {
  const { ctx, S, snapshot, drift, now } = sc;
  // The lava keeps rising while the next snapshot is on its way.
  const lava = snapshot.lava + drift;

  // The lava: a glowing orange pool at the bottom, with a wavering surface.
  const top = (1 - LAVA_SURFACE) * S;
  const pool = ctx.createLinearGradient(0, top, 0, S);
  pool.addColorStop(0, 'oklch(0.72 0.19 50)');
  pool.addColorStop(1, 'oklch(0.45 0.18 30)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.moveTo(0, S);
  for (let x = 0; x <= S; x += S / 24) ctx.lineTo(x, top + Math.sin(x / S * 14 + now / 400) * S * 0.006);
  ctx.lineTo(S, S);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createLinearGradient(0, top - S * 0.16, 0, top);
  glow.addColorStop(0, 'oklch(0.72 0.19 50 / 0)');
  glow.addColorStop(1, 'oklch(0.72 0.19 50 / 0.25)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, top - S * 0.16, S, S * 0.16);

  // Planks: full-width game covers, which stay put while the lava climbs toward them.
  for (const p of snapshot.planks) {
    const y = screenY(p.z, lava) * S;
    if (y < -S * 0.1 || y > S) continue;
    coverTile(ctx, S * 0.04, y, S * 0.92, LAVA_PLANK_H * S, hueOf(p.n), S * 0.012);
  }

  const n = snapshot.players.length;
  const r = LAVA_PLAYER_R * S;
  for (const i of sc.order()) {
    const c = snapshot.players[i];
    if (!c.alive) continue; // fallen in: the burst has taken them
    const cx = (0.5 + (i - (n - 1) / 2) * FAN) * S;
    // Eased in the world's own heights, so a player standing on a plank stays on it as the lava rises.
    const z = sc.ease(c.id, 0, c.z).y;
    sc.drawPlayer(c.id, cx, screenY(z, lava) * S - r, r, r);
  }
}

const scene: SceneGame<LavaSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => {
    const n = snapshot.players.length;
    return { x: 0.5 + (index - (n - 1) / 2) * FAN, y: screenY(snapshot.players[index].z, snapshot.lava) };
  },
};

export const lavaView: LobbyGameView<LavaSnapshot> = {
  // One button: Jump (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'jump', labelKey: 'spin.lobby.lava.jump', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'jump',
  nameKey: 'spin.lobby.lava.name',
  taglineKey: 'spin.lobby.lava.tagline',
  hintKey: 'spin.lobby.lava.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
