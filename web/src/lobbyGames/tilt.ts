import type { TiltSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STAGE, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** The run's time limit (RUN_LIMIT_S in the rules), for the bar along the top. */
const RUN_MS = 120_000;
// Where things are on the arena, as fractions of its side: the one beam across the middle, and everyone's
// pushes and points in a row under it.
const BEAM_X = 0.08;
const BEAM_W = 0.84;
const BEAM_Y = 0.5;
const BEAM_H = 0.03;
const BALL_R = 0.032;
/** How far the beam leans at full tilt, in radians. */
const LEAN = 0.12;
const TARGET_LIFE_MS = 7000;
/** A target scores when the ball is this close (HIT in the rules). */
const HIT = 0.05;
const ROW_Y = 0.8;
const CHIP_R = 0.024;
/** A ball that rolls off the end drops away for this long, then bursts off the bottom of the arena. */
const FALL_S = 0.8;
const FALL_BOTTOM = 1.02;
/** When each fallen ball started to drop (`performance.now()`), by run and player. */
const drops = new Map<string, number>();

function drawWorld(sc: Scene<TiltSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;

  // Time left in the run, as a bar draining along the top edge.
  if (snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / RUN_MS), S * 0.008);
  }

  // The beam leans the way the balls tip it; the targets and the balls sit on it, so everything is
  // drawn along it (0 is its left end, 1 its right end).
  const angle = sc.ease('lean', snapshot.tilt * LEAN, 0).x;
  ctx.save();
  ctx.translate(S / 2, BEAM_Y * S);
  ctx.rotate(angle);
  const bw = BEAM_W * S;
  const bh = BEAM_H * S;
  roundRect(ctx, -bw / 2, 0, bw, bh, bh / 2);
  ctx.fillStyle = 'oklch(0.34 0.03 60)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const along = (x: number) => (x - 0.5) * bw;
  for (const t of snapshot.targets) {
    // A target fades as it runs out of time, and flashes in its last second.
    const fade = Math.min(1, t.leftMs / 1000);
    ctx.globalAlpha = (0.4 + 0.6 * Math.min(1, t.leftMs / TARGET_LIFE_MS)) * (t.leftMs < 1500 ? 0.6 + 0.4 * Math.sin(now / 60) : 1) * (0.5 + 0.5 * fade);
    ctx.fillStyle = theme.mint;
    roundRect(ctx, along(t.x) - HIT * S, -bh * 0.5, HIT * 2 * S, bh * 1.5, bh * 0.4);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Everyone's own ball, in their colour, with yours ringed. Your ball is drawn last so it is never hidden.
  const falling: { x: number; y: number; color: string }[] = [];
  const radius = BALL_R * S * (snapshot.players.length > 6 ? 0.7 : 1);
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    const color = sc.info(p.id).color;
    if (p.fell) {
      // Rolled off: it keeps going past the end, then drops. (Worked out on screen, after the beam's lean.)
      if (snapshot.phase !== 'playing') continue;
      const key = `${snapshot.run}:${p.id}`;
      if (!drops.has(key)) drops.set(key, now);
      const t = (now - (drops.get(key) ?? now)) / 1000;
      if (t < FALL_S) {
        // The beam's end on screen: rotate the end point (on the beam, ball height above it) by the lean.
        const side = p.x < 0.5 ? -1 : 1;
        const ly = -BALL_R * S;
        const sx = S / 2 + (side * bw) / 2 * Math.cos(angle) - ly * Math.sin(angle);
        const sy = BEAM_Y * S + (side * bw) / 2 * Math.sin(angle) + ly * Math.cos(angle);
        falling.push({ x: sx + side * t * S * 0.08, y: sy + (FALL_BOTTOM * S - sy) * (t / FALL_S) ** 2, color });
      }
      continue;
    }
    if (!p.alive) continue; // watching until the next run
    const x = along(sc.ease(`ball:${p.id}`, p.x, 0).x);
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = S * 0.02;
    ctx.beginPath();
    ctx.arc(x, -BALL_R * S, radius, 0, Math.PI * 2);
    ctx.fill();
    if (p.id === sc.me) {
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.text;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  for (const f of falling) {
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Everyone's push and points in a row: an arrow for the way each is pushing, and their targets scored.
  const n = snapshot.players.length;
  const step = Math.min(0.1, 0.88 / Math.max(1, n));
  ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive && !p.fell) continue; // watching until the next run
    const cx = (0.5 + (i - (n - 1) / 2) * step) * S;
    ctx.save();
    if (p.fell) ctx.globalAlpha = 0.4;
    sc.drawPlayer(p.id, cx, ROW_Y * S, CHIP_R * S, CHIP_R * S);
    ctx.restore();
    if (p.dir !== 0) {
      const ax = cx + p.dir * CHIP_R * S * 1.7;
      ctx.fillStyle = theme.acc;
      ctx.beginPath();
      ctx.moveTo(ax + p.dir * S * 0.014, ROW_Y * S);
      ctx.lineTo(ax - p.dir * S * 0.008, ROW_Y * S - S * 0.012);
      ctx.lineTo(ax - p.dir * S * 0.008, ROW_Y * S + S * 0.012);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = theme.text;
    ctx.fillText(String(p.meters), cx, (ROW_Y + CHIP_R + 0.03) * S);
  }
}

const scene: SceneGame<TiltSnapshot> = {
  scroll: 'x',
  drawWorld,
  // A ball that rolls off drops past the end of the beam and bursts below the arena.
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x < 0.5 ? BEAM_X - 0.04 : BEAM_X + BEAM_W + 0.04, y: FALL_BOTTOM - 0.03, delayS: FALL_S }),
};

export const tiltView: LobbyGameView<TiltSnapshot> = {
  // Just left and right.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.tilt.name',
  taglineKey: 'spin.lobby.tilt.tagline',
  hintKey: 'spin.lobby.tilt.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
