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
  fishing: { pill: 'spin.lobby.hud.points.pill', winnerOne: 'spin.lobby.hud.points.winnerOne', winnerOther: 'spin.lobby.hud.points.winnerOther', over: 'spin.lobby.hud.points.over' },
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
  drawHint(sc);
}

/** What the game is and how it is played, under the count, so nobody starts blind. Every game has `spin.lobby.<id>.hint` (the same line as its info popup). */
function drawHint(sc: Scene): void {
  const { ctx, S, snapshot, t } = sc;
  const text = t(`spin.lobby.${snapshot.id}.hint` as MessageKey);
  const size = Math.max(11, Math.round(S * 0.03));
  ctx.font = `400 ${size}px ${FONT.ui}`;
  const maxW = S * 0.84;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const lineH = size * 1.35;
  const h = lines.length * lineH + size * 1.2;
  const top = Math.min(S * 0.7, S - h - S * 0.03);
  ctx.fillStyle = 'oklch(0.12 0.006 55 / 0.6)';
  roundRect(ctx, (S - maxW) / 2 - size * 0.6, top, maxW + size * 1.2, h, size);
  ctx.fill();
  ctx.fillStyle = sc.theme.text;
  lines.forEach((l, i) => ctx.fillText(l, S / 2, top + size * 0.6 + lineH * (i + 0.5)));
}

// ---- The end-of-run card: the run's standings. The winner is the hero row, your row is always shown and highlighted, and a thumbs
// prompt (HTML, laid over the strip along the bottom by RatingBar) sits with the review label. All sizes are fractions of the arena. ----

const CARD_W = 0.74;
const CARD_PAD = 0.04;
const CARD_HEAD_H = 0.075;
const CARD_HERO_H = 0.125;
const CARD_ROW_H = 0.07;
const CARD_GAP = 0.012;
const CARD_WORD_H = 0.06;
/** The strip along the bottom of the card, where the lobby panel lays the review label and thumbs (see RatingBar). */
export const RESULT_RATING_STRIP = 0.11;
/** Quiet text on the card: the run number, ranks and units. */
const FAINT = 'oklch(1 0 0 / 0.5)';
/** The most people the card lists (the top of the standings), before your own row when you are further down. */
const TOP_ROWS = 3;

interface StandingRow {
  id: string;
  rank: number;
  score: number;
  isMe: boolean;
}

/** What the card lists: a hero (the winner, or you alone) and the rows below it, in order. The winner's score is the run's, even when someone who
 * was knocked out earlier counted more; ties share a rank. */
function resultRows(snapshot: Scene['snapshot'], me: string): { hero: StandingRow | null; rows: StandingRow[] } {
  const sorted = [...snapshot.players].sort((a, b) => b.meters - a.meters);
  const ranked: StandingRow[] = [];
  sorted.forEach((p, i) => ranked.push({ id: p.id, score: p.meters, isMe: p.id === me, rank: i > 0 && p.meters === sorted[i - 1].meters ? ranked[i - 1].rank : i + 1 }));
  const winner = snapshot.winnerId ? ranked.find((r) => r.id === snapshot.winnerId) : undefined;
  const solo = ranked.length <= 1;
  const hero = winner ?? (solo ? ranked.find((r) => r.isMe) ?? ranked[0] ?? null : null);
  const rest = ranked.filter((r) => r !== hero);
  const top = rest.slice(0, hero ? TOP_ROWS - 1 : TOP_ROWS);
  const mine = rest.find((r) => r.isMe);
  return { hero, rows: mine && !top.includes(mine) ? [...top, mine] : top };
}

/** Where the card is in the arena, as fractions of its side, so the lobby panel can lay the thumbs exactly over its bottom strip. `S` is the arena's
 * side in pixels: on a small arena (a phone) the whole card is drawn larger, by `u`, so its text stays readable (as much as fits the arena). */
export function resultCardRect(snapshot: Scene['snapshot'], me: string, S: number): { left: number; top: number; width: number; height: number; stripTop: number; stripHeight: number; u: number } {
  const { hero, rows } = resultRows(snapshot, me);
  const word = hasLastWord(snapshot);
  const design = CARD_PAD + CARD_HEAD_H + (hero ? CARD_HERO_H + CARD_GAP : 0) + rows.length * (CARD_ROW_H + CARD_GAP) + (word ? CARD_WORD_H : 0) + RESULT_RATING_STRIP + CARD_PAD * 0.25;
  const u = Math.max(1, Math.min(1.6, 500 / Math.max(1, S), 0.92 / design));
  const height = design * u;
  const width = Math.min(0.94, CARD_W * u);
  const top = 0.5 - height / 2;
  return { left: (1 - width) / 2, top, width, height, stripTop: top + height - (RESULT_RATING_STRIP + CARD_PAD * 0.25) * u, stripHeight: RESULT_RATING_STRIP * u, u };
}

/** Whether the card has a word to show: Words and Anagram, once the word is over (until then the server keeps the answer back). */
function hasLastWord(snapshot: Scene['snapshot']): boolean {
  return (snapshot.id === 'words' || snapshot.id === 'anagram') && typeof snapshot.answer === 'string' && snapshot.answer.length > 0;
}

/** The unit a game's score is counted in, short ("m", "pts"). */
const UNIT_KEYS: Record<string, MessageKey> = {
  'spin.lobby.hud.metres': 'spin.lobby.hud.metres.unit',
  'spin.lobby.hud.coins.pill': 'spin.lobby.hud.coins.unit',
  'spin.lobby.hud.points.pill': 'spin.lobby.hud.points.unit',
  'spin.lobby.hud.seconds.pill': 'spin.lobby.hud.seconds.unit',
  'spin.lobby.hud.rounds.pill': 'spin.lobby.hud.rounds.unit',
  'spin.lobby.hud.swings.pill': 'spin.lobby.hud.swings.unit',
};
const unitKey = (game: string): MessageKey => UNIT_KEYS[(SCORE_WORDS[game] ?? METRES).pill] ?? 'spin.lobby.hud.metres.unit';

/** A score with its unit after it, right-aligned to `right`: the number large and the unit small beside it. */
function drawScoreText(sc: Scene, right: number, y: number, score: number, bigPx: number, smallPx: number, color: string, unitColor: string): void {
  const { ctx } = sc;
  const unit = sc.t(unitKey(sc.snapshot.id));
  ctx.textAlign = 'right';
  ctx.font = `600 ${smallPx}px ${FONT.mono}`;
  ctx.fillStyle = unitColor;
  ctx.fillText(unit, right, y);
  const unitW = ctx.measureText(unit).width + smallPx * 0.35;
  ctx.font = `800 ${bigPx}px ${FONT.display}`;
  ctx.fillStyle = color;
  ctx.fillText(score.toLocaleString('en-US'), right - unitW, y);
  ctx.textAlign = 'center';
}

function drawResult(sc: Scene): void {
  const { ctx, S, theme, snapshot, t } = sc;
  const progress = Math.min(1, (RESULT_MS - snapshot.timerMs) / 350);
  const ease = 1 - Math.pow(1 - progress, 3);
  ctx.fillStyle = `oklch(0.12 0.006 55 / ${0.5 * ease})`;
  ctx.fillRect(0, 0, S, S);

  const { hero, rows } = resultRows(snapshot, sc.me);
  const card = resultCardRect(snapshot, sc.me, S);
  // The card is laid out at its normal size and drawn `u` times larger (see resultCardRect).
  const w = (card.width * S) / card.u;
  const h = (card.height * S) / card.u;
  const word = hasLastWord(snapshot) ? t(snapshot.id === 'anagram' ? 'spin.lobby.anagram.answer' : 'spin.lobby.words.answer', { word: (snapshot as { answer: string }).answer.toUpperCase() }) : null;
  const pad = CARD_PAD * S;
  const winner = snapshot.winnerId ? snapshot.players.find((p) => p.id === snapshot.winnerId) : undefined;

  ctx.save();
  ctx.translate(S / 2, (card.top + card.height / 2) * S);
  ctx.scale((0.85 + 0.15 * ease) * card.u, (0.85 + 0.15 * ease) * card.u);
  ctx.globalAlpha = ease;
  roundRect(ctx, -w / 2, -h / 2, w, h, S * 0.05);
  ctx.fillStyle = 'oklch(0.21 0.009 55 / 0.98)';
  ctx.fill();
  ctx.strokeStyle = STAGE.hudStroke;
  ctx.stroke();
  ctx.textBaseline = 'middle';

  const left = -w / 2 + pad;
  const right = w / 2 - pad;
  let y = -h / 2 + pad;

  // The headline, and which run it was.
  const headline = winner ? (winner.id === sc.me ? t('spin.lobby.hud.youWin') : t('spin.lobby.hud.nameWins', { name: sc.info(winner.id).name })) : t(noWinnerHeadline(sc));
  ctx.textAlign = 'left';
  ctx.font = `800 ${Math.round(S * 0.05)}px ${FONT.display}`;
  ctx.fillStyle = theme.text;
  ctx.fillText(headline, left, y + CARD_HEAD_H * S * 0.4, w - pad * 2 - S * 0.14);
  ctx.textAlign = 'right';
  ctx.font = `600 ${Math.round(S * 0.022)}px ${FONT.mono}`;
  ctx.fillStyle = FAINT;
  ctx.fillText(t(hero && !winner ? 'spin.lobby.hud.solo' : 'spin.lobby.hud.runNo', { n: snapshot.run }), right, y + CARD_HEAD_H * S * 0.4);
  y += CARD_HEAD_H * S;

  // The word games (Words, Anagram) show the word the run ended on, straight under the headline, whoever won.
  if (word) {
    ctx.textAlign = 'left';
    ctx.font = `800 ${Math.round(S * 0.036)}px ${FONT.display}`;
    ctx.fillStyle = theme.accText;
    ctx.fillText(word, left, y + CARD_WORD_H * S * 0.2, right - left);
    y += CARD_WORD_H * S;
  }

  const person = (row: StandingRow) => ({ info: sc.info(row.id), name: row.isMe ? t('spin.lobby.hud.meRow') : sc.info(row.id).name });
  const avatar = (cx: number, cy: number, r: number, row: StandingRow, ring: string | null) => {
    const { info } = person(row);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = info.color;
    ctx.fill();
    if (ring) {
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.strokeStyle = ring;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(r * 0.9)}px ${FONT.ui}`;
    ctx.fillText(info.initial, cx, cy + 1);
  };

  // The hero: the winner, or you on your own. A gold ring on the winner; the row is outlined in the accent when it is you.
  if (hero) {
    const hh = CARD_HERO_H * S;
    roundRect(ctx, left, y, right - left, hh, S * 0.03);
    ctx.fillStyle = hero.isMe ? 'oklch(0.74 0.15 45 / 0.14)' : 'oklch(1 0 0 / 0.05)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hero.isMe ? theme.acc : STAGE.hudStroke;
    ctx.stroke();
    const r = S * 0.04;
    avatar(left + S * 0.015 + r, y + hh / 2, r, hero, winner ? theme.star : null);
    const tx = left + S * 0.015 + r * 2 + S * 0.025;
    ctx.textAlign = 'left';
    ctx.font = `600 ${Math.round(S * 0.02)}px ${FONT.mono}`;
    ctx.fillStyle = winner ? theme.star : theme.accText;
    ctx.fillText(t(winner ? 'spin.lobby.hud.winnerTag' : 'spin.lobby.hud.thisRun'), tx, y + hh * 0.34);
    ctx.font = `700 ${Math.round(S * 0.03)}px ${FONT.ui}`;
    ctx.fillStyle = theme.text;
    const best = !winner && snapshot.best && snapshot.best.game === snapshot.id ? snapshot.best.meters : null;
    ctx.fillText(best !== null ? t('spin.lobby.hud.bestSoFar', { n: `${best.toLocaleString('en-US')} ${t(unitKey(snapshot.id))}` }) : person(hero).name, tx, y + hh * 0.68, right - tx - S * 0.25);
    drawScoreText(sc, right - S * 0.02, y + hh / 2, hero.score, Math.round(S * 0.075), Math.round(S * 0.032), theme.text, theme.accText);
    y += hh + CARD_GAP * S;
  }

  // The rows below: rank, who, score. Yours is outlined in the accent whichever place you came.
  for (const row of rows) {
    const rh = CARD_ROW_H * S;
    roundRect(ctx, left, y, right - left, rh, S * 0.022);
    ctx.fillStyle = row.isMe ? 'oklch(0.74 0.15 45 / 0.14)' : 'oklch(1 0 0 / 0.04)';
    ctx.fill();
    if (row.isMe) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.acc;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(S * 0.022)}px ${FONT.mono}`;
    ctx.fillStyle = FAINT;
    ctx.fillText(String(row.rank), left + S * 0.03, y + rh / 2);
    avatar(left + S * 0.08, y + rh / 2, S * 0.026, row, null);
    ctx.textAlign = 'left';
    ctx.font = `600 ${Math.round(S * 0.028)}px ${FONT.ui}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(person(row).name, left + S * 0.125, y + rh / 2 + 1, right - left - S * 0.3);
    drawScoreText(sc, right - S * 0.02, y + rh / 2 + 1, row.score, Math.round(S * 0.032), Math.round(S * 0.022), row.isMe ? theme.accText : theme.text, FAINT);
    y += rh + CARD_GAP * S;
  }

  // A line above the review strip.
  ctx.fillStyle = STAGE.hudStroke;
  ctx.fillRect(left, y + CARD_GAP * S * 0.3, right - left, 1);
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
