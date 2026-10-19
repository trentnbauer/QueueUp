import { RPS_CHOICES, type RpsSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, renderScene, roundRect, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: the players in a row (with what they showed), the time to pick, then the
// three choices along the bottom.
const PLAYERS_Y = 0.2;
const BAR_Y = 0.52;
const CHOICE_Y = 0.6;
const CHOICE_W = 0.28;
const CHOICE_H = 0.32;
const CHOICE_GAP = 0.03;
const CHOICE_X = (1 - (CHOICE_W * RPS_CHOICES + CHOICE_GAP * (RPS_CHOICES - 1))) / 2;
const HANDS = ['✊', '✋', '✌️'];
const HUES = [30, 250, 150];

const choiceRect = (i: number): TapRect => ({ x: CHOICE_X + i * (CHOICE_W + CHOICE_GAP), y: CHOICE_Y, w: CHOICE_W, h: CHOICE_H });

/** The three choices are the controller: each is a tap target, drawn exactly where it is hit. On a keyboard the keys 1 to 3 do the same. */
export const RPS_TAPS: TapTargets = { rects: Array.from({ length: RPS_CHOICES }, (_, i) => choiceRect(i)), keys: ['1', '2', '3'] };

function drawWorld(sc: Scene<RpsSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  const picking = snapshot.stage === 'pick' && snapshot.round > 0 && snapshot.phase === 'playing';
  const mine = snapshot.players.find((p) => p.id === sc.me);

  // Everyone in the run, with what they have shown once it is decided (a ? if they have picked and it is hidden).
  const n = snapshot.players.length;
  const step = Math.min(0.2, 0.9 / Math.max(1, n));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    const cx = (0.5 + (i - (n - 1) / 2) * step) * S;
    ctx.save();
    if (!p.alive) ctx.globalAlpha = 0.35;
    sc.drawPlayer(p.id, cx, PLAYERS_Y * S, S * 0.04, S * 0.04);
    ctx.restore();
    ctx.font = `${Math.round(S * 0.09)}px ${FONT.ui}`;
    ctx.fillStyle = theme.text;
    const shown = p.pick >= 0 ? HANDS[p.pick] : p.picked ? '?' : picking && p.alive ? '…' : '';
    ctx.fillText(shown, cx, (PLAYERS_Y + 0.12) * S);
    ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
    ctx.fillStyle = p.outcome === 'win' ? theme.mint : p.outcome === 'lose' || p.outcome === 'late' ? theme.danger : theme.text;
    const tag = p.outcome === 'win' ? '✓' : p.outcome === 'lose' ? '✗' : p.outcome === 'late' ? '⏱' : p.outcome === 'draw' ? '=' : '';
    ctx.fillText(`${p.meters}${tag ? ` ${tag}` : ''}`, cx, (PLAYERS_Y + 0.215) * S);
  }

  // The time to pick, draining; or what the last round came to.
  if (picking) {
    const left = snapshot.pickTotalMs > 0 ? Math.max(0, snapshot.pickLeftMs / snapshot.pickTotalMs) : 0;
    ctx.fillStyle = 'oklch(1 0 0 / 0.12)';
    ctx.fillRect(CHOICE_X * S, BAR_Y * S, (1 - 2 * CHOICE_X) * S, S * 0.01);
    ctx.fillStyle = left < 0.3 ? theme.danger : theme.acc;
    ctx.fillRect(CHOICE_X * S, BAR_Y * S, (1 - 2 * CHOICE_X) * S * left, S * 0.01);
  } else if (snapshot.round > 0 && snapshot.phase === 'playing') {
    ctx.font = `800 ${Math.round(S * 0.05)}px ${FONT.display}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(sc.t(snapshot.draw ? 'spin.lobby.rps.draw' : 'spin.lobby.rps.decided'), S / 2, (BAR_Y + 0.02) * S);
  }

  // The three choices. Yours, once you have picked, is lit and the others dimmed.
  for (let i = 0; i < RPS_CHOICES; i++) {
    const r = choiceRect(i);
    const chosen = mine && mine.pick === i;
    ctx.save();
    ctx.globalAlpha = mine && mine.pick >= 0 && !chosen ? 0.4 : 1;
    roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.035);
    ctx.fillStyle = `oklch(0.5 0.13 ${HUES[i]})`;
    ctx.fill();
    if (chosen) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.text;
      ctx.stroke();
    }
    ctx.restore();
    ctx.font = `${Math.round(S * 0.13)}px ${FONT.ui}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(HANDS[i], (r.x + r.w / 2) * S, (r.y + r.h * 0.46) * S);
    ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
    ctx.fillText(sc.t(`spin.lobby.rps.choice.${i}` as 'spin.lobby.rps.choice.0'), (r.x + r.w / 2) * S, (r.y + r.h * 0.84) * S);
  }
}

const scene: SceneGame<RpsSnapshot> = {
  scroll: 'y',
  taps: RPS_TAPS,
  drawWorld,
  // Out of a round, a player bursts where they stand in the row.
  anchor: (snapshot, index) => ({ x: 0.5 + (index - (snapshot.players.length - 1) / 2) * Math.min(0.2, 0.9 / Math.max(1, snapshot.players.length)), y: PLAYERS_Y }),
};

export const rpsView: LobbyGameView<RpsSnapshot> = {
  // The three choices are the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: RPS_TAPS,
  nameKey: 'spin.lobby.rps.name',
  taglineKey: 'spin.lobby.rps.tagline',
  hintKey: 'spin.lobby.rps.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
