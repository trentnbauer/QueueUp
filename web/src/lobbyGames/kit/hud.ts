import { lowerIsBetter } from '@queueup/shared';
import type { MessageKey } from '../../i18n';
import { FONT, STAGE } from './theme';
import { roundRect } from './draw';
import type { Scene } from './scene';

/** How long the server shows a run's result (packages/shared/src/lobbyGames/roundGame.ts), so the
 * result card can animate in from its start. */
const RESULT_MS = 4000;

/** How a game's score reads. Most count metres; a few count something else. */
interface ScoreWords {
  pill: MessageKey;
  winnerOne: MessageKey;
  winnerOther: MessageKey;
  over: MessageKey;
}
const METRES: ScoreWords = { pill: 'spin.lobby.hud.metres', winnerOne: 'spin.lobby.hud.winnerKicker.one', winnerOther: 'spin.lobby.hud.winnerKicker.other', over: 'spin.lobby.hud.runOver' };
const SCORE_WORDS: Partial<Record<string, ScoreWords>> = {
  coins: { pill: 'spin.lobby.hud.coins.pill', winnerOne: 'spin.lobby.hud.coins.winnerOne', winnerOther: 'spin.lobby.hud.coins.winnerOther', over: 'spin.lobby.hud.coins.over' },
  battleships: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  whack: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  draw: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  tilt: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  stacker: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  orbit: { pill: 'spin.lobby.hud.seconds.pill', winnerOne: 'spin.lobby.hud.seconds.winnerOne', winnerOther: 'spin.lobby.hud.seconds.winnerOther', over: 'spin.lobby.hud.seconds.over' },
  rps: { pill: 'spin.lobby.hud.rounds.pill', winnerOne: 'spin.lobby.hud.rounds.winnerOne', winnerOther: 'spin.lobby.hud.rounds.winnerOther', over: 'spin.lobby.hud.rounds.over' },
  rhythm: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  sortit: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  tempo: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  sumo: { pill: 'spin.lobby.hud.seconds.pill', winnerOne: 'spin.lobby.hud.seconds.winnerOne', winnerOther: 'spin.lobby.hud.seconds.winnerOther', over: 'spin.lobby.hud.seconds.over' },
  asteroids: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  memory: { pill: 'spin.lobby.hud.rounds.pill', winnerOne: 'spin.lobby.hud.rounds.winnerOne', winnerOther: 'spin.lobby.hud.rounds.winnerOther', over: 'spin.lobby.hud.rounds.over' },
  snake: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  colormatch: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  potato: { pill: 'spin.lobby.hud.rounds.pill', winnerOne: 'spin.lobby.hud.rounds.winnerOne', winnerOther: 'spin.lobby.hud.rounds.winnerOther', over: 'spin.lobby.hud.rounds.over' },
  anagram: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  mines: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  stop: { pill: 'spin.lobby.hud.rounds.pill', winnerOne: 'spin.lobby.hud.rounds.winnerOne', winnerOther: 'spin.lobby.hud.rounds.winnerOther', over: 'spin.lobby.hud.rounds.over' },
  pong: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  fishing: { pill: 'spin.lobby.hud.fish.pill', winnerOne: 'spin.lobby.hud.fish.winnerOne', winnerOther: 'spin.lobby.hud.fish.winnerOther', over: 'spin.lobby.hud.fish.over' },
  wall: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  words: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
  rope: { pill: 'spin.lobby.hud.swings.pill', winnerOne: 'spin.lobby.hud.swings.winnerOne', winnerOther: 'spin.lobby.hud.swings.winnerOther', over: 'spin.lobby.hud.swings.over' },
};

function pill(sc: Scene, x: number, y: number, w: number, h: number): void {
  roundRect(sc.ctx, x, y, w, h, h / 2);
  sc.ctx.fillStyle = STAGE.hudFill;
  sc.ctx.fill();
  sc.ctx.strokeStyle = STAGE.hudStroke;
  sc.ctx.lineWidth = 1;
  sc.ctx.stroke();
}

/** The heads-up display every round-based game gets for free: how far the run has got, who is still
 * in, the countdown before a run, the result card after it, and a note when you are out. Games do not
 * draw any of this themselves, so it looks and reads the same everywhere. */
export function drawHud(sc: Scene): void {
  const { ctx, S, theme, snapshot, t } = sc;
  const pad = S * 0.035;
  const h = S * 0.075;
  const size = Math.round(S * 0.036);

  // Metres, top left.
  if (snapshot.phase !== 'lobby') {
    ctx.font = `600 ${size}px ${FONT.mono}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const label = t((SCORE_WORDS[snapshot.id] ?? METRES).pill, { n: snapshot.meters });
    pill(sc, pad, pad, ctx.measureText(label).width + h * 0.8, h);
    ctx.fillStyle = theme.text;
    ctx.fillText(label, pad + h * 0.4, pad + h / 2 + 1);
  }

  // One dot per player, top right: lit while they are still in.
  const dot = h * 0.17;
  const width = snapshot.players.length * dot * 2.8 + h * 0.5;
  pill(sc, S - pad - width, pad, width, h);
  snapshot.players.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(S - pad - width + h * 0.25 + dot * 1.4 + i * dot * 2.8, pad + h / 2, dot, 0, Math.PI * 2);
    ctx.fillStyle = p.alive ? sc.info(p.id).color : 'oklch(1 0 0 / 0.12)';
    ctx.fill();
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (snapshot.phase === 'countdown') drawCountdown(sc);
  else if (snapshot.phase === 'over') drawResult(sc);
  else if (snapshot.phase === 'playing') {
    const mine = snapshot.players.find((p) => p.id === sc.me);
    if (mine && !mine.alive) drawOutNote(sc);
  }
}

function drawCountdown(sc: Scene): void {
  const { ctx, S, theme, snapshot, t } = sc;
  ctx.fillStyle = 'oklch(0.12 0.006 55 / 0.35)';
  ctx.fillRect(0, 0, S, S);
  const n = Math.max(1, Math.ceil(snapshot.timerMs / 1000));
  const progress = 1 - (snapshot.timerMs % 1000) / 1000;
  // Each number pops in from large and fades as the next one nears.
  const scale = 1.35 - 0.35 * Math.min(1, progress * 4);
  ctx.font = `500 ${Math.round(S * 0.034)}px ${FONT.mono}`;
  ctx.fillStyle = theme.accText;
  ctx.fillText(t('spin.lobby.hud.startsIn', { n: snapshot.run }), S / 2, S * 0.33);
  ctx.save();
  ctx.translate(S / 2, S * 0.5);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 1 - Math.max(0, progress - 0.75) * 2.4;
  ctx.font = `800 ${Math.round(S * 0.26)}px ${FONT.display}`;
  ctx.fillStyle = theme.text;
  ctx.fillText(String(n), 0, 0);
  ctx.restore();
}

/** How much taller the result card is than its text, as a fraction of the arena: room for the rating thumbs the lobby panel lays over it. */
export const RESULT_RATING_STRIP = 0.12;
function drawResult(sc: Scene): void {
  const { ctx, S, theme, snapshot, t } = sc;
  const progress = Math.min(1, (RESULT_MS - snapshot.timerMs) / 350);
  const ease = 1 - Math.pow(1 - progress, 3);
  ctx.fillStyle = `oklch(0.12 0.006 55 / ${0.5 * ease})`;
  ctx.fillRect(0, 0, S, S);

  const winner = snapshot.winnerId ? snapshot.players.find((p) => p.id === snapshot.winnerId) : undefined;
  ctx.save();
  ctx.translate(S / 2, S * 0.48);
  ctx.scale(0.85 + 0.15 * ease, 0.85 + 0.15 * ease);
  ctx.globalAlpha = ease;
  const w = S * 0.66;
  const h = S * 0.4;
  // The card is taller than its text by a strip along the bottom, where the panel puts the thumbs (see RatingBar).
  roundRect(ctx, -w / 2, -h / 2, w, h + S * RESULT_RATING_STRIP, S * 0.05);
  ctx.fillStyle = 'oklch(0.21 0.009 55 / 0.94)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // A game with a secret (Words) shows it in the card, as its last line, whoever won: the other lines make room.
  const word = snapshot.id === 'words' && snapshot.answer ? t('spin.lobby.words.answer', { word: snapshot.answer.toUpperCase() }) : null;
  const drawWord = (y: number) => {
    if (!word) return;
    ctx.font = `800 ${Math.round(S * 0.042)}px ${FONT.display}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(word, 0, y, w * 0.9);
  };

  if (winner) {
    const info = sc.info(winner.id);
    const r = S * (word ? 0.05 : 0.065);
    const lift = word ? -h * 0.14 : 0;
    ctx.save();
    ctx.shadowColor = info.color;
    ctx.shadowBlur = S * 0.06;
    ctx.beginPath();
    ctx.arc(0, -h * 0.18 + lift, r, 0, Math.PI * 2);
    ctx.fillStyle = info.color;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.star;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(r)}px ${FONT.ui}`;
    ctx.fillText(info.initial, 0, -h * 0.18 + lift + 1);
    ctx.font = `600 ${Math.round(S * 0.03)}px ${FONT.mono}`;
    ctx.fillStyle = theme.accText;
    ctx.fillText(t(winner.wins === 1 ? (SCORE_WORDS[snapshot.id] ?? METRES).winnerOne : (SCORE_WORDS[snapshot.id] ?? METRES).winnerOther, { m: winner.meters, w: winner.wins }), 0, h * 0.08 + lift);
    ctx.font = `800 ${Math.round(S * 0.068)}px ${FONT.display}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(winner.id === sc.me ? t('spin.lobby.hud.youWin') : t('spin.lobby.hud.nameWins', { name: info.name }), 0, h * 0.26 + lift, w * 0.9);
    drawWord(h * 0.43);
  } else {
    ctx.font = `600 ${Math.round(S * 0.03)}px ${FONT.mono}`;
    ctx.fillStyle = theme.accText;
    ctx.fillText(t((SCORE_WORDS[snapshot.id] ?? METRES).over, { m: snapshot.history[snapshot.history.length - 1]?.meters ?? snapshot.meters }), 0, word ? -h * 0.2 : -h * 0.08);
    ctx.font = `800 ${Math.round(S * 0.068)}px ${FONT.display}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(t(noWinnerHeadline(sc)), 0, word ? -h * 0.0 : h * 0.12, w * 0.9);
    drawWord(h * 0.3);
  }
  ctx.restore();
}

/** What the card says when nobody won, by what actually happened: finding the word alone is a win, a best score alone is a best, time running
 * out with people still in is time up (a tie, in a game that counts points), and everyone going out together is nobody making it.
 * "Nobody made it" is only for that last one: alone, a run that simply ended is not a failure of anyone else. */
export function noWinnerHeadline(sc: Pick<Scene, "snapshot" | "me">): MessageKey {
  const { snapshot, me } = sc;
  if (snapshot.id === 'words') {
    if (snapshot.players.some((p) => p.id === me && p.solved)) return 'spin.lobby.words.solved';
    return snapshot.players.some((p) => p.solved) ? 'spin.lobby.hud.draw' : 'spin.lobby.words.nobody';
  }
  const stillIn = snapshot.players.some((p) => p.alive);
  const counts = SCORE_WORDS[snapshot.id] !== undefined;
  if (snapshot.players.length <= 1) {
    const last = snapshot.history[snapshot.history.length - 1];
    // A smaller number is the better one in a game scored by a time.
    const best = snapshot.best;
    if (last && best && best.game === last.game && last.meters > 0 && last.meters >= best.meters && !lowerIsBetter(snapshot.id)) return 'spin.lobby.hud.newBest';
    return stillIn && !counts ? 'spin.lobby.hud.timeUp' : 'spin.lobby.hud.soloOver';
  }
  if (stillIn) return counts ? 'spin.lobby.hud.draw' : 'spin.lobby.hud.timeUp';
  return 'spin.lobby.hud.nobody';
}

/** "You're out - next run soon", while the run carries on without you. */
function drawOutNote(sc: Scene): void {
  const { ctx, S, t } = sc;
  const text = t('spin.lobby.hud.youreOut');
  const size = Math.round(S * 0.034);
  ctx.font = `600 ${size}px ${FONT.ui}`;
  const width = ctx.measureText(text).width + size * 2;
  const y = S * 0.16;
  roundRect(ctx, S / 2 - width / 2, y - size, width, size * 2, size);
  ctx.fillStyle = 'oklch(0.62 0.19 25 / 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'oklch(0.62 0.19 25 / 0.45)';
  ctx.stroke();
  ctx.fillStyle = 'oklch(0.85 0.08 25)';
  ctx.fillText(text, S / 2, y + 1);
}
