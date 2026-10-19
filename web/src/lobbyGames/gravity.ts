import { GRAVITY_PLAYER_R, GRAVITY_SPIKE_H, GRAVITY_X, type GravitySnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, courseOffset, coverTile, hueOf, renderScene, type Scene, type SceneGame } from './kit';

/** Players share one spot on the screen, so they are fanned out a little along it (drawing only). */
const FAN = 0.007;
/** The floor and ceiling strips, as fractions of the arena's height. */
const BAND = 0.03;

function drawWorld(sc: Scene<GravitySnapshot>): void {
  const { ctx, S, snapshot, drift, theme } = sc;
  const band = BAND * S;
  // y runs 0 (floor) to 1 (ceiling); the canvas counts down from the top.
  const py = (y: number) => S * (1 - y);

  // The corridor: a floor and a ceiling, each with ticks that move at the course's speed.
  ctx.fillStyle = STAGE.ground;
  ctx.fillRect(0, S - band, S, band);
  ctx.fillRect(0, 0, S, band);
  ctx.fillStyle = STAGE.groundLine;
  ctx.fillRect(0, S - band, S, 1);
  ctx.fillRect(0, band, S, 1);
  const tick = S * 0.08;
  const offset = courseOffset(sc, tick);
  ctx.fillStyle = STAGE.groundTick;
  for (let x = -tick + offset; x < S; x += tick) {
    ctx.fillRect(x, S - band * 0.55, tick * 0.35, 2);
    ctx.fillRect(x, band * 0.45, tick * 0.35, 2);
  }

  // Spikes: game covers standing on the floor or hanging from the ceiling, with a red tip on the dangerous edge.
  const h = GRAVITY_SPIKE_H * S;
  for (const s of snapshot.spikes) {
    const w = s.w * S;
    const x = (s.x - drift) * S - w / 2;
    const y = s.side === 0 ? S - band - h : band;
    coverTile(ctx, x, y, w, h, hueOf(s.n), S * 0.012);
    ctx.fillStyle = theme.danger;
    ctx.fillRect(x, s.side === 0 ? y : y + h - 3, w, 3);
  }

  const r = GRAVITY_PLAYER_R * S;
  const n = snapshot.players.length;
  for (const i of sc.order()) {
    const f = snapshot.players[i];
    if (!f.alive) continue; // knocked out: the burst has taken them
    const cx = (GRAVITY_X + (i - (n - 1) / 2) * FAN) * S;
    const cy = py(sc.ease(f.id, 0, f.y).y);
    sc.drawPlayer(f.id, cx, cy, r, r);
  }
}

const scene: SceneGame<GravitySnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => {
    const n = snapshot.players.length;
    return { x: GRAVITY_X + (index - (n - 1) / 2) * FAN, y: 1 - snapshot.players[index].y };
  },
};

export const gravityView: LobbyGameView<GravitySnapshot> = {
  // One button: Flip (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'flip', labelKey: 'spin.lobby.gravity.flip', keys: [' ', 'ArrowUp', 'ArrowDown', 'w', 's'] }],
  tapAction: 'flip',
  nameKey: 'spin.lobby.gravity.name',
  taglineKey: 'spin.lobby.gravity.tagline',
  hintKey: 'spin.lobby.gravity.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
