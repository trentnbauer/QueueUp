import { RACE_CAR_HEIGHT, RACE_CAR_WIDTH, RACE_FRONT_Y, RACE_KERB, type RaceSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, courseOffset, coverTile, groundShadow, hueOf, renderScene, roundRect, type Scene, type SceneGame } from './kit';

/** Where the bottom of the screen starts to read as danger: below here a driver is close to going off. */
const DANGER_FROM = 0.78;
const WHEEL = 'oklch(0.34 0.01 55)';

/** The track: a darker road between striped kerbs, two dashed lane lines, the front line a driver at full
 * speed sits on, and a red glow along the bottom edge. The kerb stripes and lane dashes move down at the
 * course's speed (courseOffset), the same as the obstacles. */
function drawTrack(sc: Scene<RaceSnapshot>): void {
  const { ctx, S, theme } = sc;
  const kerb = RACE_KERB * S;

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = STAGE.ground;
  ctx.fillRect(kerb, -S * 0.1, S - kerb * 2, S * 1.2);
  ctx.restore();

  // Pit lanes: amber hatched strips of the track (against a kerb or in the middle), in stretches that scroll with the course. Driving
  // into one drags you down the screen, so they are loud: a different surface, a bright edge, diagonal hatching.
  for (const pit of sc.snapshot.pits) {
    const top = (pit.y + sc.drift) * S;
    const h = pit.h * S;
    if (top > S || top + h < 0) continue;
    const x = pit.x0 * S;
    const pitW = (pit.x1 - pit.x0) * S;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, pitW, h);
    ctx.clip();
    ctx.fillStyle = 'oklch(0.5 0.1 70 / 0.5)';
    ctx.fillRect(x, top, pitW, h);
    ctx.strokeStyle = 'oklch(0.82 0.15 85 / 0.55)';
    ctx.lineWidth = Math.max(2, S * 0.008);
    const gap = S * 0.04;
    for (let d = -pitW; d < h + pitW; d += gap) {
      ctx.beginPath();
      ctx.moveTo(x, top + d);
      ctx.lineTo(x + pitW, top + d - pitW);
      ctx.stroke();
    }
    ctx.restore();
    // A bright edge down both sides, so it reads as a zone however wide it is and wherever it sits.
    ctx.fillStyle = 'oklch(0.82 0.15 85)';
    ctx.fillRect(x, top, 2, h);
    ctx.fillRect(x + pitW - 2, top, 2, h);
  }

  // Kerbs: alternating stripes down each side.
  const stripe = S * 0.06;
  const kerbOffset = courseOffset(sc, stripe * 2);
  for (let y = -stripe * 2 + kerbOffset, i = 0; y < S; y += stripe, i++) {
    ctx.fillStyle = i % 2 === 0 ? theme.danger : STAGE.groundLine;
    ctx.fillRect(0, y, kerb, stripe);
    ctx.fillRect(S - kerb, y, kerb, stripe);
  }
  ctx.fillStyle = STAGE.groundLine;
  ctx.fillRect(kerb, 0, 1, S);
  ctx.fillRect(S - kerb - 1, 0, 1, S);

  // Lane lines: dashes a third and two thirds of the way across.
  const dash = S * 0.1;
  const laneOffset = courseOffset(sc, dash);
  ctx.fillStyle = STAGE.groundTick;
  for (const lane of [1 / 3, 2 / 3]) {
    const x = kerb + (S - kerb * 2) * lane;
    for (let y = -dash + laneOffset; y < S; y += dash) ctx.fillRect(x - 1, y, 2, dash * 0.5);
  }

  // The front line: as far up the screen as anyone gets.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = theme.acc;
  ctx.lineWidth = 1;
  ctx.setLineDash([S * 0.02, S * 0.015]);
  ctx.beginPath();
  ctx.moveTo(kerb, RACE_FRONT_Y * S + (RACE_CAR_HEIGHT * S) / 2);
  ctx.lineTo(S - kerb, RACE_FRONT_Y * S + (RACE_CAR_HEIGHT * S) / 2);
  ctx.stroke();
  ctx.restore();

  // The bottom edge glows red: slide off it and you are out.
  const danger = ctx.createLinearGradient(0, DANGER_FROM * S, 0, S);
  danger.addColorStop(0, 'oklch(0.68 0.2 25 / 0)');
  danger.addColorStop(1, 'oklch(0.68 0.2 25 / 0.22)');
  ctx.fillStyle = danger;
  ctx.fillRect(0, DANGER_FROM * S, S, S * (1 - DANGER_FROM));
}

function drawWorld(sc: Scene<RaceSnapshot>): void {
  const { ctx, S, snapshot, drift, theme, now, fx } = sc;
  drawTrack(sc);

  // Obstacles are game covers lying on the track: a small upright one (a cone), a wide flat one on a dark
  // puddle (an oil slick), or a big heavy one (a rock).
  for (const o of snapshot.obstacles) {
    const w = o.w * S;
    const h = o.h * S;
    const cx = o.x * S;
    const cy = (o.y + drift) * S;
    if (cy - h > S || cy + h < 0) continue;
    const hue = hueOf(o.n);
    if (o.kind === 'oil') {
      ctx.fillStyle = 'oklch(0.08 0.01 270 / 0.75)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.62, h * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = STAGE.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'oklch(1 0 0 / 0.08)';
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.15, cy - h * 0.25, w * 0.25, h * 0.2, -0.3, 0, Math.PI * 2);
      ctx.fill();
      coverTile(ctx, cx - w * 0.3, cy - h * 0.3, w * 0.6, h * 0.6, hue, S * 0.008);
    } else {
      groundShadow(ctx, cx + S * 0.006, cy + h / 2, w * 0.5);
      coverTile(ctx, cx - w / 2, cy - h / 2, w, h, hue, S * (o.kind === 'cone' ? 0.012 : 0.018), o.kind === 'rock');
    }
  }

  const rx = (RACE_CAR_WIDTH * S) / 2;
  const ry = (RACE_CAR_HEIGHT * S) / 2;
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // off the bottom: the burst has taken them
    const pos = sc.ease(p.id, p.x, p.y);
    // A gentle side-to-side wobble while spun out (none when the device asks for less motion).
    const wobble = p.hit && !fx.reduced ? Math.sin(now / 45) * rx * 0.25 : 0;
    const cx = pos.x * S + wobble;
    const cy = pos.y * S;
    const color = sc.info(p.id).color;

    // A speed streak behind the car, longer the closer it is to the front line.
    const pace = Math.max(0, 1 - (pos.y - RACE_FRONT_Y) / (1 - RACE_FRONT_Y));
    const tail = ry * (0.8 + 1.6 * pace);
    const streak = ctx.createLinearGradient(0, cy, 0, cy + ry + tail);
    streak.addColorStop(0, color);
    streak.addColorStop(1, 'transparent');
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = streak;
    ctx.fillRect(cx - rx * 0.6, cy, rx * 1.2, ry + tail);
    ctx.restore();

    // Four wheels under the body, a shade lighter than the road so they show.
    ctx.fillStyle = WHEEL;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        roundRect(ctx, cx + sx * rx * 0.95 - rx * 0.28, cy + sy * ry * 0.5 - ry * 0.22, rx * 0.56, ry * 0.44, rx * 0.15);
        ctx.fill();
      }
    }
    if (p.hit) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = theme.danger;
      ctx.lineWidth = Math.max(2, S * 0.005);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 1.6, ry * 1.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    sc.drawPlayer(p.id, cx, cy, rx, ry);
  }
}

const scene: SceneGame<RaceSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: snapshot.players[index].y }),
};

export const raceView: LobbyGameView<RaceSnapshot> = {
  // Steering only.
  pad: 'leftRight',
  actions: [],
  nameKey: 'spin.lobby.race.name',
  taglineKey: 'spin.lobby.race.tagline',
  hintKey: 'spin.lobby.race.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
