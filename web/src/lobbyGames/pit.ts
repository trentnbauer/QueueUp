import { PIT_LAYER_Y, PIT_LEFT, PIT_RIGHT, PIT_TILES, type PitSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, groundShadow, renderScene, roundRect, type Scene, type SceneGame } from './kit';

// Where things are on the arena, as fractions of its side: three rows of floor tiles (PIT_LAYER_Y), over a drop.
const TILE_H = 0.05;
const TILE_GAP = 0.004;
const TILE_W = (PIT_RIGHT - PIT_LEFT) / PIT_TILES;
/** Size of a player (drawing only). */
const RX = 0.022;
const RY = 0.046;

function drawWorld(sc: Scene<PitSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  const bottom = PIT_LAYER_Y[PIT_LAYER_Y.length - 1] * S;

  // The drop under the bottom floor: darker the further down, so it reads as a long way to fall.
  const drop = ctx.createLinearGradient(0, bottom, 0, S);
  drop.addColorStop(0, 'oklch(0.18 0.01 55 / 0)');
  drop.addColorStop(1, 'oklch(0.1 0.01 55 / 0.7)');
  ctx.fillStyle = drop;
  ctx.fillRect(0, bottom, S, S - bottom);

  // The tiles: solid, shaking red-ish just before they go, and gone (only a faint outline is left, so you can see the floor that was).
  snapshot.tiles.forEach((state, n) => {
    const i = n % PIT_TILES;
    const top = PIT_LAYER_Y[Math.floor(n / PIT_TILES)] * S;
    const x = (PIT_LEFT + i * TILE_W + TILE_GAP) * S;
    const w = (TILE_W - TILE_GAP * 2) * S;
    if (state === 2) {
      ctx.strokeStyle = 'oklch(1 0 0 / 0.08)';
      ctx.lineWidth = 1;
      roundRect(ctx, x, top, w, TILE_H * S, TILE_H * S * 0.2);
      ctx.stroke();
      return;
    }
    // A shaking tile jitters side to side, gently, and stays still for people who ask for less motion.
    const jitter = state === 1 && !sc.fx.reduced ? Math.sin(now / 35 + n) * S * 0.003 : 0;
    roundRect(ctx, x + jitter, top, w, TILE_H * S, TILE_H * S * 0.2);
    ctx.fillStyle = state === 1 ? theme.danger : STAGE.ground;
    ctx.globalAlpha = state === 1 ? 0.8 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = STAGE.groundLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // The players, facing the way they last walked. In the air they stretch tall (a little squashed when they land), so a jump reads.
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const pt = sc.ease(p.id, p.x, p.y);
    const cx = pt.x * S;
    const feet = pt.y * S;
    const stretch = p.air && !sc.fx.reduced ? 1.12 : 1;
    const rx = (RX / stretch) * S;
    const ry = RY * stretch * S;
    if (!p.air) groundShadow(ctx, cx, feet, RX * S);
    sc.drawPlayer(p.id, cx, feet - ry, rx, ry);
    // A little nose to show which way they face.
    ctx.fillStyle = theme.text;
    ctx.beginPath();
    ctx.arc(cx + p.face * rx * 1.15, feet - ry * 1.35, S * 0.006, 0, Math.PI * 2);
    ctx.fill();
  }
}

const scene: SceneGame<PitSnapshot> = {
  scroll: 'x',
  drawWorld,
  // Out, a player bursts where they stood.
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: snapshot.players[index].y - RY }),
};

export const pitView: LobbyGameView<PitSnapshot> = {
  // Left and right to walk and steer in the air, plus one Jump button (Space or Up).
  pad: 'leftRight',
  actions: [{ name: 'jump', labelKey: 'spin.lobby.pit.jump', keys: [' ', 'ArrowUp', 'w'] }],
  nameKey: 'spin.lobby.pit.name',
  taglineKey: 'spin.lobby.pit.tagline',
  hintKey: 'spin.lobby.pit.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
