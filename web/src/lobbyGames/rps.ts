import { RPS_CHOICES, type RpsSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STRIP_Y, coverTile, drawPrompt, drawStandings, drawTimer, emojiFont, renderScene, roundRect, stripX, type BadgeKind, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// The standings strip, each player's hand under them, the prompt, then the three choices along the bottom.
const HAND_Y = 0.31;
const PROMPT_AT = 0.45;
const CHOICE_Y = 0.6;
const CHOICE_W = 0.28;
const CHOICE_H = 0.32;
const CHOICE_GAP = 0.03;
const CHOICE_X = (1 - (CHOICE_W * RPS_CHOICES + CHOICE_GAP * (RPS_CHOICES - 1))) / 2;
const HANDS = ['✊', '✋', '✌️'];
const HUES = [30, 250, 150];
const OUTCOME: Record<string, BadgeKind> = { win: 'ok', lose: 'no', late: 'late', draw: 'tie' };

const choiceRect = (i: number): TapRect => ({ x: CHOICE_X + i * (CHOICE_W + CHOICE_GAP), y: CHOICE_Y, w: CHOICE_W, h: CHOICE_H });

export const RPS_TAPS: TapTargets = { rects: Array.from({ length: RPS_CHOICES }, (_, i) => choiceRect(i)), keys: ['1', '2', '3'] };

function drawWorld(sc: Scene<RpsSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  const picking = snapshot.stage === 'pick' && snapshot.round > 0 && snapshot.phase === 'playing';
  const mine = snapshot.players.find((p) => p.id === sc.me);
  const n = snapshot.players.length;

  drawTimer(sc, picking && snapshot.pickTotalMs > 0 ? snapshot.pickLeftMs / snapshot.pickTotalMs : null);
  drawStandings(sc, { badge: (p) => (p.outcome ? OUTCOME[p.outcome] ?? null : null) });

  // What each person showed, under their avatar (a ? once they have picked and it is still hidden).
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const i of sc.order()) {
    const p = snapshot.players[i];
    const shown = p.pick >= 0 ? HANDS[p.pick] : p.picked ? '?' : picking && p.alive ? '…' : '';
    if (!shown) continue;
    ctx.save();
    ctx.globalAlpha = p.alive ? 1 : 0.35;
    ctx.fillStyle = theme.text;
    ctx.font = p.pick >= 0 ? emojiFont(S * 0.075) : `800 ${Math.round(S * 0.05)}px ${FONT.display}`;
    ctx.fillText(shown, stripX(n, i) * S, HAND_Y * S);
    ctx.restore();
  }

  if (!picking && snapshot.round > 0 && snapshot.phase === 'playing') drawPrompt(sc, sc.t(snapshot.draw ? 'spin.lobby.rps.draw' : 'spin.lobby.rps.decided'), 'text', PROMPT_AT);

  // The three choices are cover tiles, like every other object on the stage. Yours gets the accent ring.
  for (let i = 0; i < RPS_CHOICES; i++) {
    const r = choiceRect(i);
    const chosen = !!mine && mine.pick === i;
    ctx.save();
    ctx.globalAlpha = mine && mine.pick >= 0 && !chosen ? 0.4 : 1;
    coverTile(ctx, r.x * S, r.y * S, r.w * S, r.h * S, HUES[i], S * 0.035);
    if (chosen) {
      roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.035);
      ctx.lineWidth = Math.max(2, S * 0.007);
      ctx.strokeStyle = theme.acc;
      ctx.stroke();
    }
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = emojiFont(S * 0.13);
    ctx.fillText(HANDS[i], (r.x + r.w / 2) * S, (r.y + r.h * 0.46) * S);
    ctx.font = `600 ${Math.round(S * 0.026)}px ${FONT.mono}`;
    ctx.fillText(sc.t(`spin.lobby.rps.choice.${i}` as 'spin.lobby.rps.choice.0'), (r.x + r.w / 2) * S, (r.y + r.h * 0.84) * S);
    ctx.restore();
  }
}

const scene: SceneGame<RpsSnapshot> = {
  scroll: 'y',
  taps: RPS_TAPS,
  drawWorld,
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const rpsView: LobbyGameView<RpsSnapshot> = {
  pad: 'none',
  actions: [],
  taps: RPS_TAPS,
  nameKey: 'spin.lobby.rps.name',
  taglineKey: 'spin.lobby.rps.tagline',
  hintKey: 'spin.lobby.rps.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
