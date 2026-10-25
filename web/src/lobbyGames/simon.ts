import { SIMON_PADS, type SimonSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STRIP_Y, drawPrompt, drawStandings, drawTimer, renderScene, roundRect, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// One board of four pads (2 x 2) under the standings strip and the prompt line.
const BOARD_X = 0.1;
const BOARD_Y = 0.33;
const PANEL_W = 0.38;
const PANEL_H = 0.28;
const GAP = 0.04;
const HUES = [25, 250, 145, 85];

const padRect = (i: number): TapRect => ({ x: BOARD_X + (i % 2) * (PANEL_W + GAP), y: BOARD_Y + Math.floor(i / 2) * (PANEL_H + GAP), w: PANEL_W, h: PANEL_H });

/** The pads are the controller: each is a tap target, drawn exactly where it is hit, numbered row by row. On a keyboard the keys 1 to 4 do the same. */
export const SIMON_TAPS: TapTargets = { rects: Array.from({ length: SIMON_PADS }, (_, i) => padRect(i)), keys: ['1', '2', '3', '4'] };

function drawWorld(sc: Scene<SimonSnapshot>): void {
  const { ctx, S, snapshot } = sc;

  drawTimer(sc, snapshot.stage === 'input' && snapshot.inputTotalMs > 0 ? snapshot.inputLeftMs / snapshot.inputTotalMs : null);
  // The longest pattern each person got through, and a small arrow under whoever's turn it is.
  drawStandings(sc, {
    badge: (p) => (!p.alive ? 'no' : null),
    under: (p, cx, y) => {
      if (p.id !== snapshot.turnId || snapshot.phase !== 'playing') return;
      const w = S * 0.012;
      ctx.fillStyle = sc.theme.acc;
      ctx.beginPath();
      ctx.moveTo(cx - w, y + w * 1.2);
      ctx.lineTo(cx + w, y + w * 1.2);
      ctx.lineTo(cx, y);
      ctx.closePath();
      ctx.fill();
    },
  });

  if (snapshot.phase === 'playing' && snapshot.turnId) {
    const mine = snapshot.turnId === sc.me;
    if (snapshot.stage === 'show') drawPrompt(sc, sc.t('spin.lobby.simon.watch'));
    else if (mine && snapshot.stage === 'input') drawPrompt(sc, sc.t('spin.lobby.simon.yourTurn'), 'go');
    else drawPrompt(sc, sc.t('spin.lobby.simon.turnOf', { name: sc.info(snapshot.turnId).name }));
  }

  for (let i = 0; i < SIMON_PADS; i++) {
    const r = padRect(i);
    const lit = snapshot.lit === i;
    ctx.save();
    ctx.globalAlpha = lit ? 1 : 0.5;
    if (lit) {
      ctx.shadowColor = `oklch(0.8 0.18 ${HUES[i]})`;
      ctx.shadowBlur = S * 0.05;
    }
    roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.03);
    ctx.fillStyle = lit ? `oklch(0.85 0.17 ${HUES[i]})` : `oklch(0.55 0.12 ${HUES[i]})`;
    ctx.fill();
    ctx.restore();
  }
}

const scene: SceneGame<SimonSnapshot> = {
  scroll: 'y',
  taps: SIMON_TAPS,
  drawWorld,
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const simonView: LobbyGameView<SimonSnapshot> = {
  pad: 'none',
  actions: [],
  taps: SIMON_TAPS,
  nameKey: 'spin.lobby.simon.name',
  taglineKey: 'spin.lobby.simon.tagline',
  hintKey: 'spin.lobby.simon.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
