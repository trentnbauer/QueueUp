import { PIT_LEFT, PIT_RIGHT, PIT_TILES, type PitSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STAGE, groundShadow, renderScene, roundRect, type Scene, type SceneGame } from './kit';

// Where things are on the arena, as fractions of its side: one row of floor tiles across the middle, over a drop.
const FLOOR_Y = 0.62;
const TILE_H = 0.05;
const TILE_GAP = 0.004;
const TILE_W = (PIT_RIGHT - PIT_LEFT) / PIT_TILES;
/** Size of a player (drawing only). */
const RX = 0.022;
const RY = 0.046;

function drawWorld(sc: Scene<PitSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  const top = FLOOR_Y * S;

  // The drop under the floor: darker the further down, so it reads as a long way to fall.
  const drop = ctx.createLinearGradient(0, top, 0, S);
  drop.addColorStop(0, 'oklch(0.18 0.01 55 / 0)');
  drop.addColorStop(1, 'oklch(0.1 0.01 55 / 0.7)');
  ctx.fillStyle = drop;
  ctx.fillRect(0, top, S, S - top);

  // The tiles: solid, shaking red-ish just before they go, and gone (only a faint outline is left, so you can see the floor that was).
  snapshot.tiles.forEach((state, i) => {
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
    const jitter = state === 1 && !sc.fx.reduced ? Math.sin(now / 35 + i) * S * 0.003 : 0;
    roundRect(ctx, x + jitter, top, w, TILE_H * S, TILE_H * S * 0.2);
    ctx.fillStyle = state === 1 ? theme.danger : STAGE.ground;
    ctx.globalAlpha = state === 1 ? 0.8 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = STAGE.groundLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // The players standing on it, facing the way they last walked; yours has a charge bar under the floor for the dash.
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const cx = sc.ease(p.id, p.x, 0).x * S;
    const wobble = p.slipping > 0 && !sc.fx.reduced ? Math.sin(now / 30) * S * 0.004 * p.slipping : 0;
    groundShadow(ctx, cx, top, RX * S);
    sc.drawPlayer(p.id, cx + wobble, top - RY * S, RX * S, RY * S);
    // A little nose to show which way they face.
    ctx.fillStyle = theme.text;
    ctx.beginPath();
    ctx.arc(cx + p.face * RX * S * 1.15, top - RY * S * 1.35, S * 0.006, 0, Math.PI * 2);
    ctx.fill();
  }

  const mine = snapshot.players.find((p) => p.id === sc.me);
  if (mine?.alive) {
    const w = S * 0.3;
    const y = (FLOOR_Y + TILE_H + 0.06) * S;
    ctx.fillStyle = STAGE.hudFill;
    roundRect(ctx, S / 2 - w / 2, y, w, S * 0.012, S * 0.006);
    ctx.fill();
    ctx.fillStyle = mine.cooldown > 0 ? theme.line : theme.mint;
    roundRect(ctx, S / 2 - w / 2, y, Math.max(S * 0.012, w * (1 - mine.cooldown)), S * 0.012, S * 0.006);
    ctx.fill();
  }
}

const scene: SceneGame<PitSnapshot> = {
  scroll: 'x',
  drawWorld,
  // Out, a player bursts where they stood.
  anchor: (snapshot, index) => ({ x: snapshot.players[index].x, y: FLOOR_Y - RY }),
};

export const pitView: LobbyGameView<PitSnapshot> = {
  // Left and right to walk, plus one Dash button (Space or Up).
  pad: 'leftRight',
  actions: [{ name: 'dash', labelKey: 'spin.lobby.pit.dash', keys: [' ', 'ArrowUp', 'w'] }],
  nameKey: 'spin.lobby.pit.name',
  taglineKey: 'spin.lobby.pit.tagline',
  hintKey: 'spin.lobby.pit.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
