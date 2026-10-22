import { ASTEROIDS_MAX_ANGLE, ASTEROIDS_TURN_SPEED, ASTEROIDS_TURRET_R, ASTEROIDS_TURRET_Y, type AsteroidsSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, coverTile, hueOf, predictOwn, renderScene, type Scene, type SceneGame } from './kit';

/** The asteroids in the last snapshot drawn (where each was, and which kind), so one that is gone from the next has been broken and can burst into confetti. */
let seen: { snapshot: object; asteroids: Map<number, { x: number; y: number; big: boolean }> } | null = null;

/** How long the barrel is, as a multiple of the turret's radius. */
const BARREL = 2.1;

function drawWorld(sc: Scene<AsteroidsSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  // Everything here moves in its own direction, so it is drawn a little way along its path from where the
  // snapshot put it, by how long ago that was, which keeps it smooth between snapshots.
  const age = snapshot.phase === 'playing' ? Math.min(0.12, sc.fx.age(snapshot, now)) : 0;

  // An asteroid that was in the last snapshot and is gone from this one has been broken: it bursts into confetti where it was (a big one, more).
  if (seen && seen.snapshot !== snapshot) {
    if (snapshot.phase === 'playing') {
      const now = new Set(snapshot.asteroids.map((a) => a.n));
      for (const [n, a] of seen.asteroids) if (!now.has(n)) sc.fx.confettiAt(a.x, a.y, hueOf(n), a.big ? 40 : 26);
    }
    seen = null;
  }
  if (!seen) seen = { snapshot, asteroids: new Map(snapshot.asteroids.map((a) => [a.n, { x: a.x + a.vx * age, y: a.y + a.vy * age, big: a.hp > 1 }])) };

  // The ground the turrets sit on.
  ctx.fillStyle = 'oklch(0.2 0.01 55 / 0.7)';
  ctx.fillRect(0, (ASTEROIDS_TURRET_Y + ASTEROIDS_TURRET_R) * S, S, S);

  // Asteroids: game covers tumbling down. A big one (two hits) has a ring round it.
  for (const a of snapshot.asteroids) {
    const cx = (a.x + a.vx * age) * S;
    const cy = (a.y + a.vy * age) * S;
    const size = a.r * 2 * S;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(now / 900 + a.n) * 0.5 + a.n);
    coverTile(ctx, -size / 2, -size / 2, size, size, hueOf(a.n), S * 0.012, true);
    if (a.hp > 1) {
      ctx.strokeStyle = theme.star;
      ctx.lineWidth = Math.max(2, S * 0.005);
      ctx.strokeRect(-size / 2 - 2, -size / 2 - 2, size + 4, size + 4);
    }
    ctx.restore();
  }

  // Shots: a short streak in the colour of whoever fired.
  for (const s of snapshot.shots) {
    const x = (s.x + s.vx * age) * S;
    const y = (s.y + s.vy * age) * S;
    const who = snapshot.players[s.by];
    ctx.strokeStyle = who ? sc.info(who.id).color : theme.acc;
    ctx.lineWidth = Math.max(2, S * 0.007);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - s.vx * 0.04 * S, y - s.vy * 0.04 * S);
    ctx.stroke();
  }

  // Turrets along the bottom, points over each. A turret that was hit is a dim wreck.
  const r = ASTEROIDS_TURRET_R * S;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.inRun) continue; // watching until the next run
    const cx = p.x * S;
    const cy = ASTEROIDS_TURRET_Y * S;
    ctx.save();
    if (!p.alive) ctx.globalAlpha = 0.35;
    ctx.translate(cx, cy);
    // Your own barrel swings the moment you press; everyone else's eases toward the last snapshot.
    const swing = (a: number, dt: number) => Math.max(-ASTEROIDS_MAX_ANGLE, Math.min(ASTEROIDS_MAX_ANGLE, a + sc.held.dx * ASTEROIDS_TURN_SPEED * dt));
    ctx.rotate(!p.alive ? p.angle : p.id === sc.me && snapshot.phase === 'playing' ? predictOwn(sc.fx, 'angle', sc.now, p.angle, swing) : sc.ease(p.id, p.angle, 0).x);
    ctx.fillStyle = 'oklch(0.4 0.02 60)';
    ctx.fillRect(-r * 0.22, -r * BARREL, r * 0.44, r * BARREL);
    ctx.restore();
    ctx.save();
    if (!p.alive) ctx.globalAlpha = 0.35;
    sc.drawPlayer(p.id, cx, cy, r, r);
    ctx.restore();
    ctx.fillStyle = theme.text;
    ctx.fillText(String(p.meters), cx, cy + r + S * 0.032);
  }
}

const scene: SceneGame<AsteroidsSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: ASTEROIDS_TURRET_Y }),
};

export const asteroidsView: LobbyGameView<AsteroidsSnapshot> = {
  // Left and right swing the gun; it fires by itself.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.asteroids.name',
  taglineKey: 'spin.lobby.asteroids.tagline',
  hintKey: 'spin.lobby.asteroids.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
