import { ROPE_PLAYER_RADIUS, type RopeSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, drawFloor, groundShadow, renderScene, type Scene, type SceneGame } from './kit';

/** Where the floor is, as a fraction of the arena's height. */
const FLOOR = 0.9;
/** How high the middle of the rope swings above the floor at the top of its swing. */
const ROPE_TOP = 0.7;
/** Where the handles are held, above the floor. The rope is drawn between them. */
const HANDLE_Y = 0.14;
const HANDLE_X = 0.04;

function drawWorld(sc: Scene<RopeSnapshot>): void {
  const { ctx, S, snapshot } = sc;
  const floor = S * FLOOR;
  drawFloor(sc, floor);

  // The rope keeps turning between snapshots, so carry it on from where the last one left it.
  const ahead = snapshot.phase === 'playing' ? sc.fx.age(snapshot, sc.now) / snapshot.period : 0;
  const angle = (snapshot.angle + ahead) % 1;
  // 0 is on the floor, 1 is overhead.
  const lift = (1 - Math.cos(angle * Math.PI * 2)) / 2;
  const handleY = floor - HANDLE_Y * S;
  const midY = floor - lift * ROPE_TOP * S;
  const left = HANDLE_X * S;
  const right = S - HANDLE_X * S;

  // The rope turns over the jumpers' heads: it comes up on the far side of them (angle 0 to 0.5) and down
  // on the near side (0.5 to 1), where it meets their feet. On the far side it is behind them, so it is
  // drawn first and darker, which is what makes it look as if it is going round.
  const behind = angle < 0.5;
  const drawRope = () => strokeRope(sc, { handleY, midY, left, right }, behind);

  // The two handles.
  ctx.fillStyle = STAGE.hudStroke;
  for (const x of [left, right]) {
    ctx.beginPath();
    ctx.arc(x, handleY, S * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }

  // Behind the jumpers: before them, so they stand in front of it.
  if (behind) drawRope();

  const radius = ROPE_PLAYER_RADIUS * S;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // caught: the burst has taken them
    const cx = p.x * S;
    const cy = sc.ease(p.id, 0, p.y).y;
    groundShadow(ctx, cx, floor, radius, 1 - Math.min(1, cy * 3) * 0.6);
    sc.drawPlayer(p.id, cx, floor - cy * S - radius, radius, radius);
  }

  // In front of the jumpers: after them, so it passes over them.
  if (!behind) drawRope();
}

/** The rope between its handles, bowed to `midY`. Behind the jumpers it is darker and has no glow, so the
 * far side of its swing reads as further away. */
function strokeRope(sc: Scene<RopeSnapshot>, box: { handleY: number; midY: number; left: number; right: number }, behind: boolean): void {
  const { ctx, S } = sc;
  const { handleY, midY, left, right } = box;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(left, handleY);
    // A quadratic curve passes half way to its control point, so aim past the middle to land on it.
    ctx.quadraticCurveTo(S / 2, 2 * midY - handleY, right, handleY);
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, S * 0.012);
  ctx.strokeStyle = sc.theme.acc;
  if (!behind) {
    ctx.shadowColor = sc.theme.accGlow;
    ctx.shadowBlur = S * 0.02;
  }
  trace();
  ctx.stroke();
  if (behind) {
    // The same rope with a flat dark layer over it.
    ctx.strokeStyle = 'oklch(0.12 0.03 280 / 0.55)';
    trace();
    ctx.stroke();
  }
  ctx.restore();
}

const scene: SceneGame<RopeSnapshot> = {
  scroll: 'x',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: FLOOR - ROPE_PLAYER_RADIUS - snapshot.players[index].y }),
};

export const ropeView: LobbyGameView<RopeSnapshot> = {
  // One button: Jump (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'jump', labelKey: 'spin.lobby.rope.jump', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'jump',
  nameKey: 'spin.lobby.rope.name',
  taglineKey: 'spin.lobby.rope.tagline',
  hintKey: 'spin.lobby.rope.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
