import { DRAW_POINTS_TO_WIN, type DrawSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STRIP_Y, drawStandings, drawTimer, renderScene, stripX, type Scene, type SceneGame } from './kit';
import type { TapTargets } from './taps';

/** The one big button is the whole play space below the standings strip, and the controller. */
const AREA = { x: 0.05, y: 0.3, w: 0.9, h: 0.64 };

/** The arena is the controller: one target (Space on a keyboard). */
export const DRAW_TAPS: TapTargets = { rects: [AREA], keys: [' '] };

function drawWorld(sc: Scene<DrawSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;

  // Time left in the run.
  if (snapshot.phase === 'playing' && snapshot.limitMs > 0) drawTimer(sc, snapshot.roundLeftMs / snapshot.limitMs);

  // Everyone's points (out of DRAW_POINTS_TO_WIN); who false-started is marked, and who won the duel.
  drawStandings(sc, {
    text: (p) => `${p.meters}/${DRAW_POINTS_TO_WIN}`,
    badge: (p) => (p.state === 'won' ? 'ok' : snapshot.stage !== 'wait' && p.state === 'false' ? 'no' : null),
  });

  // The big light: dim while waiting, a flash of green at GO, then the result.
  const cx = (AREA.x + AREA.w / 2) * S;
  const cy = (AREA.y + AREA.h / 2) * S;
  const r = Math.min(AREA.w, AREA.h) * 0.4 * S;
  const mine = snapshot.players.find((p) => p.id === sc.me);
  const go = snapshot.stage === 'go';
  const burst = go ? Math.max(0, 1 - snapshot.sinceGoMs / 300) : 0;
  ctx.save();
  ctx.fillStyle = go ? theme.mint : snapshot.stage === 'result' && snapshot.duelWinnerId ? theme.acc : 'oklch(0.3 0.01 60)';
  ctx.globalAlpha = go ? 1 : snapshot.stage === 'result' ? 0.5 : 0.35 + 0.1 * Math.sin(now / 400);
  ctx.shadowColor = go ? theme.mint : 'transparent';
  ctx.shadowBlur = S * 0.06 * (0.4 + burst);
  ctx.beginPath();
  ctx.arc(cx, cy, r * (1 + 0.08 * burst), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = go ? 'oklch(0.18 0.02 150)' : theme.text;
  ctx.font = `800 ${Math.round(S * (go ? 0.16 : 0.08))}px ${FONT.display}`;
  let line: string;
  if (go) line = sc.t('spin.lobby.draw.go');
  else if (snapshot.stage === 'wait') line = mine?.state === 'false' ? sc.t('spin.lobby.draw.early') : sc.t('spin.lobby.draw.wait');
  else if (snapshot.duelWinnerId) line = sc.t('spin.lobby.draw.winner', { name: sc.info(snapshot.duelWinnerId).name, ms: snapshot.reactMs });
  else line = sc.t('spin.lobby.draw.redo');
  if (snapshot.stage === 'result' && snapshot.duelWinnerId) ctx.font = `800 ${Math.round(S * 0.045)}px ${FONT.display}`;
  ctx.fillText(line, cx, cy);
}

const scene: SceneGame<DrawSnapshot> = {
  scroll: 'y',
  taps: DRAW_TAPS,
  drawWorld,
  // Nobody is knocked out here, so a burst would only start on the standings strip.
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const drawView: LobbyGameView<DrawSnapshot> = {
  // The big light is the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: DRAW_TAPS,
  nameKey: 'spin.lobby.draw.name',
  taglineKey: 'spin.lobby.draw.tagline',
  hintKey: 'spin.lobby.draw.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
