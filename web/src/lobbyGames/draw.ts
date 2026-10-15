import { DRAW_POINTS_TO_WIN, type DrawSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, renderScene, type Scene, type SceneGame } from './kit';
import type { TapTargets } from './taps';

/** The run's time limit (RUN_LIMIT_S in the rules), for the bar along the top. */
const RUN_MS = 60_000;
/** The one big button is the whole play space below the points row, and the controller. */
const AREA = { x: 0.05, y: 0.24, w: 0.9, h: 0.7 };
const CHIPS_Y = 0.15;
const CHIP_R = 0.022;

/** The arena is the controller: one target (Space on a keyboard). */
export const DRAW_TAPS: TapTargets = { rects: [AREA], keys: [' '] };

function drawWorld(sc: Scene<DrawSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;

  // Time left in the run, as a bar draining along the top edge.
  if (snapshot.phase === 'playing') {
    ctx.fillStyle = theme.acc;
    ctx.fillRect(0, 0, S * Math.max(0, snapshot.roundLeftMs / RUN_MS), S * 0.008);
  }

  // Everyone's points (out of DRAW_POINTS_TO_WIN) in one row; who false-started or was late is dimmed.
  const n = snapshot.players.length;
  const step = Math.min(0.09, 0.84 / Math.max(1, n));
  ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // watching until the next run
    const cx = (0.5 + (i - (n - 1) / 2) * step) * S;
    ctx.save();
    if (snapshot.stage !== 'wait' && p.state === 'false') ctx.globalAlpha = 0.4;
    sc.drawPlayer(p.id, cx, CHIPS_Y * S, CHIP_R * S, CHIP_R * S);
    ctx.restore();
    ctx.fillStyle = p.state === 'won' ? theme.mint : theme.text;
    ctx.fillText(`${p.meters}/${DRAW_POINTS_TO_WIN}`, cx, (CHIPS_Y + CHIP_R + 0.03) * S);
  }

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
  // Nobody is knocked out here, so a burst would only start on the row of points.
  anchor: (snapshot, index) => ({ x: 0.5 + (index - (snapshot.players.length - 1) / 2) * 0.09, y: CHIPS_Y }),
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
