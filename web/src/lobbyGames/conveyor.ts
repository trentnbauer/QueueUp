import { CONVEYOR_CRATE_H, CONVEYOR_CRATE_W, CONVEYOR_GROUND_Y, CONVEYOR_PLAYER_H, CONVEYOR_PLAYER_W, CONVEYOR_PLAYER_X, CONVEYOR_STACK_H, type ConveyorSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, courseOffset, coverTile, drawFloor, groundShadow, hueOf, renderScene, type Scene, type SceneGame } from './kit';

/** How far apart the rollers on the belt are, as a fraction of the arena. */
const ROLLER = 0.06;

function drawWorld(sc: Scene<ConveyorSnapshot>): void {
  const { ctx, S, snapshot, drift, theme } = sc;
  const ground = CONVEYOR_GROUND_Y * S;
  drawFloor(sc, ground);

  // The belt: rollers sliding along it the way the things on it go (right, toward the player), at exactly the belt's speed.
  ctx.fillStyle = STAGE.groundTick;
  const period = ROLLER * S;
  for (let x = courseOffset(sc, period) - period; x < S; x += period) ctx.fillRect(x, ground + S * 0.03, period * 0.45, 3);
  ctx.fillRect(0, ground + S * 0.075, S, 1);

  // Pits: a gap in the belt, dark all the way down.
  for (const o of snapshot.obstacles) {
    if (o.kind !== 'pit') continue;
    const x = (o.x + drift - o.w / 2) * S;
    ctx.fillStyle = 'oklch(0.1 0.01 55)';
    ctx.fillRect(x, ground, o.w * S, S - ground);
    ctx.fillStyle = theme.danger;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, ground, 2, S * 0.05);
    ctx.fillRect(x + o.w * S - 2, ground, 2, S * 0.05);
    ctx.globalAlpha = 1;
  }

  // Crates (one tile) and tall stacks (two), standing on the belt: game covers, as obstacles are everywhere.
  const w = CONVEYOR_CRATE_W * S;
  for (const o of snapshot.obstacles) {
    if (o.kind === 'pit') continue;
    const x = (o.x + drift) * S - w / 2;
    const h = (o.kind === 'stack' ? CONVEYOR_STACK_H : CONVEYOR_CRATE_H) * S;
    const tiles = o.kind === 'stack' ? 2 : 1;
    for (let k = 0; k < tiles; k++) coverTile(ctx, x, ground - h + (k * h) / tiles, w, h / tiles, hueOf(o.n + k), S * 0.008);
  }

  // Everyone stands on the belt in a line, a little apart so they can be told apart (where the hit happens is the same for all).
  const pw = CONVEYOR_PLAYER_W * S;
  const ph = CONVEYOR_PLAYER_H * S;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const x = (CONVEYOR_PLAYER_X - (i % 5) * 0.03) * S;
    const lift = p.h * S;
    groundShadow(ctx, x, ground, pw * (1 - p.h * 2));
    sc.drawPlayer(p.id, x, ground - lift - ph / 2, pw / 2, ph / 2);
  }
}

const scene: SceneGame<ConveyorSnapshot> = {
  // The belt carries things sideways.
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => ({ x: CONVEYOR_PLAYER_X - (index % 5) * 0.03, y: CONVEYOR_GROUND_Y - CONVEYOR_PLAYER_H / 2 }),
};

export const conveyorView: LobbyGameView<ConveyorSnapshot> = {
  // One button: Jump (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'jump', labelKey: 'spin.lobby.conveyor.jump', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'jump',
  nameKey: 'spin.lobby.conveyor.name',
  taglineKey: 'spin.lobby.conveyor.tagline',
  hintKey: 'spin.lobby.conveyor.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
