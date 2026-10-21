import { SWING_PLAYER_R, SWING_REACH, type SwingSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { renderScene, type Scene, type SceneGame } from './kit';

/** Where on the arena (0 left, 1 right) the camera keeps the viewer's own swinger, as it follows them along the course. */
const FOLLOW_AT = 0.3;
/** Where the camera was drawn from last frame, so a knock-out burst starts where the swinger was seen. */
let lastCam = 0;

function drawWorld(sc: Scene<SwingSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  const mine = snapshot.players.find((p) => p.id === sc.me);
  // The camera follows you along the course, eased; a spectator (or someone out) is shown the furthest swinger still going.
  const lead = snapshot.players.filter((p) => p.alive).sort((a, b) => b.x - a.x)[0];
  const follow = mine?.alive ? mine : lead ?? mine;
  const cam = sc.ease('cam', (follow?.x ?? 0.7) - FOLLOW_AT, 0).x;
  lastCam = cam;
  const sx = (x: number) => (x - cam) * S;
  const sy = (y: number) => y * S;

  // The bottom of the screen: falling there is the end of a run.
  const glow = ctx.createLinearGradient(0, S * 0.9, 0, S);
  glow.addColorStop(0, 'oklch(0.68 0.2 25 / 0)');
  glow.addColorStop(1, 'oklch(0.68 0.2 25 / 0.35)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, S * 0.9, S, S * 0.1);

  // The wall chasing from behind: a red wash up to its edge.
  const edge = sx(snapshot.wall + sc.fx.age(snapshot, now) * snapshot.speed);
  if (edge > 0) {
    const wash = ctx.createLinearGradient(Math.max(0, edge - S * 0.25), 0, edge, 0);
    wash.addColorStop(0, 'oklch(0.55 0.2 25 / 0.1)');
    wash.addColorStop(1, 'oklch(0.6 0.22 25 / 0.55)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, Math.min(S, edge), S);
    ctx.fillStyle = theme.danger;
    ctx.fillRect(Math.min(S, edge) - 3, 0, 3, S);
  }

  // The anchors, with a fainter ring on the one you hang from.
  const held = mine?.a ?? -1;
  for (const a of snapshot.anchors) {
    const x = sx(a.x);
    if (x < -S * 0.05 || x > S * 1.05) continue;
    ctx.fillStyle = a.n === held ? theme.acc : 'oklch(1 0 0 / 0.55)';
    ctx.beginPath();
    ctx.arc(x, sy(a.y), S * 0.012, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'oklch(1 0 0 / 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, sy(a.y), S * 0.022, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Your reach while you are in the air: a faint circle round you.
  if (mine?.alive && mine.a < 0) {
    const px = sx(mine.x);
    ctx.strokeStyle = 'oklch(1 0 0 / 0.16)';
    ctx.setLineDash([S * 0.012, S * 0.012]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, sy(mine.y), SWING_REACH * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const r = SWING_PLAYER_R * S;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const pos = sc.ease(p.id, p.x, p.y);
    const x = sx(pos.x);
    const y = sy(pos.y);
    if (x < -r * 4 || x > S + r * 4) continue;
    // The rope, from the anchor they hang from.
    const anchor = p.a >= 0 ? snapshot.anchors.find((a) => a.n === p.a) : undefined;
    if (anchor) {
      ctx.strokeStyle = p.id === sc.me ? theme.text : 'oklch(1 0 0 / 0.4)';
      ctx.lineWidth = p.id === sc.me ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(sx(anchor.x), sy(anchor.y));
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    sc.drawPlayer(p.id, x, y, r, r);
  }
}

const scene: SceneGame<SwingSnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => {
    const p = snapshot.players[index];
    return { x: Math.min(1, Math.max(0, p.x - lastCam)), y: Math.min(1, p.y) };
  },
};

export const swingView: LobbyGameView<SwingSnapshot> = {
  // Left and right pump the swing, and one Grab button (Space or Up) lets go and, in the air, grabs; or tap anywhere on the arena.
  pad: 'leftRight',
  actions: [{ name: 'grab', labelKey: 'spin.lobby.swing.grab', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'grab',
  nameKey: 'spin.lobby.swing.name',
  taglineKey: 'spin.lobby.swing.tagline',
  hintKey: 'spin.lobby.swing.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
