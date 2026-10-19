import { ORBIT_MARKER_HALF, type OrbitSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, coverTile, hueOf, renderScene, type Scene, type SceneGame } from './kit';

const CX = 0.5;
const CY = 0.54;
/** The ring's radius and how far out from it things start, as fractions of the arena. */
const RING = 0.29;
const FROM_EDGE = 0.4;
/** How thick a thing is, along the way it flies. */
const THICK = 0.045;
/** How long it stays deadly after landing (the rules' window), so the flash on the ring matches what hurts. */
const DEADLY_MS = 70;

const at = (angle: number, radius: number, S: number) => ({ x: (CX + Math.sin(angle) * radius) * S, y: (CY - Math.cos(angle) * radius) * S });

function drawWorld(sc: Scene<OrbitSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  const playing = snapshot.phase === 'playing';
  const age = playing ? sc.fx.age(snapshot, now) : 0;

  // The ring: a faint track with a bright inner edge.
  ctx.lineWidth = S * 0.014;
  ctx.strokeStyle = 'oklch(1 0 0 / 0.1)';
  ctx.beginPath();
  ctx.arc(CX * S, CY * S, RING * S, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = STAGE.groundLine;
  ctx.beginPath();
  ctx.arc(CX * S, CY * S, (RING - 0.011) * S, 0, Math.PI * 2);
  ctx.stroke();

  for (const h of snapshot.hazards) {
    const left = h.hitInMs - age * 1000;
    const k = Math.min(1, Math.max(0, 1 - left / h.flyMs));
    // Where it lands on the ring, marked ahead of time and brighter the nearer it gets.
    const half = h.w;
    ctx.lineWidth = S * 0.02;
    ctx.strokeStyle = theme.danger;
    ctx.globalAlpha = left > 0 ? 0.12 + 0.5 * k * k : Math.max(0, 1 - -left / DEADLY_MS);
    ctx.beginPath();
    // The canvas draws angles from the right going clockwise; ours start at the top.
    ctx.arc(CX * S, CY * S, RING * S, h.a - Math.PI / 2 - half, h.a - Math.PI / 2 + half);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (left < -DEADLY_MS) continue;
    // The thing itself, flying in from the edge or out of the middle.
    const radius = h.from === 'out' ? RING + (1 - k) * FROM_EDGE : 0.05 + (RING - 0.05) * k;
    const p = at(h.a, radius, S);
    const width = 2 * h.w * RING * S;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(h.a);
    coverTile(ctx, -width / 2, (-THICK * S) / 2, width, THICK * S, hueOf(h.n), S * 0.01, true);
    ctx.restore();
  }

  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const angle = p.a + p.dir * snapshot.omega * age;
    const pos = at(angle, RING, S);
    sc.drawPlayer(p.id, pos.x, pos.y, ORBIT_MARKER_HALF * RING * S * 1.15, ORBIT_MARKER_HALF * RING * S * 1.15);
    if (p.id === sc.me && playing) {
      // A small arrow ahead of you: the way you are going.
      const ahead = at(angle + p.dir * 0.28, RING + 0.045, S);
      ctx.save();
      ctx.translate(ahead.x, ahead.y);
      ctx.rotate(angle + p.dir * 0.28 + (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      ctx.fillStyle = theme.accText;
      ctx.beginPath();
      ctx.moveTo(0, -S * 0.016);
      ctx.lineTo(S * 0.012, S * 0.008);
      ctx.lineTo(-S * 0.012, S * 0.008);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

const scene: SceneGame<OrbitSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => {
    const p = snapshot.players[index];
    return { x: CX + Math.sin(p.a) * RING, y: CY - Math.cos(p.a) * RING };
  },
};

export const orbitView: LobbyGameView<OrbitSnapshot> = {
  // One button: Flip (Space, Up or the left and right keys), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'flip', labelKey: 'spin.lobby.orbit.flip', keys: [' ', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'w', 'a', 'd'] }],
  tapAction: 'flip',
  nameKey: 'spin.lobby.orbit.name',
  taglineKey: 'spin.lobby.orbit.tagline',
  hintKey: 'spin.lobby.orbit.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
