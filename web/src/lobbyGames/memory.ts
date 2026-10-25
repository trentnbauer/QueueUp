import { MEMORY_PANELS, type MemorySnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { STRIP_Y, drawPrompt, drawStandings, drawTimer, renderScene, roundRect, rememberSnapshot, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// One board of four panels (2 x 2) under the standings strip and the prompt line.
const BOARD_X = 0.1;
const BOARD_Y = 0.33;
const PANEL_W = 0.38;
const PANEL_H = 0.28;
const GAP = 0.04;
const HUES = [25, 250, 145, 85];

const panelRect = (i: number): TapRect => ({ x: BOARD_X + (i % 2) * (PANEL_W + GAP), y: BOARD_Y + Math.floor(i / 2) * (PANEL_H + GAP), w: PANEL_W, h: PANEL_H });

export const MEMORY_TAPS: TapTargets = { rects: Array.from({ length: MEMORY_PANELS }, (_, i) => panelRect(i)), keys: ['1', '2', '3', '4'] };

const previousDone = rememberSnapshot<Set<string>>();

function celebrate(sc: Scene<MemorySnapshot>): void {
  const { snapshot } = sc;
  const before = previousDone(snapshot, () => new Set(snapshot.players.filter((p) => p.done).map((p) => p.id)));
  if (!before) return;
  const n = snapshot.players.length;
  snapshot.players.forEach((p, i) => {
    if (p.done && p.alive && !before.has(p.id)) sc.fx.confettiAt(stripX(n, i), STRIP_Y, sc.info(p.id).color, 14);
  });
}

function drawWorld(sc: Scene<MemorySnapshot>): void {
  const { ctx, S, snapshot } = sc;
  celebrate(sc);

  drawTimer(sc, snapshot.stage === 'input' && snapshot.inputTotalMs > 0 ? snapshot.inputLeftMs / snapshot.inputTotalMs : null);
  // How many panels of the pattern each person has right (never which); a done badge when they have the lot.
  drawStandings(sc, {
    text: (p) => (snapshot.stage === 'show' || p.done ? '' : `${p.progress}/${snapshot.length}`),
    badge: (p) => (p.done ? 'done' : !p.alive ? 'no' : null),
  });
  // Strings change to sentence case: "Watch · {n}" and "Your turn" (see the handoff README, Copy).
  if (snapshot.stage === 'show') drawPrompt(sc, sc.t('spin.lobby.memory.watch', { n: snapshot.length }));
  else if (snapshot.stage === 'input') drawPrompt(sc, sc.t('spin.lobby.memory.repeat'), 'go');

  for (let i = 0; i < MEMORY_PANELS; i++) {
    const r = panelRect(i);
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

const scene: SceneGame<MemorySnapshot> = {
  scroll: 'y',
  taps: MEMORY_TAPS,
  drawWorld,
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const memoryView: LobbyGameView<MemorySnapshot> = {
  pad: 'none',
  actions: [],
  taps: MEMORY_TAPS,
  nameKey: 'spin.lobby.memory.name',
  taglineKey: 'spin.lobby.memory.tagline',
  hintKey: 'spin.lobby.memory.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
